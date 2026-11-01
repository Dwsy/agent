# pi-mesh 风格

> Part A 是视觉与交互的**规范源**；Part B 是代码与测试约定，操作细则仍以 `AGENTS.md` 为准。
> 规则存在的理由写在每条后面——没有理由的规则应当被删掉。

## Part A · 视觉与交互

### A0 定位

**macOS 原生工程工具**，不是 dashboard、不是 landing page、不是聊天应用。

- 参照物：Finder / Mail 侧栏、Inspector 面板、Spotlight 搜索、原生工具栏。
- 密度优先：信息密度高、留白有节奏、层级靠发丝线与字重，不靠卡片与阴影。
- 克制：一屏最多一个强调色焦点；状态色只出现在状态点上。

### A1 五条硬规

1. **图标只用 Lucide**，14/16px，28px 图标按钮；**禁止 emoji 当图标**（🖥 ↻ ⎇ ✗ 一律
   换成 `monitor` / `rotate-ccw` / `git-branch` / `x`）。理由：跨平台渲染不一致，
   emoji 图标是 AI slop 的强信号。
2. **禁止原生表单铬件**：`<select>` 数量必须为 0；复选框、下拉、分段控件全部自绘。
   例外：`textarea` / `input` 保留原生元素（IME / 选区 / a11y），但去掉原生外观。
3. **反 AI slop**：无渐变 hero、无发光、无圆角卡片汤、无营销式大留白、无装饰动效。
   渐变只允许 sticky header 的淡出遮罩。
4. **动效只做 fade**，100–120ms ease-out。禁止 scale / bounce / pulse / shimmer。
5. **颜色只走 CSS 变量**。markup 与 JS 里不出现十六进制色值。

### A2 色彩 token

| 组 | token | 用途 |
| --- | --- | --- |
| 表面 | `--bg` `--panel` `--panel-2` `--panel-3` | 页面 / 内容 / 侧栏与输入 / 凹陷 |
| 导航控件 | `--sidebar` `--control-bg` `--control-selected` `--control-hover` | 连续侧栏底色 / 搜索底色 / 分段选中面 / 悬停面 |
| 导航选中与菜单 | `--sel-soft` `--selection-edge` `--menu-bg` `--menu-selection` | 中性选中底 / 选中边条 / 菜单表面 / 菜单悬停与键盘焦点 |
| 边界 | `--border` `--border-strong` `--hairline` | 常规边框 / 强分隔 / 1px 发丝线 |
| 文字 | `--text` `--muted` `--faint` | 正文 / 次级 / 三级（均需 ≥4.5:1） |
| 强调 | `--accent` `--accent-strong` `--accent-soft` `--accent-border` | 操作 / 焦点 / 主按钮 |
| 语义 | `--running` `--waiting` `--offline` `--closed`（各带 `-soft` `-border`） | 只用于状态点/图标，**不做面板填充** |
| 危险 | `--danger` `--danger-soft` `--danger-border` | 破坏性操作 |
| 层级 | `--shadow-sm` `--shadow` `--shadow-lg` `--elev-1` `--elev-2` | 浮层高度，不用于普通行 |
| 其他 | `--focus` `--scroll-thumb` `--scroll-track` `--sel-soft` `--backdrop` | 焦点环 / 滚动条 / 选中底 / 遮罩 |

- 浅色是默认；`data-theme="light|dark"` 挂在 `<html>`，首屏在 paint 前从
  `localStorage["pi-mesh.theme"]` 引导，未设置时跟随 `prefers-color-scheme`。
- 表面使用等 RGB 通道的中性灰，不混入紫色或蓝色底调；浅色内容为白，侧栏为浅灰；深色内容为 `#1e1e1e`，侧栏为 `#252525`，菜单为 `#2b2b2b`。
- 导航选中通过明度差与中性边条表达。蓝色只用于操作、焦点与活动 tab；身份/用户/助手/工具标签使用统一中性色，不能借用运行或等待颜色。
- 对比度：正文与所有 meta 层在内容、侧栏和选中行上均 ≥4.5:1；双主题由测试与浏览器实测验证。

### A3 排版

| 角色 | 桌面 | ≤899px | 用法 |
| --- | --- | --- | --- |
| caption | 11px | 12px | 计数、时间、次要元数据 |
| row | 12px | 13px | 列表行 |
| body | 13px | 15px | 正文、历史 |
| title | 15px / 600 | 17px / 600 | 面板标题、会话标题 |
| large | 20px / 600 | 22px / 600 | 概览 hero |

- 字重只用 400 / 500 / 600；标题字距 `-0.01em`。
- mono 只给终端、diff、路径、sessionId；正文不用 mono。
- 计数用 tabular numbers；中文与数字混排不额外加空格。

### A4 布局与节奏

```text
4px 网格：间距 4 / 8 / 12 / 16 / 24
TopBar      44px，中性实底，仅发丝底线
列表行      40px（触屏 48px），行内动作 28px
详情 tab    36px，宽度跨 tab 恒定
SessionList 默认 480px，clamp 360–720
DetailPane  吃剩余空间，≥600px
Review      树 180–260px + diff ≥360px；diff 横向滚动，不逐字换行
```

- 两栏只在 ≥1180px；900–1179 列表全宽 + 详情右侧浮层；<900 单列；
  390 底部 tab + 全屏推入详情。
- 分隔用 1px `--hairline`；普通行没有边框、没有阴影、没有圆角卡片。
- 会话行选中用中性 `--sel-soft` 底 + 2px `--selection-edge` 左条；状态过滤用中性分段控件，避免与会话状态色争夺焦点。
- 桌面顶栏左区与列表共用 `--pane-list-w`，拖动分隔线时保持上下对齐；顶栏左区、列表头与 repo sticky 头共用 `--sidebar`，形成连续导航面。≤1179px 顶栏恢复单行布局。
- 拖拽把手只有列表侧一个：1px 视觉线 + 5–6px 热区，`col-resize`；列表 clamp
  360–720、详情 ≥600；拖拽中禁文本选择。

### A5 组件语法

| 组件 | 语法 |
| --- | --- |
| 列表状态过滤 | 一个中性分段控件：12px 标签 + 11px tabular 计数；26px 高、6px 圆角；选中 `--control-selected` + `--text`，仅选中控件用轻阴影；零计数隐藏，`aria-pressed` 声明选中；移动端 44px 目标，横滚不换行 |
| repo chips | 移动端单行条带：`flex: 0 0 auto` + `white-space: nowrap`，标签不压缩、不多行裁字；条带自身横滚 |
| 分组头 | **两层**：repo 头 30px（chevron + 12px/600 + 计数，sticky `--sidebar` 实底，无单独底线，整行点击折叠）+ 分支头 24px（缩进 12px，11px muted，`· N`，静态）。过滤是右侧 14px 图标，hover/过滤中可见，`click.stop`；右键 repo 头保留「新建对话到 herdr」；同名 repo 只在冲突时显示父目录段 |
| 行动作 | 桌面默认 `opacity:0` + `pointer-events:none`；hover / 选中 / `:focus-within` 出现并可点；`hover:none` 始终可见 |
| 顶栏 | 品牌 13/600 + 16px Lucide；左区右侧为「搜索与命令」+ ⌘K 的 28px 轻量按钮；来源选择是「协作来源 + 标题 + chevron」菜单钮，sid 只保留在菜单中；连接文字中性，状态点着色；≤599px 命令入口变为 44px 图标按钮 |
| 列表搜索 | 图标、输入、`/` 快捷键和清空钮在同一个 30px 搜索框内；焦点环落在整个搜索框，输入不再单独画边；清空后焦点留在输入中；移动端 44px |
| 概览 | Inspector：标题即 hero，kv 流式元数据，发丝时间线，轻量文件树，紧凑操作条 |
| Composer | 上方一行显示目标可用状态与协作来源（语义色只落在状态点）；下方保持单一输入框：分段「转向/追问」+ textarea + 发送图标钮都在框内；不再叠加第二条提示行 |
| 菜单 | 8px 圆角、`--elev-1`、发丝边；同一时刻只允许一个实例；行尾/详情「⋯」菜单右缘对齐按钮右缘，来源下拉左缘对齐按钮左缘，间隔 4px；下方不足时翻到按钮上方；右键菜单贴光标。实测尺寸后始终从原始按钮矩形/指针坐标重算，边缘保留 8px |
| Toast | 顶部居中，不覆盖发送按钮；只报结果，不报过程 |
| 空态 | 单盒 + 发丝边 + 一句可执行提示；不用整块语义色填充 |
| 骨架 | 静态块，无 shimmer；首屏图标未水合时 `visibility:hidden`，不显示空占位框 |

### A6 动效

- 只允许 opacity 过渡，100–120ms `ease-out`。
- 每个元素只能有一个动效系统：CSS `@keyframes` 与 Alpine `x-transition` 不能同时
  作用于同一元素（会把 `translateX(-50%)` 吃掉，弹层偏移 280px）。
- 背景标签页的 rAF / wterm paint pump 会停摆：回到前台必须 `fit()` 冲刷重绘。
- 终端画布不参与页面过渡；主题切换后强制重绘。

### A7 图标与图形

- Lucide 统一规格：行内 14px，工具栏 16px，图标按钮 28×28。
- 图标必须有 `aria-label` 或可见文本；纯装饰图标 `aria-hidden`。
- 首屏 chrome 的 3–4 个图标可直接内联 SVG，其余走本地 Lucide，水合后一次性替换。
- 图标名必须是真实存在的 Lucide 名；不存在的名字会让水合守卫永真，
  `createIcons` 无限重跑（实测 120% CPU、弹窗卡死）。

### A8 文案

- 中文界面，短句，动词开头；错误说清「发生了什么 + 下一步」。
- **删除冗余次级标签**：区块标题、说明句、重复 tooltip 能删就删，让结构自己说话。
- 零值不显示（`+0/−0`、`粉丝 0`、空分组计数）；没有信息就不占位。
- 不写营销词、不写「欢迎使用」、不写感叹号堆叠。

### A9 可访问性

- 焦点环：`outline: 2px solid var(--accent); outline-offset: 2px`，不允许 `outline:none`。
- 触控目标 ≥44×44；行高 48px；相邻目标间距 ≥8px。
- 三个 `role="region"`（导航/列表/详情）；列表 roving tabindex；切 tab 焦点落到面板标题。
- 键盘模型完整：↑↓ / Enter / 1–4 / `/` / Esc 逐层退出；打开终端不自动抢焦点。
- 状态不能只靠颜色：状态点 + 文本/图标双重编码。

### A10 反 slop 检查清单（提交前逐条）

```text
[ ] 渲染后 DOM 无 emoji 图标
[ ] <select> 数量为 0；复选框/下拉全自定义
[ ] 无渐变（sticky 遮罩除外）、无 glow、无 pulse/shimmer/scale
[ ] 无卡片汤：普通行无边框/阴影/圆角
[ ] 无零值噪音、无冗余标签、无重复标题
[ ] 双主题对比度 ≥4.5:1，焦点环可见
[ ] 390px 无横向溢出（scrollWidth == 390）
[ ] 图标全部水合，无空占位框，无 console error
```

### A11 安全边界

- 所有插值默认 `esc()`；唯一例外是服务端渲染的 markdown HTML。
- markdown 的服务端渲染不是信任边界：satteri 会把原始 HTML 原样透出，
  浏览器侧 `DOMPurify.sanitize` 才是边界。
- Review 每个 hunk 在 shadow root 内使用独立 DOMPurify 实例，避免 hook 互相污染。
- 会话 JSONL 可能含用户输入的密钥：通知/预览永不渲染 transcript 文本。

## Part B · 代码与测试

### B1 契约优先

- `src/protocol.ts` 是唯一 SSOT：新增字段/请求/推送先落这里，再向下派生。
- 跨模块只通过契约类型交互；不把内部形状（JSONL 行、herdr 原始响应）泄漏出去。
- 错误串是契约的一部分（`peer offline` / `already live` / `lease held`），不要改文案
  除非同步改调用方与测试。

### B2 纯函数 + 注入缝

可测逻辑从 IO 中剥离，这是本仓库的固定写法：

```text
registry.nextStateAfterSilence / isExpired
resume.buildResumePlan / findHerdrHost（HerdrApi 缝）
terminal.parseTerminalQuery / sanitizeClientLine
webui.openerCommand / openWebUi（WebUiDeps 缝）
app.js 顶部：popupPos / clampPaneWidth / buildHistory / termClickAction …
```

新逻辑先问：能不能写成纯函数？能，就不要塞进事件处理器。

### B3 失败策略

| 层 | 策略 |
| --- | --- |
| 配置、HTTP body、WS query、协议请求 | 边界 fail fast，显式错误 |
| hub 自举、注册、心跳、持久化、通知、日志 | best-effort，吞掉异常，绝不打断 pi 会话 |
| 用户动作（resume / 终端 / 新建对话） | 返回可读中文结果 + 已执行计划，不抛到 UI |

### B4 命名与结构

- 文件名 kebab-case；类型 PascalCase；函数/变量 camelCase；常量 `SCREAMING_SNAKE`。
- 布尔用 `is/has/should/can`；注册表/客户端私有字段用 `#field`。
- 一个文件一个职责；超过 ~400 行先想能不能拆（`review.ts` 是领域复杂度，不是借口）。
- 相对导入必须带 `.ts`；tabs；双引号；不用 `any` 跨模块。

### B5 注释

- 只写 why：为什么这样切、为什么不能用更直觉的写法、踩过什么坑。
- 不写「这个函数做什么」——名字已经说了。
- 已知陷阱写进 `AGENTS.md` landmines，而不是散落在代码里。

### B6 依赖与构建

- 无构建步骤：pi 用 jiti 直接加载扩展；WebUI 用 import map + 本地 vendor。
- 新依赖必须成熟且不可替代；优先移植小逻辑。
- `/vendor/*` 映射 node_modules；`hast-util-to-html` 必须指向 `@pierre/diffs`
  下的嵌套副本（版本偏移）。
- `/cdn/*` 是钉版 vendored 的 tailwind/alpine/lucide，不走外网。

### B7 测试

- `bun test` 是门槛；没有测试的改动不算完成。
- hub/daemon 测试用 `mkdtempSync` 临时 home，绝不碰真实 `~/.pi/pi-mesh`。
- 外部系统用缝：`HerdrApi`、`spawnChild`、`NotifyRunner`、`WebUiDeps`。
- WebUI 测试 = 静态契约 + 提取出的纯函数行为；改 `app.js` 后跑 `node --check`。
- 断言正路径；空结果不能通过回归测试。

### B8 验证命令

```sh
bun test                              # 全量
bun test test/mesh-panel.test.ts      # 单文件
node --check src/hub/public/app.js    # WebUI 语法
bun src/hub/daemon.ts --home <tmp>    # 临时 hub
bun src/cli.ts peers --all            # 真实 hub
```
