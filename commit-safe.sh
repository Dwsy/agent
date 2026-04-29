#!/bin/bash
cd /Users/dengwenyu/.pi/agent

echo "=== 敏感数据审计报告 ==="
echo "已修复的问题："
echo "1. 移除 extensions/model-providers/token-refresh.ts 中硬编码的 OAuth clientSecret"
echo "2. 移除 skills/tavily-search-free/mcp-config.json 中的 Tavily API key"
echo "3. 更新 .gitignore 排除敏感配置文件"
echo "4. 创建 skills/tavily-search-free/.gitignore 防止 .env 泄露"
echo ""
echo "正在提交代码..."

git add -A
git status

echo ""
echo "准备提交..."
git commit -m "$(cat <<'EOF'
fix(security): remove hardcoded credentials and update gitignore

- Replace hardcoded iFlow OAuth clientSecret with environment variable
- Remove Tavily API key from mcp-config.json URL query string
- Add .gitignore rules for mcp-config.json and auth.json.lock
- Create skills/tavily-search-free/.gitignore to protect .env files
- Update root .gitignore to exclude sensitive configuration files

Security audit completed - no real secrets should be committed
EOF
)"

echo ""
echo "=== 提交完成 ==="
git log --oneline -1
