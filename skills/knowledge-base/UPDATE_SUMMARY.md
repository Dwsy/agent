# Knowledge Base 技能更新总结

**日期**: 2025-01-09  
**版本**: v2.0  
**更新类型**: 功能增强

---

## 📋 更新概述

为 knowledge-base 技能的所有模板（concept、guide、decision）添加简化的 YAML front matter，支持 AI 索引和知识管理。

---

## ✨ 新功能

### YAML Front Matter 元数据

所有知识库文档现在在顶部包含简化的 YAML front matter，包含以下核心字段：

#### Concept 模板元数据

```yaml
---
id: "UserAuthentication"
title: "[Concept Name]"
type: "concept"
created: "2025-01-09"
updated: "2025-01-09"
category: "auth/user"
tags: ["knowledge", "concept", "UserAuthentication"]
---
```

#### Guide 模板元数据

```yaml
---
id: "ErrorHandling"
title: "[Guide Title]"
type: "guide"
created: "2025-01-09"
updated: "2025-01-09"
category: "backend"
tags: ["knowledge", "guide", "ErrorHandling"]
---
```

#### Decision 模板元数据

```yaml
---
id: "2025-01-09-WhyUsePostgres"
title: "[Decision Title]"
type: "decision"
created: "2025-01-09"
updated: "2025-01-09"
category: "database"
tags: ["knowledge", "decision", "WhyUsePostgres"]
---
```

### 元数据字段说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `id` | 唯一标识 | "UserAuthentication" 或 "2025-01-09-WhyUsePostgres" |
| `title` | 标题 | "[Concept Name]" |
| `type` | 文档类型 | concept, guide, decision |
| `created` | 创建时间 | "2025-01-09" |
| `updated` | 更新时间 | "2025-01-09" |
| `category` | 分类路径 | "auth/user", "backend", "database" |
| `tags` | 标签数组 | ["knowledge", "concept", "UserAuthentication"] |

---

## 🔧 技术实现

### 1. 日期生成函数

```typescript
function getISODateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

### 2. 占位符替换函数

```typescript
function replaceTemplatePlaceholders(
  content: string, 
  date: string, 
  name: string, 
  category?: string
): string {
  return content
    .replace(/{{date}}/g, date)
    .replace(/{{name}}/g, name)
    .replace(/{{category}}/g, category || "general");
}
```

### 3. 动态 ID 生成

- **Concept/Guide**: 使用名称作为 ID（如 "UserAuthentication"）
- **Decision**: 使用日期前缀 + 名称（如 "2025-01-09-WhyUsePostgres"）

---

## 📝 更新的文件

### 1. 模板文件

- **`~/.pi/agent/skills/knowledge-base/templates/concept-template.md`**
  - 添加 YAML front matter
  - 保持正文内容不变

- **`~/.pi/agent/skills/knowledge-base/templates/guide-template.md`**
  - 添加 YAML front matter
  - 保持正文内容不变

- **`~/.pi/agent/skills/knowledge-base/templates/decision-template.md`**
  - 添加 YAML front matter
  - 保持正文内容不变

### 2. 主脚本文件

- **`~/.pi/agent/skills/knowledge-base/lib.ts`**
  - 添加 `getISODateString()` 函数
  - 添加 `replaceTemplatePlaceholders()` 函数
  - 更新 `create()` 函数以支持占位符替换

### 3. 备份文件

- **`~/.pi/agent/skills/knowledge-base/lib.ts.backup`**: 原始 lib.ts 文件备份

---

## 🚀 使用示例

### 创建概念文档

```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "UserAuthentication" auth/user
```

生成的文件：

```yaml
---
id: "UserAuthentication"
title: "UserAuthentication"
type: "concept"
created: "2025-01-09"
updated: "2025-01-09"
category: "auth/user"
tags: ["knowledge", "concept", "UserAuthentication"]
---

# UserAuthentication

## Definition (定义)
...
```

### 创建指南文档

```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts create guide "ErrorHandling" backend
```

生成的文件：

```yaml
---
id: "ErrorHandling"
title: "ErrorHandling"
type: "guide"
created: "2025-01-09"
updated: "2025-01-09"
category: "backend"
tags: ["knowledge", "guide", "ErrorHandling"]
---

# ErrorHandling

## Goal (目标)
...
```

### 创建决策文档

```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts create decision "WhyUsePostgres" database
```

生成的文件：

```yaml
---
id: "2025-01-09-WhyUsePostgres"
title: "WhyUsePostgres"
type: "decision"
created: "2025-01-09"
updated: "2025-01-09"
category: "database"
tags: ["knowledge", "decision", "WhyUsePostgres"]
---

# WhyUsePostgres

## Context (背景)
...
```

---

## 📊 AI 索引优势

添加 YAML front matter 后，AI 可以：

1. **按类型检索**：快速区分概念、指南、决策
2. **按分类检索**：按领域（auth/backend/database）筛选
3. **时间追踪**：跟踪知识创建和更新时间
4. **关联分析**：通过标签发现相关知识点
5. **知识图谱**：构建结构化的知识网络

### 示例查询

```bash
# 查找所有概念文档
# 查询: type: "concept"

# 查找认证相关的知识
# 查询: category: "auth" OR tags: "auth"

# 查找最近的决策
# 查询: type: "decision" ORDER BY created DESC

# 查找特定主题的知识
# 查询: tags: "UserAuthentication"
```

---

## ✅ 测试验证

### 测试结果

1. ✅ 初始化知识库成功
2. ✅ 创建概念文档成功，YAML front matter 正确生成
3. ✅ 创建指南文档成功，YAML front matter 正确生成
4. ✅ 创建决策文档成功，YAML front matter 正确生成
5. ✅ 占位符替换正确（日期、名称、分类）
6. ✅ 自动生成标签正确
7. ✅ 分类路径正确处理

### 生成的文件示例

**Concept 文件：**
```yaml
---
id: "UserAuthentication"
title: "UserAuthentication"
type: "concept"
created: "2026-01-09"
updated: "2026-01-09"
category: "auth/user"
tags: ["knowledge", "concept", "UserAuthentication"]
---
```

**Decision 文件：**
```yaml
---
id: "2026-01-09-WhyUsePostgres"
title: "WhyUsePostgres"
type: "decision"
created: "2026-01-09"
updated: "2026-01-09"
category: "database"
tags: ["knowledge", "decision", "WhyUsePostgres"]
---
```

---

## 🔄 向后兼容性

- ✅ 完全向后兼容
- ✅ 现有文档不受影响
- ✅ 新创建的文档使用 YAML front matter
- ✅ 旧文档可以手动添加 YAML front matter（可选）

---

## 💡 与 Workhub 技能的对比

| 特性 | Workhub | Knowledge Base |
|------|---------|----------------|
| **用途** | 任务跟踪和变更记录 | 知识管理和文档化 |
| **文档类型** | Issue, PR | Concept, Guide, Decision |
| **ID 格式** | 日期-描述 | 名称 或 日期-描述 |
| **分类方式** | 模块分类（前端/后端） | 领域分类（auth/backend/database） |
| **标签前缀** | "workhub" | "knowledge" |
| **状态字段** | ✅ 有 | ❌ 无（知识库文档通常无状态） |

---

## 📚 相关文档

- **`~/.pi/agent/skills/knowledge-base/SKILL.md`**: 完整的技能文档
- **`~/.pi/agent/skills/knowledge-base/README.md`**: 项目说明
- **`~/.pi/agent/skills/knowledge-base/templates/`**: 模板文件目录

---

## 🎉 总结

本次更新为 knowledge-base 技能添加了 YAML front matter 支持，带来以下优势：

1. **结构化元数据**：为知识库文档提供统一的元数据格式
2. **AI 索引优化**：便于 AI 快速检索、分类和关联知识
3. **类型区分**：清晰区分概念、指南、决策三种文档类型
4. **时间追踪**：记录知识的创建和更新时间
5. **分类管理**：支持多级分类路径，便于组织知识

这些改进使得 knowledge-base 技能更适合作为项目的"第二大脑"，特别是在 AI 辅助知识管理和检索的场景下。

---

## 📈 版本历史

- **v1.0**: 初始版本，无 YAML front matter
- **v2.0**: 添加 YAML front matter（7 个核心字段）← 当前版本