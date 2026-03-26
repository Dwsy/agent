# Promotion Rules

Use these rules to choose the target layer.

## Target order
When uncertain, prefer this order:
1. keep in memory
2. role knowledge
3. project knowledge
4. global knowledge

Global knowledge has the highest promotion bar.

## Stay in memory
Keep the item in memory when any of these is true:
- it is a preference, not a general rule
- it depends on a private person or private environment
- it is a single incident with no repeated evidence
- it is still pending validation
- it helps continuity but not transferability

## Promote to role knowledge
Choose role knowledge when:
- the pattern is useful for this role repeatedly
- the rule is partly shaped by role-specific style or workflow
- it is reusable, but not broadly universal
- it improves how this role operates over time

Typical examples:
- role-specific output structure
- role-specific memory hygiene rules
- working conventions for this persona

## Promote to project knowledge
Choose project knowledge when:
- the insight explains this repository's architecture or domain language
- collaborators would benefit from reading it in `docs/knowledge/`
- the content belongs with the codebase, not with the person
- the rule loses meaning outside this project

Typical examples:
- architecture boundaries
- local naming conventions
- project-specific debugging rules
- domain glossary entries

## Promote to global knowledge
Choose global knowledge when:
- the pattern is reusable across projects and roles
- it remains useful after anonymization
- it expresses a durable engineering heuristic
- it would be reasonable to share widely

Typical examples:
- promotion criteria for memory → knowledge
- anti-patterns in knowledge curation
- reusable agent workflow heuristics

## Reject or defer
Reject or defer when:
- the item is emotionally intense but operationally vague
- the text is just a log line or transcript residue
- the candidate duplicates existing knowledge without new value
- the rule is too weakly evidenced
- the wording is too personal to cleanly share

## Evidence scoring

When git history exists for the roles repository, use it as an extra evidence source.

Signals that increase confidence:
- the same rule appears in multiple daily files
- the same memory survives consolidation edits
- similar wording appears across multiple commits or dates
- the convention has already been committed, not just scribbled locally

Signals that reduce confidence:
- the item only appears in uncommitted churn
- it only exists in one fresh pending note
- it is still being rewritten heavily with no stable wording

### Low evidence
- single occurrence
- no repetition
- no clear downstream value

Default action: keep in memory or defer.

### Medium evidence
- repeated signal in one project or one role
- clear operational value

Default action: role knowledge or project knowledge.

### High evidence
- repeated across sessions, tasks, or projects
- clearly reduces errors or improves decisions
- easy to express as a reusable heuristic

Default action: global knowledge candidate.

## Deduplication rules
Before writing:
1. search by title keywords
2. search by synonyms and tags
3. compare the candidate against the closest result

Then pick one:
- `skip`: existing entry already covers it
- `update`: same entry, better wording or stronger guidance needed
- `merge`: candidate adds meaningful sections to an existing entry
- `create`: no good equivalent exists

## Privacy rule
Never promote raw private context into shared knowledge.

Before writing shared knowledge, remove:
- personal names unless necessary
- machine-local paths unless essential
- emotional framing
- one-off meeting or conversation details
- private identifiers or secrets
