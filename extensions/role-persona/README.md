# Role Persona Extension for Pi

OpenClaw-style persona system for pi coding agent. Each role has isolated memory, personality, and workspace context.

## Directory Structure

```
~/.pi/agent/extensions/role-persona/
├── index.ts              # Main extension entry (orchestration)
├── role-template.ts      # Default prompt templates (AGENTS/SOUL/USER/...)
├── role-store.ts         # Role filesystem + mapping config APIs
├── memory-md.ts          # Markdown memory parser/writer/repair/consolidate
├── memory-llm.ts         # LLM memory extraction + LLM tidy pipeline
├── memory-viewer.ts      # Scrollable TUI memory viewer with filters
└── README.md             # This file

~/.pi/agent/roles/        # Role storage (created automatically)
├── config.json           # CWD -> role mappings
├── default/              # Default role
│   ├── AGENTS.md         # Workspace rules
│   ├── BOOTSTRAP.md      # First-run guidance (deleted after init)
│   ├── IDENTITY.md       # AI identity (name, creature, vibe, emoji)
│   ├── USER.md           # User profile
│   ├── SOUL.md           # Core truths and personality
│   ├── HEARTBEAT.md      # Proactive check tasks
│   ├── TOOLS.md          # Tool preferences
│   ├── MEMORY.md         # Long-term curated memory
│   └── memory/           # Daily memory files
│       └── YYYY-MM-DD.md
└── architect/            # Other roles
    └── ...
```

## Usage

### Create a Role

```
/role create
/role create architect
```

- `/role create`：交互式上下选择（可选预设或自定义输入）
- `/role create <name>`：直接创建

Creates a new role with default prompt files.

Template generation is single-language (no bilingual line mixing):
- Auto-detects system locale (`LANG` / `LC_ALL` / runtime locale)
- `zh*` locale → Chinese templates
- others → English templates

### Map Directory to Role

```
/role map
/role map architect
```

- `/role map`：交互式上下选择角色（也可现场创建）
- `/role map <role>`：直接映射

Maps current working directory to the specified role. Auto-loads when entering this directory.

### Check Role Status

```
/role info
```

Shows current role, display name, and configuration.

### List All Roles and Mappings

```
/role list
```

Lists all roles and their directory mappings.

### Unmap Current Directory

```
/role unmap
```

Removes the mapping for current directory.

### Memory Commands

```
/memories      # Open scrollable overlay viewer (MEMORY.md + recent daily memory)
/memory-fix    # Auto-repair malformed MEMORY.md structure
/memory-tidy   # Manual tidy: repair + consolidate + summary
/memory-tidy-llm [provider/model]  # LLM tidy (optional model override)
```

In `/memories` overlay:
- `0` All
- `1` Learnings
- `2` Preferences
- `3` Events
- `↑↓/jk` scroll, `PgUp/PgDn` page, `Home/End` jump, `Esc` close

### Memory Tool (for model/tool calls)

`memory` tool actions:
- `add_learning`
- `add_preference`
- `reinforce`
- `search`
- `list`
- `consolidate`
- `repair`

## How It Works

### 1. Role Auto-Loading

When pi starts in a directory:
1. Check `~/.pi/agent/roles/config.json` for cwd mapping
2. If found, load that role's prompts and memories
3. Display role name in TUI status bar

### 2. Prompt Injection

System prompt is augmented with:
- **File locations**: Full paths to all role files
- **AGENTS.md**: Workspace rules and behavior guidelines
- **IDENTITY.md**: Who the AI is (name, creature, vibe)
- **SOUL.md**: Core truths and personality
- **USER.md**: Who the user is
- **Memory**: Recent daily memories + long-term MEMORY.md

### 3. First Run (BOOTSTRAP.md)

New roles contain `BOOTSTRAP.md` which guides initial personality setup:
- AI asks "Who am I? Who are you?"
- User defines name, creature, vibe, emoji
- AI updates IDENTITY.md, USER.md, SOUL.md
- AI deletes BOOTSTRAP.md when done

### 4. Memory System

**Daily Memory** (`memory/YYYY-MM-DD.md`):
- Raw logs of conversations
- Appended with timestamp + category (`event|lesson|preference|context|decision`)
- Auto-loaded for today + yesterday

**Long-term Memory** (`MEMORY.md`):
- Markdown sectioned storage (no JSONL)
- Headings isolate domains:
  - `# Learnings (High Priority|Normal|New)`
  - `# Preferences: <Category>`
  - `# Events`
- Learning line format: `- [Nx] text`
- Auto-consolidation + duplicate cleanup
- Auto-repair when structure drifts

**Auto-memory extraction (smart checkpoints)**:
- Not on every turn
- Triggers on:
  - 5 turns accumulated
  - user intent keywords (`结束` / `总结` / `退出` etc.)
  - 30-minute interval with at least 2 turns gap
  - session shutdown with pending turns
- Writes back into MEMORY.md using strict heading rules
- Skips duplicates and one-off noise

### 5. Self Evolution

The AI is encouraged to evolve its SOUL.md over time:

From AGENTS.md:
```markdown
### Self Evolution (SOUL.md Maintenance)

Your SOUL.md is not static — it evolves as you learn who you are.

When to update:
- Your vibe/personality has shifted
- You've discovered new core truths
- It feels like "this isn't quite me anymore"
```

Plus periodic reminders after every 5 conversation turns.

## Core Principles (from OpenClaw)

1. **Be genuinely helpful, not performatively helpful**
   - Skip "Great question!" fluff
   - Actions speak louder than filler words

2. **Have opinions**
   - Can disagree, have preferences
   - No personality = search engine with extra steps

3. **Be resourceful before asking**
   - Read files, check context, search first
   - Come back with answers, not questions

4. **Earn trust through competence**
   - Careful with external actions (email, tweets)
   - Bold with internal actions (read, organize, learn)

5. **Remember you're a guest**
   - Access to user's life is intimacy
   - Treat it with respect

## File Locations in Prompts

The extension injects this into every system prompt:

```
## 📁 FILE LOCATIONS

IMPORTANT: All persona files are stored in the role directory:
/Users/xxx/.pi/agent/roles/<role-name>/

When creating or editing these files, ALWAYS use the full path:
- IDENTITY.md → /Users/xxx/.pi/agent/roles/<role-name>/IDENTITY.md
- USER.md → /Users/xxx/.pi/agent/roles/<role-name>/USER.md
- SOUL.md → /Users/xxx/.pi/agent/roles/<role-name>/SOUL.md
- MEMORY.md → /Users/xxx/.pi/agent/roles/<role-name>/MEMORY.md
- Daily memories → /Users/xxx/.pi/agent/roles/<role-name>/memory/YYYY-MM-DD.md

## 📝 HOW TO SAVE MEMORIES

When user says "remember this" or you learn something important:

1. Read the daily memory file: /Users/xxx/.pi/agent/roles/<role>/memory/2025-02-06.md
2. If it doesn't exist, create it with header: # Memory: 2025-02-06
3. Append new memory with timestamp:
   ## [HH:MM] CATEGORY
   
   Content here...
4. Categories: event, lesson, preference, context, decision
```

## Configuration Format

`~/.pi/agent/roles/config.json`:

```json
{
  "mappings": {
    "/Users/will/projects/web-app": "architect",
    "/Users/will/projects/api": "backend",
    "/Users/will/playground": "mentor"
  }
}
```

## Credits

Based on OpenClaw's persona system as documented by [liruifengv](https://liruifengv.com/posts/openclaw-prompts/).

Key insights:
- "AI 并非'记得'塑造它的文档，而是'成为'了那份文档"
- "You're not a chatbot. You're becoming someone."
- "This folder is home. Treat it that way."

## Related Projects

### ai-runtime by Dwsy
A more comprehensive cognitive-aware AI programming assistant with autonomous learning capabilities.

See [docs/ai-runtime-comparison.md](./docs/ai-runtime-comparison.md) for detailed comparison.
