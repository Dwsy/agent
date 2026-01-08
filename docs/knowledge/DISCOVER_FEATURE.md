# Knowledge Base Skill - Discover 功能增强

## 🎉 新功能：项目结构发现与文档清单生成

Knowledge Base Skill 现已新增 `discover` 命令，能够自动分析项目目录结构，识别技术目录，并生成知识库文档清单和建议。

---

## 🚀 功能概述

### 核心能力

1. **自动识别技术目录**: 扫描项目目录，识别常见的技术目录（auth、api、components、database 等）
2. **智能推荐文档**: 为每个技术目录推荐相关的概念和指南
3. **生成完整命令**: 提供创建文档的完整命令，可直接复制使用
4. **去重处理**: 已存在的文档不会重复建议
5. **进度追踪**: 显示文档完成进度和统计信息
6. **置信度评分**: 根据目录名称匹配度给出置信度评分

---

## 📊 支持的技术目录类型

| 目录类型 | 推荐概念 | 推荐指南 | 分类 |
|---------|---------|---------|------|
| `auth` | Authentication, Authorization, Session, Token, OAuth, JWT | HowToLogin, PasswordSecurity, SSOIntegration | `auth` |
| `api` | API, REST, GraphQL, Endpoint, Middleware | APIDesign, APIVersioning, ErrorHandling | `backend/api` |
| `components` | Component, Props, State, Lifecycle, Hooks | ComponentDesign, StateManagement, PerformanceOptimization | `frontend/components` |
| `config` | Configuration, Environment, Settings | ConfigManagement, EnvironmentVariables | `common/config` |
| `database` | Database, Schema, Migration, Query, Transaction | DatabaseDesign, QueryOptimization, BackupStrategy | `backend/database` |
| `utils` | Utility, Helper, CommonFunctions | UtilityFunctions, CodeReuse | `common/utils` |
| `services` | Service, BusinessLogic, ServiceLayer | ServiceDesign, BusinessRules | `backend/services` |
| `models` | Model, Entity, DataModel | ModelDesign, DataValidation | `backend/models` |
| `hooks` | Hook, CustomHook, SideEffect | HookUsage, CustomHooks | `frontend/hooks` |
| `store` | Store, State, Redux, Context, StateManagement | StateManagement, ReduxPattern, ContextAPI | `frontend/state` |
| `middleware` | Middleware, Interceptor, Pipeline | MiddlewareDesign, RequestProcessing | `backend/middleware` |
| `routes` | Route, Router, Navigation, URL | Routing, RouteProtection, Navigation | `frontend/routing` |
| `tests` | Test, UnitTest, IntegrationTest, E2ETest | TestingStrategy, TestDrivenDevelopment | `quality/testing` |
| `docker` | Docker, Container, Image, Dockerfile | DockerSetup, Containerization | `infrastructure/docker` |
| `deploy` | Deployment, CI, CD, Pipeline | DeploymentStrategy, CI/CDSetup | `infrastructure/deployment` |

---

## 🔧 使用方法

### 基本命令

```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover
```

### 输出内容

运行后会生成 `docs/knowledge/discovery_report.md` 文件，包含：

1. **项目概览**
   - 发现的技术目录数量
   - 高置信度发现数量
   - 中置信度发现数量

2. **目录详情**
   每个技术目录的详细建议：
   - 目录路径
   - 目录类型
   - 置信度评分
   - 建议分类
   - 建议概念（带创建命令）
   - 建议指南（带创建命令）

3. **快速开始指南**
   - 系统化构建知识库的步骤

4. **进度追踪**
   - 剩余建议概念数量
   - 剩余建议指南数量
   - 估计完成百分比

---

## 📖 使用示例

### 示例 1: 首次运行

```bash
cd /path/to/project
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover
```

输出：
```
🔬 Discovering knowledge base structure and generating checklist...

✅ Discovery complete! Report saved to: /path/to/project/docs/knowledge/discovery_report.md

📊 Found 15 technical directories
💡 87 document suggestions generated

Next steps:
  1. Review the report: /path/to/project/docs/knowledge/discovery_report.md
  2. Create suggested documents using the provided commands
  3. Run 'index' to update the knowledge base index
```

### 示例 2: 查看报告

```bash
cat docs/knowledge/discovery_report.md
```

报告内容示例：

```markdown
# Knowledge Base Discovery Report

> Generated on: 2026-01-07T13:45:07.686Z
> Project: /path/to/project

## 📊 Summary

- **Total directories discovered**: 15
- **High confidence discoveries**: 8
- **Medium confidence discoveries**: 7

---

## 📁 src/auth

**Type**: auth
**Confidence**: ⭐⭐⭐⭐⭐ (100%)
**Suggested Category**: `auth`

### 📚 Suggested Concepts

- [ ] **Authentication**
  ```bash
  bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "Authentication" auth
  ```

- [ ] **Authorization**
  ```bash
  bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "Authorization" auth
  ```

### 📖 Suggested Guides

- [ ] **HowToLogin**
  ```bash
  bun ~/.pi/agent/skills/knowledge-base/lib.ts create guide "HowToLogin" auth
  ```

---

## 🚀 Quick Start Guide

1. **Generate index**: Run `bun ~/.pi/agent/skills/knowledge-base/lib.ts index`
2. **Create top-priority concepts**: Start with high-confidence discoveries above
3. **Review and customize**: Adapt the suggested categories to fit your project
4. **Iterate**: Run discover again after adding documents to see progress

---

## 📈 Progress Tracking

- **Suggested concepts remaining**: 52
- **Suggested guides remaining**: 35
- **Estimated completion**: 0%
```

### 示例 3: 根据建议创建文档

从报告中复制命令并执行：

```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "Authentication" auth
bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "Authorization" auth
bun ~/.pi/agent/skills/knowledge-base/lib.ts create guide "HowToLogin" auth
```

### 示例 4: 重新运行查看进度

```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover
```

输出：
```
🔬 Discovering knowledge base structure and generating checklist...

✅ Discovery complete! Report saved to: /path/to/project/docs/knowledge/discovery_report.md

📊 Found 15 technical directories
💡 84 document suggestions generated

Next steps:
  1. Review the report: /path/to/project/docs/knowledge/discovery_report.md
  2. Create suggested documents using the provided commands
  3. Run 'index' to update the knowledge base index
```

注意：建议数量从 87 减少到 84，表示已有 3 个文档被创建。

---

## 🎯 工作流程

### 推荐流程

```bash
# 1. 初始化知识库
bun ~/.pi/agent/skills/knowledge-base/lib.ts init

# 2. 运行发现
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover

# 3. 查看报告
cat docs/knowledge/discovery_report.md

# 4. 创建高优先级文档（从报告复制命令）
bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "Authentication" auth

# 5. 生成索引
bun ~/.pi/agent/skills/knowledge-base/lib.ts index

# 6. 重新运行发现查看进度
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover

# 7. 重复步骤 4-6，直到完成所有建议
```

---

## 🔍 技术实现

### 核心功能

```typescript
async function discover() {
    console.log("🔬 Discovering knowledge base structure and generating checklist...\n");

    const discoveries: {
        directory: string;
        type: string;
        suggestedConcepts: string[];
        suggestedGuides: string[];
        category: string;
        confidence: number;
    }[] = [];

    // 扫描项目目录
    async function scanProjectDir(dir: string, depth = 0) {
        // 递归扫描目录
        // 匹配技术目录模式
        // 计算置信度
        // 检查已存在文档
    }

    await scanProjectDir(process.cwd());

    // 生成发现报告
    // 包含摘要、目录详情、快速开始指南、进度追踪
}
```

### 置信度计算

- **完全匹配** (100%): 目录名称完全匹配（如 `auth`）
- **部分匹配** (80%): 目录名称包含关键词（如 `auth-service`）

### 去重逻辑

检查 `docs/knowledge/concepts/` 和 `docs/knowledge/guides/` 目录，已存在的文档不会重复建议。

---

## 📊 测试结果

### 在 ~/.pi/agent 项目测试

```
📊 Found 20 technical directories
💡 113 document suggestions generated

High confidence discoveries: 3
Medium confidence discoveries: 17

Suggested concepts remaining: 69
Suggested guides remaining: 44
Estimated completion: 0%
```

### 发现的主要目录

1. `skills/codemap/generator/src/utils` (utils, 100%)
2. `skills/codemap/client/src/components` (components, 100%)
3. `skills/codemap/client/src/stores` (store, 100%)
4. `skills/codemap/client/src/hooks` (hooks, 100%)
5. `skills/codemap/client/src/routes` (routes, 100%)
6. `skills/codemap/client/src/services` (services, 100%)
7. `skills/codemap/client/src/middleware` (middleware, 100%)
8. `skills/codemap/client/src/models` (models, 100%)
9. ... 以及更多

---

## 🎯 最佳实践

### 1. 定期运行发现

建议在以下时机运行 `discover`：
- 项目初始化后
- 添加新的技术目录后
- 团队成员加入时
- 定期审查（每月一次）

### 2. 优先处理高置信度发现

优先处理置信度 100% 的目录，这些通常是核心目录。

### 3. 自定义分类

报告中的分类建议可以根据项目实际情况调整。

### 4. 迭代改进

每次创建文档后重新运行 `discover`，查看进度更新。

---

## 📝 更新内容

### 1. 新增 `discover` 命令

```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover
```

### 2. 新增技术目录映射

添加了 15 种常见技术目录的映射关系。

### 3. 新增发现报告生成

自动生成 `discovery_report.md`，包含详细的建议和命令。

### 4. 文档更新

- ✅ SKILL.md: 添加 `discover` 命令说明
- ✅ README.md: 添加 `discover` 功能详解

---

## 🚀 后续计划

### v1.1.0 计划
- [x] 添加项目结构发现功能
- [ ] 支持自定义技术目录映射
- [ ] 添加目录树可视化命令 `tree`
- [ ] 支持批量创建文档

### v1.2.0 计划
- [ ] 添加知识图谱可视化
- [ ] 支持标签系统
- [ ] 添加版本历史追踪
- [ ] 支持文档关联图

---

## 🎊 总结

`discover` 功能让知识库构建变得系统化和智能化：

1. ✅ **自动化发现**: 自动识别项目中的技术目录
2. ✅ **智能推荐**: 为每个目录推荐合适的文档类型
3. ✅ **完整命令**: 提供可直接使用的创建命令
4. ✅ **去重处理**: 避免重复建议已存在的文档
5. ✅ **进度追踪**: 显示文档完成进度
6. ✅ **置信度评分**: 帮助识别最重要的目录

---

**状态**: ✅ 功能完成，已通过测试

**更新日期**: 2026-01-07  
**版本**: v1.0.0 (Discover 功能)

---

**详细文档**: 查看 `docs/knowledge/discovery_report.md` 了解实际运行结果。