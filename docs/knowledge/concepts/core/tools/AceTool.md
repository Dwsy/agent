# AceTool

## Definition (定义)
> 基于 AugmentCode 的语义化代码搜索工具，通过自然语言查询理解代码意图，而非简单的字符串匹配。

## Context (上下文)
- **Domain**: 代码搜索 / 上下文检索
- **Role**: Pi Agent 的 Phase 1 上下文全量检索工具

## Implementation (实现)
代码中可以在以下位置找到相关实现：
- `~/.pi/agent/skills/ace-tool/client.ts` (客户端)
- `~/.pi/agent/skills/ace-tool/daemon.ts` (守护进程)

```typescript
// 使用示例
bun ~/.pi/agent/skills/ace-tool/client.ts search "Where is the user authentication handled?"
```

## Common Misconceptions (常见误区)
> 记录新人容易理解错误的地方，解决"知识诅咒"。
- ❌ 误区：AceTool 就是 ripgrep 的增强版
- ✅ 真相：AceTool 使用语义理解，能识别代码意图而非精确字符串匹配
- ❌ 误区：AceTool 可以替代所有代码搜索需求
- ✅ 真相：当需要精确匹配标识符时，应优先使用 `rg` (ripgrep)
- ❌ 误区：AceTool 实时索引代码
- ✅ 真相：AceTool 通过持久化守护进程维护索引状态，需要先启动 daemon

## Usage Guidelines (使用指南)
1. **何时使用 AceTool**：
   - 不知道具体文件名或符号位置
   - 需要理解代码的高级逻辑
   - 搜索某个功能或概念

2. **何时使用 rg**：
   - 知道精确的标识符、符号名或字符串
   - 需要遍历所有匹配项
   - 搜索非代码内容（配置文件、文档）

3. **预编辑规则**：在修改任何文件前，必须先调用 AceTool 收集上下文

## Relationships (关联)
- Related to: [[Workhub]]
- Used by: [[PiAgent]]
- Alternative: [[Ripgrep]]

## References (参考)
- [Ace Tool 技能文档](~/.pi/agent/skills/ace-tool/SKILL.md)
- [AugmentCode](https://augmentcode.dev/)