# Pi Extensions 使用指南

## 概述

Pi Extensions 是 Pi Agent 的 TypeScript 扩展，提供交互式 Q&A 提取和回答功能。包含两个扩展：

- **answer.ts**：交互式 Q&A TUI（带自定义界面）
- **qna.ts**：简化版 Q&A（加载到编辑器）

## 扩展功能

### answer.ts - 交互式 Q&A TUI

**功能**：
- 从助手消息中提取问题
- 交互式回答界面
- 快捷键：`Ctrl+.`

**特点**：
- 自定义 TUI 界面
- 进度指示器
- 上下文信息显示
- 确认对话框

### qna.ts - 编辑器 Q&A

**功能**：
- 从助手消息中提取问题
- 加载到编辑器
- 快捷键：`Ctrl+,`

**特点**：
- 简洁的文本格式
- 直接编辑提交
- 快速输入

## 安装

```bash
cd ~/.pi/agent/extensions
pnpm install
```

依赖：
- `@mariozechner/pi-ai`: 统一 LLM API
- `@mariozechner/pi-coding-agent`: 编码代理 CLI
- `@mariozechner/pi-tui`: 终端用户界面

## 使用方法

### answer.ts - 交互式 Q&A

1. **触发方式**

   - 命令：`/answer`
   - 快捷键：`Ctrl+.`

2. **工作流程**

   ```
   1. 触发扩展
   2. 提取最后一条助手消息中的问题
   3. 显示加载动画（使用 Haiku 模型）
   4. 进入交互式 Q&A 界面
   5. 逐个回答问题
   6. 确认提交
   7. 发送答案并触发新轮次
   ```

3. **界面操作**

   - `Tab`：下一个问题
   - `Shift+Tab`：上一个问题
   - `Enter`：移动到下一个问题（最后一个问题显示确认）
   - `Shift+Enter`：添加换行
   - `↑/↓`：导航问题（编辑器为空时）
   - `Esc`：取消
   - `Ctrl+C`：取消

4. **界面元素**

   - **进度指示器**：显示当前问题位置和回答状态
     - ● (青色)：当前问题
     - ● (绿色)：已回答
     - ○ (灰色)：未回答

   - **问题显示**：
     ```
     Q: What is your preferred database?
     > we can only configure MySQL and PostgreSQL
     A: [输入框]
     ```

   - **确认对话框**：
     ```
     Submit all answers? (Enter/y to confirm, Esc/n to cancel)
     ```

### qna.ts - 编辑器 Q&A

1. **触发方式**

   - 命令：`/qna`
   - 快捷键：`Ctrl+,`

2. **工作流程**

   ```
   1. 触发扩展
   2. 提取最后一条助手消息中的问题
   3. 显示加载动画（使用 Haiku 模型）
   4. 将问题格式加载到编辑器
   5. 用户编辑答案
   6. 提交答案
   ```

3. **输出格式**

   ```
   Q: What is your preferred database?
   > we can only configure MySQL and PostgreSQL
   A: [在这里输入答案]

   Q: Should we use TypeScript or JavaScript?
   A: [在这里输入答案]
   ```

## 模型优化

两个扩展都使用模型优化策略：

### 自动选择 Haiku

- **触发条件**：当前模型是 Anthropic 的 Opus 或 Sonnet
- **优化目标**：使用 `claude-haiku-4-5` 替代，降低成本
- **回退机制**：如果 Haiku 不可用，使用原模型

### 提取系统提示

```
You are a question extractor. Given text from a conversation, extract any questions that need answering.

Output format:
- List each question on its own line, prefixed with "Q: "
- After each question, add a blank line for the answer prefixed with "A: "
- If no questions are found, output "No questions found in the last message."
- When there is important context needed to answer a question, use quote characters (">") and add it into the question block as additional lines.

Keep questions in the order they appeared. Be concise.
```

## 使用场景

### 配置收集

**助手消息**：
```
我需要了解你的偏好：

1. 你想使用哪个数据库？我们目前只支持 MySQL 和 PostgreSQL
2. 是否需要启用缓存？
3. 日志级别如何设置？
```

**操作**：
1. 按 `Ctrl+.` 触发 answer 扩展
2. 逐个回答问题
3. 确认提交

### 决策确认

**助手消息**：
```
在继续之前，我需要确认几个决策：

- 你是否同意使用 TypeScript？
- 是否需要集成测试？
- 部署目标是什么？
```

**操作**：
1. 按 `Ctrl+,` 触发 qna 扩展
2. 在编辑器中填写答案
3. 提交

### 技术选型

**助手消息**：
```
对于这个项目，我需要一些信息：

1. 前端框架偏好（React/Vue/Svelte）？
> 考虑到团队熟悉度，React 可能是更好的选择

2. 是否需要状态管理？
> 如果应用复杂度高，建议使用 Zustand

3. 构建工具偏好？
```

**操作**：
1. 按 `Ctrl+.` 触发 answer 扩展
2. 查看上下文信息（> 开头的行）
3. 基于上下文回答问题

## 注册扩展

扩展需要在 Pi Agent 中注册才能使用。注册方式取决于 Pi Agent 的扩展机制。

### 方式 1：配置文件

在 `settings.json` 中添加：

```json
{
  "extensions": [
    "extensions/answer.ts",
    "extensions/qna.ts"
  ]
}
```

### 方式 2：命令行

```bash
pi --extensions extensions/answer.ts,extensions/qna.ts
```

### 方式 3：环境变量

```bash
export PI_EXTENSIONS="extensions/answer.ts:extensions/qna.ts"
pi
```

注意：具体注册方式需要根据 Pi Agent 的实际扩展机制确定。

## 开发

### 依赖安装

```bash
cd extensions
pnpm install
```

### 扩展结构

```typescript
import { complete, type Model, type Api, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 注册命令
  pi.registerCommand("answer", {
    description: "Extract questions from last assistant message into interactive Q&A",
    handler: (args, ctx) => { /* 处理逻辑 */ }
  });

  // 注册快捷键
  pi.registerShortcut("ctrl+.", {
    description: "Extract and answer questions",
    handler: (ctx) => { /* 处理逻辑 */ }
  });
}
```

### API 参考

#### ExtensionAPI

- `registerCommand(name, options)`: 注册命令
- `registerShortcut(key, options)`: 注册快捷键
- `sendMessage(content, options)`: 发送消息

#### ExtensionContext

- `hasUI`: 是否支持 UI
- `model`: 当前模型
- `modelRegistry`: 模型注册表
- `sessionManager`: 会话管理器
- `ui`: UI 接口

#### UI 接口

- `notify(message, type)`: 显示通知
- `custom(renderFn)`: 自定义 UI 组件
- `setEditorText(text)`: 设置编辑器文本

## 故障排查

### 扩展未加载

```bash
# 检查依赖
cd extensions
pnpm list

# 检查 TypeScript 编译
tsc --noEmit

# 检查扩展注册
pi --list-extensions
```

### 快捷键冲突

- 检查其他扩展是否使用了相同的快捷键
- 修改快捷键注册
- 使用不同的快捷键组合

### 提取失败

```bash
# 检查模型配置
pi --model list

# 检查 API 密钥
echo $ANTHROPIC_API_KEY

# 验证助手消息格式
# 确保最后一条助手消息包含完整内容
```

### UI 显示异常

- 确保终端支持 ANSI 颜色
- 检查终端宽度（至少 80 列）
- 重启 Pi Agent

## 最佳实践

1. **问题格式化**：助手消息中的问题应该清晰明确
2. **上下文提供**：使用 `>` 符号提供必要的上下文信息
3. **简洁回答**：答案应该简洁明了
4. **批量回答**：使用 answer 扩展批量回答多个问题
5. **灵活编辑**：使用 qna 扩展进行复杂的答案编辑

## 示例会话

```
User: 帮我设置这个项目

Assistant: 我需要了解一些信息：

Q: 你想使用哪个数据库？
> 我们支持 MySQL 和 PostgreSQL
A: [等待输入]

Q: 是否需要 Docker 支持？
A: [等待输入]

User: [按 Ctrl+.]

[进入交互式 Q&A 界面]
[用户填写答案]
[确认提交]

[答案发送给助手]
Assistant: 好的，我会使用 PostgreSQL 并配置 Docker 支持...
```