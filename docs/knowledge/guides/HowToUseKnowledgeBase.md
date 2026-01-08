# How To Use Knowledge Base

## Goal (目标)
帮助团队成员快速上手使用知识库系统，减少知识传递成本。

## Prerequisites (前置知识)
- [[KnowledgeBase]]

## Steps (步骤)

### 1. 初始化
在项目根目录执行：
```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts init
```

### 2. 扫描代码
定期扫描代码库，识别需要文档化的概念：
```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts scan
```

### 3. 创建文档
根据需要创建不同类型的文档：
```bash
# 创建概念文档
bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "DomainTerm"

# 创建操作指南
bun ~/.pi/agent/skills/knowledge-base/lib.ts create guide "HowToDoSomething"

# 创建决策记录
bun ~/.pi/agent/skills/knowledge-base/lib.ts create decision "WhyWeChoseX"
```

### 4. 搜索知识
快速查找已有知识：
```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts search "keyword"
```

### 5. 更新索引
当添加新文档后，更新索引文件：
```bash
bun ~/.pi/agent/skills/knowledge-base/lib.ts index
```

## Best Practices (最佳实践)
- ✅ Do: 遇到不懂的术语时，立即创建概念文档
- ✅ Do: 代码 Review 时，如果需要解释超过 3 句，创建指南
- ✅ Do: 记录"为什么"而不仅仅是"怎么做"
- ❌ Don't: 只记录显而易见的信息
- ❌ Don't: 使用递归定义（如"知识库是存储知识的库"）
- ❌ Don't: 忽略常见误区记录

## Examples (示例)

### 好的概念文档
```markdown
# DoubleEntryBookkeeping

## Definition
> 一种会计记账方法，每笔交易至少影响两个账户，借方和贷方必须相等。

## Common Misconceptions
- ❌ 误区：借方就是收入，贷方就是支出
- ✅ 真相：借贷关系取决于账户类型（资产/负债/权益）
```

### 坏的概念文档
```markdown
# DoubleEntryBookkeeping

## Definition
> 双倍记账法就是记两遍账（错误：递归定义，没有解释核心概念）
```