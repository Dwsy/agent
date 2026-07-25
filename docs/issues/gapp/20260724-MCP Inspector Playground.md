---
id: "2026-07-24-MCP Inspector Playground"
title: "MCP Inspector Playground"
status: "done"
created: "2026-07-24"
updated: "2026-07-25"
category: "gapp"
tags: ["gapp", "mcp", "inspector", "security"]
---

# Issue: MCP Inspector Playground

## Goal

将 `mcp-url-playground` 升级为宿主代理式 MCP Inspector，支持远程与本地 MCP 服务、完整能力浏览、持久历史与安全鉴权。

## 背景/问题

旧版由 WKWebView 直接请求 Streamable HTTP，受 CORS 限制，不支持 stdio 本地二进制、SSE、resources/prompts，也无法安全承载进程执行。新版采用官方 Inspector 的 UI + 本地代理分层，但代理 RPC 仅走 GAPP native window message channel，不暴露可执行 HTTP 路由。

## 验收标准

- [x] 支持 `stdio`、`sse`、`streamable-http`，stdio 使用 command + args 直接 spawn，禁止 shell 拼接。
- [x] 支持 OAuth 2.1/PKCE、Bearer、Basic、API Key、自定义 Headers；秘密仅存宿主/窗口内存。
- [x] 支持 tools/list/call、resources/list/read/templates、prompts/list/get、ping、logging/setLevel。
- [x] 保存脱敏服务器配置、UI 设置和请求历史；支持导入/导出 `mcpServers`。
- [x] GAPP 与宿主 RPC 仅走 native message channel，不新增命令执行 HTTP API。
- [x] 断开、窗口关闭或 session shutdown 时关闭 Client/Transport/stdio 子进程/OAuth 回调。
- [x] 自动化覆盖参数校验、秘密脱敏、Native RPC、OAuth 回调、远程鉴权和真实 stdio 调用。
- [x] Tools、Resources、Prompts、History、Config 五个工作区可用，JSON 深浅主题安全高亮。

## 实施阶段

### Phase 1: 规划和准备
- [x] 对照官方 Inspector 架构与能力
- [x] 确定 native RPC 安全边界
- [x] 确定使用 MCP TypeScript SDK

### Phase 2: 执行
- [x] 增加通用 GAPP host RPC 请求/响应协议
- [x] 增加 MCP Inspector 宿主会话管理器
- [x] 重写 `mcp-url-playground` UI 与 state
- [x] 增加 SDK 依赖、配置导入导出、OAuth 与 JSON 高亮

### Phase 3: 验证
- [x] 协议/会话单元测试
- [x] stdio 与 Streamable HTTP 鉴权集成测试
- [x] UI 脚本、安全扫描与窗口运行验证
- [x] 聚焦构建、格式与变更边界审查

### Phase 4: 交付
- [x] 更新 Issue 与 PR 变更记录

## 关键决策

| 决策 | 理由 |
|------|------|
| Native window RPC，不开执行型 HTTP API | 避免 DNS rebinding/CORS 页面触发本地 RCE |
| 使用 MCP TypeScript SDK | 复用标准初始化、通知、OAuth、三种 transport 与生命周期 |
| 秘密不持久化 | token/env/header 值/OAuth token 不进入仓库 state 或历史 |
| stdio 禁止 shell | command + args 直接 spawn，降低命令注入面 |
| JSON 高亮用 DOM token | 不使用 `innerHTML`，保持用户内容安全 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| 2026-07-24 | RTK 改写带 `if/for` 的 shell 导致语法错误 | 复杂控制流改用 Python subprocess |
| 2026-07-24 | 远程工具上下文缺少 `activeWindows` 导致 GAPP 打开崩溃 | `openGappBundle` 对 undefined 做共享兜底 |
| 2026-07-25 | 窗口运行会话状态需要二次确认 | 使用保留退出现场的 tmux 会话验证持续运行 |

## 验证证据

- `bun test gapp/mcp-inspector.test.ts`：7 pass / 0 fail / 31 assertions。
- 真实 stdio MCP：初始化、工具调用、资源、Prompt、历史与关闭均通过。
- 真实 Streamable HTTP MCP：API Key Header 到达服务端，状态与历史不含密钥。
- OAuth：本机随机端口回调、state 校验、PKCE Provider、token 交换重连路径通过聚焦测试。
- `bun build`：`mcp-inspector.ts`、`open.ts`、`storage.ts` 均成功。
- UI：`node --check`、无 `fetch/XMLHttpRequest/WebSocket/innerHTML`、state 无秘密字段。
- 原生窗口：tmux `gapp-mcp-inspector` 持续运行并输出 `OPENED MCP Inspector Playground`。

## 相关资源

- GAPP：`.pi/gapp/mcp-url-playground/`
- 宿主核心：`extensions/generative-ui/gapp/mcp-inspector.ts`
- Native RPC：`extensions/generative-ui/gapp/host-rpc.ts`
- 测试：`extensions/generative-ui/gapp/mcp-inspector.test.ts`
- PR 记录：`docs/pr/gapp/20260725-MCP Inspector Playground.md`

## Notes

OAuth 回调使用 `http://127.0.0.1:<随机端口>/oauth/callback`。静态 OAuth Client 必须允许 loopback 动态端口；否则使用动态客户端注册或预先配置兼容的 Client。

## Status 更新日志

- **2026-07-24 23:40**: 状态变更 → in_progress，完成架构与安全边界确认。
- **2026-07-25 00:12**: 状态变更 → done，功能、鉴权、JSON 高亮与验证完成。
