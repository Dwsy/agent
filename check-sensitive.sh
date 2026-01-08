#!/bin/bash
# 敏感信息检查脚本

echo "🔍 敏感信息检查..."
echo ""

# 检查是否有敏感文件被跟踪
echo "📁 检查被跟踪的敏感文件类型..."
SENSITIVE_FILES=$(git ls-files | grep -E "\.(env|key|pem|crt|log)$" | wc -l | tr -d ' ')
if [ "$SENSITIVE_FILES" -eq 0 ]; then
  echo "✅ 未发现被跟踪的敏感文件"
else
  echo "⚠️  发现 $SENSITIVE_FILES 个敏感文件被跟踪:"
  git ls-files | grep -E "\.(env|key|pem|crt|log)$"
fi
echo ""

# 搜索代码中的硬编码密钥
echo "🔑 检查硬编码的 API 密钥..."
API_KEYS=$(git grep -i "api_key\|secret\|password" -- '*.ts' '*.js' '*.json' 2>/dev/null | grep -v "node_modules" | grep -v "example" | grep -v "// " | wc -l | tr -d ' ')
if [ "$API_KEYS" -eq 0 ]; then
  echo "✅ 未发现硬编码的 API 密钥"
else
  echo "⚠️  发现 $API_KEYS 处可能包含敏感信息:"
  git grep -i "api_key\|secret\|password" -- '*.ts' '*.js' '*.json' 2>/dev/null | grep -v "node_modules" | grep -v "example" | grep -v "// " | head -5
fi
echo ""

# 检查未提交的敏感文件
echo "📋 检查未跟踪的敏感文件..."
UNTRACKED=$(find . -type f \( -name ".env" -o -name "*.key" -o -name "*.pem" \) -not -path "*/node_modules/*" -not -path "*/target/*" 2>/dev/null | wc -l | tr -d ' ')
if [ "$UNTRACKED" -eq 0 ]; then
  echo "✅ 未发现未跟踪的敏感文件"
else
  echo "⚠️  发现 $UNTRACKED 个未跟踪的敏感文件（应被 .gitignore 忽略）:"
  find . -type f \( -name ".env" -o -name "*.key" -o -name "*.pem" \) -not -path "*/node_modules/*" -not -path "*/target/*" 2>/dev/null
fi
echo ""

# 检查 .gitignore 规则
echo "🛡️  检查 .gitignore 规则..."
if [ -f .gitignore ]; then
  echo "✅ .gitignore 存在"
  echo "   规则数: $(grep -v '^#' .gitignore | grep -v '^$' | wc -l | tr -d ' ')"
else
  echo "❌ .gitignore 不存在"
fi
echo ""

# 总结
echo "📊 检查总结:"
echo "   被跟踪文件总数: $(git ls-files | wc -l | tr -d ' ')"
echo "   敏感文件数: $SENSITIVE_FILES"
echo "   未跟踪敏感文件: $UNTRACKED"

if [ "$SENSITIVE_FILES" -eq 0 ] && [ "$UNTRACKED" -eq 0 ]; then
  echo ""
  echo "✅ 仓库安全，无敏感信息泄露风险"
  exit 0
else
  echo ""
  echo "⚠️  发现潜在安全问题，请检查上述警告"
  exit 1
fi