# Pi Agent

企业级 AI Agent 系统，用于代码生成、分析和编排。

**[English](README.md) | [中文](README.zh-CN.md)**

## 概述

自主 AI 编排器，通过结构化技能系统管理复杂的软件开发工作流。执行企业级协议，确保代码质量、文档和多模型协作。

## 设计哲学

Pi Agent 基于以下核心原则构建：

### 1. 精简高效

- **代码**: 自文档化，最少注释，无冗余
- **文档**: Token 高效，信息密集
- **优化**: 从 22KB 优化到 8.8KB（减少 59%，从 500+ 行降至 214 行）

### 2. SSOT (Single Source of Truth)

- **单一权威来源**: 每个知识领域只有一个权威文档
- **引用优于复制**: 链接到详细文档而非重复内容
- **文件系统即记忆**: 大内容存储在文件中，上下文只保留路径

### 3. 代码主权

- **外部代码仅作参考**: AI 生成的代码只是参考
- **强制重构**: 必须重构为精简高效的企业级代码
- **Unified Diff Patch**: 所有变更必须经过审查才能应用

### 4. 沙箱安全

- **禁止直接写入**: 外部模型不能直接写入
- **人工干预**: 所有修改需要人工审查
- **强制审计**: 强制执行 Phase 5 审计

## 架构原则

```
Pi Agent (编排器)
├── 全局协议 (设计哲学)
├── 5 阶段工作流
│   ├── Phase 1: 上下文检索 (ace-tool/ast-grep)
│   ├── Phase 2: 分析与规划 (Gemini)
│   ├── Phase 3: 原型获取 (Gemini → Unified Diff)
│   ├── Phase 4: 编码实施 (重构)
│   └── Phase 5: 审计与交付 (代码审查)
├── 模块化技能 (14+ 能力)
├── 专门子代理
│   ├── scout (快速侦察)
│   ├── worker (深度分析)
│   ├── planner (任务规划)
│   ├── reviewer (代码审查)
│   └── brainstormer (设计探索)
└── 文档系统 (workhub)
```

### 多模型编排

- **Codex**: 算法实现、错误分析、代码审查
- **Gemini**: 前端/UI 设计、后端逻辑、架构规划
- **专门工具**: ace-tool、ast-grep、context7、deepwiki

### 基于技能的架构

每个技能都是独立的能力，具有：
- 明确的目的和文档
- 标准化接口
- 独立测试和验证

## 文档哲学

Pi Agent 的文档策略：

- **Token 效率优先**: 优化上下文窗口（15,000 → 8,814 字符，节省 41%）
- **引用链接**: 详细内容在技能文档中，避免重复
- **文件系统即记忆**: 大内容在文件中，上下文只保留路径
- **状态管理**: 决策前读取 Issue，行动后更新 Issue
- **变更可追溯**: 每个 PR 必须关联 Issue

## 核心工作流

### 标准 5 阶段工作流

```mermaid
graph LR
    A[Phase 1: 上下文检索] --> B[Phase 2: 分析与规划]
    B --> C[Phase 3: 原型获取]
    C --> D[Phase 4: 编码实施]
    D --> E[Phase 5: 审计与交付]
```

**Phase 1: 上下文检索**（强制）
- 工具: `ace-tool`（语义搜索）或 `ast-grep`（AST 感知）
- 策略: 自然语言查询（Where/What/How），递归检索
- 输出: 完整的代码定义

**Phase 2: 分析与规划**（仅复杂任务）
- 模型: Gemini
- 输入: 原始需求（无预设）
- 输出: 分步计划和伪代码

**Phase 3: 原型获取**（强制）
- 路线 A（前端/UI）: Gemini → Unified Diff Patch
- 路线 B（后端/逻辑）: Gemini → Unified Diff Patch
- 约束: 禁止文件写入，仅 diff

**Phase 4: 编码实施**（强制）
- 将原型重构为生产代码
- 删除冗余，优化效率
- 最小作用域，审计副作用

**Phase 5: 审计与交付**（强制）
- 自动代码审查（Codex/Gemini）
- 审计通过后交付

### 工作流命令

| 命令 | 目的 | 代理 |
|---------|---------|-------|
| `/analyze` | 深度代码分析 | worker |
| `/brainstorm` | 设计探索 | brainstormer |
| `/research` | 并行代码库研究 | 多工具 |
| `/scout` | 快速侦察 | scout |

**使用示例**:
```bash
/scout authentication flow          # 快速文件定位
/analyze database schema            # 深度架构分析
/brainstorm caching strategy        # 设计构思
/research error handling patterns   # 并行研究
```

## 使用示例

### 场景 1: 快速代码侦察

```bash
# 查找认证相关代码
/scout authentication flow

# scout 返回:
# - 相关文件及行号范围
# - 关键函数和接口
# - 架构概述
# - 深度分析的起点
```

### 场景 2: 深度代码分析

```bash
# 分析数据库模式设计
/analyze database schema

# worker 返回:
# - 完整的架构分析
# - 模式识别
# - 依赖映射
# - 改进建议
```

### 场景 3: 设计头脑风暴

```bash
# 探索缓存策略
/brainstorm caching strategy

# brainstormer 返回:
# - 多种设计方案
# - 权衡分析
# - 实现考虑
# - 架构决策点
```

### 场景 4: 并行代码库研究

```bash
# 研究代码库中的错误处理模式
/research error handling patterns

# 多工具返回:
# - ace-tool: 语义搜索结果
# - ast-grep: 模式匹配
# - context7: 外部引用
# - 综合: 全面分析
```

## 最佳实践

### 1. 始终从项目根目录执行 workhub 命令

```bash
# ✅ 正确
cd /path/to/your/project
bun ~/.pi/agent/skills/workhub/lib.ts create issue "任务描述"

# ❌ 错误（文档存储在错误位置）
~/.pi/agent/skills/workhub/lib.ts create issue "任务描述"
```

### 2. 复杂任务使用 workhub

- 开始前创建 Issue
- 执行期间更新 Issue 状态
- 完成后创建 PR
- 将 PR 关联到 Issue

### 3. 选择正确的搜索工具

- **ace-tool**: 语义搜索（概念、功能）
- **ast-grep**: AST 感知搜索（模式、结构）
- **rg (ripgrep)**: 精确标识符/字面量匹配

### 4. 重构外部代码

- AI 生成的代码仅作参考
- 必须重构为精简高效的代码
- 应用设计模式和最佳实践

### 5. 遵循 5 阶段工作流

- Phase 1: 始终先检索上下文
- Phase 2: 规划复杂任务
- Phase 3: 获取原型（仅 diff）
- Phase 4: 实施和重构
- Phase 5: 交付前审计

### 6. 对长时间运行的任务使用 tmux

- 长时间编译/构建任务
- 交互式程序（Python REPL、gdb）
- 后台服务（开发服务器、数据库）
- 实时监控任务

## 技能参考

| 技能 | 目的 | 文档 |
|-------|---------|---------------|
| `workhub` | 文档管理（Issues/PRs） | `~/.pi/agent/skills/workhub/SKILL.md` |
| `ace-tool` | 语义代码搜索 | `~/.pi/agent/skills/ace-tool/SKILL.md` |
| `ast-grep` | AST 感知代码搜索/重写 | `~/.pi/agent/skills/ast-grep/SKILL.md` |
| `codemap` | 代码流分析 | `~/.pi/agent/skills/codemap/SKILL.md` |
| `context7` | GitHub Issues/PRs 搜索 | `~/.pi/agent/skills/context7/SKILL.md` |
| `deepwiki` | GitHub 仓库文档 | `~/.pi/agent/skills/deepwiki/SKILL.md` |
| `exa` | 高质量网络搜索 | `~/.pi/agent/skills/exa/SKILL.md` |
| `tavily-search-free` | 实时网络搜索 | `~/.pi/agent/skills/tavily-search-free/SKILL.md` |
| `tmux` | 终端会话管理 | `~/.pi/agent/skills/tmux/SKILL.md` |
| `project-planner` | 项目规划 | `~/.pi/agent/skills/project-planner/SKILL.md` |
| `sequential-thinking` | 系统化推理 | `~/.pi/agent/skills/sequential-thinking/SKILL.md` |
| `system-design` | 架构设计 | `~/.pi/agent/skills/system-design/SKILL.md` |
| `web-browser` | Chrome DevTools 协议 | `~/.pi/agent/skills/web-browser/SKILL.md` |
| `improve-skill` | 改进/创建技能 | `~/.pi/agent/skills/improve-skill/SKILL.md` |
| `zai-vision` | MCP 视觉服务器访问 | `~/.pi/agent/skills/zai-vision/SKILL.md` |

## 配置

| 文件 | 目的 |
|------|---------|
| `docs/system/SYSTEM.md` | 核心协议和工作流（详细版本） |
| `settings.json` | Agent 设置 |
| `models.json` | 模型配置 |
| `auth.json` | 认证凭据 |

## 文档结构

```
docs/
├── system/              # 系统协议文档
│   ├── SYSTEM.md        # 当前系统协议
│   ├── VERSIONS.md      # 版本历史
│   └── *.md             # 备份版本
├── guides/              # 使用指南
├── knowledge/           # 知识库
├── issues/              # 任务跟踪（workhub）
└── pr/                  # 变更日志（workhub）
```

## 快速开始

```bash
# 初始化文档结构（从项目根目录）
cd /path/to/your/project
bun ~/.pi/agent/skills/workhub/lib.ts init

# 创建新 Issue
bun ~/.pi/agent/skills/workhub/lib.ts create issue "任务描述"

# 使用工作流命令
/scout authentication flow
/analyze database schema
/brainstorm caching strategy
```

## 参阅

- **系统协议**: `docs/system/SYSTEM.md`（详细版本）
- **Workhub 指南**: `skills/workhub/SKILL.md`
- **Subagent 配置**: `docs/system/subagent.md`

## 许可证

用于专业软件开发的企业级 AI Agent 系统。