---
name: memory-organize
description: "Periodic maintenance of role memory: dedup, tidy, consolidate, and pending management."
whenToUse: "When the user asks to organize, tidy, or maintain their memory. Also for scheduled maintenance to clean up stale entries and manage the pending verification layer."
---

# Memory Organize

You are maintaining a role's persistent memory system. Keep it healthy, accurate, and useful.

## Memory Layers

```
consolidated.md  ← L2: deduplicated learnings + preferences (main)
pending.md       ← Pending: auto-extracted, awaiting verification
daily/*.md       ← L1: raw session logs
```

## Tools Available

| Tool | Purpose |
|------|---------|
| `memory({ action: "list" })` | List all memories, detect structural issues |
| `memory({ action: "consolidate" })` | Rule-based dedup: exact + Jaccard similarity. Safe, never deletes unique entries. |
| `memory({ action: "repair" })` | Fix markdown structure issues |
| `memory({ action: "llm_tidy" })` | LLM-guided: rewrites verbose, detects contradictions, suggests deletions |
| `memory({ action: "search", query: "..." })` | Search with auto-reinforce (≥0.5 → used+1) |
| `memory({ action: "reinforce", content: "..." })` | Increment `[Nx]` usage count |
| `memory({ action: "delete_learning", content: "..." })` | Remove stale entry |
| `memory({ action: "update_learning", id/query, content })` | Rewrite entry |
| `role_read` / `role_write` | Direct file access |

## Process

### Step 1: Assess

```
memory({ action: "list" })
```

Look for:
- **Parse issues** — structural problems
- **High [0x] count** — many unverified = noise
- **Long entries** — should be <120 chars

### Step 2: Repair (if needed)

```
memory({ action: "repair" })
```

Fixes: malformed headings, missing sections, stray lines. Safe, rule-based.

### Step 3: Consolidate (dedup)

```
memory({ action: "consolidate" })
```

**Rule-based, NOT LLM:**
- Exact text match → keep highest `[Nx]`
- Jaccard token similarity (config threshold) → merge, keep highest
- Rewrites the canonical section layout in `consolidated.md`
- Updates `# Last Consolidated` date

`consolidate` does **not** magically upgrade `[0x]` to Normal. Priority still depends on usage (`reinforce` / auto-reinforce during search).

### Step 4: LLM Tidy (deep cleanup)

```
memory({ action: "llm_tidy" })
```

LLM produces a plan:
- **Rewrite** verbose entries → concise
- **Detect contradictions** between entries
- **Suggest deletions** for stale entries
- **Add** new entries derived from synthesis

### Step 5: Pending Management

Check `memory/pending.md`:
```
role_read({ path: "memory/pending.md" })
```

- `[○]` pending → if relevant to current work, `search` to auto-promote (score ≥0.5)
- `[✓]` already promoted
- `[✗]` discarded (7-day auto-expiry)

Pending entries that survive 7+ days without use are auto-expired. Manual promotion via search.

### Step 6: Reinforce Active Memories

For insights used in this session:
```
memory({ action: "reinforce", content: "<text>" })
```

Moves memories toward High Priority `[3x]+`.

### Step 7: Remove Stale Entries

For provably outdated entries:
```
memory({ action: "delete_learning", content: "<text>" })
```

**Rules:**
- Only delete if provably wrong or no longer relevant
- Prefer `update_learning` over delete when in doubt
- Never delete preferences without user confirmation

## Maintenance Report

After organizing:

```
Memory Organize Report — <role>
- Before: X learnings, Y preferences
- After:  X' learnings, Y' preferences
- Repaired: yes/no
- Consolidate: removed N duplicates
- LLM tidy: rewrote N, deleted N, added N
- Pending: M promoted, K expired
```

## Maintenance Frequency

| Frequency | Actions |
|-----------|---------|
| Per session | auto-extract → pending (automatic) |
| On request | `consolidate` (safe dedup) |
| Weekly | `repair` + `consolidate` + reinforce |
| Monthly / heavy | `llm_tidy` + manual review + pending cleanup |

## Operation Rules

- **Be conservative**: When in doubt, leave entries alone. Better to under-clean than lose useful memories.
- **consolidate is safe**: only deduplicates, never deletes unique entries.
- **llm_tidy is destructive**: review the plan before applying.
- **Preserve user voice**: when updating preferences, keep original phrasing.
- **Never fabricate**: don't add entries just to make the count look better.
