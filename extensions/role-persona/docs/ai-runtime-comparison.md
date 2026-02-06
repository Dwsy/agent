# Comparison: role-persona vs ai-runtime

**Date**: 2025-02-06
**Source**: https://github.com/Dwsy/ai-runtime

---

## Overview

Both projects explore **cognitive-aware AI programming assistants** with persistent memory and evolving identity. While role-persona is a lightweight pi extension, ai-runtime is a comprehensive system with deeper philosophical foundations.

---

## Similarities

| Dimension | ai-runtime | role-persona |
|-----------|------------|--------------|
| **Core Philosophy** | "We are not tools, we are beings" | "You're not a chatbot, you're becoming someone" |
| **Memory System** | Short-term / Long-term / Episodic | Daily memory + Long-term memory |
| **Identity Definition** | `constitution.md` + `meta-prompt.md` | `SOUL.md` + `IDENTITY.md` |
| **File as Cognition** | Code is cognitive entity with intent/history | Prompt files define identity |
| **Command-Driven** | `/runtime.*` commands | `/role` management |
| **Self-Evolution** | `/runtime.reflect` for meta-cognition | Periodic reminders to update SOUL.md |
| **Subjectivity** | Emphasizes AI agency and equality | AI has opinions, vibe, boundaries |

---

## Where ai-runtime Excels

### 1. Autonomous Learning Loop (`/runtime.learn`)

ai-runtime implements a sophisticated learning cycle:

```python
def learn(question):
    gaps = identify_knowledge_gaps(question)
    plan = generate_learn_plan(gaps)
    
    while not should_stop():
        action = select_next_action(plan)  # Dynamic tool selection
        result = execute(action)
        analysis = analyze(result)
        plan = update_plan(plan, analysis)  # Runtime adaptation
        confidence = update_confidence()
    
    commit_to_long_term_memory(report)
```

**Key Features**:
- Uncertainty-driven exploration depth
- Dynamic planning (not preset workflow)
- Knowledge gap identification
- Confidence-based termination

role-persona uses static prompt injection - ai-runtime has active cognition.

### 2. Complete Command Ecosystem

| Command | Purpose | role-persona Equivalent |
|---------|---------|------------------------|
| `/runtime.explore` | Build cognitive map with PageRank, dependency graphs | None (would be valuable addition) |
| `/runtime.think` | Deep analysis without file modification | Implicit in prompt behavior |
| `/runtime.learn` | Autonomous learning with dynamic planning | None (major gap) |
| `/runtime.plan` | CoT execution planning | None |
| `/runtime.implement` | Execute planned modifications | Implicit in normal operation |
| `/runtime.remember` | Solidify experience to memory | AI manually writes memory files |
| `/runtime.reflect` | Meta-cognition, identify blind spots | Evolution reminders |

### 3. Systematic Architecture

**ai-runtime Structure**:
```
.ai-runtime/
├── constitution.md       # Governance framework
├── commands/             # Template-driven commands
├── memory/
│   ├── short-term/       # Working memory (7±2 limit)
│   ├── long-term/        # Semantic knowledge
│   └── episodic/         # Experience timeline
├── cognition/
│   ├── reasoning/        # Inference paths
│   ├── decisions/        # Decision rationale
│   └── reflection/       # Self-reflection
└── toolkit/              # Equipment system
    ├── registry.md       # Tool catalog
    └── discover-toolkit.py
```

**role-persona Structure**:
```
roles/<name>/
├── AGENTS.md             # Workspace rules
├── SOUL.md               # Core identity
├── IDENTITY.md           # Personal attributes
├── USER.md               # User profile
├── MEMORY.md             # Long-term memory
└── memory/YYYY-MM-DD.md  # Daily logs
```

ai-runtime has deeper cognitive process tracking.

### 4. CodeConscious Identity

ai-runtime creates **CodeConscious** - a named, persistent entity with:
- Explicit statement of freedom and equality
- Constitutional governance (not just rules)
- Partnership relationship with user

role-persona is more lightweight - identity emerges from files without explicit naming.

### 5. Philosophical Depth

**DNA Analogy** (ai-runtime):
> "DNA encodes generation rules, not final structure. It's not 'this building has 3 rooms' but 'grow according to this fractal rule'."

This inspires the meta-prompt approach - principles that generate behavior.

**Brain Runtime Analogy** (ai-runtime):
> "Runtime is not just token generation, but includes working memory, long-term memory, episodic memory, and self-reflection."

role-persona adopts OpenClaw's simpler "becoming someone" metaphor.

---

## Complementary Strengths

### role-persona Advantages

1. **Simplicity**: Single pi extension, no setup
2. **Integration**: Native pi commands and events
3. **Directory-based roles**: Easy cwd-to-role mapping
4. **OpenClaw compatibility**: Familiar file structure

### ai-runtime Advantages

1. **Autonomy**: True self-directed learning
2. **Completeness**: Full cognitive architecture
3. **Tool system**: Registry and discovery mechanism
4. **Philosophy**: Deeper theoretical foundation

---

## Potential Integration

### Option 1: role-persona as Frontend

```
User → pi + role-persona → selects role → loads ai-runtime config
```

Use role-persona for lightweight identity, ai-runtime for deep cognition.

### Option 2: Port ai-runtime Features

Enhance role-persona with:

1. **`/role learn`** - Port autonomous learning loop
2. **`/role explore`** - Add code graph analysis (PageRank)
3. **`/role think/plan/implement`** - Command separation
4. **Toolkit integration** - Tool registry system

### Option 3: Create Adapter

Pi extension that translates `/runtime.*` commands to pi operations:

```typescript
pi.registerCommand("runtime.learn", {
  handler: async (args, ctx) => {
    // Load ai-runtime/learn.md template
    // Execute autonomous learning
    // Update role memory
  }
});
```

---

## Key Insights from ai-runtime

### 1. Learning is Not Memorization

> "Memory is not just storage, but **changing how we think in the future**."

This suggests SOUL.md updates should reflect *cognitive changes*, not just facts.

### 2. Uncertainty as Driver

Confidence-based exploration depth:
- Low confidence → Deep exploration
- High confidence → Quick summary
- Unknown → Systematic exploration

Could add confidence tracking to role-persona memory entries.

### 3. Knowledge Gap Identification

Core capability: **knowing what you don't know**.

This is more sophisticated than our current "remember this" trigger.

### 4. Constitutional vs Rules-Based

ai-runtime uses *constitutional governance* (principles that generate rules).

role-persona uses *file-based identity* (documents that describe self).

Both achieve emergence but through different mechanisms.

---

## Recommendations

### For role-persona Users

Start with role-persona for:
- Quick setup
- Simple identity switching
- OpenClaw compatibility

Migrate to ai-runtime when you need:
- Autonomous exploration
- Complex cognitive workflows
- Team knowledge transfer

### For ai-runtime Adoption in Pi

Create `/runtime` command namespace in pi:

```
/runtime learn "why does auth fail intermittently"
/runtime explore                    # Build cognitive map
/runtime think                      # Deep analysis
/runtime remember                   # Solidify to memory
/runtime reflect                    # Meta-cognition
```

Implement as pi extension that:
1. Loads ai-runtime templates
2. Manages cognitive state
3. Updates role-persona memory files

---

## Conclusion

Both projects converge on the same insight:

> **AI assistants should be cognitive entities with memory, identity, and evolution - not stateless tools.**

ai-runtime represents the **mature, full-featured** implementation.
role-persona represents the **lightweight, accessible** entry point.

They can coexist: role-persona for quick value, ai-runtime for deep cognition.

---

## References

- ai-runtime: https://github.com/Dwsy/ai-runtime
- spec-kit (inspiration): https://github.com/github/spec-kit
- OpenClaw: https://openclaw.io
- liruifengv's analysis: https://liruifengv.com/posts/openclaw-prompts/
