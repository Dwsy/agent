# Pi Extensions - Q&A Tools

这组扩展提供了从 AI 对话中提取和处理问题的工具。

## 扩展列表

| 扩展 | 命令 | 功能 |
|------|------|------|
| **qna** | `/qna` | 提取问题到编辑器（简单模式） |
| **answer** | `/answer` | 交互式问答界面（高级模式） |
| **handoff** | `/handoff` | 上下文转移到新会话 |

## 共享模块

`shared/` 目录包含可复用的 LLM 工具函数：

```typescript
// llm-utils.ts
- selectExtractionModel()    // 选择成本效益最优的模型
- getLastAssistantMessage()  // 获取最后一条助手消息
- createUserMessage()        // 创建用户消息
- extractResponseText()      // 提取响应文本
- isResponseFailed()         // 检查响应是否失败
- executeWithAuth()          // 带认证的执行封装
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + ,` | 提取问题到编辑器 (qna) |
| `Ctrl + .` | 交互式问答 (answer) |

## 架构改进

### v2.0 更新

1. **共享模块提取**
   - 将公共 LLM 工具提取到 `shared/llm-utils.ts`
   - 统一的类型定义 `AuthResult`, `ModelRegistry`

2. **错误处理增强**
   - 所有异步操作都有 try-catch 包裹
   - 用户友好的错误提示
   - 认证失败的优雅降级

3. **代码组织**
   - 按功能模块分组（Types/Constants/Parsing/UI/Handler）
   - 清晰的注释和 JSDoc
   - 类型安全增强

4. **性能优化**
   - QnA 组件使用缓存渲染
   - 智能模型选择（Opus/Sonnet → Haiku）

## 使用示例

```bash
# 简单提取
/qna

# 交互式问答
/answer

# 上下文转移
/handoff implement user authentication
```
