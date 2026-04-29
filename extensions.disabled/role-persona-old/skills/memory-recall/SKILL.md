---
name: memory-recall
description: "Load prior knowledge from role memory before starting any task."
whenToUse: "At the START of every new conversation or task, BEFORE doing any work. This skill loads prior knowledge from the role's persistent memory system. Without it, you have no memory of past sessions. Invoke proactively — do not wait for the user to ask."
---

# Memory Recall

You have access to a role-based persistent memory system with **4 layers**:

```
L2 Structured  → memory/consolidated.md (deduplicated, priority-ranked)
PENDING        → memory/pending.md (auto-extracted, awaiting verification)
L1 Raw         → memory/daily/YYYY-MM-DD.md (session logs)
Knowledge      → docs/knowledge/ (reusable patterns, architecture decisions)
```

## Tools Available

| Tool | Purpose |
|------|---------|
| `memory({ action: "search", query: "<text>" })` | Search all layers. Auto-reinforces high-score matches (≥0.5). Auto-promotes relevant pending memories. |
| `memory({ action: "list" })` | List all consolidated memories, detect issues |
| `role_read` | Read role file (default: `memory/consolidated.md`) |
| `role_search` | Full-text search across role files |
| `knowledge({ action: "search", query: "<text>" })` | Search knowledge base |

## Process

### Step 1: Targeted search

```
memory({ action: "search", query: "<user topic or key concept>" })
```

The search automatically:
- Searches consolidated learnings, preferences, events
- Searches pending memories (auto-promotes score ≥0.5)
- Searches last 7 days of daily files
- **Tag boost**: matching tags +0.3 score, related tags +0.15
- **Auto-reinforce**: matches ≥0.5 get `used` count +1

### Step 2: Scan High Priority

If search returns few results:
```
memory({ action: "list" })
```
Focus on `High Priority [3x]+` — these are battle-tested.

### Step 3: Deep context (if needed)

- `role_search({ query: "<concept>" })` → find related role files
- `role_read({ path: "core/constraints.md" })` → read full file

### Step 4: Check knowledge base

For technical tasks:
```
knowledge({ action: "search", query: "<topic>" })
```

### Step 5: Summarize and proceed

Summarize findings, then proceed.

## Guardrails

- **max memory ops: 10** — Don't burn the whole session searching
- **Tag boost is real** — matching tags rank higher. Trust the sort.
- If nothing found, proceed — not every task has prior knowledge
- Summarize before proceeding

## Memory Format

```
# Learnings (High Priority)    → used ≥ 3
- [6x] 声明完成前验证铁律

# Learnings (Normal)           → used 1-2
- [2x] 软删除优先

# Learnings (New)              → used = 0
- [0x] 标签系统闭环是快速win

# Preferences: Communication | Code | Tools | Workflow | General
- 偏好中文沟通
```

## Pending Layer

Auto-extracted memories land in `memory/pending.md`:
- `[○]` pending — awaiting verification
- `[✓]` promoted — moved to consolidated
- `[✗]` discarded — 7 days without use

**Search auto-promotes** pending entries with score ≥0.5. Usage is verification.

## Tags

Each learning has LLM-auto-extracted tags. Search uses them:
- Exact tag match → +0.3 score
- Related tag (association graph) → +0.15 score
- This means conceptually related entries surface even with different wording

## Important

- Always start with `memory({ action: "search", query: "..." })`
- High Priority `[3x]+` are most valuable — read first
- User references past work → search for related keywords
- Nothing found → proceed without memory
