# Glimpse-APP (GAPP)

挂在 `generative-ui` 下的临时 Web 应用层。

## 目录

```
gapp/
  index.ts         # registerGapp() + host start + agent bridge
  constants.ts     # port 54888 + path table
  host-server.ts   # multipath HTTP hub
  host-client.ts   # HTTP client when not hub
  lease.ts         # single-connection leases
  registry.ts      # live windows / tools / generate jobs
  stateops.ts      # declarative stateOps executor
  open.ts          # open + message router + lease
  storage.ts       # disk SSOT + inject GappHost
  tools.ts         # gapp_* including list_tools / call
  commands.ts      # /gapp TUI
  prompt.ts        # system appendix
  protocol.ts      # types + helpers
  PROTOCOL.md      # full protocol
  skills/          # generative-bridge skill
```

## Host control plane

- **Port:** `54888`（`GAPP_HOST_PORT`）
- **Paths:** `/health`, `/v1/gapp/...` — 见 PROTOCOL §0
- First process = hub; others = HTTP clients to same port

## 磁盘

```
project:  .pi/gapp/<id>/{meta.json,state.json,index.html,tools.json?}
global:   ~/.pi/gapp/<id>/...
```

## 命令

| 命令 | 行为 |
|------|------|
| `/gapp` / `/gapp list` | TUI 列表，**Enter 打开** |
| `/gapp open 1` | 列表第 1 个 |
| `/gapp open kanban-08` | 按 id |
| `/gapp list --text` | 纯文本 |
| `/gapp enable\|disable\|archive <n\|id>` | 生命周期 |
| `/gapp generate <描述>` | 让 agent 生成 |

TUI：`↑↓` 选择 · `Tab` project/global/all · `Enter` 打开 · `e/d/a` 启停归档 · `Esc` 取消

## Host Protocol (v0.1)

详见 [PROTOCOL.md](./PROTOCOL.md)。摘要：

| 能力 | 机制 |
|------|------|
| 动态工具（类 MCP） | `tools.json` + `GappHost.registerTools` → AI 用 `gapp_list_tools` / `gapp_call` |
| 人改完 AI 看 | `GappHost.emit(..., { notifyAgent: true })` → 主会话 `sendUserMessage` |
| App 内生成 | `GappHost.generate(prompt)` → **主会话** `sendUserMessage` → 文本回流 App（无独立 model） |
| 连接互斥 | 默认 `meta.instances: "single"` 一 app 一 live 连接；`multi` 才允许多开；冲突弹窗提示 |
| 连接模式 | `pi-live`（Pi open）全能力；`isolated`（CLI/Raycast）无 generate |

已定：无 destructive 二次确认；generate 不另起模型。实现分阶段见 PROTOCOL §11。类型：`protocol.ts`。
