---
description: Parallel codebase research using multiple tools
---

**Step 1**: Use workhub to create issue for research task
```bash
cd <project-root>
bun ~/.pi/agent/skills/workhub/lib.ts create issue "Research: $@"
```

**Step 2**: Parallel research using multiple tools

```bash
# Terminal 1: Semantic search
~/.pi/agent/skills/ace-tool/lib.ts "Find all code related to: $@"

# Terminal 2: Pattern search
~/.pi/agent/skills/ast-grep/lib.ts "Search patterns for: $@"

# Terminal 3: GitHub context
~/.pi/agent/skills/context7/lib.ts "Search issues and discussions about: $@"
```

**Step 3**: Use sequential-thinking to synthesize findings
```bash
~/.pi/agent/skills/sequential-thinking/lib.ts "Synthesize research findings for: $@\n\nCombine results from:\n1. Semantic code search results\n2. Pattern analysis\n3. GitHub context\n\nOutput: Comprehensive research document with architecture, patterns, and recommendations."
```

**Step 4**: Document findings in workhub issue

**Alternative**: Use subagent for parallel delegation
```json
{
  "tasks": [
    {"agent": "scout", "task": "Find all files related to: $@"},
    {"agent": "worker", "task": "Analyze patterns for: $@"}
  ]
}
```