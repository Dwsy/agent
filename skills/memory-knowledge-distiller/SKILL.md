---
name: memory-knowledge-distiller
description: Distill role-persona memory into reusable knowledge. Use this skill whenever the user asks to 整理记忆、蒸馏经验、提炼方法论、抽取知识库、沉淀共享经验、清理 pending、强化 consolidated，或希望把 daily/pending/consolidated memory 转成 role/global/project knowledge. It classifies memory, filters noise, deduplicates against existing knowledge, and drafts or writes structured knowledge entries.
---

# Memory Knowledge Distiller

Turn noisy memory into reusable knowledge.

The job is not "deep self-reflection". The job is to extract **high-signal, reusable, shareable patterns** from `memory/daily`, `memory/pending`, and `memory/consolidated`, then decide whether they should stay in memory or become knowledge.

Use the existing `memory`, `knowledge`, `role_read`, `role_list`, and `role_search` tools. Do not invent a parallel storage system.

## Core principle

Prefer **evidence-driven distillation** over emotional reflection.

Good output:
- reusable rule
- decision heuristic
- anti-pattern
- project convention
- role-specific working method

Bad output:
- vague self-criticism
- diary prose
- one-off task residue
- private context copied into shared docs

If a memory cannot be rewritten into a durable pattern, keep it in memory.

## When to use this skill

Use this skill when the user wants to:
- organize or clean memory
- distill lessons into knowledge
- extract reusable experience from daily/consolidated memory
- promote role knowledge into shared/global knowledge
- build project docs from repeated memory patterns
- review pending memories and decide what deserves promotion
- convert role-persona memory into structured documentation

## Sources and targets

### Memory sources
Inspect these in roughly this order:
1. `memory/consolidated.md`
2. `memory/pending.md`
3. recent files in `memory/daily/`
4. optional `context/` files if the user explicitly wants broader context
5. git history for the role repository when available

### Knowledge targets
A candidate can end up in exactly one of these buckets:
- **stay in memory**
- **role knowledge**: reusable for this role, but still persona-specific
- **global knowledge**: reusable across roles/projects
- **project knowledge**: belongs in `docs/knowledge/` for the current repository
- **reject**: noise, private context, or insufficient evidence

## Workflow

### Phase 1 — Inventory

Collect current state before proposing anything.

1. Read `memory/consolidated.md`.
2. Read `memory/pending.md` if present.
3. List `memory/daily/` and inspect recent files only; default to the most recent 3-7 files unless the user asks for a wider sweep.
4. If the role directory is a git repository, inspect `git status --short` and recent `git log --oneline` to understand what changed and which memories are stable enough to matter.
5. List existing knowledge and search for likely duplicates before drafting new entries.

Focus on extracting candidate items, not summarizing every file.

### Phase 2 — Classify candidates

For each candidate, classify it using these dimensions:
- `type`: `fact | preference | method | knowledge`
- `evidence`: `low | medium | high`
- `reusable`: `yes | no`
- `shareable`: `yes | no`
- `target`: `memory | role | global | project | reject`

Use these default rules:

#### Keep in memory
Use `memory` when the item is:
- a user preference
- a one-off incident
- private or identity-linked context
- still unverified
- useful only for personal continuity

#### Promote to role knowledge
Use role knowledge when the item is:
- reusable for the current role
- still shaped by this role's workflow or style
- useful beyond one session, but not broadly shareable

#### Promote to global knowledge
Use global knowledge when the item is:
- general engineering guidance
- reusable across multiple roles/projects
- valuable after removing personal context
- a durable rule, heuristic, or pattern

#### Promote to project knowledge
Use project knowledge when the item is:
- clearly tied to the current repository
- useful for collaborators reading `docs/knowledge/`
- an architecture rule, domain term, or local convention

#### Reject
Reject when the item is:
- emotional reflection without operational value
- private or sensitive
- a duplicate already covered by knowledge
- too vague to become a rule or guide
- pure task residue

### Phase 3 — Distill

Rewrite candidates into reusable knowledge.

Do **not** copy raw memory lines into knowledge. Rewrite them into a durable form.

Every strong knowledge draft should answer:
- What is the pattern?
- When should someone use it?
- Why does it matter?
- How should they apply it?
- What are the anti-patterns or limits?

When turning memory into knowledge, remove:
- personal names unless required
- emotional commentary
- one-time timestamps unless historically relevant
- chat-specific phrasing
- unnecessary machine logs

### Phase 4 — Deduplicate

Before creating or updating anything:
1. run `knowledge.search` using title keywords, tags, and synonyms
2. compare candidates against existing entries
3. choose one of: `skip | merge | update | create`

If an existing entry already captures the same rule, prefer updating or skipping over creating a near-duplicate.

### Phase 5 — Materialize

#### For role/global knowledge
Use `knowledge.write`.

Choose:
- `global: false` for role knowledge
- `global: true` for global knowledge

#### For project knowledge
Draft Markdown for `docs/knowledge/<category>/<slug>.md`.

If the user asked for execution, write the file directly.
If not, provide the draft and proposed path.

### Phase 6 — Report

Always finish with a concise report containing:
- sources inspected
- candidates found
- promotions proposed or executed
- rejections and reasons
- written or proposed file paths
- unresolved items needing human judgment

## Promotion threshold

Promote only if the candidate satisfies at least one:
- reduces repeated future errors
- guides future decisions
- is reusable across sessions/tasks
- can be expressed as a stable pattern
- is valuable for collaborators, not only the current user

Be conservative. A smaller clean knowledge base beats a bloated one.

## Output format

Use this structure when presenting results:

# Distillation Report
## Summary
## Candidate Decisions
## Drafted / Written Knowledge
## Rejected or Deferred Items
## Next Recommended Actions

For `Candidate Decisions`, use a compact table when possible:

| Candidate | Source | Type | Target | Action | Reason |
|---|---|---|---|---|---|

## Knowledge entry template

Use this template for drafted knowledge entries:

```md
---
title: ...
description: ...
tags: [..]
version: 1
created: YYYY-MM-DD
updated: YYYY-MM-DD
scope: ...
author: ...
---

# Summary
One paragraph describing the durable insight.

## When to use
Concrete situations and trigger signals.

## Why
Why this pattern matters.

## How
Practical steps or heuristics.

## Signals / Heuristics
Observable cues, thresholds, or decision signals.

## Anti-patterns
What not to do, and common failure modes.

## Source notes
Short note describing what kind of memory patterns this was distilled from. Do not leak private details.
```

## Heuristics that matter

### Preference is not global knowledge
User preferences and role tone usually belong in memory or role knowledge, not global knowledge.

### Repetition beats drama
Repeated signals matter more than intense wording. Three boring repeated incidents are more valuable than one dramatic reflection.

### Git history is evidence, not decoration
If the role repository is under git, use commit history and diffs to judge stability:
- repeated edits across days often indicate durable memory
- uncommitted churn often indicates in-progress noise
- a committed convention is usually a stronger promotion candidate than a fresh scratch note

### Project specifics belong with the project
If the insight explains this repository's architecture, terminology, or workflow, prefer `docs/knowledge/`.

### Shared knowledge must survive anonymization
If removing private context destroys the value, it was probably not shareable knowledge.

## Recommended supporting references
Read these only when needed:
- `references/taxonomy.md` — memory vs knowledge boundary
- `references/promotion-rules.md` — target selection rules and rejection rules
- `references/templates.md` — output patterns and document templates

## Anti-patterns

Avoid these mistakes:
- turning diary notes into fake principles
- copying memory verbatim into knowledge
- promoting unverified pending items directly to global knowledge
- creating many near-duplicate entries
- treating preferences as universal truths
- writing abstract "be more careful" fluff instead of concrete heuristics

## Default stance

If uncertain, do this order of preference:
1. keep in memory
2. promote to role knowledge
3. promote to project knowledge
4. promote to global knowledge

Global knowledge should have the highest bar.
