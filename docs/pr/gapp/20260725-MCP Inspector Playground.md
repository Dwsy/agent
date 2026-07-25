---
id: "2026-07-25-MCP Inspector Playground"
title: "MCP Inspector Playground"
status: "ready"
created: "2026-07-25"
updated: "2026-07-25"
category: "gapp"
tags: ["gapp", "mcp", "security", "testing"]
---

# MCP Inspector Playground

> 将 URL Playground 升级为安全的宿主代理式 MCP Inspector。

## 背景与目的

浏览器直连只能覆盖部分远程 MCP，无法安全启动本地 stdio 二进制，也缺少 OAuth、资源、Prompt、持久历史和配置管理。此变更采用 GAPP UI + Pi 宿主 MCP Client 分层，保持本地执行能力不暴露给普通网页。

## 变更内容概述

- Native GAPP Host RPC 请求/响应协议与生命周期清理。
- MCP SDK 宿主会话：stdio、SSE、Streamable HTTP。
- OAuth 2.1/PKCE、Bearer、Basic、API Key、自定义 Header。
- Tools、Resources、Prompts、History、Config 五工作区。
- 脱敏历史、Profile、mcpServers 导入导出、stdio stderr。
- 安全 DOM JSON 高亮，支持深浅主题。
- stdio、远程鉴权、OAuth、RPC 与秘密脱敏自动化测试。

## 关联 Issue

- `docs/issues/gapp/20260724-MCP Inspector Playground.md`

## 测试与验证结果

- [x] 7 项聚焦测试通过，31 个断言。
- [x] 真实 stdio MCP 集成验证。
- [x] 真实 Streamable HTTP API-Key 集成验证。
- [x] OAuth 回调/state/秘密隔离验证。
- [x] UI 脚本、JSON 高亮和危险 API 扫描。
- [x] 宿主核心聚焦构建。
- [x] 新版原生窗口持续运行验证。

## 风险与影响评估

- 仅 `mcp-url-playground` 注册 MCP Host RPC；没有新增执行型 HTTP 路由。
- stdio command/args 仍具本地执行能力，因此只应运行用户明确配置的可信程序。
- OAuth 静态 Client 需允许 loopback 动态端口。
- 依赖新增 `@modelcontextprotocol/sdk@^1.29.0`；保留本地 `glimpseui` link。

## 回滚方案

1. 下线或恢复 `.pi/gapp/mcp-url-playground/` 旧版本。
2. 移除 `mcp-inspector.ts`、`host-rpc.ts` 及协议/入口接线。
3. 从 `extensions/generative-ui/package.json` 与 lockfile 移除 MCP SDK。
4. 关闭 tmux `gapp-mcp-inspector`。

## 变更类型

- [x] ✨ New Feature
- [x] 🔒 Security
- [x] 🧪 Testing
- [x] 📝 Documentation

## 文件变更列表

| 文件 | 类型 | 描述 |
|------|------|------|
| `extensions/generative-ui/gapp/host-rpc.ts` | 新增 | Native Host RPC 白名单注册与分发 |
| `extensions/generative-ui/gapp/mcp-inspector.ts` | 新增 | MCP Client、transport、鉴权、历史与生命周期 |
| `extensions/generative-ui/gapp/mcp-inspector.test.ts` | 新增 | 7 项聚焦及真实集成测试 |
| `extensions/generative-ui/gapp/test-fixtures/mcp-stdio-server.mjs` | 新增 | stdio MCP 测试服务 |
| `extensions/generative-ui/gapp/{protocol,storage,open,index}.ts` | 修改 | RPC 协议、浏览器桥接与宿主注册 |
| `extensions/generative-ui/package.json` | 修改 | 增加 MCP SDK |
| `.pi/gapp/mcp-url-playground/` | 重写 | Inspector UI、state 与 meta |

## 测试命令

```bash
cd extensions/generative-ui
bun test gapp/mcp-inspector.test.ts
bun build gapp/mcp-inspector.ts --target=bun --outfile=/tmp/mcp-inspector.js
bun build gapp/open.ts --target=bun --outfile=/tmp/gapp-open.js
bun build gapp/storage.ts --target=bun --outfile=/tmp/gapp-storage.js
```

## 破坏性变更

- [x] 否。原 GAPP ID 保持 `mcp-url-playground`，state 升级为 version 2。

## 性能影响

- [x] 无常驻扫描；MCP SDK 与子进程仅在用户连接时创建。

## 依赖变更

- [x] 新增 `@modelcontextprotocol/sdk@^1.29.0`。

## 安全考虑

- [x] stdio 不经 shell。
- [x] Native RPC 按 app ID 注册，不暴露 HTTP 执行端点。
- [x] token/password/env/header values/OAuth tokens 不持久化。
- [x] JSON 高亮使用 text node/span，不使用 `innerHTML`。

## 最终状态

- **状态:** Ready for review
- **运行验证:** tmux `gapp-mcp-inspector`
- **部署状态:** 本地 GAPP 已打开
