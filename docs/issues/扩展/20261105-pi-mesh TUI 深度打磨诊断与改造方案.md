---
id: "2026-11-05-pi-mesh TUI 深度打磨诊断与改造方案"
title: "pi-mesh TUI 深度打磨诊断与改造方案"
status: "completed"
created: "2026-11-05"
updated: "2026-11-05"
category: "扩展"
tags: ["workhub", "pi-mesh", "tui", "theme", "ux", "diagnosis"]
---

# Issue: pi-mesh TUI 深度打磨诊断与改造方案

> 诊断先行；用户随后以「set goal 启动」确认开工，Phase 1-3 已全部完成并验证。执行记录见 `docs/pr/扩展/20261105-pi-mesh TUI 主题化·文案瘦身·交互质感.md`。

## 交付形态说明（选项冲突的处理）

用户在多选里同时选了「主题化 + 文案瘦身」「交互质感」和「先只做诊断报告」。前两项定义**改什么**，第三项定义**本轮交付形态**，存在冲突。先按最小风险原则只出可评审文档；用户随后以「set goal 启动」确认开工，并建立持久 goal 驱动 Phase 1-3 全部落地。

## Goal

把 `pi-mesh` 的全屏 TUI 从「照 demo 写的硬编码 ANSI 面板」提升到与 Pi 其它 UI 一致的生产级组件：主题自适应、文案克制、键位与鼠标交互走标准契约，同时保持宽度安全与现有行为不回归。

## 用户选定的范围

| 方向 | 是否本轮范围 |
|---|---|
| 主题化 + 文案瘦身 | ✅ 纳入 |
| 交互质感 | ✅ 纳入 |
| 布局与信息架构重设计 | ❌ **排除**（独立提案，会动 render 几何与 rowMap） |

## 诊断：7 处具体问题（均带行号证据）

| # | 严重度 | 位置 | 现状 | 后果 |
|---|---|---|---|---|
| 1 | 高 | `src/mesh-panel.ts:16-25`；`src/command.ts:155` | 7 个原始 SGR 码常量 `C`（`\x1b[32m` 等）；`ctx.ui.custom` 回调的 `_theme` 参数被直接丢弃 | 明暗主题不自适应；与 Pi 其它 UI 配色脱节；这是「很 low」的根因 |
| 2 | 高 | `src/mesh-panel.ts:41-55` `fit()` | 截断分支注释自承 `re-apply no colors (safe degradation)` | 长标题/长 footer 被截断时整行颜色突然消失 |
| 3 | 中 | `src/mesh-panel.ts:30-38` `displayWidth()` | 手写 CJK/emoji 宽度区间判断 | pi-tui 已有 `visibleWidth()` / `truncateToWidth()` / `wrapTextWithAnsi()`；重复实现且边界不如标准库 |
| 4 | 高 | `src/mesh-panel.ts:868-906` `#footerText()` | 最长一行塞 9 个快捷键，`#pickFooter` 准备了 4 档降级文案 | 用文字补偿弱布局；窄屏下信息反复变化；按键说明与帮助层重复 |
| 5 | 中 | `src/mesh-panel.ts:949-973` `#renderHelpBody()` | 17 行平铺按键表，与 footer 大量重复 | 帮助层没有信息分层，只能靠 dim 整体降权 |
| 6 | 中 | `src/mesh-panel.ts:1029` `#renderRow()`；`:933` `#renderWideBody()` | `width - 17` 列宽魔法数、`leftWidth + 6` 分栏偏移 | 列宽与徽章数量耦合；窄屏精度差 |
| 7 | 中 | `src/mesh-panel.ts:418-450` `#handleInput()` | 6 处裸 ANSI 字面量（`"\x1b[A"` / `"\x1b[5~"` / `"\x1b[C"` …） | 未走 `matchesKey` / `KeybindingsManager`；终端协议差异与自定义键位无法覆盖 |

补充观察：`mesh-panel.ts:1-8` 文件头注释自承「Rendering follows the pi-tui-kit reference demo (examples/demo-simple.ts)」——生产组件参照 demo 实现，解释了上述多数问题的来源。另 pi-tui 会在每行末自动追加 SGR/OSC8 reset（见 `docs/tui.md`），当前每行手写 `C.reset` 属于冗余。

## 做得好、**不要动**的地方

- **宽度安全**：`render()` 所有行经 `fit(line, w)` 压到 viewport 宽度，从不依赖终端换行；CJK 感知正确。
- **异步反馈完整**：`refresh()`（`:345-352`）、`#loadDetail()`（`:624-635`）、`#toggleFollow()`（`:736-757`）都有「加载中 / 成功 / 失败」三段 `#setStatus` + `requestRender()`，`#statusError` 标红。**不要**把「缺加载反馈」写进改造项——那是错误诊断。
- **状态机**：`#searchMode` / `#help` / `#pendingResume` / `#focus` / `#detailOpen` / `#expandedClosed` 的转换有 23 个测试覆盖。
- **鼠标**：双栏 `#splitX` 分流、`#rowMap` 命中、press/click/wheel 三段（上一轮补齐），`command.ts` wrapper 已转发。
- **测试基线**：`test/mesh-panel.test.ts` 23 个测试，覆盖宽度安全、宽窄屏、分组、搜索、follow、resume、帮助层。

## 改造方案（分阶段，每阶段独立验收）

### Phase 1 — 主题化（依赖最少，先做）

1. `MeshPanelDeps` 增加 `theme` 字段；`command.ts:155` 把 `_theme` 改为 `theme` 并注入。**契约变更仅此一处**。
2. 用 `theme.fg("accent"|"dim"|"border"|"success"|"warning"|"error"|"text"|"muted", …)` 与 `theme.bold()` 替换 `C.*`；删除 `C` 常量与手写 `C.reset`（pi-tui 每行自动 reset）。
3. `fit()` 改用 pi-tui 的 `truncateToWidth(line, width, "…", true)` 保留 ANSI；`displayWidth` 改为 `visibleWidth` 的薄封装或直接用标准函数（保留导出以免破坏 23 个测试里对 `displayWidth` 的引用）。
4. 状态色语义化：`STATE_STYLE` 从「绿色/黄色/红色/灰色」改成 theme 语义色（running→success、waiting→warning、offline→error、closed→dim）。

**验收**：23 个测试全绿；新增主题快照测试（分别注入亮/暗两套 mock theme，断言渲染行不含任何硬编码 `\x1b[3` / `\x1b[9` 序列）；所有行仍 `fit` 到宽度；长标题截断后颜色标记未丢失。

### Phase 2 — 文案瘦身

1. footer 常驻只保留 3 个高频动作（如 `↑↓ 选择 · Enter 详情 · ? 快捷键`），`?` 打开帮助层承载其余。
2. 帮助层按语义分组（导航 / 过滤与搜索 / 会话操作 / 其它），组内用对齐列，删掉与 footer 重复的行。
3. 删除 `#pickFooter` 的 4 档降级串（保留一个按宽度兜底的 `truncateToWidth` 即可）。
4. 空状态文案（`:976-981`）保留——它承载「为什么空 + 怎么切换」的信息，不是装饰文字。

**验收**：footer 在 40/60/80/100/140 宽度下均单行、不截断；帮助层行数 ≤ 当前 17 行；`?` 与 `Esc` 路径测试通过。

### Phase 3 — 交互质感

1. 6 处裸 ANSI 键位改走 `matchesKey(data, Key.up/down/pageUp/pageDown/right/left)` 或注入的 `KeybindingsManager`（`command.ts` 回调已有 `_kb` 参数，与 `_theme` 一样被忽略）。
2. hover：沿用上一轮 `style-selector` 试水模式——`move + button==="none"`、`rowMap[y]` 得到行、`hoveredIndex` 不改选中、变化才 `render: true`；视觉用 theme 的 `dim`/`bold`，与选中态 `❯` 区分。**注意 tmux/zellij/screen 下不发 `move`，键盘与点击路径必须完整保留，文案不得承诺 hover**。
3. 检查 footer/帮助层列出的键与 `#handleInput` 实际映射逐项对齐（当前 `b`、`Esc` 在宽窄屏语义有差异）。

**验收**：新增 hover 行为测试（真实 MeshPanel 实例：hover 不改 `#selectedId`、重复 move 返回 `render:false`、drag/右键返回 undefined）；键位映射表与文案一致性断言；23 + 新增测试全绿。

### 明确排除

- 布局重设计（双栏比例、徽章布局、详情面板排版）——独立提案，不折叠进本轮。
- 不引入新依赖、不抽跨扩展共享模块（pi-mesh 是独立加载的扩展）。
- 不改 `#status` 异步反馈机制、不改 `rowMap`/`#splitX` 几何、不改数据协议。

## 三轴成本

| 轴 | 影响 | 说明 |
|---|---|---|
| UX | **提升** | 明暗主题自适应、长行不再掉色、footer 不再随宽度跳变、hover 反馈；regular 模式与复用器下无 hover 是已知降级 |
| DX | **提升** | 删掉自造宽度/颜色层，改为标准 `theme` + `visibleWidth` + `matchesKey`；`MeshPanelDeps` 多一个 `theme` 字段，是唯一契约变更 |
| Agent 可读性 | **提升** | 语义色替代 7 个魔法 SGR 常量；键位集中到 `matchesKey`；文案集中到帮助层；几何与 rowMap 保持不变，行为仍由测试固定 |

可能的负向：Phase 1 会让 `displayWidth` / `fit` 的导出行为变化，需保留导出并补测试；theme 注入让单测的 `stubDeps()` 必须提供 theme mock（23 个测试需同步改 setup）。

## 验收标准（总体）

- [x] 23 个现有测试全部通过（改造前后各跑一次）
- [x] 两套 mock theme 下渲染行不含硬编码颜色 SGR 序列
- [x] `fit` 截断后 ANSI 样式保留（新增回归测试）
- [x] footer 在 40–140 宽度下单行且不截断
- [x] hover 不改变选中态；wheel/press/click/键盘路径无回归
- [x] 键位映射与帮助层文案逐项一致
- [x] 所有行仍 `fit` 到 viewport 宽度，CJK 宽度正确

## 执行结果（Phase 1-3）

| 阶段 | 结果 |
|---|---|
| Phase 1 主题化 | `MeshPanelDeps.theme` + `MeshTheme` 契约；`paletteFromTheme()` 从主题派生颜色前缀；`fit()` 改为 ANSI 感知截断；`STATE_STYLE` 改语义色名 |
| Phase 2 文案瘦身 | footer 从 9 键 / 4 档降级缩到 3 键；删除 `#pickFooter`；帮助层按「导航 / 过滤与搜索 / 会话操作 / 其它」分组，17 行 → 11 行 |
| Phase 3 交互质感 | 6 处裸 ANSI 键位改为注入的 `MeshKeys`（command.ts 惰性加载 `Key`/`matchesKey`）；hover 用 `rowMap[event.y]` + `hoveredIndex`，只在 `move + button none` 生效且变化才 `render:true` |

**关键取舍**：`pi-mesh` 独立加载，测试环境无法解析 `@earendil-works/pi-tui` 裸包（动态 import smoke test 会崩）。因此 `mesh-panel.ts` 保持零 pi-tui 值 import：宽度函数保留自实现（只修截断丢色），键位与主题均通过 deps 注入；`command.ts` 用 handler 内惰性 `await import(...)` 加载 `Key`/`matchesKey`。

**验证**：`bun test ./extensions/pi-mesh/test/` 262 pass / 0 fail；临时脚手架 46 pass；两个改动文件 `bun build` 通过；`tsc` 中 pi-mesh 相关错误基线 0 → 现在 0（唯一新增错误来自其它会话并行修改的 `generative-ui/gapp/tui.ts:397`）。

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| theme 语义色在部分主题下缺失 | 使用 `theme.fg` 的标准色名；不引入自定义色名 |
| `fit` 换成 `truncateToWidth` 后宽度行为微变 | 现有 23 个宽度安全测试作为闸门，改造前后各跑一次 |
| hover 在复用器下无事件 | 代码自然降级；文案不承诺；键盘/点击路径保留 |
| 单测 `stubDeps()` 需补 theme mock | 属于改造所需的测试改动，单独列出 |

回滚：按 Phase 逐文件 `git diff` 反向应用；本方案不改跨模块数据格式。工作区存在其它会话的并行未提交改动，回滚时**只针对 pi-mesh 文件**，不要用全量 `git restore .`。

## 证据来源

- 父级亲自阅读：`src/mesh-panel.ts`（1-60、393-450、500-512、617-660、730-790、810-920、949-1040）、`src/command.ts:150-190`、`test/mesh-panel.test.ts`（23 个 test）。
- pi-tui 官方文档 `docs/tui.md`：每行自动重置样式、推荐 `visibleWidth()` / `truncateToWidth()` / `wrapTextWithAnsi()` / `matchesKey()`。
- 上一轮生产的 hover 契约：`docs/issues/扩展/20261105-wrapper 鼠标坐标平移与输出风格 hover 试水.md`。
- 两个只读审计子代理因陷入收尾循环被终止，其结论未被采信；本诊断全部来自父级第一手阅读。

## 未决问题

1. 用户选项冲突：本轮按「只出报告」执行，待确认是否直接开工 Phase 1。
2. Theme 语义色名需在实际主题实现里核对（当前仓库其它扩展用 `accent`/`dim`/`border`/`success`/`warning`/`error`/`text`/`muted`）。
3. 布局重设计被排除；若用户后续想要，另开独立提案。

---

## Status 更新日志

- **[2026-11-05 02:10]**: 状态变更 → review，备注: 诊断与方案完成，等待用户确认是否开工
- **[2026-11-05 03:00]**: 状态变更 → completed，备注: 用户 set goal 启动，Phase 1-3 全部落地，262+46 测试通过
