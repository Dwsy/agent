# pi-mesh 架构

> 协议改动顺序固定：先改 `src/protocol.ts`，再改 hub → 客户端/CLI → WebUI，最后同步本文。

## 1. 职责边界

pi-mesh 让本机的 pi 会话互相**看见、说话、接管**。

- 形态：一个 pi 扩展 + 一个本机 hub 守护进程 + 一个 WebUI + 一个 CLI。
- **零 tool**：不向任何 pi 注册工具。能力面只有 `skills/pi-mesh`（渐进注入）
  与 `mesh` CLI。
- **hub 被动**：只维护注册表、路由推送、读会话文件。唯一 spawn 进程的地方是
  用户显式触发的 resume / 新建对话 / 终端桥。
- 信任模型：单机、单用户。HTTP 只绑 `127.0.0.1`，socket 在 `~/.pi/pi-mesh/`，
  没有鉴权层；不要把它暴露到局域网。

## 2. 运行时拓扑

```text
pi 进程 A ────────────────────────────────┐
 index.ts（零 tool）                      │
  ├ hooks：注册 / 心跳 / 文件活动 / 收推送 │  JSONL over unix socket
  ├ /mesh TUI overlay（command.ts）        │  Windows: named pipe
  └ skill：skills/pi-mesh（渐进注入）      │
pi 进程 B … ──────────────────────────────┤
                                          ▼
                        hub daemon（src/hub/daemon.ts）
                        ~/.pi/pi-mesh/mesh.sock
                        ├ server.ts    请求路由 + push 关联
                        ├ registry.ts  状态 / 关注图 / 租约 / 保留期
                        ├ http.ts      REST + SSE + 静态 + /vendor
                        ├ terminal.ts  WS ↔ herdr terminal session
                        ├ transcript.ts 会话 JSONL → TranscriptEntry
                        ├ markdown.ts  satteri → 历史 HTML
                        └ review.ts    会话 JSONL → 文件树 + diff
                              │
              ┌───────────────┼─────────────────┐
              ▼               ▼                 ▼
        WebUI (public/)   herdr（外部）    registry.json
        Tailwind+Alpine   工作区/通知/终端  500ms 防抖持久化
```

两个入口共享同一套语义：

- 扩展 / CLI ↔ hub：socket 上的 JSONL，一条请求一条响应（按 `id` 配对），
  hub 也可以在同一连接上反向推。
- WebUI ↔ hub：HTTP + SSE。`POST message/cancel` 走的是 socket 的同一个
  `HubRouter.handle`，不是第二套实现。

## 3. 身份与状态

- 一个 pi 会话 = 一条 peer。`sessionId` 来自 `ctx.sessionManager.getSessionId()`，
  与会话 JSONL 的文件名同源。
- `sessionFile` 是 JSONL 绝对路径。内存模式（`pi --no-session`）下为 `""`，
  并带 `persistence: "memory"` / `ephemeral: true`。
- **身份连续**：resume 用 `pi --session <file>` 续写同一 JSONL，重新注册的是
  同一条记录（`register()` 清掉 `closedAt`），不是新会话。

```text
session_start ──► waiting ──agent_start──► running
                     ▲                        │
                     └────agent_settled───────┘
                     │
        心跳静默 > offlineTimeoutMs（45s）
                     ▼
                  offline ──retentionDays──► 清除
session_shutdown ──► closed ──retentionDays──► 清除
register（复活）──► waiting（清 closedAt / closeReason）
```

| 事实 | 值 | 来源 |
| --- | --- | --- |
| 心跳间隔 | 15s | `DEFAULT_CONFIG.heartbeatIntervalMs` |
| 判离线阈值 | 45s（≥3× 心跳，配置校验强制） | `offlineTimeoutMs` |
| 保留期 | 7 天（offline/closed） | `retentionDays` |
| 临时会话清除 | 静默后 10 分钟 | `EPHEMERAL_PURGE_MS` |
| 每 peer 文件上限 | 50 | `MAX_FILES_PER_PEER` |
| resume 血缘上限 | 20 | `MAX_RESUMPTIONS_PER_PEER` |
| resume 租约 TTL | 60s | `RESUME_LEASE_TTL_MS` |
| 持久化防抖 | 500ms | `PERSIST_DEBOUNCE_MS` |

**排序是契约**：状态优先级（running→waiting→offline→closed）→ `startedAt`
降序 → sessionId。心跳只改状态，不改位置。

## 4. Wire 契约（`src/protocol.ts`）

所有模块只认这里定义的类型；跨进程字段先在这里出现。

### 4.1 socket 请求（扩展 / CLI → hub）

| 请求 | 作用 | 关键失败串 |
| --- | --- | --- |
| `register` | 注册/复活 peer，携带 `git` | `peer.sessionId is required`、`peer.sessionFile is required`（非临时） |
| `heartbeat` | 上报 `running/waiting` + model/title | `unknown session` |
| `file_activity` | 批量文件改动 | `unknown session` |
| `close` | 标记 closed | `unknown session` |
| `follow` / `unfollow` | 有向关注边 | `unknown session`、`a session cannot follow itself` |
| `claim_resume` | resume 前的 CAS 租约 | `unknown session`、`already live`、`lease held`、`ephemeral session` |
| `record_resume` | 追加血缘 + 释放租约 | `unknown session` |
| `query_peers` | 全量 `PeerView[]` | — |
| `query_transcript` | 历史分页 | `unknown session` |
| `send_message` | 投递 `steer/followUp` | `peer offline`、`peer did not respond` |
| `cancel` | 中止目标当前回合 | 同上 |

### 4.2 hub 推送（hub → 扩展）

| push | 语义 | 扩展行为 |
| --- | --- | --- |
| `deliver_message` | 把文本交给目标 pi | `pi.sendUserMessage(text, {deliverAs})`，回 `push_response` |
| `cancel` | 中止当前回合 | `ctx.abort()` |
| `peer_state_changed` | 被关注 peer 的状态变更（fire-and-forget，不等回复） | 隐藏消息（`pi-mesh-peer-state`，`triggerTurn:false`）+ toast |

`send_message`/`cancel` 是**请求型推送**：hub 等目标的 `push_response`，10s 超时。
`peer_state_changed` 是**通知型推送**：写失败就算了，绝不阻塞注册表变更。

诚实说明：扩展当前对 `deliver_message` 一律回 `disposition: "started"`。
`steer` 与 `followUp` 的真实排队语义由 pi 的 `deliverAs` 决定，mesh 不自己造队列。

### 4.3 HTTP / WS（WebUI，仅 127.0.0.1）

```text
GET  /api/peers                                   { peers: PeerView[] }
GET  /api/peers/:id/transcript?limit&beforeEntryId&theme
                                                  { entries: TranscriptEntry[] }
GET  /api/peers/:id/review                        { ok, files, tree, stats, ... }
POST /api/peers/:id/message   {text,mode,fromSessionId?}
POST /api/peers/:id/cancel
POST /api/peers/:id/follow | unfollow  {targetSessionId}
POST /api/peers/:id/resume    {fork?}
POST /api/peers/:id/focus
POST /api/herdr/new-session   {cwd?,label?}
GET  /api/herdr                                   { agents: [...] }
GET  /api/events                                  SSE: peers / file_activity
WS   /api/terminal?target&mode=control|observe&cols&rows
GET  /                                            静态 WebUI
GET  /vendor/*                                    node_modules（wterm 等 ESM）
GET  /cdn/*                                       钉版 tailwind/alpine/lucide
```

HTTP 的输入校验在边界完成：非法 JSON / 缺字段 / 非法 mode → 400；未知会话 →
404；业务失败（herdr 不可用、临时会话）→ 200 + `{ ok:false, message }`。
SSE 的 `peers` 帧有 1s 节流，`file_activity` 立即广播。

## 5. 数据流

### 5.1 启动与自举

```text
session_start
  → loadConfig(~/.pi/pi-mesh/config.json)   非法则回退默认（不杀会话）
  → ensureHubRunning(home)
      probe socket → 无响应则清掉陈旧 socket 文件
      → spawn detached `bun src/hub/daemon.ts --home <home>`
      → 最多 3s 轮询；失败也不抛
  → detectSessionMode(ctx.sessionManager, argv)
  → MeshClient.connect() → onReconnect → register(peer, git)
  → setInterval(heartbeat)
```

hub 挂了不影响 pi：客户端以 1s→30s 指数退避重连，每次连上都重发 `register`。

### 5.2 心跳与掉线

扩展按 `agent_start` / `agent_settled` / `agent_end` 维护本地 `runState`，每 15s
上报一次。hub 每 15s `sweepOffline()`，超过 45s 静默的 live peer 转 `offline`
并触发关注者通知。连接断开**不**直接改状态——让 sweep 统一裁决。

### 5.3 文件活动

`tool_execution_start` 按 `toolCallId` 暂存 args（`tool_execution_end` 不带参数），
`end` 时只认 `edit` / `write`，500ms 批量合并上报。hub 按时间倒序保留 50 条。

### 5.4 关注与状态通知

```text
follow(self → target)        有向边存在 self.following
target 状态变化
  ├─ 关注者的 socket → peer_state_changed → 隐藏消息 + toast（不触发回合）
  └─ hub 侧 herdr notification show（仅当存在关注者）
```

通知只带身份（sessionId 尾 8 位、标题、状态、分支），**永不包含 transcript 文本**。

### 5.5 互发与取消

```text
CLI / WebUI
  → hub.handle(send_message)
  → routePush(deliver_message) ── 目标连接必须在线且非 offline/closed
  → 目标扩展 api.sendUserMessage(text, {deliverAs})
  → push_response → hub 回 { ok, disposition }
  → 成功时自动补一条 sender → target 的关注边
```

`cancel` 走同一条路由，目标是 `ctx.abort()`。目标不在线统一 `peer offline`。

### 5.6 历史（transcript）

```text
GET transcript
  → readTranscript(sessionFile, {limit, beforeEntryId})
      只取 type=="message"，拍平 text block，toolResult 截 500 字
  → 服务端 markdown：satteri + expressive-code + mermaid（按 theme）
  → JSON entries（prose 带 html，toolResult 不带）
  → WebUI DOMPurify.sanitize → 注入
```

`limit` 取最新 N 条；`beforeEntryId` 是向更早翻页的游标（未知游标回退到尾部）。
JSONL 被删的幽灵记录 → 404「会话文件已不存在」。

### 5.7 Review

```text
会话 JSONL（原始 toolCall + toolResult.details，不复用 transcript 的拍平结果）
  → write / write_file            → 整文件 add/replace hunk
  → edit / multi_edit / apply_patch → 每个 old/new 对一条 hunk
  → bash / shell / exec           → shell note（不是文件改动）
  → files[] + tree + stats
```

Review 是独立模块：hub 侧 `review.ts` 出数据，浏览器侧 `review.js`
（`window.PiMeshReview`）出视图；每个 hunk 在 shadow root 内渲染，使用**独立的**
DOMPurify 实例，避免与 `app.js` 的 hook 列表互相污染。

### 5.8 Resume（把死会话放回 herdr）

```text
mesh resume / WebUI 恢复
  → 预检：sessionFile 存在、cwd 存在；--print 到此为止（零副作用）
  → hub claim_resume（CAS，60s TTL）   already live / lease held 直接拒绝
  → herdr workspace：label pi-<tail8> 存在即复用，否则 create
  → herdr agent start … -- pi --session <file>（或 --fork）
  → record_resume（血缘，best-effort）
  → 被拉起的 pi 自己 register → 同一条 peer 复活
```

- 人类触发默认聚焦；`PI_SESSION_ID` 存在（agent 触发）默认 `--no-focus`。
- `--fork` 是逃生舱：新会话，不续写原 JSONL。
- 失败点全部返回可读中文消息 + 已执行的命令计划。

### 5.9 终端桥

```text
浏览器 WTerm/ghostty ──WS /api/terminal──► hub terminal.ts
  → spawn `herdr terminal session <mode> <target> --cols N --rows N`
  → 双向 JSONL 原样透传（无翻译层）
       → {"type":"terminal.input","bytes":"<b64>"}
       → {"type":"terminal.resize","cols","rows"}
       → {"type":"terminal.scroll",...} / terminal.release
       ← {"bytes":"<b64>"} … {"type":"terminal.closed"}
```

- `observe` 模式服务端丢弃所有输入（只读镜像）。
- target 正则、cols 20–400、rows 5–200 在边界校验。
- 同一 `mode:target` 的新 attach 会回收上一个子进程（浏览器被硬杀时的孤儿守卫）；
  WS 关闭先 EOF 让 herdr 干净 detach，2s 后仍在则 kill。

## 6. 持久化

- `~/.pi/pi-mesh/registry.json`：`{ version, peers[] }`，500ms 防抖写，SIGINT/SIGTERM
  时 `flush()`；文件损坏 → 空启动（不崩 hub）。
- 租约只在内存里：TTL 短，重启即失效是正确语义。
- `~/.pi/pi-mesh/hub.log`：启动/停止等少量事件，写失败被吞掉。

## 7. 失败语义与安全边界

| 故障 | 行为 |
| --- | --- |
| hub 不在 | 扩展静默重连；会话照常工作 |
| 配置非法 | 回退默认 + stderr，不阻断启动 |
| registry 损坏 | 空启动 |
| 目标离线/已关闭 | `peer offline` |
| 目标 10s 不响应 | `peer did not respond` |
| JSONL 被删 | transcript 404；review 返回 `ok:false` |
| 临时会话 | 历史 / Review / 恢复显式拒绝并说明原因 |
| herdr 缺失 | resume / 终端 / 通知降级，不报错到会话 |
| 终端子进程残留 | 新 attach 回收 + 关闭后 kill 兜底 |

安全红线：

1. HTTP 只绑 `127.0.0.1`；终端 control 模式等于本机 shell 权限。
2. 通知 / toast 只带身份，不带 transcript 内容。
3. 会话 JSONL 里可能有用户输入的密钥；历史渲染必须过 DOMPurify，Review 只读。
4. 服务端 markdown 不是信任边界：satteri 会把原始 HTML 原样透出，浏览器侧
   sanitize 才是边界。

## 8. 模块地图

| 路径 | 职责 |
| --- | --- |
| `index.ts` | 扩展入口：`/mesh` 命令 + `resources_discover` skill + hooks；注册零 tool |
| `src/protocol.ts` | **SSOT**：wire/domain 类型、错误串、路径约定、HTTP API 注释 |
| `src/config.ts` | 配置加载 + fail-fast 校验 |
| `src/client.ts` | MeshClient：JSONL 请求/响应、push 处理、1s→30s 重连 |
| `src/hooks.ts` | 生命周期、心跳、文件活动、session 模式自报、入站 push |
| `src/ensure-hub.ts` | hub 自举（probe → detached spawn → 轮询），永不抛 |
| `src/git-info.ts` | repo/worktree/branch 解析；非 git 仓库返回全 null |
| `src/command.ts` / `src/mesh-panel.ts` | `/mesh` 交互面板（`ctx.ui.custom` overlay，纯文本渲染） |
| `src/cli.ts` | `mesh` CLI；JSON 默认，`--table` 人类视图 |
| `src/resume.ts` | herdr 编排：计划、预检、CAS 门、工作区复用、聚焦、新建对话 |
| `src/notify.ts` | hub 侧 herdr 通知（仅身份信息） |
| `src/hub/daemon.ts` | 组装 registry + socket + HTTP + 终端 WS + 定时 sweep/purge |
| `src/hub/server.ts` | socket 服务 + 共享 `HubRouter`（HTTP 复用） |
| `src/hub/registry.ts` | peer 状态机、关注图、resume 租约、保留期、防抖持久化 |
| `src/hub/http.ts` | REST/SSE/静态/`/vendor`/`/cdn`；输入校验 |
| `src/hub/transcript.ts` | JSONL → `TranscriptEntry[]` + 分页 |
| `src/hub/markdown.ts` | satteri + expressive-code + mermaid → 历史 HTML |
| `src/hub/review.ts` | JSONL 原始工具调用 → hunks / tree / stats |
| `src/hub/terminal.ts` | herdr 终端 WS 桥 + 孤儿回收 |
| `src/hub/public/` | WebUI：`app.js`（纯函数置顶）、`app.css`（token）、`review.*`、`cdn/` |
| `skills/pi-mesh/SKILL.md` | 模型唯一能力面（渐进 skill，CLI 驱动） |

## 9. 加一个能力（固定顺序）

1. `src/protocol.ts`：加请求/推送/字段，写清错误串。
2. `src/hub/registry.ts`：状态变更 + 纯函数（可单测的迁移/排序/过期）。
3. `src/hub/server.ts`：路由分支；需要 HTTP 就同时在 `http.ts` 暴露。
4. `src/client.ts` / `src/cli.ts` / `src/command.ts`：调用面。
5. `src/hub/public/app.js` + `index.html`：UI（纯 helper 置顶，便于测试）。
6. `skills/pi-mesh/SKILL.md`：只有模型需要知道时才写；否则保持沉默。
7. 测试：registry 纯函数、server 路由、CLI/端到端、WebUI 静态契约。
8. 本文 + `AGENTS.md` 模块表同步。

反向检查：这个能力是否让 hub 主动 spawn 了进程？除 resume/终端/新建对话外，
答案必须是「没有」。
