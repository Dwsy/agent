# Wisdom Saving Improvement for ParallelMode and ChainMode

## 📋 改进摘要

为 `ParallelMode` 和 `ChainMode` 添加智慧保存功能，使它们与 `SingleMode` 保持一致。

## 🔧 改进内容

### 1. ParallelMode 改进

**文件**: `modes/parallel.ts`

**修改内容**:
```typescript
// 添加导入
import { extractWisdom, appendWisdom, loadAllWisdom, formatWisdomForPrompt } from "../utils/wisdom.js";

// 在 execute 方法末尾添加智慧提取和保存
// 提取所有并行任务的智慧并保存到会话（默认作用域）
const allWisdomNotes: any[] = [];
for (const result of results) {
	const notes = extractWisdom(result, "session");
	allWisdomNotes.push(...notes);
}

if (allWisdomNotes.length > 0) {
	appendWisdom(allWisdomNotes, defaultCwd);
}
```

### 2. ChainMode 改进

**文件**: `modes/chain.ts`

**修改内容**:
```typescript
// 添加导入
import { extractWisdom, appendWisdom, loadAllWisdom, formatWisdomForPrompt } from "../utils/wisdom.js";

// 在 execute 方法末尾（for 循环结束后）添加智慧提取和保存
// 提取所有步骤的智慧并保存到会话（默认作用域）
const allWisdomNotes: any[] = [];
for (const result of results) {
	const notes = extractWisdom(result, "session");
	allWisdomNotes.push(...notes);
}

if (allWisdomNotes.length > 0) {
	appendWisdom(allWisdomNotes, defaultCwd);
}
```

## ✅ 改进效果

### 改进前

| 模式 | 智慧保存 | 状态 |
|------|---------|------|
| SingleMode | ✅ 自动提取并保存 | 已实现 |
| ParallelMode | ❌ 无智慧保存 | 未实现 |
| ChainMode | ❌ 无智慧保存 | 未实现 |

### 改进后

| 模式 | 智慧保存 | 状态 |
|------|---------|------|
| SingleMode | ✅ 自动提取并保存 | 已实现 |
| ParallelMode | ✅ 自动提取并保存 | **已改进** |
| ChainMode | ✅ 自动提取并保存 | **已改进** |

## 🔄 工作流程

### ParallelMode 智慧保存流程

```
1. 执行并行任务
   ↓
2. 收集所有任务结果
   ↓
3. 遍历所有结果
   ↓
4. 对每个结果调用 extractWisdom(result, "session")
   ↓
5. 收集所有智慧笔记
   ↓
6. 调用 appendWisdom(allWisdomNotes, defaultCwd)
   ↓
7. 智慧保存到会话（内存）
```

### ChainMode 智慧保存流程

```
1. 执行链式任务（顺序执行）
   ↓
2. 收集所有步骤结果
   ↓
3. 遍历所有结果
   ↓
4. 对每个结果调用 extractWisdom(result, "session")
   ↓
5. 收集所有智慧笔记
   ↓
6. 调用 appendWisdom(allWisdomNotes, defaultCwd)
   ↓
7. 智慧保存到会话（内存）
```

## 💡 使用示例

### 示例 1: ParallelMode 智慧保存

```javascript
// 调用并行任务
subagent({
  tasks: [
    { agent: "scout", task: "查找认证代码" },
    { agent: "scout", task: "查找数据库代码" },
    { agent: "scout", task: "查找 API 端点" }
  ]
})

// 内部流程：
// 1. 并行执行 3 个任务
// 2. 每个任务输出包含智慧标记：
//    - scout 1: Convention: 使用 TypeScript
//    - scout 2: Success: ✅ 找到 5 个文件
//    - scout 3: Gotcha: ⚠️ 注意 API 版本
// 3. 提取所有智慧并保存到会话
// 4. 下一个任务自动加载这些智慧
```

### 示例 2: ChainMode 智慧保存

```javascript
// 调用链式任务
subagent({
  chain: [
    { agent: "scout", task: "查找 API 定义" },
    { agent: "analyst", task: "分析以下代码: {previous}" },
    { agent: "worker", task: "生成文档: {previous}" },
    { agent: "reviewer", task: "审查文档: {previous}" }
  ]
})

// 内部流程：
// 1. 顺序执行 4 个步骤
// 2. 每个步骤输出包含智慧标记：
//    - scout: Decision: 使用 REST API
//    - analyst: Success: ✅ 发现 3 个问题
//    - worker: Convention: 使用 Markdown 格式
//    - reviewer: Failure: ❌ 缺少示例代码
// 3. 提取所有智慧并保存到会话
// 4. 下一个任务自动加载这些智慧
```

## 📊 测试验证

### 测试文件

`test-wisdom-improvement.ts` - 完整的测试套件

### 测试内容

1. **ParallelMode 智慧保存测试**
   - 模拟并行任务执行
   - 验证智慧提取
   - 验证智慧保存
   - 验证智慧加载

2. **ChainMode 智慧保存测试**
   - 模拟链式任务执行
   - 验证智慧提取
   - 验证智慧保存
   - 验证智慧加载

3. **智慧注入测试**
   - 验证智慧注入到任务提示
   - 验证智慧优先级

### 运行测试

```bash
cd /Users/dengwenyu/.pi/agent/extensions/subagent
bun test-wisdom-improvement.ts
```

## 🎯 优势

### 1. 一致性
- 所有三种模式（Single、Parallel、Chain）都支持智慧保存
- 统一的智慧管理体验

### 2. 累积学习
- 并行任务的学习会被保存
- 链式任务的学习会被保存
- 避免重复错误

### 3. 知识传递
- 新任务自动获得历史智慧
- 保持代码一致性
- 提高开发效率

### 4. 代码复用
- 复用现有的智慧工具函数
- 最小化代码修改
- 易于维护

## 🔍 注意事项

### 1. 智慧作用域
- 默认保存到会话（内存）
- 需要手动调用 `saveSessionWisdomTo()` 持久化

### 2. 并发安全
- `sessionWisdom` 是全局变量
- 并发任务同时保存时可能有竞争条件
- 建议使用锁机制（未来改进）

### 3. 性能影响
- 智慧提取和保存会增加少量开销
- 对于大量并行任务可能需要优化

## 🚀 未来改进

### 1. 会话结束提示
```typescript
// 在会话结束时提示用户保存
pi.onSessionEnd(() => {
  const notes = getSessionWisdomNotes();
  if (notes.length > 0) {
    ctx.ui.confirm(
      "Save session wisdom?",
      `You learned ${notes.length} items. Save to project or global?`
    );
  }
});
```

### 2. 智慧去重
```typescript
// 避免重复保存相同的智慧
function deduplicateWisdom(notes: WisdomNote[]): WisdomNote[] {
  const seen = new Set<string>();
  return notes.filter(note => {
    const key = `${note.type}:${note.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

### 3. 智慧统计
```typescript
// 显示智慧统计信息
const stats = getWisdomStats(cwd);
console.log(`Session: ${stats.session.totalNotes}`);
console.log(`Project: ${stats.project.totalNotes}`);
console.log(`Global: ${stats.global.totalNotes}`);
```

## 📝 相关文档

- [WISDOM.md](./WISDOM.md) - 智慧积累系统完整设计
- [README.md](./README.md) - Subagent 扩展主文档
- [test-wisdom-v2.ts](./test-wisdom-v2.ts) - 智慧系统测试

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 📋 版本历史

### v1.6.0 (2026-01-27)
- ✅ ParallelMode 添加智慧保存功能
- ✅ ChainMode 添加智慧保存功能
- ✅ 统一三种模式的智慧管理
- ✅ 添加测试验证

### v1.5.0 (2026-01-27)
- 输出格式优化
- 思考过程显示
- JSON 结果美化

### v1.0.0 (2026-01-01)
- 初始版本
- 三种执行模式
- SingleMode 智慧保存