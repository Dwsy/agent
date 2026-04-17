#!/bin/bash
# 敏感信息检查脚本 - 增强版 v4
# 默认面向 pre-commit：优先检查 staged 内容，避免无关工作区文件误伤提交

set -u

MODE="workspace"
QUIET=0
STRICT_UNTRACKED=0

for arg in "$@"; do
    case "$arg" in
        --staged)
            MODE="staged"
            ;;
        --workspace)
            MODE="workspace"
            ;;
        --quiet)
            QUIET=1
            ;;
        --strict-untracked)
            STRICT_UNTRACKED=1
            ;;
    esac
done

say() {
    if [ "$QUIET" -ne 1 ]; then
        echo "$@"
    fi
}

# 计数器
TOTAL_ISSUES=0
SEVERE_ISSUES=0

say "🔍 敏感信息安全检查"
say "===================="
say ""

# 预计算 staged 文件集合（仅在 staged 模式）
STAGED_FILES=""
if [ "$MODE" = "staged" ]; then
    STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

is_staged_path() {
    local path="$1"
    if [ "$MODE" != "staged" ]; then
        return 0
    fi
    printf '%s\n' "$STAGED_FILES" | grep -Fx -- "$path" >/dev/null 2>&1
}

# ==================== 1. 检查被跟踪的敏感文件 ====================
say "📋 1. 检查被跟踪的敏感文件"

TRACKED_CANDIDATES=$(git ls-files 2>/dev/null | grep -iE '\.(env|key|pem|crt|p12|pfx|keystore|jks|credentials|secrets)$' | grep -viE "example|sample|test|mock|fixture" || true)
if [ "$MODE" = "staged" ]; then
    SENSITIVE_FILES=$(printf '%s\n' "$TRACKED_CANDIDATES" | while IFS= read -r file; do
        [ -n "$file" ] || continue
        if is_staged_path "$file"; then
            printf '%s\n' "$file"
        fi
    done)
else
    SENSITIVE_FILES="$TRACKED_CANDIDATES"
fi

SENSITIVE_COUNT=0
if [ -n "$SENSITIVE_FILES" ]; then
    SENSITIVE_COUNT=$(echo "$SENSITIVE_FILES" | grep -c '.' || echo 0)
fi

if [ "$SENSITIVE_COUNT" -eq 0 ]; then
    say "✅ 未发现被跟踪的敏感文件"
else
    say "🚨 发现 $SENSITIVE_COUNT 个敏感文件被跟踪！"
    say "$(echo "$SENSITIVE_FILES" | head -10 | sed 's/^/   • /')"
    [ "$SENSITIVE_COUNT" -gt 10 ] && say "   ... 还有 $((SENSITIVE_COUNT - 10)) 个"
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    SEVERE_ISSUES=$((SEVERE_ISSUES + 1))
fi
say ""

# ==================== 2. 检查硬编码的高风险密钥 ====================
say "📋 2. 检查硬编码密钥 (高风险)"

SEVERE_COUNT=0

check_pattern() {
    local name="$1"
    local pattern="$2"
    local grep_cmd="git grep -nE"
    local grep_scope="-- '*.ts' '*.js' '*.json' '*.yaml' '*.yml' '*.py'"
    if [ "$MODE" = "staged" ]; then
        grep_cmd="git diff --cached -G"
        grep_scope="--name-only --diff-filter=ACMR"
        local files
        files=$(eval "$grep_cmd '$pattern' $grep_scope" 2>/dev/null | grep -viE 'example|sample|test|spec|mock|fixture|\.d\.ts|\.min\.js|_web-assets' || true)
        if [ -z "$files" ]; then
            return
        fi
        local matches=""
        while IFS= read -r file; do
            [ -n "$file" ] || continue
            local file_matches
            file_matches=$(git diff --cached -- "$file" | grep -nE "$pattern" | head -3 || true)
            if [ -n "$file_matches" ]; then
                matches="${matches}${file}:\n${file_matches}\n"
            fi
        done <<EOF
$files
EOF
        matches=$(printf '%b' "$matches" | grep -v "node_modules" | grep -vE "^\s*(//|/\*|\*|#|<!--|\"|').*https?://" | grep -v "fonts.googleapis" | grep -v "react.dev/errors" | head -9 || true)
        if [ -n "$matches" ]; then
            say "🚨 可能的 $name:"
            say "$(echo "$matches" | sed 's/^/   /')"
            SEVERE_COUNT=$((SEVERE_COUNT + 1))
        fi
        return
    fi

    local matches
    matches=$(git grep -nE "$pattern" -- '*.ts' '*.js' '*.json' '*.yaml' '*.yml' '*.py' 2>/dev/null | \
        grep -v "node_modules" | \
        grep -viE "example|sample|test|spec|mock|fixture|\.d\.ts|\.min\.js|_web-assets" | \
        grep -vE "^\s*(//|/\*|\*|#|<!--|\"|').*https?://" | \
        grep -v "fonts.googleapis" | \
        grep -v "react.dev/errors" | \
        head -3 || true)
    if [ -n "$matches" ]; then
        say "🚨 可能的 $name:"
        say "$(echo "$matches" | sed 's/^/   /')"
        SEVERE_COUNT=$((SEVERE_COUNT + 1))
    fi
}

check_pattern "AWS Access Key" "AKIA[0-9A-Z]{16}"
check_pattern "GitHub Token" "ghp_[a-zA-Z0-9]{36}"
check_pattern "Slack Token" "xox[baprs]-[0-9a-zA-Z]{10,48}"
check_pattern "Private Key" "-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----"
check_pattern "OpenAI API Key" "sk-[a-zA-Z0-9]{48}"
check_pattern "Google API Key" "AIza[0-9A-Za-z_-]{35}"
check_pattern "硬编码 Secret" 'client[_\s]?secret[:\s]*["'\''"]+[a-zA-Z0-9_-]{16,}["'\''"]+'

if [ "$SEVERE_COUNT" -eq 0 ]; then
    say "✅ 未发现高风险硬编码密钥"
else
    TOTAL_ISSUES=$((TOTAL_ISSUES + SEVERE_COUNT))
    SEVERE_ISSUES=$((SEVERE_ISSUES + SEVERE_COUNT))
fi
say ""

# ==================== 3. 检查未跟踪的敏感文件 ====================
say "📋 3. 检查未跟踪的敏感文件"

UNTRACKED=$(find . -type f \( \
    -name ".env" -o -name ".env.local" -o -name ".env.*.local" -o \
    -name "*.key" -o -name "*.pem" -o \
    -name "*.p12" -o -name "*.pfx" -o \
    -name "id_rsa" -o -name "id_dsa" -o \
    -name ".netrc" -o -name ".htpasswd" \
\) -not -path "*/node_modules/*" -not -path "*/target/*" -not -path "*/.git/*" 2>/dev/null | \
    grep -viE "example|sample|test|mock|fixture" | \
    sort -u || true)

UNTRACKED_COUNT=0
if [ -n "$UNTRACKED" ]; then
    UNTRACKED_COUNT=$(echo "$UNTRACKED" | grep -c '.' || echo 0)
fi

if [ "$UNTRACKED_COUNT" -eq 0 ]; then
    say "✅ 未发现未跟踪的敏感文件"
else
    say "⚠️  发现 $UNTRACKED_COUNT 个未跟踪的敏感文件"
    say "$(echo "$UNTRACKED" | head -10 | sed 's/^/   • /')"
    [ "$UNTRACKED_COUNT" -gt 10 ] && say "   ... 还有 $((UNTRACKED_COUNT - 10)) 个"
    if [ "$STRICT_UNTRACKED" -eq 1 ] && [ "$MODE" != "staged" ]; then
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    fi
fi
say ""

# ==================== 4. 检查 .gitignore ====================
say "📋 4. 检查 .gitignore 安全配置"

if [ ! -f ".gitignore" ]; then
    say "🚨 缺少 .gitignore 文件！"
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    SEVERE_ISSUES=$((SEVERE_ISSUES + 1))
else
    RULES=$(grep -v '^#' .gitignore 2>/dev/null | grep -v '^$' | wc -l | tr -d ' ')
    say "   规则数量: $RULES"

    MISSING=""
    for pattern in "\.env$" "\.env\." "\.key$" "\.pem$"; do
        if ! grep -qE "^.*${pattern}" .gitignore 2>/dev/null; then
            MISSING="$MISSING $(echo $pattern | sed 's/\\.//g' | sed 's/\$//')"
        fi
    done

    if [ -n "$MISSING" ]; then
        say "⚠️  缺少关键忽略规则:$MISSING"
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    else
        say "✅ .gitignore 包含关键安全规则"
    fi
fi
say ""

# ==================== 5. 检查大文件 ====================
say "📋 5. 检查异常大文件"

LARGE_CANDIDATES=$(git ls-files 2>/dev/null || true)
if [ "$MODE" = "staged" ]; then
    LARGE_CANDIDATES="$STAGED_FILES"
fi

LARGE_FILES=$(printf '%s\n' "$LARGE_CANDIDATES" | while IFS= read -r file; do
    [ -f "$file" ] || continue
    if echo "$file" | grep -qE '\-assets\.ts$|\.bundle\.|\.min\.'; then
        continue
    fi
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
    if [ "$size" -gt 524288 ]; then
        echo "$((size / 1024))KB $file"
    fi
done | sort -rn | head -5 || true)

if [ -n "$LARGE_FILES" ]; then
    say "⚠️  发现大文件（可能包含嵌入式数据）"
    say "$(echo "$LARGE_FILES" | sed 's/^/   • /')"
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
    say "✅ 未发现异常大文件"
fi
say ""

# ==================== 总结 ====================
say "===================="
say "📊 检查总结"
say "===================="
say ""
say "  模式:             $MODE"
say "  被跟踪敏感文件: $SENSITIVE_COUNT"
say "  高风险密钥泄露: $SEVERE_COUNT"
say "  未跟踪敏感文件: $UNTRACKED_COUNT"
say "  总问题数:       $TOTAL_ISSUES"
say ""

if [ "$SEVERE_ISSUES" -gt 0 ]; then
    say "🚨 严重：发现 $SEVERE_ISSUES 个高风险问题，请立即修复！"
    exit 2
elif [ "$TOTAL_ISSUES" -gt 0 ]; then
    say "⚠️  警告：发现 $TOTAL_ISSUES 个潜在问题，建议检查"
    exit 1
else
    say "✅ 检查通过：未发现敏感信息泄露风险"
    exit 0
fi
