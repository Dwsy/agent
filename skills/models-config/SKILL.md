---
name: models-config
description: Model configuration editor for ~/.pi/agent/models.json - 使用 Bun 脚本管理模型配置
---

# Pi Models Manager

管理 `~/.pi/agent/models.json` 配置文件的命令行工具。

## 快速开始

```bash
# 列出所有模型
bun ~/.pi/agent/skills/models-config/models.ts list

# 添加 Provider
bun ~/.pi/agent/skills/models-config/models.ts add provider myprovider https://api.example.com/v1 --api-key sk-your-api-key

# 添加模型
bun ~/.pi/agent/skills/models-config/models.ts add model pox gpt-5.4 --reasoning --context-window 200000

# 测试连接
bun ~/.pi/agent/skills/models-config/models.ts test pox gpt-5.4

# 测试推理
bun ~/.pi/agent/skills/models-config/models.ts test pox gpt-5.4 --reasoning --thinking high

# 测试流式响应
bun ~/.pi/agent/skills/models-config/models.ts test pox gpt-5.4 --stream

# 批量测试
bun ~/.pi/agent/skills/models-config/models.ts batch pox

# 更新价格
bun ~/.pi/agent/skills/models-config/models.ts update

# 验证配置
bun ~/.pi/agent/skills/models-config/models.ts validate
```

## 命令详解

### list - 列出模型

```bash
bun models.ts list                    # 列出所有
bun models.ts list --provider pox    # 查看 pox 详情
bun models.ts list --json            # JSON 格式输出
```

### add provider - 添加 Provider

```bash
bun models.ts add provider <name> <baseUrl> [options]

# 选项:
#   --api-key <key>     API 密钥
#   --api <type>        API 类型 (默认: openai-responses)
#   --auth-header       使用 Authorization header

# 示例:
bun models.ts add provider myprovider https://api.example.com/v1 \
  --api-key sk-your-api-key \
  --api openai-responses \
  --auth-header
```

### add model - 添加模型

```bash
bun models.ts add model <provider> <modelId> [options]

# 选项:
#   --name <name>           显示名称
#   --reasoning            支持推理功能
#   --context-window <n>   上下文窗口 (默认: 128000)
#   --max-tokens <n>       最大输出 (默认: 16384)
#   --cost-input <n>       输入价格 $/M
#   --cost-output <n>      输出价格 $/M

# 示例:
bun models.ts add model pox gpt-5.4 \
  --name "GPT-5.4" \
  --reasoning \
  --context-window 200000 \
  --max-tokens 64000
```

### test - 测试连接 ⭐

支持所有主流 API 类型和高级功能：

```bash
bun models.ts test <provider> [modelId] [options]

# 基本测试
bun models.ts test pox gpt-5.4

# 指定测试消息
bun models.ts test pox gpt-5.4 --message "What is 2+2?"

# 测试流式响应
bun models.ts test pox gpt-5.4 --stream

# 测试推理能力
bun models.ts test pox gpt-5.4 --reasoning --thinking high

# 推理级别: minimal / low / medium / high / xhigh
```

**支持的 API 类型：**

| API 类型 | 说明 | 端点 |
|---------|------|-----|
| `openai-responses` | OpenAI Responses API | `/responses` |
| `openai-completions` | OpenAI Chat Completions | `/chat/completions` |
| `anthropic-messages` | Anthropic Messages API | `/v1/messages` |
| `google-generative-ai` | Google Gemini API | `/v1beta/models/:generateContent` |
| `mistral-conversations` | Mistral API | `/v1/chat/completions` |
| `azure-openai-responses` | Azure OpenAI | `/openai/deployments/.../responses` |

### batch - 批量测试

```bash
# 批量测试所有模型
bun models.ts batch pox

# 带推理的批量测试
bun models.ts batch pox --reasoning

# 带流式的批量测试
bun models.ts batch pox --stream
```

### rm - 删除

```bash
# 删除整个 provider
bun models.ts rm pox

# 删除指定模型
bun models.ts rm pox gpt-5.4
```

### update - 更新价格

从 [models.dev](https://models.dev/api.json) 获取最新价格数据：

```bash
bun models.ts update
bun models.ts update --provider pox  # 只更新 pox
```

### template - 配置模板

```bash
# 查看 OpenAI 兼容配置模板
bun models.ts template openai-compatible

# 查看 Anthropic 兼容模板
bun models.ts template anthropic-compatible
```

### validate - 验证 JSON

```bash
bun models.ts validate
```

## 完整配置示例

```json
{
  "providers": {
    "pox": {
      "baseUrl": "https://api.example.com/v1",
      "apiKey": "sk-your-api-key",
      "api": "openai-responses",
      "authHeader": true,
      "models": [
        {
          "id": "gpt-5.4",
          "name": "GPT-5.4",
          "reasoning": true,
          "input": ["text", "image"],
          "output": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 200000,
          "maxTokens": 64000
        }
      ]
    }
  }
}
```

## 配置文件位置

```
~/.pi/agent/models.json
```
