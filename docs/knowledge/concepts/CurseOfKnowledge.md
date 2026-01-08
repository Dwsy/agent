# Curse of Knowledge

## Definition (定义)
> 当一个人掌握某种知识后，难以想象不懂这种知识的人的状态，导致沟通时假设对方已经了解相关背景。

## Context (上下文)
- **Domain**: 认知心理学 / 知识管理
- **Role**: Knowledge Base 技能设计的核心问题来源

## Common Manifestations (常见表现)

### 在软件工程中
1. **代码注释不足**
   - 资深开发者认为某些逻辑"显而易见"，不写注释
   - 新人需要花费大量时间理解隐含的业务规则

2. **术语滥用**
   - 使用缩写或行话，假设所有人都懂
   - 例如："这个 API 需要处理 idempotency 问题"

3. **架构决策背景缺失**
   - 只留下代码结果，不记录"为什么这样设计"
   - 后续维护者可能重复错误的决策

4. **文档跳跃**
   - 文档假设读者已经阅读了其他相关文档
   - 缺少前置知识说明

### 在团队协作中
1. **新成员培训困难**
   - 老成员"忘了自己是怎样学会的"
   - 培训材料遗漏关键步骤

2. **Code Review 效率低**
   - 需要反复解释隐含的业务逻辑
   - Review 者和被 Review 者理解不一致

## Solutions (解决方案)

### 1. 显式化隐性知识
- 记录"为什么"（Why）而非只是"怎么做"（How）
- 在 Knowledge Base 中创建概念文档
- 记录常见误区（Common Misconceptions）

### 2. 建立统一词汇表
- 明确定义领域术语
- 避免使用行话和缩写
- 使用 [[KnowledgeBase]] 管理术语

### 3. 决策背景化
- 使用 Workhub 记录架构决策
- 包含"认知对齐"（Cognitive Alignment）章节
- 说明决策对某些人可能反直觉的原因

### 4. 新人视角审计
- 让新成员记录所有困惑点
- 定期审查文档，补充遗漏的背景信息
- 建立"新人必须记录困惑"的流程

## Real-World Examples (现实案例)

### 案例 1：电商系统的"购物车"
- ❌ 资深视角："购物车就是临时存储商品列表"
- ✅ 新人困惑："为什么购物车有价格锁定？为什么有库存预占？"
- ✅ 解决方案：创建 ShoppingCart 概念文档，解释价格锁定和库存预占的业务逻辑

### 案例 2：支付系统的"幂等性"
- ❌ 资深视角："当然要实现幂等性，防止重复扣款"
- ✅ 新人困惑："什么是幂等性？为什么需要？"
- ✅ 解决方案：创建 Idempotency 概念文档，包含定义、场景和实现方式

## Relationships (关联)
- Solved by: [[KnowledgeBase]]
- Related to: [[TacitKnowledge]]
- Managed by: [[Workhub]]

## References (参考)
- [Curse of Knowledge - Wikipedia](https://en.wikipedia.org/wiki/Curse_of_knowledge)
- [The Curse of Knowledge in UX Design](https://www.nngroup.com/articles/curse-knowledge/)
- [Overcoming the Curse of Knowledge](https://hbr.org/2020/05/overcoming-the-curse-of-knowledge)