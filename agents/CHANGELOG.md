# Pi Agent 代理系统更新日志

## [1.2.1] - 2026-01-26

### 改进
- Scout 代理: 添加 `showInTool: true`，在工具描述中可见
- Planner 代理: 添加 `showInTool: true`，在工具描述中可见
- Worker 代理: 添加 `showInTool: true`，在工具描述中可见；升级元数据（version, mode, category 等）

---

## [1.2.0] - 2026-01-26

### 新增功能

#### 1. 代理模式系统
- 新增 `mode` 字段支持四种代理模式：
  - `standard`: 标准模式，无限制
  - `readonly`: 只读模式，禁止文件修改
  - `planning`: 计划模式，仅允许编辑计划文件
  - `restricted`: 受限模式，严格限制操作

#### 2. 代理元数据扩展
- 新增 `version` 字段：代理版本号
- 新增 `category` 字段：代理分类（exploration, planning, security 等）
- 新增 `requires_context` 字段：是否需要完整对话上下文
- 新增 `max_parallel` 字段：最大并行实例数

#### 3. Scout 代理升级（只读模式）
- 添加显式只读模式声明
- 列出所有禁止的操作
- 明确允许的 bash 命令列表
- 添加操作约束和安全警告
- 优化输出格式，强调文件路径和行号

#### 4. Planner 代理（全新）
- 实现五阶段计划工作流：
  - Phase 1: Context Discovery（并行探索）
  - Phase 2: Design & Strategy（方案设计）
  - Phase 3: Review & Alignment（审查对齐）
  - Phase 4: Final Plan（最终计划）
  - Phase 5: Exit Planning（请求批准）
- 支持任务复杂度评估（L1-L4）
- 并行探索策略指导
- 链式执行模式说明
- 计划文件模板

#### 5. Security Reviewer 代理（全新）
- 借鉴 Claude Code 安全审查方法论
- 18 项硬性排除规则
- 精确的置信度评分（0.9-1.0, 0.8-0.9）
- 结构化漏洞报告格式
- 五大安全类别覆盖：
  - Input Validation
  - Authentication & Authorization
  - Crypto & Secrets Management
  - Injection & Code Execution
  - Data Exposure

#### 6. 使用示例文档
- 创建 `README-EXAMPLES.md`
- 涵盖所有新代理的使用方法
- 完整工作流示例
- 并行和链式执行示例
- 命令行使用说明
- 最佳实践和故障排除

### 改进

#### 类型系统 (`agents.ts`)
- 扩展 `AgentConfig` 接口，添加新字段：
  - `mode?: AgentMode`
  - `version?: string`
  - `category?: string`
  - `requiresContext?: boolean`
  - `maxParallel?: number`
- 更新 frontmatter 解析逻辑，支持新字段
- 添加 `AgentMode` 类型定义

### 文档更新

#### Scout 代理 (`scout.md`)
- 版本号更新为 `1.2.0`
- 添加只读模式显式声明
- 详细列出禁止和允许的操作
- 添加 bash 命令限制说明
- 优化输出格式说明

#### Planner 代理 (`planner.md`)
- 全新代理，版本 `1.0.0`
- 五阶段工作流详细说明
- 任务复杂度评估指南
- 并行探索策略
- 链式执行模式
- 计划文件模板
- interview 工具使用规范

#### Security Reviewer 代理 (`security-reviewer.md`)
- 全新代理，版本 `1.0.0`
- 安全审查方法论
- 硬性排除规则（18 项）
- 先例说明（应报告 vs 不应报告）
- 五大安全类别
- 分析方法论（三阶段）
- 输出格式规范
- 严重性和置信度指南

### 借鉴来源

本版本主要借鉴了 Claude Code v2.1.19 的系统提示词设计：

1. **只读模式约束**
   - 来源: `agent-prompt-explore.md`
   - 关键改进: 显式声明禁止操作、bash 命令限制

2. **五阶段计划模式**
   - 来源: `system-reminder-plan-mode-is-active-5-phase.md`
   - 关键改进: 并行探索、多代理设计、结构化工作流

3. **安全审查方法论**
   - 来源: `agent-prompt-security-review-slash-command.md`
   - 关键改进: 硬性排除规则、置信度评分、结构化报告

### 迁移指南

#### 对于现有代理

如果需要为新旧代理添加模式字段：

```markdown
---
name: your-agent
description: Your agent description
version: "1.0.0"
mode: standard  # 或 readonly, planning, restricted
category: general
requires_context: false
max_parallel: 1
---
```

#### 对于用户

1. **Scout 代理**：现在有严格的只读限制，确保不会意外修改文件
2. **Planner 代理**：新增的规划代理，适合复杂任务的方案设计
3. **Security Reviewer 代理**：专业的安全审查，减少误报

### 兼容性

- ✅ 向后兼容：旧代理仍然可以正常工作
- ✅ 新字段可选：不添加新字段不影响现有代理
- ✅ 默认值：未指定 `mode` 时默认为 `standard`

### 已知问题

无

### 下一步计划

- [ ] 添加代理模式验证逻辑（运行时检查 bash 命令）
- [ ] 创建更多专用代理（如 `analyst`, `optimizer`）
- [ ] 添加代理性能监控
- [ ] 实现代理间通信机制

---

## [1.1.0] - 2026-01-14

### 新增功能
- 动态代理生成
- 作用域管理（user/project/both）
- 命令注册系统

### 改进
- 三模式执行架构（Single/Parallel/Chain）
- 技能集成

---

## [1.0.0] - 2026-01-01

### 初始版本
- 基础子代理系统
- Scout、Worker、Reviewer 代理
- 命令行工具支持