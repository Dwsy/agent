---
id: "2026-11-05-wrapper 鼠标坐标平移与输出风格 hover 试水"
title: "wrapper 鼠标坐标平移与输出风格 hover 试水"
status: "completed"
created: "2026-11-05"
updated: "2026-11-05"
category: "扩展"
tags: ["workhub", "pi-extension", "tui", "mouse", "hover"]
---

# Issue: wrapper 鼠标坐标平移与输出风格 hover 试水

## Goal

1. 清掉上一轮点击 PR 记录的「wrapper 转发未平移坐标」遗留问题。
2. 由子代理试水给 `output-styles/style-selector.ts` 加 hover 效果，验证模式后再决定是否推广到其它组件。

## 背景/问题

上一轮把 `handleMouse` 转发给内置 `SelectList` / `SettingsList` 时，没有扣除 wrapper 在子组件输出前拼的表头/边框/内边距行，导致 `event.y` 命中错误行。用户先说「继续」（修遗留），随后要求「让子代理添加 hover 效果，先试水给输出风格插件」。

## 硬约束（父级核实 pi-tui 源码）

- `dispatchMouseEvent`（`pi-tui/dist/tui.js:13`）丢弃不含 `handled || capture || focus` 的结果 → hover 分支必须返回 `handled: true`。
- `applyMouseDispatchResult`（`pi-tui/dist/tui-alt-screen.js:671`）：`move` 的 render 默认 `false` → hover 变化时必须显式 `render: true`，无变化用 `render: false`。
- `TuiAltScreen` 在 `TMUX`/`ZELLIJ`/`STY` 或 `TERM` 以 tmux/screen 开头时只开 1000+1002，**不发 `move`** → hover 在复用器下自动静默，键盘/点击路径必须完整保留，不能改 footer 承诺 hover。
- 内置 SelectList 注释 "Hover must not change selection" → hover 不得改 `cursor`/`selectedIndex`/`scrollOffset`。

## 验收标准 (Acceptance Criteria)

- [x] WHEN wrapper 转发鼠标事件给子组件，系统 SHALL 扣除前置行/列的 y（和 x）偏移
- [x] WHEN 指针 `move` 落在可选行，系统 SHALL 显示 hover 态且不改变选中项
- [x] WHEN hover 状态未变化，系统 SHALL 返回 `render: false`
- [x] WHEN 指针落在不可选行或 `drag`/右键 press，系统 SHALL 清 hover / 返回 `undefined`
- [x] wheel / press / click / 键盘路径保持不变

## 实施阶段

### Phase 1: 规划
- [x] 读取 pi-tui 的 dispatch/render 默认行为与鼠标追踪模式
- [x] 确定 hover 契约与复用器降级策略

### Phase 2: 执行
- [x] `pi-custom-compaction/src/ui.ts`：模型选择器记录 `inputRows`/`listStart` 后分流给 Input / SelectList；设置面板改为委托 `Container.handleMouse` 并扣 1 行 1 列
- [x] `pi-rtk-optimizer/src/zellij-modal.ts`：`ZellijModal` 记录 `lastFrame` 并用 `contentStartLine + padding` 平移；`ZellijSettingsModal` 改为委托 Container→Box→SettingsList 逐层派发
- [x] `output-styles/style-selector.ts`（子代理）：hoveredIndex + move 分支 + 非选中行的 `- ` 前缀与 bold 标签
- [x] 父级复核补修：过滤后清 `hoveredIndex`；`· ` 前缀换 ASCII `- ` 消除歧义宽度风险

### Phase 3: 验证
- [x] 4 个改动文件 `bun build --packages external` 通过
- [x] `tsc --noEmit`：114 条错误与基线归一化集合一致，新增 0，无 hover/TuiMouse 相关错误
- [x] 46 个测试通过（含 3 个真实 StyleSelectorComponent hover 行为测试）
- [x] 既有 23 个测试全部通过

### Phase 4: 交付
- [x] 创建 PR 记录
- [x] 更新上一轮点击 PR 的「已知限制」标注（避免文档说谎）

## 关键决策

| 决策 | 理由 |
|------|------|
| wrapper 优先委托 `Container.handleMouse` 而非直接转发给叶子组件 | Container 已按 children 几何逐层派发，避免手工累加每个 child 的高度 |
| hover 用 `- ` + bold，选中态保持 `> ` + warning | 两套视觉通道明显可区分；纯 ASCII 避免 U+00B7 歧义宽度 |
| hover 只在状态变化时 `render: true` | move 事件高频，避免每次移动都全量重绘 |
| 不改 footer 文案 | hover 在复用器下不可用，文案承诺会误导 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| 2026-11-05 | hover 子代理只有文件类工具，无 shell，无法执行 build/tsc | 父级代为执行并复核；子代理如实报告 blocker，未编造输出 |
| 2026-11-05 | 子代理实现里过滤后 `hoveredIndex` 残留旧绝对下标 | 父级在 `applyFilter()` 里清 hoveredIndex |

## Notes

试水范围仅 1 个组件。推广到其它组件前需评估：每个组件的 `render()` 都要能在 hover 态下保持行宽与 rowMap 1:1 对齐，且必须接受「复用器下无 hover」这一降级。

---

## Status 更新日志

- **[2026-11-05 01:30]**: 状态变更 → in-progress
- **[2026-11-05 01:50]**: 状态变更 → completed，备注: 46+23 测试通过，构建与类型无新增问题
