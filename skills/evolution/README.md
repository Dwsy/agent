# Evolution Skill - Setup Guide

## Overview

The Evolution skill enables Pi Agent to self-improve by capturing learnings, correcting errors, and validating skills through a semi-automated workflow integrated with workhub.

## Installation

### 1. Verify Directory Structure

Ensure the following structure exists:

```
~/.pi/agent/skills/evolution/
├── SKILL.md
├── README.md
└── workhub-integration/
    ├── lib.ts
    └── templates/
        ├── issue-template.md
        └── pr-template.md
```

### 2. Install Hook

The evolution hook should already be installed at `~/.pi/hooks/evolution.ts`.

Verify it exists:

```bash
ls -la ~/.pi/hooks/evolution.ts
```

### 3. Verify Workhub Dependency

Ensure workhub skill is installed:

```bash
ls -la ~/.pi/agent/skills/workhub/SKILL.md
```

If not installed, install it first.

## Usage

### Automatic Detection

The evolution hook automatically detects:

1. **Compilation Errors**: TypeScript/JavaScript errors in bash output
2. **Session End**: Prompts to capture learnings when session ends
3. **Pattern Detection**: Identifies potential new patterns in context

### Manual Evolution

Create evolution issues manually:

```bash
# From project root
cd /path/to/project
bun ~/.pi/agent/skills/workhub/lib.ts create issue "evolution: new pattern" "evolution"
```

### Using Workhub Integration

Use the helper scripts:

```bash
cd ~/.pi/agent/skills/evolution/workhub-integration

# Create issue
bun lib.ts create-issue --title "Fix TypeScript error" --content "$(cat issue.md)"

# Create PR
bun lib.ts create-pr --title "Update skill" --issue "123" --changes "Added pattern,Fixed error"
```

## Workflow

### 1. Detect Opportunity

The hook detects:
- ❌ Compilation errors
- 💡 New patterns
- 📚 Learnings at session end

### 2. User Confirmation

The system asks:
- "Document this error and solution?"
- "Did you discover any new patterns?"

### 3. Create Workhub Issue

If confirmed, the system:
- Formats the content
- Prompts you to create workhub issue
- Saves content to temp file

### 4. Implement Change

You:
- Update the skill file
- Add evolution marker
- Test the changes

### 5. Create PR

Submit via workhub:
```bash
bun ~/.pi/agent/skills/workhub/lib.ts create pr "evolution: update" "evolution"
```

## Evolution Markers

Always add markers to track evolution:

```markdown
<!-- Evolution: YYYY-MM-DD | source: project-name | author: @user -->
<!-- Correction: YYYY-MM-DD | was: [old advice] | reason: [why] -->
<!-- Validation: YYYY-MM-DD | status: passed | version: 0.1.0 -->
```

## Quality Guidelines

### DO Add
- ✅ Generic, reusable patterns
- ✅ Common errors with clear solutions
- ✅ Well-tested code examples
- ✅ TypeScript/JavaScript best practices
- ✅ Performance optimizations

### DON'T Add
- ❌ Project-specific code
- ❌ Unverified solutions
- ❌ Duplicate content
- ❌ Incomplete examples
- ❌ Personal preferences without rationale

## Validation

Periodically validate skills:

```markdown
## Validation Report

### Code Examples
- [ ] All TypeScript code compiles
- [ ] All patterns work as documented

### API Accuracy
- [ ] API references are correct
- [ ] Method signatures are accurate

### Documentation
- [ ] Instructions are clear
- [ ] Examples are complete
```

## Troubleshooting

### Hook Not Triggering

1. Verify hook is installed:
   ```bash
   ls -la ~/.pi/hooks/evolution.ts
   ```

2. Check Pi Agent settings:
   ```bash
   cat ~/.pi/agent/settings.json
   ```

3. Restart Pi Agent session

### Workhub Issues Not Creating

1. Verify workhub is installed:
   ```bash
   ls -la ~/.pi/agent/skills/workhub/SKILL.md
   ```

2. Check you're in project root:
   ```bash
   pwd
   ```

3. Run manually:
   ```bash
   bun ~/.pi/agent/skills/workhub/lib.ts create issue "test" "evolution"
   ```

### Temp Files Not Found

Temp files are saved to `/tmp/evolution-*.md`:

```bash
ls -la /tmp/evolution-*.md
```

## Examples

### Example 1: Documenting an Error Fix

1. Hook detects error
2. System prompts: "Document this error and solution?"
3. You confirm and enter solution
4. System provides command to create issue
5. You execute command
6. Update skill with fix
7. Add marker: `<!-- Correction: 2025-01-15 | was: [old code] | reason: [why] -->`

### Example 2: Capturing a New Pattern

1. At session end, system prompts: "Did you discover any new patterns?"
2. You describe the pattern
3. System provides command to create issue
4. You execute command
5. Add pattern to relevant skill
6. Add marker: `<!-- Evolution: 2025-01-15 | source: my-project | author: @user -->`

## Integration with Workhub

The evolution skill extends workhub:

- **Issues**: Track evolution items
- **PRs**: Submit evolution changes
- **Categories**: Use "evolution" category
- **Templates**: Use provided templates

## Support

For issues or questions:

1. Check [SKILL.md](SKILL.md) for detailed documentation
2. Review workhub skill documentation
3. Check hook logs in Pi Agent session

## Contributing

To improve the evolution skill:

1. Create evolution issue
2. Propose changes
3. Submit PR
4. Add evolution marker

---

**Version**: 1.0.0
**Last Updated**: 2025-01-15
**Author**: Pi Agent System