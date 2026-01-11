# Quick Start Guide

## Verify Installation

```bash
# Check evolution skill
ls -la ~/.pi/agent/skills/evolution/SKILL.md

# Check evolution hook
ls -la ~/.pi/hooks/evolution.ts

# Check workhub dependency
ls -la ~/.pi/agent/skills/workhub/SKILL.md
```

## Test Hook

Start a Pi Agent session and trigger an error:

```bash
pi
# Inside session:
# Run a command that will fail, e.g.:
# ts-node nonexistent.ts
```

The hook should detect the error and prompt to document it.

## Manual Evolution

### Create Issue

```bash
cd /path/to/project
bun ~/.pi/agent/skills/workhub/lib.ts create issue "evolution: new pattern" "evolution"
```

### Create PR

```bash
cd /path/to/project
bun ~/.pi/agent/skills/workhub/lib.ts create pr "evolution: update skill" "evolution"
```

## Common Commands

```bash
# View evolution skill
cat ~/.pi/agent/skills/evolution/SKILL.md

# View README
cat ~/.pi/agent/skills/evolution/README.md

# Check hook
cat ~/.pi/hooks/evolution.ts

# Use workhub integration
cd ~/.pi/agent/skills/evolution/workhub-integration
bun lib.ts --help
```

## Evolution Markers

```markdown
<!-- Evolution: 2025-01-15 | source: project-name | author: @user -->
<!-- Correction: 2025-01-15 | was: [old advice] | reason: [why] -->
<!-- Validation: 2025-01-15 | status: passed | version: 0.1.0 -->
```

## Workflow Summary

1. **Detect** → Hook detects error/pattern
2. **Confirm** → System prompts for confirmation
3. **Document** → Create workhub issue
4. **Implement** → Update skill with fix/pattern
5. **Submit** → Create workhub PR
6. **Validate** → Verify changes work correctly

## Next Steps

- Read [SKILL.md](SKILL.md) for detailed documentation
- Read [README.md](README.md) for setup guide
- Review [templates](workhub-integration/templates/) for examples
- Test the hook in a real session