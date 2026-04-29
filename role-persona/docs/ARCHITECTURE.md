# role-persona 架构文档

> 重构自 extensions.disabled/role-persona-cli/ (13,424 行单体)
> 三层分离, 四种运行模式, CLI-first JSON 输出

## 核心设计

```
┌─────────────────────────────────────────────────────┐
│ Transport Layer                                      │
│ ┌──────────┐ ┌──────┐ ┌──────────┐ ┌──────────────┐│
│ │Pi Adapter│ │ CLI  │ │MCP Server│ │HTTP Daemon   ││
│ │  495行    │ │380行  │ │  284行    │ │  227行       ││
│ └────┬─────┘ └──┬───┘ └────┬─────┘ └──────┬───────┘│
│      │          │          │               │        │
│      └──────────┴────┬─────┴───────────────┘        │
│                      │                              │
│          cli-runner (93行)                           │
│          spawn("bun", [...])                         │
│          parse JSON stdout                           │
├──────────────────────┼──────────────────────────────┤
│ Service Layer        │ (877行, 零Pi依赖)             │
│ role.* memory.* knowledge.* embedding.*             │
├──────────────────────┼──────────────────────────────┤
│ Core Layer           │ (10071行, 零Pi依赖)           │
│ config logger role-store memory-md knowledge ...    │
└──────────────────────┴──────────────────────────────┘
```

**关键约束**: Pi Adapter 不 import service/core 任何模块。
所有操作通过 `cli-runner.ts` → `bun src/bin/cli.ts` 子进程完成。

## CLI 输出格式 (Agent-Friendly JSON)

```json
// 成功
{ "ok": true, "data": {...}, "message": "Human-readable summary" }

// 失败
{ "ok": false, "error": "Error description" }
```

每个命令都输出 JSON，无需 `--json` 标记。
用 `--human` 切换为人类可读文本。

## 运行模式

### 1. CLI
```bash
bun src/bin/cli.ts init
bun src/bin/cli.ts role list
bun src/bin/cli.ts memory search "query"
bun src/bin/cli.ts knowledge list
bun src/bin/cli.ts embedding stats
bun src/bin/cli.ts prompt --base "You are..."
echo '[{"role":"user","content":[{"type":"text","text":"hello"}]}' | bun src/bin/cli.ts memory build-prompt
```

### 2. MCP Server
```bash
bun src/transport/mcp-server.ts
```

### 3. HTTP Daemon
```bash
bun src/bin/daemon.ts  # port 3939
curl -X POST http://localhost:3939/api/memory/search -d '{"query":"test"}'
```

### 4. Pi Extension
```typescript
// 通过 cli-runner 自动调用 CLI 子进程
export default rolePersonaExtension;
```

## 文件清单

| 层 | 文件 | 行数 | Pi依赖 |
|---|---|---:|:---:|
| **Core** | 18 文件 | 10,071 | ❌ |
| **Service** | 6 文件 | 877 | ❌ |
| **Transport** | 5 文件 | 1,485 | 仅 pi-adapter |
| **Bin** | 2 文件 | 392 | ❌ |
| **总计** | **31 文件** | **12,825** | |

## 依赖方向

```
pi-adapter → cli-runner → bun cli.ts → service → core
mcp-server ──────────────────────→ service → core
daemon ───────────────────────────→ service → core
cli.ts ───────────────────────────→ service → core
```

Pi adapter 是唯一需要 pi 包的文件。
其余 30 个文件完全独立。
