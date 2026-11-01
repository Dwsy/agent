# pi-mesh UI/UX 重构规格 — "Session Workbench"

（来源：/root/ux_research 调研 + /root/ux_design 设计，经 /root 裁决合成。
本文件是实施与验收的唯一规格。）

## 裁决结论

三栏工作台（方案 A）为基座 + ⌘K 命令面板（方案 B）+ 终端最大化逃生舱（方案 C 的 dock 思想）。
移动端 = 底部 tab 栏 + 全屏推入式详情（PSM AppMobileLayout 模式）。
风格 = native 应用外壳 + 精致打磨（polish layer 为一等验收标准）。

## 问题诊断（为什么重构）

1. 「1 卡片」根因：一个动作行堆 6–9 个控件（关注/发消息/取消/恢复/终端/进入/copy/Review/历史），无主次。
2. 历史/Review/终端全是模态抽屉（640/960/880px），遮住列表，上下文尽失，无法并看。
3. 卡片是杂物抽屉：元数据+文件+动作+内联 compose 同块，compose 展开挤动网格。
4. 无选择模型、无键盘导航、无搜索/过滤；tooltip 藏关键信息。
5. 单会话线性，无多功能面（跨会话文件时间线/关注图/活动总览）。
6. 移动端不可用：10px 字、~24px 按钮、换行按钮行、全宽抽屉。
7. 风格 generic web：mono 满屏 + dashboard 面板，非 native。

## 布局

### 桌面 ≥1180px

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopBar 44px: pi-mesh [⌘K 搜索/命令]  当前视角▾  SSE●  ☾  ⟳  ⏸          │ vibrancy
├─────────┬──────────────────────────────────┬─────────────────────────────┤
│GroupRail│ SessionList (flex, min 380px)    │ DetailPane 420–560px        │
│ 240px   │ filters [全部 n][运行 n][等待 n]…│ 概览 历史 Review 终端 文件   │ tabs 36px
│ ▾ repo  │ ──────────────────────────────── │ ─────────────────────────── │
│  ├ wt   │ ● 标题…   ⎇main 🖥 ↻2   2m      │ (tab content, scrolls)      │
│  │ └ br │   model · 3 files                │                             │
│  └ br   │ ──────────────────────────────── │─────────────────────────────│
│ ▾ repo2 │ ◌ 等待中…  ⎇dev         18m      │ [Composer 转向|追问 ▢ 发送] │ footer
└─────────┴──────────────────────────────────┴─────────────────────────────┘
```

- 900–1179px: GroupRail → 48px 图标栏 + flyout；DetailPane 右侧浮层 min(560px,92vw) + scrim。
- 600–899px: repo chips 条 + 全宽列表，detail = 推入视图。

### 手机 ~390px

```
┌─────────────────────────┐  ┌──────────────────────────────┐
│ ≡ pi-mesh        🔍  ☾  │  │ ‹ 返回  标题 · ⎇main      ⋯ │
│─────────────────────────│  │ 概览 历史 Review 终端 文件 → │ 滚动 tabs
│ [搜索实例…         ]     │  │ (全屏推入视图)               │
│ repo chips ▸ …          │  │                              │
│ ● 标题…      ⎇main  2m  │  │──────────────────────────────│
│ ◌ 标题…      ⎇dev   18m │  │ [转向|追问][输入…      ][发送]│
│─────────────────────────│  └──────────────────────────────┘
│  会话    发现    设置    │ bottom tab bar 49px + safe-area
└─────────────────────────┘
```

- 触控目标 ≥44×44（行 48px），间距 ≥8px；edge-swipe 返回、下拉刷新、长按行=overflow。
- 历史紧凑（工具链折叠、15px）；Review 文件列表优先→点文件全屏 diff；终端全屏、触屏默认 鼠标·本地、顶部提示「触屏终端为受限体验」；Composer 钉底、visualViewport 感知。

## 动作安置（取代「1 卡片 8 按钮」）

- 行级仅 3 个一键：发消息（选中+聚焦 Composer）、终端（herdr peer）、⋯ overflow。
- Overflow 菜单：关注/取消关注、恢复(+fork 复选 ConfirmPopover)、进入 herdr、复制 focus 命令、复制 sessionId、查看 Review。
- DetailPane 上下文工具栏（按状态主操作）：running→取消（ConfirmPopover）；offline/closed→恢复（fork 复选）；herdr→进入+复制命令；关注 eye 常驻。
- Composer 常驻 DetailPane 底部（所有 tab）：分段 转向|追问 + textarea（Enter 发送 / Shift+Enter 换行）+ 发送。
- ⌘K CommandBar：模糊命令——聚焦会话/发消息/打开终端/Review/恢复/进入 herdr/切换主题/过滤状态/暂停实时。

## 交互模型

- 键：↑↓ 选行（环绕）· Enter 聚焦详情 tab · 1–5 切 tab · / 搜索 · t 终端 · r Review · h 历史 · m composer · f 关注 · e 进入 herdr · Esc: popover→CommandBar→退出终端全屏→清搜索。
- 终端仅在表面获得焦点时捕获按键（点击聚焦）；onEscape 保持终端优先级。
- 选择：selectedId 持久化（localStorage + URL hash `#p=<sid>&tab=<t>`）；SSE 刷新不动选择；peer 消失→最近行+toast。
- 焦点：3 个 role="region"；列表 roving tabindex；focus-visible 2px `--accent` offset 2px；切 tab 移焦到面板标题，绝不自动聚焦终端。
- 抽屉：历史/Review 抽屉废除（进 tab）。终端 ⛶ 展开 = 全屏浮层（复用 `.drawer` class 与同一 `x-ref="termHost"` 元素，openTerminal 内部不变），Esc 收回 tab。

## 组件清单（名 — 规格 — 吸收自）

- `AppShell` — CSS-grid 三栏 + 移动推入路由。吸收 `<main>`。
- `TopBar` — 品牌、⌘K、视角选择、SSE pill、主题、刷新、暂停。吸收 `<header>`。
- `GroupRail` — repo→worktree→branch 树 + 计数 + 状态过滤 chips（计数从 header 移来）。吸收 `grouped`。
- `SessionList` — 扁平分区 + sticky 分支头。吸收嵌套 `x-for="g in grouped"` 面板。
- `PeerRow` — 40px(48 触控)：StateDot、标题、model/branch/chip-herdr/chip-resume ↻N、文件数、relTime、发消息+终端+⋯。吸收 `<article class="card">` + filebox。
- `RowOverflowMenu` — 原生弹出菜单。吸收卡片动作簇。
- `ConfirmPopover` — 锚定确认（取消/恢复+fork）。替换 confirmSid/resumeSid 内联。
- `Composer` — 分段模式+textarea+发送。吸收 compose/cstate/toggleCompose/setMode/send。
- `DetailPane`+`DetailTabs` — 5 tab、懒内容、滑动指示条。
- `OverviewPanel` — 身份（title/sid8/cwd-copy/model/pid/startedAt/lastHeartbeat）、GitBlock、ResumptionTimeline、FollowBlock、FilesSummary（最新5→查看全部）、上下文动作。新组合。
- `HistoryPanel` — 原样吸收 drawer + openHistory + entry/toolrun 模板（buildHistory/mdHtml/esc 不变）。
- `ReviewPanel` — 吸收 review 抽屉；`window.PiMeshReview.open(el,{sessionId,theme,baseUrl})` 不变；主题切换重开。
- `TerminalPanel` — 吸收 term 抽屉 + `openTerminal(p)`（签名不变）；`x-ref="termHost"`；瘦工具栏保留 控制/观察、鼠标·自动/本地、重连。
- `FilePanel` — 完整 files[] 按目录分组（path/op/relTime），点按→Review 聚焦该文件；空态「尚无文件改动」。
- `CommandBar` — ⌘K 模态，分组命令 + 最近会话。新建。
- `ToastStack`（重饰）、`SkeletonRows`、`EmptyState` — 替换 spinner + `.empty`。

## 视觉语言 — native 应用外壳

- Chrome：TopBar 44px / 工具栏 36px；`backdrop-filter: blur(20px) saturate(1.8)` + `--panel`@72%（实色回退）；1px `--border` 发丝分割线替代边框盒子；无浮动卡片、无圆角面板汤。
- 字体：`-apple-system,"SF Pro Text","PingFang SC",Inter,sans-serif`（mono 仅 终端/diff/路径）。字阶 桌面/移动：11/12 caption · 12/13 row · 13/15 body · 15/17 title · 20/22 large。字重仅 400/500/600；≥15px 字距 −0.01em。
- 密度：行 40/48px · chips 18px/10px/500 · 4px 网格（4/8/12/16/24/32）· 面板内边距 12px。
- 状态色仅用于 点+徽章底纹（`--*-soft` 底、`--*-border`、`--*` 文字），绝不做面板填充。选中行：`--accent-soft` + 2px `--accent` 左条。
- 控件：分段胶囊（`--panel-3` 轨、`--panel` 滑块+发丝线+微阴影）；图标工具钮 28×28（触控 44）；原生菜单 8px 圆角、24px 项、hover `--accent-soft`。
- 层级：e0 发丝平 · e1 菜单/弹层 `0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.12)` · e2 CommandBar/sheet `0 16px 48px rgba(0,0,0,.24)` · scrim `rgba(0,0,0,.28)+blur(4px)`。
- 主题：保留 `data-theme` 与既有变量名（测试钉 `:root,[data-theme="light"]` 与 --bg/--panel/--border/--text/--muted/--accent/--running/--waiting/--offline/--closed）。新增 `--hairline/--elev-1/--elev-2/--sel-soft`。暗色 #131316 中性、面板 @78% 毛玻璃。

## Polish layer（一等验收标准）

微交互（`cubic-bezier(.2,.8,.2,1)` 除非另注）：
- 行 hover `--panel-2` + 内嵌发丝线 120ms ease-out · 按压 scale .995 + `--panel-3` 80ms
- 选中：左条 0→2px + 底色 160ms · 按钮 hover 100ms、按压 scale .97 60ms、禁用 opacity .4 无动效
- 菜单/弹层开 140ms scale .98→1+fade（原点在触发器）、关 90ms
- tab 指示条滑动 180ms + 内容交叉淡入 120ms（不滑）
- toast 入 220ms translateY(4px)→0+fade、出 160ms、4s 自动消失
- tooltip 延迟 500ms / 60ms 淡入 · 运行点脉冲 2s ease-in-out（opacity .55↔1）
- 骨架 shimmer 1.4s linear（`--panel-2`→`--panel-3`）
- 焦点：`:focus-visible { outline:2px solid var(--accent); outline-offset:2px }` 永不抑制；菜单移焦首项、Esc 还焦触发器
- 加载：`SkeletonRows`（5×PeerRow 几何）首屏；分 tab 骨架（历史 3 文本块、Review 树骨架、终端连接卡）；spinner 仅限终端状态
- 空态：32px Lucide 于 `--panel-3` 圆底 + 13px 标题 + 11px muted 提示
- 滚动条：`scrollbar-width:thin; scrollbar-color:var(--border) transparent`；webkit 8px 圆拇指、hover `--muted`
- chips：每行 ≤4（其余入 tooltip）；双主题对比度 ≥4.5:1
- 光学：图标在热盒内偏移 .5px；固定高 flex 列保持基线；尾部 meta 右对齐 12px 沟槽
- 禁令：无弹跳缓动、无渐变按钮、无行阴影、每面板 ≤2 字重

## 迁移顺序（实施者按序执行，每步后 bun test 全绿）

冻结契约（不得改动）：`API.*`、SSE `enqueue/applyEvent/connect`、`esc()`、`mdHtml`/DOMPurify、`buildHistory`、`resolveHerdrHost`、终端函数（`clampInt…termWheelAction`、`terminalWsUrl`、`buildTerminalTheme`、`termThemeColors`、`loadTermModules`）、`openTerminal(p)` 签名、`PiMeshReview.open(el,{sessionId,theme,baseUrl})`、CSS 变量名 + `:root,\s*\[data-theme="light"\]` 正则。

1. app.css 增量：tokens、字阶、分段/菜单/骨架/滚动条/层级类。测试保持绿。
2. index.html → AppShell 网格；计数移入 GroupRail；旧卡片暂渲染进 SessionList。
3. app.js：加 `selectedId`/`detailTab`；抽屉模板搬进 tab —— 历史→HistoryPanel（entry/toolrun 标记原样）、review→ReviewPanel（`x-ref="reviewHost"` + PiMeshReview.open 调用不变）、终端→TerminalPanel（`x-ref="termHost"`、`term.*` 命名、`setTermMode/setTermMouse/termReconnect/closeTerminal` 保留；onEscape 终端优先正则不变）。
4. 卡片换 `PeerRow` + `RowOverflowMenu` + 停靠 `Composer`；删每卡 compose/confirm；保留测试可见字符串 `↻`、`chip-resume`、`chip-herdr`、`🖥 herdr`、`<span>终端</span>`、`<span>进入</span>`、`<span>恢复</span>`、`rotate-ccw`、`resumeFork`、`--fork`、`分叉新对话，不续写原会话`。
5. CommandBar + 键盘模型 + 选择持久化。
6. 移动层 + polish 通道。

## test/webui.test.ts 预期破坏面（需同步更新断言）

- "follows feature"：`@click="toggleFollow(p)"` → 新 handler 串（overflow + 详情工具栏用 `toggleFollow(p.sessionId)`）。
- "resume feature"：`x-if="p.state === 'offline' || p.state === 'closed'"`、`@click="openResume(p)"`、`resumeSid`、`@click="doResume(p)"`、`@click="resumeSid = null"` → ConfirmPopover 状态（`resumeFor`/`confirmAction`）；这 5 处断言重定向。
- "terminal button + drawer"：`aria-label="herdr 终端"` + "full-height right drawer" 框定 → 改断言 TerminalPanel/浮层；保留 `x-ref="termHost"`、`class="term-host"`、`data-lucide="square-terminal"`、`<span>终端</span>`、`@click="openTerminal(p)"`、`@click="enterHerdr(p)"`、`x-html="esc(term.title)"`、`esc(term.target)"`、观察·只读、chip-term-*、setTermMode/setTermMouse/termReconnect/closeTerminal 串、`@keydown.escape.window`；onEscape 正则在终端优先保持时可通过。
- "history rendering" + "tool-chain collapse"：模板原样搬迁即通过。
- "herdr feature"：保留函数名（enterHerdr/copyHerdrCmd/herdrTip/resolveHerdrHost/copyText）+ chip 串 → 仅 handler 位置断言需改。
- CSS 变量测试：清单含 `.drawer` —— 终端全屏浮层/移动推入壳保留 `.drawer` class 免改（或更新选择器清单）。
- 新增断言：tab 标签 概览/历史/Review/终端/文件、CommandBar（`openCommand`）、键盘（`onListKey`）、移动底栏 会话/发现/设置、`SkeletonRows` 类名。

## 验收（ux_verify 将执行）

0. **硬规（用户明确要求）**：
   - 杜绝 emoji 作图标 —— 图标只能用 Lucide（14/16px 统一规格），含空态/标签栏/按钮/chips/品牌区；规格草图中的 ● ◌ ⎇ 🖥 ↻ ☾ 等字形只是速记，实施时一律换成 Lucide 图标。
   - 杜绝 AI slop —— 无渐变 hero、无滥用毛玻璃、无圆角卡片汤、无发光装饰、无营销式大留白；克制、发丝线、密实、目的性强，像真实原生工程工具。
1. bun test 全绿（含更新后的 webui 断言）。
2. agent-browser 真实截图：桌面 1440×900（三栏+各 tab）、900px（折叠）、手机 390×844（底栏+推入+各 tab）。
3. 逐条核对 polish layer 与「native 质感」；不达标列出回归项返工。
