---
id: "2026-08-19-对齐 Cursor Canvas SDK"
title: "对齐 Cursor Canvas SDK"
status: "done"
created: "2026-08-19"
updated: "2026-08-19"
category: "generative-ui"
tags: ["workhub", "对齐 Cursor Canvas SDK"]
---

# Issue: 对齐 Cursor Canvas SDK

## Goal

让 `show_canvas` 的 `@gen-ui/canvas` 覆盖 Cursor Canvas SDK 的公开能力，并保持 Pi 宿主的事件桥接、主题适配和离线运行特性；Canvas 技能文档改为目录优先、细节按需展开。

## 背景/问题

当前 SDK 只有 `useHostTheme`、事件桥接、`Card`、`Stat`、`DataTable`，与 Cursor Canvas 的布局、排版、表单、图表、Diff、Todo、持久状态、DAG 等能力差距较大。Cursor App 内存在完整运行时 bundle，但其中混入宿主逻辑与语法高亮依赖，直接整包复制会把 Cursor 私有宿主耦合带进 Pi。

## 验收标准 (Acceptance Criteria)

- [x] WHEN Canvas 代码从 `@gen-ui/canvas` 导入 Cursor 公共 API，系统 SHALL 在不引入外部 npm/runtime 网络依赖的情况下成功编译并渲染核心组件。
- [x] WHERE Canvas 读取主题，系统 SHALL 提供 Cursor 风格的 `kind/tokens/palette` 与顶层语义 token 分组，并随 light/dark 变化更新。
- [x] WHEN Canvas 使用 `useCanvasState`，系统 SHALL 在 Pi WebView 可用存储范围内按 key 持久化 JSON 状态，并在存储不可用时安全退化为 React state。
- [x] WHEN Canvas 使用 `useCanvasAction`，系统 SHALL 通过 Pi widget event bridge 发出结构化 `canvas_action` 事件，而不是依赖 Cursor IDE 私有 API。
- [x] WHEN Canvas 使用图表、DAG、Diff、Todo、表单与基础 UI primitives，系统 SHALL 提供与 Cursor 声明兼容的 props/行为基线。
- [x] WHERE `visualize_read_me({modules:["canvas"]})` 仅请求 Canvas 指南，系统 SHALL 默认返回精简 API 目录；详细 skeleton 通过 `templates` 按需展开。
- [x] IF 现有 Pi 专属桥接 `sendToAgent/sendPrompt/sendAnnotation` 被使用，THEN 系统 SHALL 继续支持这些增量 API。
- [x] WHEN 相关测试执行，系统 SHALL 通过 Canvas 编译/校验测试和 generative-ui 受影响测试。
- [x] WHEN 保存的 Canvas 在画廊 WebUI 打开，系统 SHALL 在保持 `sandbox="allow-scripts"`（不启用 same-origin）的前提下正常渲染 React，并支持状态持久化、主题同步与既有事件桥接。

## 实施阶段

### Phase 1: 规划和准备
- [x] 分析 Cursor SDK 声明与 App runtime bundle
- [x] 分析 Pi Canvas 编译、主题与事件桥接
- [x] 确定“公开 API 兼容 + Pi 宿主适配”的方案

### Phase 2: 执行
- [x] 抽离独立 `canvas-sdk-source.ts`，实现主题/tokens/hooks/layout/typography/UI/form primitives
- [x] 实现 chart / DAG / diff / todo / usage / swatch 等 Cursor 公共组件
- [x] 接入 `canvas.ts` virtual module，并保留 Pi 专属桥接
- [x] 把 Canvas 指南改成渐进式目录 + 按需模板
- [x] 扩充编译与契约测试覆盖全部公开 API 类别

### Phase 3: 验证
- [x] 运行 Canvas 定向测试
- [x] 运行 generative-ui 受影响测试
- [x] 审查 git diff 与公开 API 清单

### Phase 4: 交付
- [x] 更新 Issue 状态/Notes
- [x] 创建并填写 PR 变更记录
- [x] 汇总已实现能力与已知差异

## 关键决策

| 决策 | 理由 |
|------|------|
| 不直接 vendoring Cursor `canvas-runtime.esm.js` | bundle 混合 Cursor 私有宿主、Shiki/语法 grammar 与挂载逻辑，体积和耦合都不适合 Pi |
| 以 Cursor `index.d.ts` 为公开 API SSOT | 可验证、边界清晰，同时允许宿主实现不同 |
| SDK 实现独立于 `canvas.ts` | 避免继续扩大编译器文件，符合外部能力移植独立模块原则 |
| `useCanvasAction` 转为 Pi 事件 | Pi 没有 Cursor IDE action host，结构化事件可被 agent/未来 host adapter 消费 |
| DiffView 首版无 Shiki 依赖 | 保持离线、零额外依赖；API 与 diff 视觉契约保留，语法高亮作为可选增强 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| 2026-08-19 | 初始 Workhub skill 路径按 `~/.agents` 查找不存在 | 改读实际 `~/.pi/agent/skills/workhub/SKILL.md` |

## 相关资源

- [x] Cursor SDK 声明: `~/.cursor/skills-cursor/canvas/sdk/`
- [x] Cursor runtime: `/Applications/Cursor.app/Contents/Resources/app/extensions/cursor-agent-exec/dist/canvas-runtime/canvas-runtime.esm.js`
- [x] Pi Canvas: `extensions/generative-ui/canvas.ts`
- [x] Pi 指南: `extensions/generative-ui/guidelines.ts`
- [x] 少量参考: `~/.codex/plugins/cache/openai-bundled/visualize/1.0.21/skills/visualize/SKILL.md`

## Notes

- 目标是 Cursor 公共 SDK 的 API/行为兼容，不复制私有宿主协议。
- `show_canvas` 仍保持单文件 TSX、host-side esbuild、vendored React 18、无 fetch/XHR/WebSocket 的现有安全模型。
- Cursor DiffView 的 Shiki 高亮依赖很重；本阶段保留 path/language API 和纯文本 diff 渲染，不把高亮引擎塞入 SDK。
- Cursor `index.d.ts` 公开 runtime exports 已自动核对：48/48，无缺失。
- 最终验证：Node 测试 25/25、Bun 测试 32/32；Canvas 相关 scoped `git diff --check` 通过。
- Workhub PR 记录：`docs/pr/generative-ui/20260819-对齐 Cursor Canvas SDK.md`。
- 后续按用户要求少量吸收 OpenAI `visualize` skill：仅融合“最小媒介/首屏有用、展示态交互本地化、数值内容 plot/table-first、约 320px 窄宽可读”四类原则；未复制其 HTML 文件协议、`window.openai` 宿主 API、D3/CDN 约束或设计系统。
- Gallery WebUI 兼容已补齐：保存 Canvas 在 `sandbox="allow-scripts"` 的 opaque-origin iframe/OOPIF 内运行；通过受限 parent↔iframe bridge 代理 JSON state 与 gallery theme，不增加 `allow-same-origin`。真实 Chromium/CDP smoke 已验证 React 渲染、状态跨 modal 重开持久化、light/dark 同步。

---

## Status 更新日志

- **2026-08-19**: 状态变更 → in_progress，备注: 完成 Cursor/Pi 能力盘点并开始实现。
- **2026-08-19**: 状态变更 → done，备注: 48/48 公开 runtime exports 对齐完成，渐进式模板与全套受影响测试通过。
- **2026-08-19**: done 状态补充，备注: 少量融入 OpenAI visualize 的媒介选择、首屏有用、交互克制与窄宽自检原则；回归仍为 Node 25/25、Bun 32/32。
- **2026-08-19**: done 状态补充，备注: Canvas 已可在 gallery WebUI 的严格 sandbox 中正常运行；真实 Chromium smoke 验证渲染、持久状态、主题同步，回归更新为 Node 26/26、Bun 32/32。