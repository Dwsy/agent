# Subagent 运行时间显示功能

## 概述
为 subagent 扩展添加了子代理运行时间显示功能，在 TUI 界面上显示每个子代理任务的执行时间和 token 消耗。

## 更改的文件

### 1. `types.ts`
- **新增字段**: 在 `SingleResult` 接口中添加了 `startTime` 和 `endTime` 可选字段
- **用途**: 记录每个子代理任务的开始和结束时间戳

### 2. `executor/runner.ts`
- **记录开始时间**: 在创建 `currentResult` 时设置 `startTime: Date.now()`
- **记录结束时间**: 在进程结束时设置 `endTime: Date.now()`
- **修复 token 显示**: 
  - 在 `message_end` 事件处理中，除了从 `event.usage` 获取 token 数据外
  - 还尝试从 `message.usage` 获取 token 数据（兼容不同的事件结构）
  - 使用 `??` 操作符而不是 `||` 来正确处理 `0` 值
- **影响**: 所有通过 `runSingleAgent` 执行的任务都会记录时间和 token

### 3. `modes/parallel.ts`
- **初始化时间戳**: 在预创建结果数组时添加 `startTime: Date.now()`
- **确保结束时间**: 在任务完成后确保 `endTime` 被设置
- **影响**: 并行模式下的所有任务都会记录时间

### 4. `executor/parser.ts`
- **修复空值处理**: 使用 `??` 操作符替代 `||`，确保 `0` 值被正确处理
  - `usage.input ?? 0` 而不是 `usage.input || 0`
  - 这样即使 token 数为 0 也会被记录
- **影响**: 确保 token 数据正确累积

### 5. `utils/formatter.ts`
- **新增函数**: `formatDuration(startTime?, endTime?)`
  - 功能：将毫秒时间差格式化为人类可读的字符串
  - 格式：`500ms`、`1.2s`、`2m5s`、`1h0m`
- **优化 `formatTokens`**: 
  - 移除不必要的 `.0` 后缀（如 `1.0k` → `1k`）
  - 使用 `.replace(/\.0$/, '')` 清理
- **优化 `formatUsageStats`**: 
  - 改进成本显示：移除末尾多余的零（如 `$0.0010` → `$0.001`）
  - 对小于 0.01 的成本进行特殊处理

### 6. `ui/renderer.ts`
- **导入函数**: 导入 `formatDuration` 函数
- **Single 模式**: 在每个任务结果后显示运行时间 (⏱ 图标)
- **Chain 模式**: 在每个步骤后显示步骤运行时间，汇总显示总时间
- **Parallel 模式**: 在每个任务后显示运行时间，汇总显示总时间
- **显示位置**: 
  - Token 统计：`↑input ↓output RcacheRead WcacheWrite $cost`
  - 时间显示：`⏱ duration`
  - 用 `•` 分隔 token 统计和时间

## 显示示例

### Single 模式
```
✓ worker (user)
  Task: Analyze code
  → read file.ts
  Result output...

2 turns ↑2.3k ↓1.5k R200 W100 $0.0123 • ⏱ 2.5s
```

### Chain 模式
```
✓ chain 3/3 steps

─── Step 1: worker ✓
  Task: First task
  → read file.ts
  Output...

1 turn ↑1.2k ↓0.8k • ⏱ 1.2s

─── Step 2: worker ✓
  Task: Second task
  → write result.ts
  Output...

1 turn ↑2.0k ↓1.5k • ⏱ 2.1s

─── Step 3: worker ✓
  Task: Final task
  → validate
  Output...

1 turn ↑0.5k ↓0.3k • ⏱ 0.8s

Total: 3 turns ↑3.7k ↓2.6k R200 W100 $0.0123 • ⏱ 4.1s
```

### Parallel 模式
```
✓ parallel 3/3 tasks

─── worker ✓
  Task: Task 1
  → process
  Output...

1 turn ↑1.5k ↓1.0k • ⏱ 3.2s

─── worker ✓
  Task: Task 2
  → analyze
  Output...

1 turn ↑2.0k ↓1.5k • ⏱ 2.8s

─── worker ✓
  Task: Task 3
  → validate
  Output...

1 turn ↑1.0k ↓0.8k • ⏱ 1.5s

Total: 3 turns ↑4.5k ↓3.3k • ⏱ 3.2s
```

### 统计信息说明

**Token 统计格式:**
- `turns`: 对话轮数
- `↑N`: 输入 tokens（N 可以是具体数字，如 `500`，或 k/M 表示千/百万）
- `↓N`: 输出 tokens
- `RN`: 缓存读取 tokens（R = Read）
- `WN`: 缓存写入 tokens（W = Write）
- `$N`: 成本（美元，最多 4 位小数）
- `ctx:N`: 上下文 tokens

**时间格式:**
- `< 1s`: 毫秒显示（如 `500ms`）
- `1s-60s`: 秒显示，保留一位小数（如 `2.5s`）
- `1m-60m`: 分钟+秒（如 `2m5s`）
- `> 60m`: 小时+分钟（如 `1h30m`）

## 测试
已通过单元测试验证以下功能：

### formatDuration 函数
- ✓ 500ms 格式化
- ✓ 1.2s 格式化
- ✓ 5.0s 格式化
- ✓ 1m0s 格式化
- ✓ 2m5s 格式化
- ✓ 1h0m 格式化
- ✓ 2h1m 格式化
- ✓ 缺失参数处理

### formatUsageStats 函数
- ✓ 完整统计（包含所有字段）
- ✓ 最小统计（仅基本字段）
- ✓ 零值处理
- ✓ 仅输入/输出
- ✓ 大数值处理（k/M 格式）
- ✓ 成本显示优化（移除末尾零）
- ✓ Token 格式优化（移除 .0 后缀）

## 技术细节

### 时间戳记录
- 使用 `Date.now()` 记录 Unix 时间戳（毫秒）
- `startTime`: 在任务开始前记录
- `endTime`: 在进程结束时记录

### Token 数据获取
- **主要来源**: `event.usage.input/output/cacheRead/cacheWrite/cost`
- **备用来源**: `message.usage.input/output/cacheRead/cacheWrite/cost`
- **空值处理**: 使用 `??` 操作符，确保 `0` 值被正确记录
- **兼容性**: 支持不同的事件结构格式

### 显示逻辑
- 时间只在任务完成后显示（`endTime` 存在时）
- Token 统计只在有数据时显示（非零值）
- 对于运行中的任务（`exitCode === -1`），不显示时间
- 总时间计算：所有任务时间的总和（chain/parallel 模式）
- 总 token 计算：所有任务 token 的累加（chain/parallel 模式）

### 主题支持
- Token 统计：使用 `theme.fg("dim", ...)` 进行着色
- 时间显示：使用 `theme.fg("accent", ⏱ ${duration})` 进行着色
- 与现有 UI 主题系统完全兼容

## 向后兼容性
- 所有新增字段都是可选的 (`startTime?`, `endTime?`)
- 现有代码不提供时间戳时，`formatDuration` 返回空字符串
- 不影响现有功能和 API

## 性能影响
- 时间戳记录开销极小（两次 `Date.now()` 调用）
- 格式化仅在渲染时执行，不影响执行性能
- 内存占用增加：每个 `SingleResult` 增加 16 字节（两个 8 字节数字）