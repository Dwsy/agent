# T10: 模型容灾 Phase 1 — Fallback Chain + 错误分类

**Owner:** JadePhoenix  
**改动量:** ~170 行

---

## 新建文件: `src/core/model-health.ts` (~120 行)

### 类型定义

```typescript
type FailoverReason = "rate_limit" | "auth" | "billing" | "timeout" | "overloaded" | "unknown";

interface ModelHealthState {
  model: string;
  failures: number;
  lastFailure: number;
  cooldownUntil: number;
}

interface ModelConfig {
  primary?: string;           // "provider/model"
  fallbacks?: string[];       // ordered fallback chain
  maxRetries?: number;        // per-model retry count, default 1
  cooldownMs?: number;        // cooldown after failure, default 60000
}
```

### 错误分类函数

```typescript
function classifyError(errorText: string): FailoverReason | null {
  const lower = errorText.toLowerCase();
  if (/rate.limit|429|too many requests|quota/.test(lower)) return "rate_limit";
  if (/overloaded/.test(lower)) return "overloaded";
  if (/401|403|invalid.*key|unauthorized/.test(lower)) return "auth";
  if (/402|billing|insufficient.*credit/.test(lower)) return "billing";
  if (/timeout|timed out/.test(lower)) return "timeout";
  return null;
}
```

### ModelHealth 类

```typescript
class ModelHealth {
  private states = new Map<string, ModelHealthState>();
  
  constructor(private config: ModelConfig) {}

  recordFailure(model: string, reason: FailoverReason): void {
    const state = this.states.get(model) ?? { model, failures: 0, lastFailure: 0, cooldownUntil: 0 };
    state.failures++;
    state.lastFailure = Date.now();
    state.cooldownUntil = Date.now() + (this.config.cooldownMs ?? 60000);
    this.states.set(model, state);
  }

  recordSuccess(model: string): void {
    this.states.delete(model); // reset on success
  }

  selectModel(): string | null {
    const candidates = [this.config.primary, ...(this.config.fallbacks ?? [])].filter(Boolean) as string[];
    const now = Date.now();
    return candidates.find(m => {
      const state = this.states.get(m);
      return !state || now > state.cooldownUntil;
    }) ?? null;
  }

  getCurrentState(): Map<string, ModelHealthState> {
    return new Map(this.states);
  }
}
```

---

## 修改: `src/core/config.ts` (+10 行)

`AgentConfig.model` 从 `string?` 改为 `string | ModelConfig`:

```typescript
export interface ModelConfig {
  primary?: string;
  fallbacks?: string[];
  maxRetries?: number;        // default 1
  cooldownMs?: number;        // default 60000
}

// AgentConfig 中:
model?: string | ModelConfig;
```

兼容：`model: "anthropic/claude-sonnet-4"` (string) 和 `model: { primary: "...", fallbacks: [...] }` (object) 都支持。

---

## 修改: `src/gateway/types.ts` (+2 行)

```typescript
// GatewayContext 新增:
modelHealth?: ModelHealth;
```

---

## 修改: `src/gateway/message-pipeline.ts` (+30 行)

### 集成点 1: message_end 错误检测

在事件循环中（约 L228-237），检测 `stopReason: "error"`:

```typescript
if (event.type === "message_end") {
  const msg_ = event.message;
  if (msg_?.stopReason === "error" && msg_.errorMessage && ctx.modelHealth) {
    const reason = classifyError(msg_.errorMessage);
    if (reason) {
      ctx.modelHealth.recordFailure(currentModel, reason);
    }
  }
}
```

### 集成点 2: catch 块 fallback

在 catch 块（约 L278-281）加自动切换:

```typescript
} catch (err: unknown) {
  const errMsg = err instanceof Error ? err.message : String(err);
  const reason = classifyError(errMsg);
  
  if (reason && ctx.modelHealth) {
    ctx.modelHealth.recordFailure(currentModel, reason);
    const fallback = ctx.modelHealth.selectModel();
    if (fallback && fallback !== currentModel) {
      ctx.log.warn(`Model ${currentModel} failed (${reason}), switching to ${fallback}`);
      // 通知用户
      // 下次请求自动使用 fallback
    }
  }
  
  fullText = typeof fullText === 'string' && fullText.trim() ? fullText : `Error: ${errMsg}`;
}
```

### 集成点 3: 成功时 reset

在 agent_end 成功路径:

```typescript
if (ctx.modelHealth) {
  ctx.modelHealth.recordSuccess(currentModel);
}
```

---

## 修改: `src/server.ts` (+5 行)

初始化 ModelHealth 并注入 GatewayContext:

```typescript
import { ModelHealth } from "./core/model-health.ts";

// Gateway constructor 中:
const modelHealth = new ModelHealth(resolveModelConfig(this.config));
// ctx 中:
modelHealth,
```

---

## 配置示例

```jsonc
{
  "agent": {
    "model": {
      "primary": "anthropic/claude-sonnet-4",
      "fallbacks": ["openai/gpt-4o", "moonshot/kimi-k2-0711"],
      "cooldownMs": 60000
    }
  }
}
```

---

## 验收

- `classifyError` 正确分类 rate_limit/auth/billing/timeout/overloaded
- primary 失败后自动选择 fallback
- cooldown 过期后恢复 primary
- 成功请求 reset failure count
- 兼容 `model: "string"` 旧配置
- 723 tests / 0 fail + 新增 model-health 单元测试
