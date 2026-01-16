# Token 显示功能修复

## 问题描述
用户报告子代理执行结果中只显示了 "2 turns" 和模型名称，但没有显示 token 消耗信息（↑input ↓output 等）。

## 根本原因分析

1. **事件结构差异**: 不同的事件可能将 usage 信息放在不同的位置
   - 有些事件将 usage 放在 `event.usage`
   - 有些事件将 usage 放在 `message.usage`

2. **空值处理问题**: 使用 `||` 操作符会导致 `0` 值被当作 falsy 值处理
   - `0 || 0` → `0` (看似正确)
   - 但在某些情况下可能导致数据丢失

## 解决方案

### 1. executor/runner.ts
在 `processLine` 函数中添加备用 token 数据源：

```typescript
// 原有代码
accumulateUsage(currentResult.usage, event);

// 新增代码：尝试从 message 获取 token 数据
if (!event.usage && (msg as any).usage) {
    const msgUsage = (msg as any).usage;
    currentResult.usage.input += msgUsage.input ?? 0;
    currentResult.usage.output += msgUsage.output ?? 0;
    currentResult.usage.cacheRead += msgUsage.cacheRead ?? 0;
    currentResult.usage.cacheWrite += msgUsage.cacheWrite ?? 0;
    currentResult.usage.cost += msgUsage.cost?.total ?? 0;
    currentResult.usage.contextTokens = msgUsage.totalTokens ?? 0;
}
```

### 2. executor/parser.ts
修复空值处理，使用 `??` 替代 `||`：

```typescript
// 修改前
current.input += usage.input || 0;
current.output += usage.output || 0;

// 修改后
current.input += usage.input ?? 0;
current.output += usage.output ?? 0;
```

**为什么需要这个修改？**
- `||` 运算符会将 `0`、`false`、`""`、`null`、`undefined` 都当作 falsy 值
- `??` 运算符只处理 `null` 和 `undefined`
- 对于 token 数量，`0` 是一个有效值，不应该被覆盖

### 3. utils/formatter.ts
优化显示格式：

#### formatTokens
移除不必要的 `.0` 后缀：
```typescript
// 修改前
if (count < 10000) return `${(count / 1000).toFixed(1)}k`;  // "1.0k"

// 修改后
if (count < 10000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;  // "1k"
```

#### formatUsageStats
改进成本显示：
```typescript
// 修改前
if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);  // "$0.0010"

// 修改后
if (usage.cost) {
    const costStr = usage.cost >= 0.01
        ? `$${usage.cost.toFixed(4)}`
        : `$${usage.cost.toFixed(4).replace(/0+$/, '')}`;  // "$0.001"
    parts.push(costStr);
}
```

## 测试验证

已通过单元测试验证所有场景：

### formatUsageStats 测试用例
1. ✓ 完整统计（包含所有字段）
2. ✓ 最小统计（仅基本字段）
3. ✓ 零值处理
4. ✓ 仅输入/输出
5. ✓ 大数值处理（k/M 格式）
6. ✓ 成本显示优化

## 显示效果

### 修复前
```
2 turns Qwen/Qwen3-VL-235B-A22B-Instruct • ⏱ 23.8s
```

### 修复后
```
2 turns ↑1.5k ↓800 R200 W100 $0.0123 Qwen/Qwen3-VL-235B-A22B-Instruct • ⏱ 23.8s
```

## 兼容性

- ✓ 支持不同的事件结构格式
- ✓ 正确处理 `0` 值
- ✓ 向后兼容现有代码
- ✓ 不影响性能

## 相关文件

1. `executor/runner.ts` - 添加备用 token 数据源
2. `executor/parser.ts` - 修复空值处理
3. `utils/formatter.ts` - 优化显示格式