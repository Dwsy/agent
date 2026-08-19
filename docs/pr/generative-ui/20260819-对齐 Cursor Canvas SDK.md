---
id: "2026-08-19-对齐 Cursor Canvas SDK"
title: "对齐 Cursor Canvas SDK"
status: "ready"
created: "2026-08-19"
updated: "2026-08-19"
category: "generative-ui"
tags: ["workhub", "pr", "canvas", "cursor-sdk"]
---

# 对齐 Cursor Canvas SDK

> 将 Pi `show_canvas` 的 `@gen-ui/canvas` 对齐 Cursor Canvas SDK 公开运行时能力，并把 Canvas 技能说明改为目录优先、模板按需展开。

## 背景与目的 (Why)

Pi 原有 Canvas SDK 只提供少量主题/事件 API 与基础组件，无法直接承载 Cursor Canvas 中常用的布局、表单、图表、Diff、Todo、持久状态和 DAG 布局。Cursor App 的 `canvas-runtime.esm.js` 同时打包了私有宿主协议与 Shiki/grammar 等依赖，因此本次以 Cursor `sdk/index.d.ts` 作为公开 API SSOT，做独立、零新增运行时依赖的兼容实现。

## 变更内容概述 (What)

- 新增独立 `canvas-sdk-source.ts`，覆盖 Cursor `index.d.ts` 的 48 个公开 runtime exports。
- 补齐主题/tokens、持久状态、Canvas actions、布局/排版、Cards/Table、表单、charts、DAG、Diff、Todo、UsageBar、Swatch、CollapsibleSection。
- `useCanvasState` 使用 `project + canvas title` 作为稳定 namespace，在 WebView 存储可用时跨同名 Canvas 重建复用状态。
- `useCanvasAction` 通过 Pi widget event bridge 发出 `canvas_action`，并保持 fire-and-forget，不会误结算 interactive canvas。
- 保留 Pi 增量 API：`sendToAgent`、`sendPrompt`、`sendAnnotation`，以及现有 `DataTable`。
- Canvas `visualize_read_me` 改为能力目录优先；新增 5 个 TSX skeleton，仅在 `templates` 指定时展开。
- 增加 Cursor 公共 runtime surface、模板真实编译、状态/action 宿主契约和渐进式披露测试。
- 少量融合 OpenAI `visualize` skill 的生成判断：最小媒介、首屏有用、展示态交互本地化、plot/table-first 与约 320px 窄宽可读；不复制其 HTML/`window.openai`/D3 宿主实现。
- 补齐 Gallery WebUI Canvas host：严格保留 `sandbox="allow-scripts"`，通过受限 postMessage bridge 代理 Canvas state 与 gallery theme；保存 Canvas 在 WebUI modal 中可正常执行 React bundle。

## 关联 Issue

- **Issue:** `docs/issues/generative-ui/20260819-对齐 Cursor Canvas SDK.md`

## 测试与验证结果 (Test Result)

- [x] Canvas 定向编译/契约测试通过（9/9）
- [x] `theme-templates` 渐进式披露测试通过
- [x] generative-ui Node 测试通过（26/26）
- [x] generative-ui Bun 测试通过（32/32）
- [x] Cursor `index.d.ts` 公开 runtime exports 自动核对：48/48，无缺失
- [x] Canvas 相关文件 scoped `git diff --check` 通过

## 风险与影响评估 (Risk Assessment)

- Canvas SDK bundle 体积明显增加，但仍由 esbuild tree-shake，实际 Canvas 只内联被引用的实现。
- `useCanvasState` 依赖 WebView `localStorage`；存储不可用时安全退化为 React state，不阻塞渲染。
- Cursor `useCanvasAction` 的 IDE 私有动作协议无法原样复用，Pi 侧以结构化 `canvas_action` 事件作为宿主适配边界。
- `DiffView` 保留 Cursor props 与 diff 视觉语义，但不内置 Shiki 语法高亮；避免引入 Cursor 私有高亮 bundle/grammar 依赖。
- 工作区存在与本任务无关的既有修改；本次没有清理、覆盖或回滚这些修改。

## 回滚方案 (Rollback Plan)

回退本 PR 记录列出的 Canvas SDK/模板/指南与测试文件变更，并恢复 `canvas.ts` 使用原最小 virtual SDK source、`tools.ts` 使用原 Canvas document/activation 行为。无需回退依赖或迁移数据文件。

## 变更类型

- [x] ✨ New Feature
- [x] 📝 Documentation
- [x] 🚀 Refactoring
- [x] 🧪 Testing

## 文件变更列表

| 文件 | 变更类型 | 描述 |
|------|---------|------|
| `extensions/generative-ui/canvas-sdk-source.ts` | 新增 | Cursor-compatible Canvas SDK 独立实现 |
| `extensions/generative-ui/canvas.ts` | 修改 | virtual module 接入 SDK；saved canvas 注入 state namespace |
| `extensions/generative-ui/tools.ts` | 修改 | live/saved state namespace；`canvas_action` fire-and-forget |
| `extensions/generative-ui/guidelines.ts` | 修改 | Canvas 技能能力目录与渐进式披露 |
| `extensions/generative-ui/templates/index.ts` | 修改 | 模板 catalog 支持 HTML/TSX 与 widget/canvas target |
| `extensions/generative-ui/templates/canvas-*.tsx.frag` | 新增 | dashboard/charts/form-state/diff/todo TSX skeletons |
| `extensions/generative-ui/canvas.test.mjs` | 修改 | 公共 API、模板、宿主契约回归 |
| `extensions/generative-ui/theme-templates.test.mjs` | 修改 | Canvas catalog-first/按需展开回归 |

## 详细变更说明

### 1. Cursor 公共 SDK 兼容层

**问题：** Pi Canvas 公开能力远少于 Cursor Canvas，生成的 TSX 无法直接复用 Cursor SDK 的组件与 hooks。

**方案：** 以 Cursor `sdk/index.d.ts` 为边界，在独立 `canvas-sdk-source.ts` 中实现全部 48 个公开 runtime exports；保留 Pi 增量 API，但不复制 Cursor 私有宿主协议。

**影响范围：** `show_canvas` 编译时的 `@gen-ui/canvas` virtual module。

### 2. Pi 宿主适配

**问题：** Cursor 的 sidecar state 与 IDE actions 不能直接搬到 Pi WebView。

**方案：** `useCanvasState` 映射到稳定 Canvas namespace 的 JSON localStorage；`useCanvasAction` 映射为 Pi widget event，并明确 fire-and-forget。

**影响范围：** Canvas 状态持久化、interactive Canvas 消息处理。

### 3. 渐进式技能披露

**问题：** 完整 SDK 示例如果直接塞进 read_me 会快速放大上下文。

**方案：** `canvas` 模块默认仅返回能力目录；详细 TSX 示例拆成 5 个 `canvas-*` template，由 `templates` 参数按需加载。

**影响范围：** `visualize_read_me`、模板 catalog，不影响 `show_widget` 原有 HTML 模板。

### 4. Gallery WebUI Canvas host

**问题：** Gallery modal 的 iframe 为安全使用 `sandbox="allow-scripts"`，因此保存 Canvas 虽可执行脚本，但 iframe 是 opaque origin，`localStorage` 不可用；Gallery 自己的 light/dark toggle 也不会天然传播给 iframe。

**方案：** 不增加 `allow-same-origin`。新增受限 parent↔iframe bridge：父页面只对可映射到 `kind: "canvas"` 的 iframe 响应 state get/set 与 theme；state 由 gallery localStorage 按稳定 `canvasStateId` 保存，主题切换通过消息同步。既有 widget feedback/action 仍走原事件 bridge。

**验证：** Headless Chromium/CDP 真实打开 Gallery modal（opaque-origin OOPIF），确认 React 首屏渲染、按钮更新 `useCanvasState`、关闭后重开仍保持状态、Gallery light→dark 后 Canvas `useHostTheme` 与背景同步；sandbox 仍为 `allow-scripts`。

### 5. 少量融汇 OpenAI visualize 生成原则

**问题：** Canvas SDK 能力齐全后，生成端仍可能因为“能做”而过度使用 Canvas、堆叠控制器/KPI 或忽略窄宽布局。

**方案：** 只吸收与 Pi Canvas 相容的判断原则：选择最小媒介、首屏先有用、展示态交互保持本地、数值内容优先 plot/table、侧排内容在约 320px 时改为 wrap/stack。Codex visualize 的 HTML 输出协议、`window.openai` API、CDN/D3 规则与 utility design system 不进入 Pi Canvas。

**影响范围：** `guidelines.ts` 与 `show_canvas` prompt guidance；SDK runtime 和模板结构不变。

## 测试命令

```bash
cd extensions/generative-ui
node --test psm-renderer/index.test.mjs theme-templates.test.mjs storage.test.mjs
bun test canvas.test.mjs gapp/storage.test.mjs gapp/host.test.mjs gapp/tui.test.mjs gapp/subagent.test.mjs
```

## 已知差异

- `DiffView` 不打包 Cursor 的 Shiki syntax-highlighting runtime；`path`/`language` API 仍兼容，未知语言与当前实现均安全退化为纯文本 diff。
- `useCanvasAction` 不直接执行 Cursor IDE 私有动作，而是发出结构化 Pi `canvas_action` 事件，供当前/未来宿主 adapter 消费。

## 破坏性变更

- [x] 否。旧的 Pi `sendToAgent/sendPrompt/sendAnnotation` 与 `DataTable` 继续可用。

## 性能影响

- [x] 可控。SDK 源码增大，但 Canvas 编译仍由 esbuild tree-shake，只打包实际引用的实现。

## 依赖变更

- [x] 否。没有新增 npm/runtime 网络依赖。

## 安全考虑

- [x] 维持现有 Canvas CSP 与无 fetch/XHR/WebSocket 模型；持久化只写同一 WebView 的 JSON localStorage；actions 只通过既有 widget event bridge 传递。

## 文档变更

- [x] `guidelines.ts` 与模板 catalog 已更新为 Canvas 渐进式披露。

## 代码审查检查清单

### 功能性
- [x] 代码实现需求
- [x] 核心边界情况已处理（存储失败、空数据、cycle/back-edge、非有限 usage 值）
- [x] 编译/运行时错误路径保持现有处理

### 代码质量
- [x] Cursor 外部能力移植集中在独立 SDK 模块
- [x] Pi 私有宿主适配保留在 `canvas.ts` / `tools.ts`
- [x] 未引入新的第三方依赖

### 测试
- [x] 有对应单元/契约测试
- [x] 覆盖公开 runtime surface 与渐进式模板
- [x] 全套受影响测试通过

## 审查日志

- **2026-08-19 作者自检**: 48/48 Cursor 公开 runtime exports 覆盖；全套受影响测试通过；scoped diff check 通过。
- **2026-08-19 差异确认**: Shiki 与 Cursor IDE 私有 action host 不直接 vendoring，改为 Pi 可维护的宿主适配。

## 最终状态

- **实现状态:** ready for review
- **合并状态:** 未执行 git commit / merge
