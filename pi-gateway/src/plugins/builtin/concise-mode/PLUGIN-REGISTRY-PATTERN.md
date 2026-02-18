# 插件注册模式 - 系统提示词注入

## 架构设计

### 问题

**硬编码方式的问题：**
```typescript
// ❌ 错误：system-prompts.ts 硬编码所有插件提示词
if (config.plugins?.config?.["concise-mode"]?.enabled) {
  segments.push(CONCISE_MODE_SEGMENT);
}
if (config.plugins?.config?.["my-plugin"]?.enabled) {
  segments.push(MY_PLUGIN_SEGMENT);
}
// ... 无限膨胀
```

**问题：**
- ❌ system-prompts.ts 需要知道所有插件
- ❌ 违反开闭原则（对扩展不开放）
- ❌ 违反单一职责（系统层知道插件细节）
- ❌ 难以维护和新插件扩展

---

### 解决方案：插件注册模式

```typescript
// ✅ 正确：插件自己注册提示词段
// concise-mode/index.ts
registerSystemPromptSegment({
  id: "concise-mode",
  segment: CONCISE_MODE_SEGMENT,
  shouldInclude: (config) => config.plugins?.config?.["concise-mode"]?.enabled ?? false,
});
```

**优势：**
- ✅ system-prompts.ts 不需要知道具体插件
- ✅ 插件自己管理提示词和注入条件
- ✅ 符合开闭原则
- ✅ 易于扩展新插件

---

## API 设计

### registerSystemPromptSegment

```typescript
import { registerSystemPromptSegment } from "../../../core/system-prompts.ts";

registerSystemPromptSegment({
  /** 唯一标识符 */
  id: string,
  
  /** 提示词段文本 */
  segment: string,
  
  /** 条件函数：决定是否注入 */
  shouldInclude: (config: Config) => boolean,
  
  /** 可选：优先级（高优先级在后） */
  priority?: number,
});
```

---

## 使用示例

### 示例 1：Concise-Mode 插件

```typescript
// concise-mode/index.ts
import { registerSystemPromptSegment } from "../../../core/system-prompts.ts";

const CONCISE_MODE_SEGMENT = `## Gateway: Concise Output Mode

You are in concise output mode...`;

export default function register(api: GatewayPluginApi) {
  // 注册系统提示词段
  registerSystemPromptSegment({
    id: "concise-mode",
    segment: CONCISE_MODE_SEGMENT,
    shouldInclude: (config) => 
      config.plugins?.config?.["concise-mode"]?.enabled ?? false,
    priority: 0,
  });
  
  // ... 其他插件逻辑
}
```

---

### 示例 2：自定义插件

```typescript
// my-plugin/index.ts
import { registerSystemPromptSegment } from "../../../core/system-prompts.ts";

const MY_PLUGIN_SEGMENT = `## Gateway: My Plugin Mode

Special capabilities for my plugin...`;

export default function register(api: GatewayPluginApi) {
  registerSystemPromptSegment({
    id: "my-plugin",
    segment: MY_PLUGIN_SEGMENT,
    shouldInclude: (config) => 
      config.plugins?.config?.["my-plugin"]?.enabled ?? false,
    priority: 10, // 高优先级，在 prompt 后面
  });
  
  // ... 其他插件逻辑
}
```

---

### 示例 3：多条件注入

```typescript
// advanced-plugin/index.ts
registerSystemPromptSegment({
  id: "advanced-plugin",
  segment: ADVANCED_SEGMENT,
  shouldInclude: (config) => {
    // 复杂条件判断
    const pluginConfig = config.plugins?.config?.["advanced-plugin"];
    return pluginConfig?.enabled && 
           pluginConfig?.mode === "advanced" &&
           config.channels?.telegram?.enabled !== false;
  },
  priority: 5,
});
```

---

## 注入流程

```
Gateway 启动
    ↓
加载所有插件
    ↓
插件调用 registerSystemPromptSegment()
    ↓
系统提示词段注册到 registry
    ↓
调用 buildGatewaySystemPrompt(config)
    ↓
调用 getRegisteredSegments(config)
    ↓
遍历 registry，调用 shouldInclude(config)
    ↓
收集所有应包含的段
    ↓
按优先级排序
    ↓
合并到最终系统提示词
    ↓
启动 RPC 进程时传入
```

---

## 架构对比

### Before（硬编码）

```
┌─────────────────────────────────────────────────────────────┐
│  system-prompts.ts                                          │
│  - 知道所有插件                                             │
│  - 硬编码所有条件                                           │
│  - 违反开闭原则                                             │
└─────────────────────────────────────────────────────────────┘
```

### After（注册模式）

```
┌─────────────────────────────────────────────────────────────┐
│  system-prompts.ts                                          │
│  - 提供 registerSystemPromptSegment() API                   │
│  - 不知道具体插件                                           │
│  - 只负责收集和应用                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  concise-mode/index.ts                                      │
│  - 自己注册提示词段                                         │
│  - 自己定义注入条件                                         │
│  - 符合单一职责                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 设计原则

### 1. 开闭原则 (Open-Closed Principle)

> "软件实体应该对扩展开放，对修改关闭。"

- ✅ 新插件无需修改 system-prompts.ts
- ✅ 插件自己管理提示词和条件
- ✅ 系统层不需要知道插件细节

### 2. 单一职责原则 (Single Responsibility Principle)

> "每个类应该只有一个引起变化的原因。"

- ✅ system-prompts.ts: 只负责收集和合并
- ✅ 插件：只负责自己的提示词和条件

### 3. 依赖倒置原则 (Dependency Inversion Principle)

> "高层模块不应该依赖低层模块，两者都应该依赖抽象。"

- ✅ system-prompts.ts 不依赖具体插件
- ✅ 插件通过 registry 接口注册

---

## 最佳实践

### 1. 提示词段设计

```typescript
// ✅ 好的提示词段
const SEGMENT = `## Gateway: Feature Name

Clear description of what this feature does.

### Usage
How to use this feature.

### Examples
Code examples if applicable.`;

// ❌ 避免
const SEGMENT = `Some random text without structure`;
```

### 2. 条件函数设计

```typescript
// ✅ 好的条件函数
shouldInclude: (config) => 
  config.plugins?.config?.["my-plugin"]?.enabled ?? false

// ❌ 避免：硬编码
shouldInclude: () => true

// ❌ 避免：访问无关配置
shouldInclude: (config) => 
  config.channels?.telegram?.enabled // 无关配置
```

### 3. 优先级使用

```typescript
// 基础功能：priority = 0
registerSystemPromptSegment({ priority: 0, ... });

// 扩展功能：priority = 5-10
registerSystemPromptSegment({ priority: 5, ... });

// 覆盖/特殊功能：priority = 10+
registerSystemPromptSegment({ priority: 10, ... });
```

---

## 调试方法

### 1. 查看注册的段

```typescript
// 在 buildGatewaySystemPrompt 中添加调试
const registeredSegments = getRegisteredSegments(config);
config.log?.info(`Registered segments: ${registeredSegments.map(s => s.id).join(", ")}`);
```

### 2. 检查注入条件

```typescript
// 在 shouldInclude 中添加调试
shouldInclude: (config) => {
  const enabled = config.plugins?.config?.["my-plugin"]?.enabled ?? false;
  console.log(`[my-plugin] shouldInclude: ${enabled}`);
  return enabled;
}
```

### 3. 查看最终提示词

```bash
# 查看 Gateway 启动日志
tail -f logs/gateway.log | grep "prompt"

# 或查看 RPC 进程启动参数
ps aux | grep "pi.*rpc"
```

---

## 故障排查

### 问题 1：提示词未注入

**检查清单：**
1. ✅ 插件是否调用了 `registerSystemPromptSegment()`
2. ✅ `shouldInclude()` 是否返回 `true`
3. ✅ 配置是否正确（`pi-gateway.jsonc`）
4. ✅ Gateway 是否重启（注册在启动时）

### 问题 2：提示词顺序不对

**解决方案：**
- 调整 `priority` 值（高优先级在后）
- 默认 `priority = 0`

### 问题 3：多个插件冲突

**解决方案：**
- 使用唯一的 `id`
- 调整 `priority` 控制顺序
- 在提示词中说明兼容性

---

## 总结

插件注册模式提供了：

- ✅ **可扩展性**：新插件无需修改系统代码
- ✅ **模块化**：每个插件管理自己的提示词
- ✅ **清晰职责**：系统层 vs 插件层职责分离
- ✅ **易于维护**：代码组织清晰，易于理解

> "好的设计是让扩展变得容易，让错误变得困难。" — *软件设计原则*
