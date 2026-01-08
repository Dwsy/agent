---
description: Quick codebase reconnaissance
---

Use subagent extension to delegate fast exploration:

```json
{
  "agent": "scout",
  "task": "Quick reconnaissance for: $@\n\nUse ace-tool for semantic search to find relevant code.\nReturn:\n1. File paths and line numbers\n2. Brief summary of each finding\n3. Key files to investigate further\n4. Architecture overview\n\nFocus on speed and high-level understanding."
}
```

**For targeted searches**:
```bash
# Semantic search
~/.pi/agent/skills/ace-tool/lib.ts "Where is $@ implemented?"

# AST pattern search
~/.pi/agent/skills/ast-grep/lib.ts "Find $@ patterns"

# Exact identifier search
rg -l "identifier" --type ts
```

**Output**: Structured findings ready for handoff to other agents.