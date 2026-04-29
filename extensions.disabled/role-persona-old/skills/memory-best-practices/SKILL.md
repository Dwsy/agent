---
name: memory-best-practices
description: "Best practices for writing and maintaining high-quality role memories."
whenToUse: "When writing or reviewing memory entries, or when the user asks about memory quality standards."
---

# Memory Best Practices

A quality standard for writing high-quality memories that compound in value.

## The `[Nx]` Priority System

```
[0x]  New           → unverified, just added
[1-2x] Normal       → confirmed 1-2 times
[3x]+  High Priority → battle-tested, frequently used
```

**`[Nx]` = usage count.** The best quality signal. `[6x]` survived 6 sessions — probably right. `[0x]` might be noise.

## How `[Nx]` Increments

| Trigger | Effect |
|---------|--------|
| `memory({ action: "reinforce", content: "..." })` | Manual +1 |
| `memory({ action: "search", query: "..." })` score ≥0.5 | Auto-reinforce +1 |
| Pending auto-promote (search ≥0.5) | Moves to consolidated at [0x] |

**Reinforce ≠ Promote:**
- **Reinforce** = increment `[Nx]` within consolidated (used+1)
- **Promote** = move entry from pending.md → consolidated.md (at [0x])

## Learning Quality Checklist

Before saving:
- [ ] **Durable** — true next month?
- [ ] **Non-obvious** — changes approach next time?
- [ ] **Actionable** — what to do differently?
- [ ] **Concise** — under 120 chars?
- [ ] **Not redundant** — search first, reinforce if similar

## Good vs Bad

```
✅ "MyBatis-Plus getOne needs .last('LIMIT 1') to avoid TooManyResultsException"
✅ "禁止 rm，优先 trash"
✅ "ACP: Agent 无状态，Client 持状态"

❌ "用户让我修了一个 bug"          ← too generic
❌ "Error at /src/index.ts:42"    ← copy-paste, no insight
❌ "服务器现在在 3000 端口"         ← temporary state
```

## Preference Categories

| Category | When |
|----------|------|
| `Communication` | Language, style, tone |
| `Code` | Style, conventions, abstraction |
| `Tools` | CLI, editors, workflows |
| `Workflow` | Process, review, deployment |
| `General` | Everything else |

**Rules:** one per line, be specific, correct category.

## Tags

Each learning has **LLM-auto-extracted tags**. You don't tag manually.

Tags are used in search:
- **Exact tag match** → +0.3 score
- **Related tag** (association graph) → +0.15 score
- Conceptually related entries surface even with different wording

Example: searching "安全删除" finds entries tagged `filesystem`, `safety`, `delete` even if they don't contain those words.

## Two Paths to Memory

```
Path 1: Auto-extract (agent_end / compaction)
  → pending.md [○] → search ≥0.5 → promote → consolidated [0x]
  → reinforce over time → [3x]+ High Priority

Path 2: Manual (memory tool)
  → consolidated [0x] directly (you verified it's worth keeping)
  → reinforce over time → same priority ladder
```

**Why pending?** Auto-extracted memories are noisy. Pending layer filters by actual usage.

## Consolidate vs LLM Tidy

| Operation | Method | What it does |
|-----------|--------|-------------|
| `consolidate` | Rule-based | Exact + Jaccard dedup. Safe, never deletes unique entries. |
| `llm_tidy` | LLM-guided | Rewrites verbose, detects contradictions, suggests deletions. |

Use `consolidate` for routine maintenance. Use `llm_tidy` for deep cleanup.

## Knowledge vs Memory

| Dimension | Memory (consolidated.md) | Knowledge (knowledge/) |
|-----------|-------------------------|----------------------|
| Scope | Cross-session insights | Reusable patterns, decisions |
| Format | One-line entries | Full markdown files |
| Example | "禁止 rm，优先 trash" | Full design pattern with code |
| Tool | `memory` | `knowledge` |
| Share | Per-role | Role / global / project |

**Write knowledge when:** full pattern with code examples, or share across roles.

## Signs of Healthy Memory

- High ratio of `[3x]+` entries
- Low `[0x]` count (low noise)
- Entries under 120 chars
- Well-categorized preferences
- No duplicates or contradictions

## Signs of Unhealthy Memory

- Many `[0x]` never reinforced (noise)
- Very long entries
- Duplicates saying same thing differently
- Contradictory preferences
- Outdated information

## Quick Reference

```
Add learning:     memory({ action: "add_learning", content: "..." })
Add preference:   memory({ action: "add_preference", content: "...", category: "..." })
Reinforce:        memory({ action: "reinforce", content: "..." })
Search:           memory({ action: "search", query: "..." })
List:             memory({ action: "list" })
Consolidate:      memory({ action: "consolidate" })
LLM tidy:         memory({ action: "llm_tidy" })
```
