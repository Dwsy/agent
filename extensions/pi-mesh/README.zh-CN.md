# pi-mesh（中文版）

本机多 pi 会话协作插件，以单个 pi 扩展形式发布。

同一台机器上的每个 pi 会话都会向本地 hub 守护进程注册。用户与 agent 可以查看 peer
状态、文件活动、Git 分组、会话历史，彼此发消息，把死会话恢复到 herdr 工作区，并打开
实时终端——且**不会向任何 pi 注册额外工具**。

## 设计原则

1. **零工具**：不向任何 pi 注册工具。能力面只有渐进注入的 skill `skills/pi-mesh` 与
   `mesh` CLI。
2. **hub 被动**：hub 只维护注册表、路由推送、读会话文件。只在用户显式触发 resume /
   新建会话 / 终端时 spawn 进程。
3. **身份连续**：恢复会话是"同一条会话活过来"，不是新建一条。
4. **状态只影响语义，不影响位置**：peer 始终按 `startedAt`（+ `sessionId`）稳定排序，
   绝不按心跳——心跳不能让列表跳动。
5. **工作台，不是仪表盘**：两栏布局、行列表、常驻详情；拒绝卡片流与模态抽屉。
6. **删除优于新增**：结构能表达的，不靠标签、说明文字、装饰动效。

## 架构

```text
pi 扩展 (index.ts，零工具)              mesh CLI (src/cli.ts)
  hooks：心跳 / 文件活动 /                peers files history send
       消息+取消推送                      cancel follow resume
  skill：skills/pi-mesh（渐进）          /mesh TUI 面板 (command.ts)
        │  JSONL over unix socket / named pipe     │
        └──────────────┬─────────────────────────────┘
                       ▼
   hub 守护进程 (src/hub/daemon.ts)  ~/.pi/pi-mesh/mesh.sock
     server.ts   请求路由 + 推送路由 (deliver_message/cancel)
     registry.ts peer、关注图、resume CAS 租约、7 天保留期
     http.ts     REST + SSE + 静态 + /vendor/ (node_modules)
     terminal.ts WS 桥接 `herdr terminal session`（JSONL 原样透传）
     markdown.ts satteri + expressive-code + mermaid → 历史 HTML
     review.ts   会话 JSONL → 变更文件树 + diff
                       │
        WebUI (src/hub/public/) — Tailwind + Alpine + Lucide，无构建步骤
        herdr (工作区/agent/终端/通知) — 外部二进制
```

身份模型：一个 peer 记录对应一条 pi 会话（`sessionId` == 会话 JSONL）。
状态：`running | waiting | offline | closed`（心跳推导；closed/offline 保留
`retentionDays`，默认 7 天）。复活会话复用原记录。

## 快速开始

```sh
# 在本目录运行。Bun ≥ 1.1，Node ≥ 18。
bun test                       # 全量套件——交付前必须全绿
bun src/hub/daemon.ts --home <dir>   # 对 scratch home 跑 hub
bun src/cli.ts peers --all           # 与运行中的 hub 通信
```

本机的 live hub 运行在 tmux 会话 `pi-mesh-hub`
（`bun src/hub/daemon.ts --home /Users/dengwenyu`）。它不会热重载——改 hub 代码后重启。

## 能力面（CLI）

```sh
MESH="bun src/cli.ts"
$MESH peers [--all|--table]        # 发现 peer
$MESH files <prefix>               # 文件活动
$MESH history <prefix> --limit 20  # 会话历史
$MESH send <prefix> --mode steer|followUp "..."
$MESH resume <prefix> [--fork]     # 恢复到 herdr 工作区
$MESH follow|unfollow <prefix>     # 状态变更通知
$MESH cancel <prefix>              # 中止对方当前回合
$MESH web [--no-open]              # 打开 WebUI
```

会话 id 接受任意唯一前缀（建议切到唯一尾部）。

## 斜杠命令

| 命令 | 作用 |
| --- | --- |
| `/mesh` | 交互面板：peer、关注、互发、历史 |
| `/mesh-status [copy]` | 一份状态汇总（hub、peer 计数、在线会话）；`copy` 直接复制到剪贴板 |
| `/mesh status [copy]` | 与 `/mesh-status` 同一份汇总 |
| `/mesh web` | 打开 WebUI（必要时先拉起 hub） |

## WebUI

Session Workbench：两栏布局——左 `SessionList`（360–720px 可拖拽）+ 右 `DetailPane`
含三个 tab：会话 / 变更 / 终端。状态过滤只有四档：全部 / 在线 / 离线 / 已关闭。
在线包含 running + waiting。排序按 `startedAt` + `sessionId` 稳定排序，绝不按心跳。

断点：≥1180 两栏；900–1179 列表全宽 + 详情浮层；<900 单列；390 底部 tab 栏。

## 非目标（明确不做）

- SSH 跨机 mesh（协议预留 `machineId`，Phase 5 前不做）
- 自动 resume（恢复必须是人的决定）
- 文件系统 watcher（只认 `edit`/`write` 工具调用）
- 多用户 / 鉴权（单机单用户；127.0.0.1 是边界）
- TUI 发消息 / 鼠标

## 文档地图

`docs/` 是设计空间；代码是事实，文档解释「为什么」。

| 文档 | 什么时候读 |
|---|---|
| `docs/architecture.md` | 协议、状态机、数据流、新增请求类型 |
| `docs/design.md` | 产品形态、交互模型、决策 + 被否决方案 |
| `docs/style.md` | 视觉语言、组件、文案、代码/测试风格 |
| `docs/ux-verify/VERDICT.md` | 真实浏览器验收历史 + 截图索引 |
| `docs/ux-rework-spec.md` | 原始 Session Workbench 规格（历史基线） |
| `AGENTS.md` | 模块地图、命令、编码/测试规则、踩坑清单 |

`docs/ux-*` 是冻结证据：追加新轮次，不覆盖旧判定。

## 运行时常量

| 项 | 值 |
|---|---|
| 心跳间隔 | 15s |
| 离线阈值 | 45s（≥3× 心跳，配置校验强制） |
| 保留期 | 7 天（offline/closed） |
| 临时会话清除 | 静默 10 分钟后 |
| 每 peer 文件上限 | 50（新→旧） |
| resume 租约 TTL | 60s |
| 持久化防抖 | 500ms |
| HTTP 绑定 | 127.0.0.1 |

## 安全

- HTTP 只绑 127.0.0.1；control 模式等于本机 shell 权限。
- 通知 / toast 只带身份信息，绝不带 transcript 内容。
- 会话 JSONL 可能含在 pi 里输入的密钥；历史渲染经 DOMPurify 清洗，Review 只读。
- 服务端 markdown 不是信任边界——satteri 会把原始 HTML 原样透出，浏览器侧
  sanitize（DOMPurify）才是边界。

## 许可

私有。`~/.pi` agent home 的一部分。
