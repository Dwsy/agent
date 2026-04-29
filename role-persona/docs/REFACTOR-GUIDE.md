# Role-Persona 重构指南

## 模块依赖矩阵

```
config.ts         → 零依赖 (自包含)
logger.ts         → config
spinner-utils.ts  → 零依赖
role-template.ts  → 零依赖
role-store.ts     → config, memory-md (ensureRoleMemoryFiles), role-template
memory-md.ts      → config, logger, memory-tags
memory-tags.ts    → config, logger
memory-llm.ts     → config, logger, memory-md (+ pi-ai complete*)
knowledge.ts      → config, logger, role-store
embedding-*.ts    → logger, memory-vector接口
memory-vector.ts  → config, logger, memory-md, embedding-*
memory-export.ts  → memory-md
tui-renderers.ts  → pi-tui, pi-coding-agent (仅 pi-adapter)
```

## 重构要点

### 需要解除的 Pi API 依赖

| 文件 | Pi 依赖 | 解耦方式 |
|------|---------|---------|
| memory-md.ts | `ExtensionContext` (仅 addRoleLearningWithTags 的 LLM 调用) | 回调注入 |
| memory-llm.ts | `ExtensionContext` (modelRegistry, complete) | 抽象 LLM 调用接口 |
| memory-tags.ts | `ExtensionContext` (completeSimple) | 抽象 LLM 调用接口 |
| memory-vector.ts | `ExtensionContext` (modelRegistry) | 抽象 Provider 工厂 |
| memory-viewer.ts | pi-tui 组件 | 仅 pi-adapter 使用 |
| tui-renderers.ts | pi-tui + pi-coding-agent | 仅 pi-adapter 使用 |
| index.ts | 全部 | 拆分为 service + pi-adapter |

### LLM 调用抽象接口

```typescript
// 用于替代直接依赖 ExtensionContext 的 LLM 调用
export interface LlmCaller {
  complete(opts: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<string>;
}
```

### Service 层接口映射

| Pi 命令 | Service 方法 |
|---------|-------------|
| `/role info` | `role.resolve(cwd)` + `role.getIdentity()` |
| `/role create` | `role.create(name)` |
| `/role map` | `role.map(cwd, name)` |
| `/role unmap` | `role.unmap(cwd)` |
| `/role list` | `role.list()` |
| `/memories` | `memory.list()` + viewer |
| `/memory-log` | `memory.getLog()` |
| `/memory-fix` | `memory.repair()` |
| `/memory-tidy` | `memory.repair()` + `memory.consolidate()` |
| `/memory-tidy-llm` | `memory.tidyLlm(model)` |
| `/memory-vector stats` | `embedding.stats()` |
| `/memory-vector rebuild` | `embedding.rebuild()` |
| `/memory-tags` | `memory.list()` + tag cloud |
| `/memory-conflicts` | `memory.detectConflicts()` |
| `/memory-export` | `memory.exportHtml()` |
| `/kb list` | `knowledge.list()` |
| `/kb search` | `knowledge.search()` |
| `/kb stats` | `knowledge.list()` |

| Pi Tool | Service 方法 |
|---------|-------------|
| `memory({ action: "add_learning" })` | `memory.addLearning(content)` |
| `memory({ action: "add_preference" })` | `memory.addPreference(content, category)` |
| `memory({ action: "search" })` | `memory.search(query)` |
| `memory({ action: "list" })` | `memory.list()` |
| `memory({ action: "consolidate" })` | `memory.consolidate()` |
| `memory({ action: "repair" })` | `memory.repair()` |
| `memory({ action: "llm_tidy" })` | `memory.tidyLlm(model)` |
| `memory({ action: "vector_rebuild" })` | `embedding.rebuild()` |
| `memory({ action: "vector_stats" })` | `embedding.stats()` |
| `memory({ action: "reinforce" })` | `memory.reinforce(needle)` |
| `memory({ action: "update_learning" })` | `memory.updateLearning(needle, text)` |
| `memory({ action: "update_preference" })` | `memory.updatePreference(needle, text)` |
| `memory({ action: "delete_learning" })` | `memory.deleteLearning(needle)` |
| `memory({ action: "delete_preference" })` | `memory.deletePreference(needle)` |
| `knowledge({ action: "list" })` | `knowledge.list()` |
| `knowledge({ action: "search" })` | `knowledge.search(query)` |
| `knowledge({ action: "read" })` | `knowledge.read(path)` |
| `knowledge({ action: "write" })` | `knowledge.write(entry)` |
| `role_info()` | `role.getStructure(path)` |
