---
title: "Memory → Knowledge Promotion Pipeline"
description: "How role-persona should promote information from daily/pending/consolidated memory into reusable project or shared knowledge without polluting long-term storage."
tags: [memory, knowledge, promotion, pending, consolidated, role-persona]
category: architecture
version: 1
created: 2026-03-26
updated: 2026-03-26
scope: ai-agent
author: pi-zero
---

# Summary
`role-persona` already has a strong memory stack (`daily` → `pending` → `consolidated`) and a separate knowledge stack (`role` / `global` / `project` / `external`). What it does **not** have natively is a first-class promotion pipeline between them. This document defines that missing bridge.

## Current State
Memory layers already exist:
- `memory/daily/*.md`: raw context and session residue
- `memory/pending.md`: observations waiting for usage verification
- `memory/consolidated.md`: durable role memory

Knowledge layers already exist:
- role knowledge
- global shared knowledge
- project knowledge (`docs/knowledge/`)
- external readonly sources

The gap is not storage. The gap is **promotion logic**.

## Promotion Goals
A promotion pipeline should answer three questions for each candidate:
1. Should this stay in memory?
2. If not, which knowledge layer should own it?
3. Can it be rewritten into reusable, non-personal documentation?

## Promotion Flow
### 1. Capture
Information enters through:
- automatic extraction from conversation turns
- compaction-time memory rescue
- manual `memory` tool usage
- daily notes and pending observations

### 2. Verification
Candidates should not jump directly from raw notes into shared knowledge.

Use these default rules:
- `daily` is raw and should not be promoted directly unless repeated elsewhere
- `pending` exists specifically to require a second signal
- `consolidated` is the first layer that indicates some durability

### 3. Classification
Classify each candidate as one of:
- preference
- fact
- method
- reusable knowledge

This matters because not every stable memory deserves to become knowledge.

### 4. Target Selection
Use the lightest sufficient target:
- **memory** if it is personal, contextual, or not yet reusable
- **role knowledge** if it is reusable for one role but still persona-shaped
- **project knowledge** if it explains this repository's architecture, terms, or conventions
- **global knowledge** only when it remains useful after anonymization and is broadly reusable

### 5. Distillation
Before writing to knowledge, rewrite the candidate so it contains:
- what the pattern is
- when to use it
- why it matters
- what signals indicate it applies
- what anti-patterns to avoid

### 6. Deduplication
Search existing knowledge before writing.

Do not create near-duplicate entries when a merge or update is enough.

## Recommended Promotion Threshold
Promote only if at least one is true:
- it reduces repeated future errors
- it guides decisions, not just recollection
- it survives removal of personal context
- it applies across multiple sessions or tasks
- it is useful for a collaborator who was not present for the original session

## Anti-patterns
- copying daily notes directly into knowledge
- turning preferences into universal rules
- promoting one-off incidents because they sound clever
- using knowledge as an archive for chat residue
- skipping deduplication and flooding the knowledge tree

## Recommended Future Tooling
The project does not necessarily need a new storage layer. It needs better orchestration. Useful future additions would be:
- export memory candidates with evidence scores
- first-class `memory → knowledge` proposal generation
- project-knowledge write support in tooling
- reviewable promotion reports before write actions

## Decision Principle
The system should be conservative:
- memory is cheap
- bad knowledge is expensive

A smaller clean knowledge base beats a large contaminated one.
