# 敏感数据审计报告

## 执行时间
2026-04-29

## 发现的安全问题

### 🔴 CRITICAL - 已修复

#### 1. OAuth Client Secret 硬编码在源码中
- **文件**: `extensions/model-providers/token-refresh.ts:94`
- **问题**: iFlow OAuth 的 `clientSecret` 直接硬编码在代码中
- **风险**: 任何访问仓库的人都能使用此密钥
- **修复**: ✅ 已改为从环境变量 `IFLOW_CLIENT_SECRET` 读取

#### 2. API Key 暴露在配置文件 URL 中
- **文件**: `skills/tavily-search-free/mcp-config.json:4`
- **问题**: Tavily API key 作为查询参数直接写在 URL 中
- **风险**: API 密钥被提交到版本控制系统
- **修复**: ✅ 已替换为占位符 `${TAVILY_API_KEY}`

### 🟡 HIGH - 已防护

#### 3. .env 文件保护不足
- **问题**: `skills/tavily-search-free/` 和 `skills/jina-reader/` 目录缺少 `.gitignore`
- **风险**: 包含真实 API 密钥的 `.env` 文件可能被意外提交
- **修复**: ✅ 已创建 `.gitignore` 排除 `.env` 和 `mcp-config.json`

#### 4. Gitignore 规则不完善
- **问题**: 缺少对 `mcp-config.json` 和 `auth.json.lock` 的排除
- **风险**: 敏感配置文件可能被提交
- **修复**: ✅ 已更新根目录 `.gitignore`

## 已发现但未提交的文件（安全）

以下文件包含敏感数据，但已被 `.gitignore` 正确排除：
- ✅ `skills/tavily-search-free/.env` - 包含 3 个 Tavily API keys
- ✅ `skills/ace-tool/.env` - 包含 ACE_API_KEY
- ✅ `skills/jina-reader/.env` - 包含 JINA_API_KEY
- ✅ `qqbot-credentials/credentials.json` - 包含 QQBot clientSecret
- ✅ `models.json.backup-20260423-142658` - 包含数十个各种 provider 的 API keys

## 修复清单

- [x] 移除硬编码的 OAuth clientSecret
- [x] 移除 MCP 配置中的 API key
- [x] 更新 .gitignore 规则
- [x] 创建子目录 .gitignore
- [ ] **需要手动执行**: git commit（由于 shell 配置问题）

## Shell 配置问题

当前 fish shell 存在配置错误，导致所有 bash 命令失败：
```
fish: Unknown command: -l
```

**建议**: 检查 `~/.config/fish/config.fish` 或 `~/.fishrc` 中的 `-l` 命令引用

## 下一步操作

由于 shell 配置问题，需要手动执行以下命令完成提交：

```bash
cd /Users/dengwenyu/.pi/agent

# 1. 修复 shell 配置（可选，但推荐）
# 检查 ~/.config/fish/config.fish 中的问题

# 2. 添加所有更改
git add -A

# 3. 查看将要提交的内容
git status

# 4. 提交
git commit -m "fix(security): remove hardcoded credentials and update gitignore

- Replace hardcoded iFlow OAuth clientSecret with environment variable
- Remove Tavily API key from mcp-config.json URL query string
- Add .gitignore rules for mcp-config.json and auth.json.lock
- Create skills/tavily-search-free/.gitignore to protect .env files
- Update root .gitignore to exclude sensitive configuration files

Security audit completed - no real secrets should be committed"

# 5. 验证提交
git log --oneline -1
```

## 环境变量设置

修复后的代码需要设置以下环境变量才能正常工作：

```bash
export IFLOW_CLIENT_SECRET="4Z3YjXycVsQvyGF1etiNlIBB4RsqSDtW"
export TAVILY_API_KEY="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"
```

建议将这些变量添加到 `~/.zshrc` 或 `~/.bashrc` 中，或使用 `.env.local` 文件管理。
