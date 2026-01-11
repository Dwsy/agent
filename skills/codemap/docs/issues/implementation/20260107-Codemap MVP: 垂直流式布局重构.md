# Issue: Codemap MVP: 垂直流式布局重构

## 元数据

| 字段 | 内容 |
|------|------|
| **文件名** | 20260107-Codemap MVP: 垂直流式布局重构.md |
| **创建时间** | 2026-01-07 |
| **状态** | 📝 待办 |
| **优先级** | 🔴 P0 |
| **负责人** | Pi Agent |
| **预计工时** | 8h |

## Goal

将 Codemap 的核心 UI 从当前的网状图（Graph/Mermaid）重构为模仿 DeepWiki 的**垂直流式列表（Flow List）**，并实现基础的代码跳转功能。暂不涉及后端 Rust 分析引擎的改造。

## 背景/问题

当前 Codemap 使用图表展示，信息密度低，难以阅读长流程。DeepWiki 的垂直流式布局（Timeline/Flow）已被验证为更优的交互模式。我们需要快速复刻这一核心体验。

## 验收标准 (Acceptance Criteria)

- [ ] **UI**: 界面展示为垂直的时间轴/流程列表，而非网状图。
- [ ] **样式**: 左侧有贯穿的时间轴线，右侧为卡片内容。
- [ ] **数据**: 能够正确渲染生成器输出的步骤标题和描述。
- [ ] **交互**: 点击卡片上的代码胶囊（Pill），能在 Monaco Editor 中打开对应文件并跳转行号。

## 实施阶段

### Phase 1: 组件开发 (Frontend Only)
- [ ] 创建 `FlowContainer` 组件：实现 Grid 布局和左侧时间轴轨道。
- [ ] 创建 `FlowItem` 组件：实现单个步骤的卡片样式。
- [ ] 实现 `CodePill` 组件：显示 `file:line`，样式模仿 DeepWiki。
- [ ] 移除旧的 `GraphView` 相关引用（或保留为切换选项）。

### Phase 2: 数据适配 (Generator Tweak)
- [ ] 修改 `generator.js` 的 Prompt，强制 AI 输出扁平化的 JSON 数组结构。
- [ ] 定义简化的数据接口 `FlowStep`：
  ```typescript
  interface FlowStep {
    id: string;
    title: string;     // 步骤名称
    description: string; // 详细解释
    refs: Array<{ file: string; line: number }>; // 代码锚点
  }
  ```

### Phase 3: 交互联调
- [ ] 在 Tauri 端实现 `open_file(path, line)` 命令（如果尚未存在）。
- [ ] 绑定 `CodePill` 点击事件到 Tauri 命令。
- [ ] 验证从生成的 Codemap 点击跳转的准确性。

## 关键决策

| 决策 | 理由 |
|------|------|
| **暂不使用 Rust Tree-sitter** | 降低复杂度，优先验证 UI 价值。继续沿用 AI 生成行号。 |
| **仅支持单层列表** | MVP 阶段暂不支持多层嵌套，简化 DOM 结构。 |
| **使用 Flex/Grid 而非 Canvas** | 提高文本渲染能力，便于复制和阅读。 |

## 相关资源

- [ ] 参考: DeepWiki UI 截图 (见上文分析)
- [ ] 现有代码: `client/src/components/GraphView.tsx` (将被替换)

## Notes

- 重点在于 Tailwind CSS 的样式调试，确保时间轴线在卡片高度变化时能正确连接。
- 暂时忽略“虚拟滚动”，直接渲染所有步骤。
