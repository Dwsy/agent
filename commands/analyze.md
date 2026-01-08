---
description: Deep analysis of specific code or module
---

Use subagent extension to delegate detailed analysis:

```json
{
  "agent": "worker",
  "task": "Analyze in depth: $@\n\nExplain:\n1. How it works (architecture and data flow)\n2. Why it's structured that way (design decisions)\n3. What patterns it uses (design patterns, idioms)\n4. Dependencies and interactions\n\nUse ace-tool for semantic understanding, ast-grep for pattern analysis."
}
```

**Prerequisites**: Use workhub to create an issue first for complex analyses.