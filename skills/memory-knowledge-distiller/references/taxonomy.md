# Taxonomy

Use this taxonomy to decide whether a memory candidate should stay in memory or become knowledge.

## Four content types

### 1. Fact
A specific thing that happened.

Examples:
- a build failed because a path changed
- a tool required an env var
- a command was run from the wrong cwd

**Usually belongs to:** daily memory, pending memory, sometimes consolidated memory.

Promote only if repeated facts reveal a durable pattern.

### 2. Preference
A stable user, role, or workflow preference.

Examples:
- prefers Chinese output
- prefers `trash` over `rm`
- dislikes over-engineered tests

**Usually belongs to:** memory or role knowledge.

Do not treat a preference as universal truth.

### 3. Method
An operational way of working that improves outcomes.

Examples:
- verify logs before patching code
- use parallel `read` calls for multiple files
- classify memory before promoting it

**Usually belongs to:** role knowledge, sometimes global knowledge.

Promote when the method is reusable and not tied to one repo.

### 4. Knowledge
A durable, reusable, transferable pattern or explanation.

Examples:
- boundary between memory and knowledge
- when to promote pending memory
- project architecture conventions

**Usually belongs to:** role/global/project knowledge.

## Boundary rules

### Memory stays personal and contextual
Use memory when the value depends on:
- personal preference
- session continuity
- private context
- unverified observations

### Knowledge must survive compression
A knowledge candidate should remain useful after:
- anonymization
- removing session-specific details
- removing emotional framing
- rewriting into a guide or heuristic

If the value disappears after cleanup, it was memory, not knowledge.

## Practical classifier

Ask these questions in order:

1. Is this mostly a user preference?
   - yes → memory or role knowledge
2. Is this a one-off event?
   - yes → memory
3. Does this describe a repeatable way of working?
   - yes → method → role/global candidate
4. Does this explain a reusable rule, concept, or convention?
   - yes → knowledge candidate
5. Is it tied to this repository's local architecture or terminology?
   - yes → project knowledge candidate

## Smell tests

Likely **memory**:
- contains strong chat/session residue
- only matters to one user
- cannot be rewritten without losing meaning

Likely **knowledge**:
- teaches future decisions
- reduces repeated mistakes
- works across time, not just across one chat
- can be turned into a short guide with anti-patterns
