---
id: "2026-11-05-pi-mesh TUI 主题化·文案瘦身·交互质感"
title: "pi-mesh TUI 主题化·文案瘦身·交互质感"
status: "merged-locally"
created: "2026-11-05"
updated: "2026-11-05"
category: "扩展"
tags: ["workhub", "pr", "pi-mesh", "tui", "theme", "hover"]
---

# pi-mesh TUI 主题化 · 文案瘦身 · 交互质感

> 把 `/mesh` 面板从「照 demo 写的硬编码 ANSI」提升到主题自适应、文案克制、键位与鼠标走标准契约。

## 背景与目的 (Why)

诊断发现 7 处问题（见关联 Issue），根因是 `command.ts` 丢弃了 `ctx.ui.custom` 回调的 `theme`，面板自定义了 7 个原始 SGR 码常量。用户以「set goal 启动」确认按 Phase 1 → 2 → 3 全部落地。**布局重设计按约定排除**。

## 变更内容概述 (What)

### Phase 1 — 主题化

| 改动 | 说明 |
|---|---|
| `MeshTheme` / `MeshThemeColor` | 最小结构化主题契约（`fg` / `bold`），`MeshPanelDeps.theme` 注入 |
| `paletteFromTheme()` | 从主题派生颜色前缀，替换 `const C = {...}` 的 7 个硬编码 SGR 码 |
| `invalidate()` 重新派生 | 主题热切换后下一次渲染生效 |
| `STATE_STYLE` | `green/yellow/red/gray` → `success/warning/error/muted` 语义色名 |
| 边框 | 4 处 frame 边框改用 `border` 色，不再复用 `accent` |
| `fit()` | 改为 ANSI 感知截断：保留 SGR、按可见宽度截断、未闭合样式补 reset 后输出 `…`；修掉「长行颜色突变」 |
| `displayWidth()` | **保留自实现**（见「关键取舍」） |

### Phase 2 — 文案瘦身

- footer 从 9 个快捷键 + `#pickFooter` 4 档降级 → 常驻 3 键 `↑↓ 选择 · Enter 详情 · ? 快捷键`；搜索/resume/help 三种状态文案保留（承载输入与不可逆后果，不是装饰文字）。
- 帮助层 17 行平铺 → 11 行，按「导航 / 过滤与搜索 / 会话操作 / 其它」分组，组标题用 `accent`、条目用 `dim`。
- 空状态文案保留。

### Phase 3 — 交互质感

- `MeshKeys` 契约注入 6 个方向/翻页键判定，`handleInput` 中 6 处裸 `"\x1b[A"` / `"\x1b[5~"` / `"\x1b[C"` 等字面量全部移除。
- `command.ts` 在 `/mesh` handler 内惰性 `await import("@earendil-works/pi-tui")`，用 `Key` + `matchesKey` 构造注入实现。
- hover：`move + button === "none"` 时用 `rowMap[event.y]` 得到行，`#hoveredIndex` 只影响非选中行标题的 `accent` 着色，**不改选中态**；状态不变返回 `render:false`，右栏详情区清 hover；`drag` / 右键 press 返回 `undefined`。tmux/zellij/screen 下不发 `move`，键盘与点击路径完整保留，文案未承诺 hover。

### 关键取舍（重要）

`pi-mesh` 是独立加载的扩展，其 `package.json` 依赖里没有 `@earendil-works/pi-tui`，且 `test/command.test.ts` 有对 `src/command.ts` 的 import smoke test。第一次尝试在 `command.ts` 顶层值 import `Key`/`matchesKey` 直接让该测试以 `Cannot find module` 失败。因此：

- `mesh-panel.ts` **保持零 pi-tui 值 import**（否则 262 个测试全崩）；
- 宽度函数保留自实现，只修 `fit` 截断丢色（报告里「换 `visibleWidth()`」一条因该约束放弃）；
- 主题、键位均通过 `MeshPanelDeps` 注入；
- `command.ts` 用 handler 内惰性动态 import，运行时 Pi 可解析、单测只 import 模块不执行 handler。

## 关联 Issue

- **Issues:** `docs/issues/扩展/20261105-pi-mesh TUI 深度打磨诊断与改造方案.md`

## 测试与验证结果 (Test Result)

- [x] `bun test ./extensions/pi-mesh/test/` → **262 pass / 0 fail / 2309 expect**（17 个文件，含新增 8 个测试）
- [x] 临时契约/行为脚手架 `/tmp/mouse-wheel-test` → **46 pass / 0 fail**
- [x] `bun build`：`src/mesh-panel.ts`、`src/command.ts` 均通过
- [x] `tsc --noEmit` strict：**pi-mesh 相关错误基线 0 → 现在 0**。全局唯一新增错误 `generative-ui/gapp/tui.ts:397 TS2722` 来自其它会话并行编辑该文件（mtime 与行号整体偏移可证），与本 PR 无关
- [x] `git diff --check` 干净；源码中硬编码颜色 SGR 残留 0、裸 ANSI 键位残留 0
- [ ] 真实全屏交互回归（需 `/reload` 后肉眼确认主题对比度与 hover 视觉）

新增测试覆盖：主题注入生效（两套 mock theme）、`invalidate()` 重派生、`fit` 截断保色、源码无硬编码色、footer 40–140 宽度单行不截断、footer 3 键 + 帮助层分组、键位可注入（自定义键生效 / 旧裸序列失效）、hover 不改选中且只在变化时重绘。

## 风险与影响评估 (Risk Assessment)

| 轴 | 影响 |
|---|---|
| UX | 明暗主题自适应、长行不再掉色、footer 稳定不跳变、hover 轻量反馈；复用器下 hover 静默降级 |
| DX | 删掉自造颜色层与 4 档降级文案；`MeshPanelDeps` 多 `theme` + `keys` 两个字段，是唯一契约变更；`stubDeps()` 同步补 mock |
| Agent 可读性 | 语义色替 7 个魔法 SGR、键位集中到注入契约、文案集中到帮助层；`#splitX` / `#rowMap` 几何未动，行为仍由 262 个测试固定 |

风险点：`paletteFromTheme` 通过 marker 从 `theme.fg` 提取开色前缀（面板是前缀式拼接，Theme 是包装式）。若某主题 `fg` 不把文本原样放在中间，前缀为空 → 降级为纯文本，不会崩溃；已由两套 mock theme 测试覆盖。

## 回滚方案 (Rollback Plan)

逐文件 `git diff` 反向应用：`extensions/pi-mesh/src/mesh-panel.ts`、`src/command.ts`、`test/mesh-panel.test.ts`。未改动跨模块数据格式。工作区存在其它会话的并行未提交改动（`generative-ui/gapp/tui.ts`、`pi-custom-compaction/` 等），回滚时**不要用全量 `git restore .`**。

## 变更类型

- [x] ✨ New Feature（主题化 / hover）
- [x] 🚀 Refactoring（键位与文案）
- [x] 🐛 Bug Fix（fit 截断丢色）
- [x] 📝 Documentation

## 文件变更列表

| 文件 | 变更类型 | 描述 |
|------|---------|------|
| `extensions/pi-mesh/src/mesh-panel.ts` | 修改 | 主题契约、palette、fit、STATE_STYLE、footer、帮助层、MeshKeys、hover |
| `extensions/pi-mesh/src/command.ts` | 修改 | 注入 theme + keys，惰性加载 Key/matchesKey |
| `extensions/pi-mesh/test/mesh-panel.test.ts` | 修改 | stubDeps 补 theme/keys；新增 8 个测试；1 处断言从旧文案改为状态断言 |
| `docs/issues/扩展/20261105-pi-mesh TUI 深度打磨诊断与改造方案.md` | 修改 | 状态 completed + 执行结果 |
| `docs/pr/扩展/20261105-pi-mesh TUI 主题化·文案瘦身·交互质感.md` | 新增 | 本 PR |

## 测试命令

```bash
cd ~/.pi/agent
bun test ./extensions/pi-mesh/test/
bun build extensions/pi-mesh/src/mesh-panel.ts --target=bun --outfile=/tmp/m.js --packages external
bun build extensions/pi-mesh/src/command.ts --target=bun --outfile=/tmp/c.js --packages external
bunx --bun tsc -p /tmp/mouse-tsconfig.json
cd /tmp/mouse-wheel-test && bun test
```

## 破坏性变更 / 依赖变更 / 安全影响

- [x] 否 / 否 / 否（`MeshPanelDeps` 新增两个必需字段属于内部契约，唯一调用方 `command.ts` 已同步）

## 性能影响

- [x] 无实质影响（palette 仅在构造/失效时派生；hover 仅在状态变化时请求重绘）

## 最终状态

- **合并时间:** 2026-11-05（本地工作区，未提交）
- **合并人:** π-zero
- **Commit Hash:** 未提交
- **部署状态:** 待 `/reload` 生效
