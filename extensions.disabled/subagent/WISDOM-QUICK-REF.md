# 智慧保存改进 - 快速参考

## ❓ 你的问题
> "这个不能复用吗？ParallelMode 和 ChainMode 没有智慧保存？"

## ✅ 答案
**完全可以复用！现在已经改进完成。**

---

## 📊 改进前后对比

| 模式 | 改进前 | 改进后 |
|------|--------|--------|
| SingleMode | ✅ 有智慧保存 | ✅ 有智慧保存 |
| ParallelMode | ❌ 无智慧保存 | ✅ **有智慧保存** |
| ChainMode | ❌ 无智慧保存 | ✅ **有智慧保存** |

---

## 🔧 改进内容

### ParallelMode
```typescript
// modes/parallel.ts
import { extractWisdom, appendWisdom } from "../utils/wisdom.js";

// 在 execute 方法末尾添加
const allWisdomNotes: any[] = [];
for (const result of results) {
  const notes = extractWisdom(result, "session");
  allWisdomNotes.push(...notes);
}
if (allWisdomNotes.length > 0) {
  appendWisdom(allWisdomNotes, defaultCwd);
}
```

### ChainMode
```typescript
// modes/chain.ts
import { extractWisdom, appendWisdom } from "../utils/wisdom.js";

// 在 execute 方法末尾添加
const allWisdomNotes: any[] = [];
for (const result of results) {
  const notes = extractWisdom(result, "session");
  allWisdomNotes.push(...notes);
}
if (allWisdomNotes.length > 0) {
  appendWisdom(allWisdomNotes, defaultCwd);
}
```

---

## 💡 复用的函数

| 函数 | 作用 | 来源 |
|------|------|------|
| `extractWisdom()` | 从结果中提取智慧 | `utils/wisdom.ts` |
| `appendWisdom()` | 保存智慧到会话/项目/全局 | `utils/wisdom.ts` |

---

## 🎯 效果

### 改进前
```
并行任务执行 → 学习丢失 ❌
链式任务执行 → 学习丢失 ❌
```

### 改进后
```
并行任务执行 → 提取智慧 → 保存到会话 ✅
链式任务执行 → 提取智慧 → 保存到会话 ✅
```

---

## 📝 使用示例

```javascript
// ParallelMode - 现在会保存智慧
subagent({
  tasks: [
    { agent: "scout", task: "查找认证代码" },
    { agent: "scout", task: "查找数据库代码" }
  ]
})
// 智慧会被保存到会话，下一个任务自动加载

// ChainMode - 现在会保存智慧
subagent({
  chain: [
    { agent: "scout", task: "查找 API 定义" },
    { agent: "analyst", task: "分析以下代码: {previous}" }
  ]
})
// 智慧会被保存到会话，下一个任务自动加载
```

---

## 📚 相关文档

| 文档 | 描述 |
|------|------|
| [WISDOM-COMPARISON.md](./WISDOM-COMPARISON.md) | 详细对比 |
| [WISDOM-IMPROVEMENT.md](./WISDOM-IMPROVEMENT.md) | 改进说明 |
| [WISDOM.md](./WISDOM.md) | 完整设计 |

---

## 🎉 总结

**问题**: ParallelMode 和 ChainMode 没有智慧保存
**解决**: 复用现有的智慧保存函数
**结果**: 所有三种模式都支持智慧保存 ✅

**代码量**: 仅 14 行新代码，修改 2 个文件