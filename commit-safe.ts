#!/usr/bin/env bun
import { $ } from "bun";

console.log("=== 敏感数据审计报告 ===\n");
console.log("已修复的安全问题：");
console.log("1. ✓ 移除 extensions/model-providers/token-refresh.ts 中硬编码的 OAuth clientSecret");
console.log("2. ✓ 移除 skills/tavily-search-free/mcp-config.json 中的 Tavily API key");  
console.log("3. ✓ 更新 .gitignore 排除敏感配置文件");
console.log("4. ✓ 创建 skills/tavily-search-free/.gitignore 防止 .env 泄露\n");

try {
  console.log("正在添加文件到暂存区...");
  await $`git add -A`;
  
  console.log("\n当前状态：");
  await $`git status`;
  
  console.log("\n准备提交...");
  await $`git commit -m "fix(security): remove hardcoded credentials and update gitignore

- Replace hardcoded iFlow OAuth clientSecret with environment variable
- Remove Tavily API key from mcp-config.json URL query string  
- Add .gitignore rules for mcp-config.json and auth.json.lock
- Create skills/tavily-search-free/.gitignore to protect .env files
- Update root .gitignore to exclude sensitive configuration files

Security audit completed - no real secrets should be committed"`;
  
  console.log("\n=== 提交完成 ===");
  await $`git log --oneline -1`;
} catch (error) {
  console.error("执行失败:", error.message);
  process.exit(1);
}
