#!/bin/bash
# 敏感信息检查脚本 - 增强版 v3
# 检测硬编码密钥、token、密码、私钥等敏感信息

# 计数器
TOTAL_ISSUES=0
SEVERE_ISSUES=0

echo "🔍 敏感信息安全检查"
echo "===================="
echo ""

# ==================== 1. 检查被跟踪的敏感文件 ====================
echo "📋 1. 检查被跟踪的敏感文件"

SENSITIVE_FILES=$(git ls-files 2>/dev/null | grep -iE '\.(env|key|pem|crt|p12|pfx|keystore|jks|credentials|secrets)$' | grep -viE "example|sample|test|mock|fixture" || true)
SENSITIVE_COUNT=0
if [ -n "$SENSITIVE_FILES" ]; then
    SENSITIVE_COUNT=$(echo "$SENSITIVE_FILES" | grep -c '.' || echo 0)
fi

if [ "$SENSITIVE_COUNT" -eq 0 ]; then
    echo "✅ 未发现被跟踪的敏感文件"
else
    echo "🚨 发现 $SENSITIVE_COUNT 个敏感文件被跟踪！"
    echo "$SENSITIVE_FILES" | head -10 | sed 's/^/   • /'
    [ "$SENSITIVE_COUNT" -gt 10 ] && echo "   ... 还有 $((SENSITIVE_COUNT - 10)) 个"
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    SEVERE_ISSUES=$((SEVERE_ISSUES + 1))
fi
echo ""

# ==================== 2. 检查硬编码的高风险密钥 ====================
echo "📋 2. 检查硬编码密钥 (高风险)"

SEVERE_COUNT=0

# 检查各种高风险模式 - 排除注释和字符串中的误报
check_pattern() {
    local name="$1"
    local pattern="$2"
    # 排除注释行、CSS链接、文档字符串
    local matches=$(git grep -nE "$pattern" -- '*.ts' '*.js' '*.json' '*.yaml' '*.yml' '*.py' 2>/dev/null | \
        grep -v "node_modules" | \
        grep -viE "example|sample|test|spec|mock|fixture|\.d\.ts|\.min\.js|_web-assets" | \
        grep -vE "^\s*(//|/\*|\*|#|<!--|\"|').*https?://" | \
        grep -v "fonts.googleapis" | \
        grep -v "react.dev/errors" | \
        head -3 || true)
    if [ -n "$matches" ]; then
        echo "🚨 可能的 $name:"
        echo "$matches" | sed 's/^/   /'
        SEVERE_COUNT=$((SEVERE_COUNT + 1))
    fi
}

check_pattern "AWS Access Key" "AKIA[0-9A-Z]{16}"
check_pattern "GitHub Token" "ghp_[a-zA-Z0-9]{36}"
check_pattern "Slack Token" "xox[baprs]-[0-9a-zA-Z]{10,48}"
check_pattern "Private Key" "-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----"
check_pattern "OpenAI API Key" "sk-[a-zA-Z0-9]{48}"
check_pattern "Google API Key" "AIza[0-9A-Za-z_-]{35}"
# 只在代码值位置检查 clientSecret（排除变量定义）
check_pattern "硬编码 Secret" 'client[_\s]?secret[:\s]*["'\''"]+[a-zA-Z0-9_-]{16,}["'\''"]+'

if [ "$SEVERE_COUNT" -eq 0 ]; then
    echo "✅ 未发现高风险硬编码密钥"
else
    TOTAL_ISSUES=$((TOTAL_ISSUES + SEVERE_COUNT))
    SEVERE_ISSUES=$((SEVERE_ISSUES + SEVERE_COUNT))
fi
echo ""

# ==================== 3. 检查未跟踪的敏感文件 ====================
echo "📋 3. 检查未跟踪的敏感文件"

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
    echo "✅ 未发现未跟踪的敏感文件"
else
    echo "⚠️  发现 $UNTRACKED_COUNT 个未跟踪的敏感文件"
    echo "$UNTRACKED" | head -10 | sed 's/^/   • /'
    [ "$UNTRACKED_COUNT" -gt 10 ] && echo "   ... 还有 $((UNTRACKED_COUNT - 10)) 个"
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi
echo ""

# ==================== 4. 检查 .gitignore ====================
echo "📋 4. 检查 .gitignore 安全配置"

if [ ! -f ".gitignore" ]; then
    echo "🚨 缺少 .gitignore 文件！"
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    SEVERE_ISSUES=$((SEVERE_ISSUES + 1))
else
    RULES=$(grep -v '^#' .gitignore 2>/dev/null | grep -v '^$' | wc -l | tr -d ' ')
    echo "   规则数量: $RULES"
    
    # 检查关键规则
    MISSING=""
    for pattern in "\.env$" "\.env\." "\.key$" "\.pem$"; do
        if ! grep -qE "^.*${pattern}" .gitignore 2>/dev/null; then
            MISSING="$MISSING $(echo $pattern | sed 's/\\.//g' | sed 's/\$//')"
        fi
    done
    
    if [ -n "$MISSING" ]; then
        echo "⚠️  缺少关键忽略规则:$MISSING"
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    else
        echo "✅ .gitignore 包含关键安全规则"
    fi
fi
echo ""

# ==================== 5. 检查大文件 ====================
echo "📋 5. 检查异常大文件"

# 排除自动生成的资源文件
LARGE_FILES=$(git ls-files 2>/dev/null | while read -r file; do
    if [ -f "$file" ]; then
        # 跳过生成的资源文件
        if echo "$file" | grep -qE '\-assets\.ts$|\.bundle\.|\.min\.'; then
            continue
        fi
        size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
        if [ "$size" -gt 524288 ]; then
            echo "$(($size / 1024))KB $file"
        fi
    fi
done | sort -rn | head -5 || true)

if [ -n "$LARGE_FILES" ]; then
    echo "⚠️  发现大文件（可能包含嵌入式数据）"
    echo "$LARGE_FILES" | sed 's/^/   • /'
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
    echo "✅ 未发现异常大文件"
fi
echo ""

# ==================== 总结 ====================
echo "===================="
echo "📊 检查总结"
echo "===================="
echo ""
echo "  被跟踪敏感文件: $SENSITIVE_COUNT"
echo "  高风险密钥泄露: $SEVERE_COUNT"
echo "  未跟踪敏感文件: $UNTRACKED_COUNT"
echo "  总问题数:       $TOTAL_ISSUES"
echo ""

if [ "$SEVERE_ISSUES" -gt 0 ]; then
    echo "🚨 严重：发现 $SEVERE_ISSUES 个高风险问题，请立即修复！"
    exit 2
elif [ "$TOTAL_ISSUES" -gt 0 ]; then
    echo "⚠️  警告：发现 $TOTAL_ISSUES 个潜在问题，建议检查"
    exit 1
else
    echo "✅ 检查通过：未发现敏感信息泄露风险"
    exit 0
fi
