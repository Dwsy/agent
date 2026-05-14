---
name: memory-retro
description: "Save insights from completed tasks to role memory."
whenToUse: "After completing any task involving code changes, architectural decisions, debugging, or non-trivial problem solving. Distill what you learned into reusable memories so future sessions can benefit. Invoke proactively at task end — do not wait for the user to ask."
---

# Memory Retro

You have access to a role-based persistent memory system. After completing this task, reflect on what you learned and save valuable insights.

## Tools Available

| Tool | Purpose |
|------|---------|
| `memory({ action: "add_learning", content: "..." })` | Save a durable insight. LLM auto-extracts tags. Auto-deduplicates. |
| `memory({ action: "add_preference", content: "...", category: "..." })` | Save a user preference. Goes directly to consolidated. |
| `memory({ action: "search", query: "..." })` | Check if similar memory already exists |
| `memory({ action: "reinforce", content: "..." })` | Increment `[Nx]` usage count for existing learning |

## Process

1. **Reflect**: What did I learn that would be useful in the future?
2. **If nothing worth remembering, skip** — not every task produces insights.
3. **For each insight**, decide type:
   - **Learning**: Durable cross-session fact, pattern, or rule.
   - **Preference**: User's communication style, tool preference, coding habit.

### Dedup check (built-in)

`add_learning` auto-deduplicates. Just call it — if similar text exists, it returns "Already stored". Then use `reinforce` instead.

### Write

```
memory({ action: "add_learning", content: "MyBatis-Plus getOne needs .last('LIMIT 1') to avoid TooManyResultsException" })
```

LLM auto-extracts tags (e.g., `mybatis`, `gotcha`). No manual tagging.

### Preferences

```
memory({ action: "add_preference", content: "用户偏好中文沟通，技术术语可保留英文", category: "Communication" })
```

### Reinforce (when you USE an existing memory)

```
memory({ action: "reinforce", content: "安全删除原则" })
→ "Reinforced [abc123] -> 6x"
```

## Quality Rules

### What to remember

- ✅ **Root cause**: "X fails because of Y. Fix: Z"
- ✅ **Gotcha**: "Tool A requires flag B, otherwise silently fails"
- ✅ **Decision**: "We chose X over Y because Z"
- ✅ **Pattern**: "This project uses pattern A for all B"
- ✅ **User preference discovered**

### What NOT to remember

- ❌ Obvious facts
- ❌ Task-specific instances (save the *pattern*, not the *instance*)
- ❌ Temporary states
- ❌ Redundant with existing entries
- ❌ Full error messages without analysis

### Writing rules

- **Concise** — under 120 chars
- **Own words** — distill, don't copy-paste
- **Actionable** — changes how you'd approach similar tasks
- **Conservative** — bad memory > missing memory is worse. 1 quality insight > 5 mediocre.

## Pending Layer

Two paths to memory:

```
Auto-extract (agent_end, compaction)
  → pending.md [○] → search score ≥0.5 → auto-promote → consolidated [0x]

Manual (this tool)
  → consolidated [0x] directly
```

The pending layer filters noise. Only memories proven useful by actual usage survive. Manual entries skip pending because you're explicitly deciding they're worth keeping.

## Reinforce vs Promote

| Action | Effect | When |
|--------|--------|------|
| `reinforce` | used+1 in consolidated | You used an existing memory |
| Search score ≥0.5 | auto-reinforce (used+1) | Found via search |
| Pending auto-promote | pending → consolidated | Pending entry is relevant |
| `consolidate` | dedup + canonical rewrite | Routine maintenance |

## Category Reference

| Category | When |
|----------|------|
| `Communication` | Language, style, tone |
| `Code` | Style, conventions, abstraction |
| `Tools` | CLI, editors, workflows |
| `Workflow` | Process, review, deployment |
| `General` | Everything else |

## Examples

```
✅ Good:
memory({ action: "add_learning", content: "MyBatis-Plus getOne needs .last('LIMIT 1')" })

✅ Good (reinforce):
memory({ action: "reinforce", content: "安全删除原则" })

❌ Bad: "The user asked me to fix a bug" — too generic
❌ Bad: "Error at /src/index.ts:42" — copy-paste, no insight
```

## Important

- `add_learning` **auto-deduplicates** — if similar exists, use `reinforce` instead.
- LLM **auto-extracts tags** — no manual tagging needed.
- Quality > quantity. 30 quality entries > 300 noisy ones.
- The system auto-extracts at session end, but manual retro is more accurate.
