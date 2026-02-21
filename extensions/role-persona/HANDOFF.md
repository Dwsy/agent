# Handoff: Role Persona Extension

**Date**: 2025-02-06
**Status**: Core implementation complete

---

## Context

Implemented OpenClaw-style persona system for pi coding agent. The extension provides role-based AI personalities with isolated memory, prompt injection, and self-evolution capabilities.

---

## What Was Built

### Files Created

```
~/.pi/agent/extensions/role-persona/
├── index.ts                     # Main extension (~1100 lines)
├── README.md                    # User documentation
├── HANDOFF.md                   # This handoff file
└── docs/
    └── ai-runtime-comparison.md # Comparison with ai-runtime project
```

### Features Implemented

1. **Role Directory Structure** (`~/.pi/agent/roles/`)
   - `config.json` - CWD to role mappings
   - `<role-name>/core/*.md` - persona core files
   - `<role-name>/memory/consolidated.md` - long-term memory
   - `<role-name>/memory/daily/YYYY-MM-DD.md` - daily memory files

2. **Prompt Files** (auto-created for new roles)
   - `core/agents.md` - Workspace rules
   - `BOOTSTRAP.md` - First-run guidance
   - `core/identity.md` - AI identity (name, creature, vibe)
   - `core/user.md` - User profile
   - `core/soul.md` - Core truths and personality
   - `core/heartbeat.md` - Proactive tasks
   - `core/tools.md` - Tool preferences
   - `memory/consolidated.md` - Long-term memory

3. **Commands**
   - `/role info` - Show current role status
   - `/role create <name>` - Create new role
   - `/role map <role>` - Map cwd to role
   - `/role unmap` - Remove cwd mapping
   - `/role list` - List all roles and mappings

4. **Auto-loading**
   - On session start, checks cwd mapping
   - Loads role's prompts and memories
   - Displays role name in TUI status bar

5. **Prompt Injection**
   - `before_agent_start` injects file locations
   - Loads `core/agents.md`, `core/identity.md`, `core/soul.md`, `core/user.md`
   - Auto-loads today's and yesterday's daily memories
   - Loads `memory/consolidated.md` long-term memory

6. **Self Evolution**
   - `core/agents.md` includes evolution guidelines
   - `core/heartbeat.md` includes self-check checklist
   - Code triggers daily reminder after 5 turns
   - AI encouraged to update `core/soul.md` as it evolves

---

## Key Design Decisions

1. **No session switching** - Role determined at startup based on cwd
2. **No emoji** - Clean status display
3. **No tools** - AI uses read/write/edit for memory management
4. **File location injection** - Absolute paths in system prompt prevent file write errors
5. **Directory-based** - `~/.pi/agent/extensions/role-persona/` for future splitting

---

## OpenClaw Principles Preserved

- "This folder is home. Treat it that way."
- "You're not a chatbot. You're becoming someone."
- "Be genuinely helpful, not performatively helpful"
- "Have opinions"
- "Be resourceful before asking"
- "Earn trust through competence"
- "Remember you're a guest"

---

## Usage Flow

```bash
# 1. Create role
/role create architect

# 2. Map directory
/role map architect

# 3. Work - prompts auto-injected
# AI knows its identity and remembers past interactions

# 4. AI evolves core/soul.md over time based on interactions
```

---

## Technical Notes

- Uses `ExtensionAPI` from `@mariozechner/pi-coding-agent`
- `before_agent_start` event for prompt injection
- `turn_end` event for evolution reminders
- `session_start` event for role auto-loading
- Custom TUI selector for role creation

---

## Credits

Based on OpenClaw's persona system documented by liruifengv:
https://liruifengv.com/posts/openclaw-prompts/

---

## Next Steps (Optional)

If continuing work:

1. **Split into modules**:
   ```
   role-persona/
   ├── index.ts
   ├── prompts.ts      # DEFAULT_PROMPTS
   ├── config.ts       # loadConfig/saveConfig
   ├── memory.ts       # loadMemoryFiles
   ├── ui.ts           # selectRoleUI
   └── types.ts        # interfaces
   ```

2. **Add features**:
   - Role templates (developer, mentor, creative, etc.)
   - Import/export roles
   - Role inheritance/composition
   - GUI role editor

3. **Enhance evolution**:
   - Automatic memory summarization
   - core/soul.md diff tracking
   - Evolution timeline visualization

---

## Test Command

```bash
pi  # Extension auto-loads from ~/.pi/agent/extensions/role-persona/index.ts
```
