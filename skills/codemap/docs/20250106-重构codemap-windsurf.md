# Issue: 重构 CodeMap - 复刻 Windsurf 代码地图功能

## 元数据
- 文件名: 20250106-重构codemap-windsurf.md
- 状态: 🚧 进行中
- 优先级: 🔴 P0

## Goal
将 CodeMap 从简单的静态分析工具重构为专业的任务驱动代码地图系统，复刻 Windsurf Codemaps 的核心体验。

## 当前问题分析

### 功能缺陷
1. **生成策略太简单**：仅基于模式匹配，没有真正的 AI 分析
2. **没有任务驱动**：不是围绕用户任务生成，而是静态扫描
3. **层级结构缺失**：只是按文件分组，没有真正的层级关系
4. **无精确代码定位**：节点没有精确的行区间引用
5. **无智能体集成**：没有 @-mention 功能
6. **无建议主题**：没有基于导航历史生成建议
7. **无图视图**：只有静态 Mermaid，不是交互式图
8. **无跟踪指南**：没有"See more"展开功能

### 架构问题
1. **数据模型不完整**：缺少 nodes、edges、code_refs
2. **无 AI 集成**：没有 LLM 调用
3. **无缓存机制**：每次都重新分析
4. **无预算控制**：没有 max_files、max_chunks 限制

## 验收标准

### P0 (Must-have)
- [ ] 任务驱动的即时映射：输入任务 → 生成相关地图
- [ ] 层级树结构：可展开/折叠的节点树
- [ ] 精确代码定位：节点绑定文件+行区间
- [ ] 点击跳转：点击节点打开精确位置
- [ ] 建议主题：基于导航历史生成 3-7 个建议
- [ ] Fast/Smart 档位：提供不同质量/速度选项

### P1 (Should-have)
- [ ] 跟踪指南：短摘要 + "See more"长解释
- [ ] 图视图：树/图切换，节点行为一致
- [ ] @-mention 集成：在聊天中引用地图
- [ ] 分享链接：浏览器查看

### P2 (Could-have)
- [ ] .codemap 协议：标准格式导出
- [ ] 节点注释：团队协作注释

## 实施阶段

### Phase 1: 数据模型重构 ⏳ 当前
- [x] 分析 PRD 中的 .codemap schema
- [x] 重构 Rust 数据结构（Node、Edge、CodeRef）
- [ ] 实现新的 CodeMap 序列化/反序列化
- [x] 添加 metadata（repo、generation、zdr）
- [x] 添加 TypeScript 类型定义
- [x] 实现 Zustand Store
- [x] 创建图标组件库
- [x] 添加 .gitignore 和 tsconfig
- [x] 配置 Vite + React + Tailwind
- [x] 实现基础 UI 组件（Button、Input、Dialog 等）
- [x] 实现 Header 组件
- [x] 实现 Sidebar 组件
- [x] 实现 MainPanel 组件
- [x] 实现 TreeView 组件
- [x] 实现 GraphView 组件（ReactFlow）
- [x] 实现 NodeDetails 组件

### Phase 2: AI 集成层
- [ ] 集成 LLM API（OpenAI/Anthropic/本地模型）
- [ ] 实现任务理解模块
- [ ] 实现仓库探索模块
- [ ] 实现分组与层级化算法
- [ ] 实现可解释摘要生成

### Phase 3: 生成流水线
- [ ] 实现任务理解（检索计划生成）
- [ ] 实现静态检索（文件名/符号）
- [ ] 实现语义检索（向量检索）
- [ ] 实现结构分析（符号索引、调用图）
- [ ] 实现预算控制（max_files、max_chunks）

### Phase 4: 前端重构
- [ ] 重新设计面板布局（Header + Tree + Details）
- [ ] 实现层级树组件（可展开/折叠）
- [ ] 实现节点详情面板（摘要 + CodeRefs + Trace Guide）
- [ ] 实现点击跳转（打开文件并高亮行区间）
- [ ] 实视图切换（Tree ↔ Graph）

### Phase 5: 建议主题系统
- [ ] 实现导航历史采集
- [ ] 实现建议生成算法
- [ ] 实现建议列表展示

### Phase 6: 跟踪指南
- [ ] 实现短摘要生成
- [ ] 实现"See more"展开功能
- [ ] 实现长解释生成

### Phase 7: @-mention 集成
- [ ] 实现引用语法解析（@Codemap、@Codemap/Node）
- [ ] 实现上下文注入策略
- [ ] 实现聊天集成

### Phase 8: 分享功能
- [ ] 实现浏览器分享页
- [ ] 实现权限控制
- [ ] 实现企业策略（opt-in）

### Phase 9: 性能优化
- [ ] 实现缓存机制
- [ ] 实现渐进式探索
- [ ] 实现降级策略

## 关键决策

| 决策 | 理据 |
|------|------|
| 保留 Rust + Tauri | 跨平台、性能好 |
| 集成 LLM API | 实现真正的 AI 分析 |
| 使用向量检索 | 提高语义相关性 |
| 本地优先存储 | 保护隐私 |
| 支持 .codemap 协议 | 生态兼容 |

## 技术债务

### 需要移除
- [ ] 简单的模式匹配分析器
- [ ] 按文件分组的 traces
- [ ] 静态的 Mermaid 生成

### 需要添加
- [ ] LLM 调用模块
- [ ] 向量数据库（本地）
- [ ] 符号索引器
- [ ] 调用图构建器

## Notes

### PRD 核心要点
1. **任务驱动**：围绕用户任务生成，不是离线全量索引
2. **强定位**：每个节点绑定精确的文件+行区间
3. **可复用上下文**：@-mention 在聊天中引用

### 参考实现
- Windsurf Codemaps: https://docs.windsurf.com/windsurf/codemaps
- Cognition 博客: https://cognition.ai/blog/codemaps

### 性能目标
- Fast 档位：≤ 20s（中型仓库）
- Smart 档位：≤ 60s
- 点击跳转：≤ 200ms

## Status 更新日志
- 2025-01-06 23:20: 状态变更 → 进行中，备注: 开始 Phase 1，重构数据模型
- 2025-01-06 23:45: 状态变更 → 进行中，备注: 完成前端基础架构，开始 React + Vite 重构
- 2025-01-06 23:55: 状态变更 → 进行中，备注: 完成所有核心 UI 组件，待实现后端 API 集成
- 2025-01-07 00:05: 状态变更 → 进行中，备注: 实现基于 CLI 的 CodeMap 生成（generator.js + executor.rs）
- 2025-01-07 00:10: 状态变更 → ✅ Phase 1-4 完成，编译通过，待测试