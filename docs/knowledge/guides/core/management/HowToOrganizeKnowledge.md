# How to Organize Knowledge

## Goal (目标)
指导团队成员如何合理组织知识库结构，避免知识碎片化和重复记录。

## Prerequisites (前置知识)
- [[KnowledgeBase]]

## Steps (步骤)

### 1. 选择合适的分类策略
根据项目规模和团队结构选择分类方式：

**策略 A：按模块分类（适合中大型项目）**
```
docs/knowledge/
├── concepts/
│   ├── auth/
│   │   ├── User.md
│   │   └── Session.md
│   ├── payment/
│   │   ├── Transaction.md
│   │   └── PaymentGateway.md
│   └── common/
│       └── ErrorHandling.md
```

**策略 B：按层级分类（适合复杂系统）**
```
docs/knowledge/
├── concepts/
│   ├── core/          # 核心概念
│   ├── domain/        # 领域概念
│   └── infrastructure/# 基础设施
```

### 2. 创建分类目录
```bash
# 创建二级分类
bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "User" auth

# 创建三级分类
bun ~/.pi/agent/skills/knowledge-base/lib.ts create guide "APIDesign" backend/api
bun ~/.pi/agent/skills/knowledge-base/lib.ts create decision "WhyUseRedis" database/cache
```

### 3. 确保文档归属明确
- 每个文档应属于一个明确的分类
- 避免跨分类重复（使用引用链接替代）
- 定期审计分类结构的合理性

### 4. 使用引用建立关联
在文档中使用 Markdown 引用关联相关概念：
```markdown
## Relationships (关联)
- Contains: [[SubConcept]]
- Related to: [[OtherConcept]]
- Depends on: [[Dependency]]
```

## Best Practices (最佳实践)
- ✅ Do: 按职责或功能模块分类，而非按技术栈
- ✅ Do: 分类层级不超过 3 层（避免过深）
- ✅ Do: 使用英文或拼音作为分类名（避免路径编码问题）
- ✅ Do: 定期重构分类结构（每季度审查）
- ❌ Don't: 创建过于细碎的分类（如按文件名分类）
- ❌ Don't: 忽略分类，所有文件堆在根目录
- ❌ Don't: 在多个分类中复制同一文档（使用引用）

## Examples (示例)

### 好的分类结构
```
concepts/
├── auth/              # 认证相关概念
│   ├── User.md
│   └── Session.md
├── payment/           # 支付相关概念
│   ├── Transaction.md
│   └── PaymentGateway.md
└── common/            # 通用概念
    └── ErrorHandling.md
```

### 坏的分类结构
```
concepts/
├── types/             # ❌ 过于技术化
├── interfaces/        # ❌ 与实现细节耦合
├── utils/             # ❌ 不符合领域概念
└── temp/              # ❌ 临时目录不应存在
```

## When to Restructure
出现以下信号时，考虑重构分类：
- 某个分类下的文档超过 20 个
- 团队成员频繁找不到文档
- 分类名称与实际内容不符
- 新成员需要大量时间理解分类逻辑