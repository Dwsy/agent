---
name: gapp-generative-bridge
description: Operate Glimpse-APPs with progressive context — app list in system, domain detail via tools on demand.
---

# GAPP agent skill (progressive)

## What is injected vs fetched

| In system | Via tools when needed |
|-----------|------------------------|
| Online app **list** (id / name / scope) | `gapp_list` full list |
| Live window **ids** only | **`gapp_list_tools({ id })`** catalog + schema |
| Inbound event/generate rules (short) | `gapp_get_state` / `gapp_call` payloads |

**Never invent domain tool names.** System does not embed full tool catalogs.

## Tool priority

1. See app in online list (or `gapp_list`)
2. **`gapp_list_tools({ id })`** when you will call/mutate
3. **`gapp_call`** preferred mutate/read
4. `gapp_get_state` / `gapp_set_state` fallback only
5. `gapp_upsert` / `gapp_open` for create / window

## Inbound

### `[GAPP event]`
- Re-read with tools, then short status + next steps

### `[GAPP generate]`
- Main session; content only; no chit-chat

## SSOT
- Disk `state.json`; UI via `GappStore`
