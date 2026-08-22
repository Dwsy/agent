---
title: "Knowledge Source Priority"
description: "Defines the priority, responsibilities, and appropriate use cases of role, global, project, and external knowledge sources in role-persona."
tags: [knowledge, source-priority, role, global, project, external, role-persona]
category: architecture
version: 1
created: 2026-03-26
updated: 2026-03-26
scope: ai-agent
author: pi-zero
---

# Summary
`role-persona` already aggregates knowledge from multiple layers. This is powerful, but only if each layer keeps a clear responsibility. Without that boundary, the system degenerates into duplicated, conflicting documentation.

## Source Order
Current source priority is:
1. `role` — writable, role-specific
2. `global` — writable, shared
3. `project` — readonly, `docs/knowledge/`
4. `external` — readonly, configured sources

This order should be interpreted as **specificity before generality**, not just search precedence.

## Layer Responsibilities
### 1. Role Knowledge
Use role knowledge for:
- persona-shaped working rules
- role-specific methods or tone constraints
- heuristics that are reusable for one role but not universally

Role knowledge should answer: "How should this role operate?"

### 2. Global Knowledge
Use global knowledge for:
- cross-role engineering heuristics
- reusable prompt or workflow playbooks
- durable patterns that survive anonymization

Global knowledge should answer: "What should many roles or projects reuse?"

### 3. Project Knowledge
Use project knowledge for:
- local architecture decisions
- repository-specific conventions
- glossary and domain terminology
- subsystem explanations needed by collaborators

Project knowledge should answer: "How does this repository work?"

### 4. External Knowledge
Use external knowledge for:
- readonly imported references
- third-party patterns and standards
- upstream documentation snapshots

External knowledge should answer: "What useful references exist outside this repo?"

## Common Routing Rules
### Put it in role knowledge if
- it depends on persona, style, or role workflow
- it would be too opinionated as a global rule
- it improves one role's consistency

### Put it in global knowledge if
- it applies across multiple contexts
- removing names and local details does not reduce its value
- it is guidance rather than local history

### Put it in project knowledge if
- it explains a specific subsystem in this codebase
- it belongs near repository docs
- it would confuse people outside this project

### Keep it out of knowledge if
- it is just a memory preference
- it is still pending validation
- it is one-off incident residue
- it duplicates an existing entry without meaningful new value

## Conflict Rule
If the same concept appears in multiple places, prefer this split:
- project layer documents local implementation
- global layer documents transferable pattern
- role layer documents persona-specific operating guidance

Do not let the same text drift across all three layers.

## Practical Examples
- `ctx.ui.setStatus()` vs `setFooter()` in this extension → project knowledge
- "verify before declaring completion" → global knowledge
- zero's tool-boundary rules → role knowledge

## Maintenance Rule
Before adding a new entry, ask:
1. Is this actually a memory and not knowledge?
2. Which layer owns it with the least surprise?
3. Is there already an entry nearby that should be updated instead?

## Anti-patterns
- using global knowledge as a dumping ground
- storing project architecture in role knowledge
- storing persona preferences in project docs
- letting readonly external docs substitute for local architectural explanation

## Design Principle
The point of multi-source knowledge is not to accumulate more text. The point is to preserve the right knowledge at the right layer so recall stays useful and conflicts stay understandable.
