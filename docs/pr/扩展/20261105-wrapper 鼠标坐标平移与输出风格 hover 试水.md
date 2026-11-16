---
id: "2026-11-05-wrapper 鼠标坐标平移与输出风格 hover 试水"
title: "wrapper 鼠标坐标平移与输出风格 hover 试水"
status: "merged-locally"
created: "2026-11-05"
updated: "2026-11-05"
category: "扩展"
tags: ["workhub", "pr", "pi-extension", "tui", "mouse", "hover"]
---

# wrapper 鼠标坐标平移与输出风格 hover 试水

> 修掉 wrapper 转发的坐标偏移；由子代理试水给输出风格插件加 hover，父级复核并补验证。

## 背景与目的 (Why)

点击 PR 记录了「wrapper 转发未平移 y/x」的已知限制，用户「继续」要求修掉。随后用户要求「让子代理添加 hover 效果，先试水给输出风格插件」，因此本 PR 合并两件独立但同属鼠标交互面的改动。

## 变更内容概述 (What)

### 1. wrapper 坐标平移（3 文件）

| 文件 | 修复 |
|---|---|
| `pi-custom-compaction/src/ui.ts` 模型选择器 | render 时记录 `inputRows` / `listStart`；`y=1..inputRows` 转发给 `Input`（y-1），`y>=listStart` 转发给 `SelectList`（y-listStart），标签行/空行返回 undefined |
| `pi-custom-compaction/src/ui.ts` 设置面板 | 不再直接转发给 `SettingsList`，改为委托 `Container.handleMouse` 并扣掉 `framePanel` 的 1 行上边框 + 1 列左边框（`width-2`），让 Container 按 children 几何逐层派发 |
| `pi-rtk-optimizer/src/zellij-modal.ts` | `ZellijModal` 记录 `lastFrame`，用 `contentStartLine + padding` 平移 y、`1 + padding` 平移 x，并把 width 换成 `contentWidth`；`ZellijSettingsModal` 记录 `lastRenderWidth/Height` 并委托 `Container → Box → SettingsList` 逐层派发 |

`pi-rtk-optimizer/src/config-modal.ts` 的 wrapper 已转发给 `ZellijModal`，由后者自行平移，无需改动。

### 2. hover 试水（1 文件，子代理实现）

`output-styles/style-selector.ts`：
- `private hoveredIndex`
- `move + button==="none"` 分支：`rowMap[y]` 得到 hovered index（不可选行清 hover）；无变化返回 `{handled:true, render:false}`，有变化返回 `{handled:true, render:true}`
- render 里非选中行用 `dim` 的 `"- "` 前缀 + `bold(label)`，与选中态 `warning` 的 `"> "` 箭头明显区分；行宽由 `visibleWidth` + `truncateToWidth` 保持，rowMap 1:1 对齐不变
- hover 不改 `cursor` / `pressedIndex` / `scrollOffset`；wheel / press / click / 键盘 / footer 全部原样

**父级复核补修 2 处**：`applyFilter()` 里清 `hoveredIndex`（否则过滤后残留旧绝对下标）；hover 前缀 `· `(U+00B7) 换成 ASCII `"- "`（消除歧义宽度导致边框错位的风险）。

## 关联 Issue

- **Issues:** `docs/issues/扩展/20261105-wrapper 鼠标坐标平移与输出风格 hover 试水.md`
- 关联前序：`docs/pr/扩展/20261105-本地 TUI 扩展补齐鼠标点击事件.md`

## 测试与验证结果 (Test Result)

- [x] 4 个改动文件 `bun build --target=bun --packages external` 全部通过
- [x] `tsc --noEmit` strict：114 条错误与基线归一化集合完全一致（新增 0 / 移除 0），无 hover / `TuiMouse` / TS2416 相关错误
- [x] **46 个测试通过**（29 上一轮 + 14 点击契约 + 3 个真实 `StyleSelectorComponent` hover 行为测试）
  - hover 不改 cursor、视觉输出变化、同位置重复 move 返回 `render:false`
  - 不可选行清 hover、`drag` / 右键 press 返回 undefined
  - wheel / press 路径回归
- [x] 既有 23 个测试全部通过
- [ ] 交互式人工回归（需在全屏 TUI `/reload` 后实测；子代理无 shell 权限，构建/tsc 由父级补跑）

## 风险与影响评估 (Risk Assessment)

| 轴 | 影响 |
|---|---|
| UX | wrapper 点击现在命中正确行；hover 提供轻量指针反馈。**tmux/zellij/screen 下不发 `move`，hover 静默降级**，键盘与点击仍完整 |
| DX | wrapper 统一改为「记录几何 + 平移后委托」；hover 是单组件试水，未抽共享抽象 |
| Agent 可读性 | hover 依赖 `move` 默认不重绘这一非显然行为，已在代码注释与 Issue 中锁定；契约测试断言其它组件不受影响 |

## 已知限制 / 未验证项

- 未做真实全屏交互回归；hover 视觉在真实主题下的对比度未经肉眼确认。
- hover 目前只在 `StyleSelectorComponent` 试水，未推广到其它 10 个自绘组件。
- 工作区存在 `pi-custom-compaction/src/ctx.ts` 等其它会话的并行编辑，本 PR 未触碰。

## 回滚方案 (Rollback Plan)

逐文件 `git diff` 反向应用；未改动跨模块数据格式。不要用全量 `git restore .`。

## 变更类型

- [x] 🐛 Bug Fix（wrapper 坐标偏移）
- [x] ✨ New Feature（hover 试水）
- [x] 📝 Documentation

## 文件变更列表

| 文件 | 变更类型 | 描述 |
|------|---------|------|
| `extensions/pi-custom-compaction/src/ui.ts` | 修改 | 2 处 wrapper 平移 / 委托 |
| `extensions/pi-rtk-optimizer/src/zellij-modal.ts` | 修改 | ZellijModal + ZellijSettingsModal 坐标契约 |
| `extensions/output-styles/style-selector.ts` | 修改 | hoveredIndex、move 分支、hover 视觉、过滤清态 |
| `docs/issues/扩展/20261105-wrapper ...hover 试水.md` | 新增 | Issue |
| `docs/pr/扩展/20261105-wrapper ...hover 试水.md` | 新增 | 本 PR |
| `docs/pr/扩展/20261105-本地 TUI 扩展补齐鼠标点击事件.md` | 修改 | 「已知限制」标注已修复，避免文档说谎 |

## 测试命令

```bash
cd /tmp/mouse-wheel-test && bun test
cd ~/.pi/agent && bun test ./extensions/pi-mesh/test/mesh-panel.test.ts ./extensions/pi-custom-compaction/tests/ctx.test.ts ./extensions/pi-rtk-optimizer/src/config-modal-test.ts
bunx --bun tsc -p /tmp/mouse-tsconfig.json
```

## 破坏性变更 / 依赖变更 / 安全影响

- [x] 否 / 否 / 否

## 最终状态

- **合并时间:** 2026-11-05（本地工作区，未提交）
- **合并人:** π-zero
- **Commit Hash:** 未提交
- **部署状态:** 待 `/reload` 生效
