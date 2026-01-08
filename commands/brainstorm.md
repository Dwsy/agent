---
description: Design exploration and ideation session
---

**Step 1**: Use workhub to create issue for the design task
```bash
cd <project-root>
bun ~/.pi/agent/skills/workhub/lib.ts create issue "Design: $@"
```

**Step 2**: Use sequential-thinking skill for structured design exploration
```bash
~/.pi/agent/skills/sequential-thinking/lib.ts "Brainstorm design for: $@\n\nFollow these phases:\n1. Problem understanding and constraints\n2. Explore 2-3 approaches with trade-offs\n3. Architecture overview and components\n4. Data flow and error handling\n5. Testing strategy"
```

**Step 3**: Use system-design skill for architecture diagrams
```bash
~/.pi/agent/skills/system-design/lib.ts "$@"
```

**Step 4**: Document the design in workhub issue

**Principles**:
- Use ace-tool to research existing patterns
- Propose multiple approaches before settling
- Validate design incrementally
- Document in workhub for traceability