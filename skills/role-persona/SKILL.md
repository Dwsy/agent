---
name: role-persona
description: >
  Role-persona CLI for managing AI agent identity, memory, and knowledge systems.
  Use this skill when the user wants to: manage roles/identities, view or edit agent memory,
  search past learnings and preferences, export memory reports, manage knowledge bases,
  configure role mappings, build system prompts, or interact with the role-persona daemon.
  Triggers: role, memory, learnings, preferences, knowledge, identity, persona, prompt,
  consolidate, export, daemon, role-persona, agent memory, persistent memory.
---

# role-persona Skill

CLI tool for managing AI agent identity, persistent memory, and knowledge bases.

## Core Concepts

- **Role**: An agent identity with name, emoji, persona, and soul files. Roles live in `~/.pi/roles/`.
- **Memory**: Persistent learnings (facts) and preferences (behavior rules) stored in Markdown files.
- **Knowledge Base**: Categorized documents searchable by tags and content.
- **Daemon**: Background HTTP server (~0.3s response) with auto-start on first CLI call.

## CLI Reference

All commands output JSON by default (`{ ok, data, error, message }`). Add `--human` for formatted output.

### Role Management

```bash
role-persona role list                    # List all roles
role-persona role create                  # Create new role (interactive)
role-persona role info                    # Current role info
role-persona role map <name>              # Map role to current directory
role-persona role unmap                   # Unmap role from directory
```

### Memory Operations

```bash
# Add
role-persona memory add-learning "When X, do Y"
role-persona memory add-preference "Prefer Z for tasks"

# Search
role-persona memory search "query text"  # Semantic search

# List
role-persona memory list                 # All memory summary

# Maintenance
role-persona memory consolidate          # Merge duplicates
role-persona memory repair               # Fix format issues
role-persona memory tidy --model <m>     # LLM-assisted cleanup

# Export & Reports
role-persona memory export               # Full report to ~/memory-report.md
role-persona memory conflicts            # Find contradictory entries
role-persona memory log                  # Recent memory changes

# Advanced
role-persona memory build-prompt         # Generate memory context
role-persona memory extract-memory       # Extract from conversation
role-persona memory flush                # Flush pending writes

# CRUD
role-persona memory update-learning "needle" "new text"
role-persona memory update-preference "needle" "new text"
role-persona memory delete-learning "needle"
role-persona memory delete-preference "needle"
role-persona memory reinforce "needle"   # Bump usage count
```

### Knowledge Base

```bash
role-persona knowledge list [category]   # List documents
role-persona knowledge search "query"    # Search
role-persona knowledge read "path"       # Read document
role-persona knowledge write "path"      # Write/update document
```

### Vector Embedding

```bash
role-persona embedding stats             # Embedding status
role-persona embedding rebuild           # Rebuild vector index
```

### System Prompt

```bash
role-persona prompt                      # Output system prompt
```

### Daemon (auto-starts on first call)

```bash
role-persona daemon start                # Start daemon (background)
role-persona daemon stop                 # Stop daemon
role-persona daemon status               # Check daemon health
```

## Flags

| Flag | Description |
|------|-------------|
| `--json` | JSON output (default) |
| `--human` | Human-readable output |
| `--cwd <path>` | Override working directory |
| `--direct` | Skip daemon, run directly |
| `--model <m>` | Model for LLM operations |

## Common Workflows

### Onboarding a New Session

```bash
# 1. Check current role
role-persona role info --human

# 2. Review memory
role-persona memory list --human

# 3. Check for conflicts
role-persona memory conflicts --human
```

### End-of-Session Cleanup

```bash
# 1. Consolidate memory (merge duplicates)
role-persona memory consolidate

# 2. Check for contradictions
role-persona memory conflicts --human

# 3. Repair any format issues
role-persona memory repair
```

### Building System Prompt

```bash
# Generate prompt with memory context
role-persona prompt --human

# Or export full memory report
role-persona memory export --output ~/session-memory.md
```

### Searching Past Knowledge

```bash
# Semantic search across all memory
role-persona memory search "how to handle auth tokens"

# Search knowledge base
role-persona knowledge search "deployment guide"
```

## Integration Patterns

### With Pi Agent

The CLI auto-starts a daemon on first call for fast subsequent operations (~0.3s vs ~0.5s cold start). Use `--direct` to bypass daemon for one-off operations.

### Programmatic Usage (JavaScript/TypeScript)

```typescript
import { cli, cliOrThrow } from "role-persona/cli";

// JSON output
const result = await cli(["memory", "list"]);
console.log(result.ok, result.data);

// Throws on error
const data = await cliOrThrow(["memory", "search", "auth"]);
```

### As MCP Server

```bash
# Start MCP server (Streamable HTTP)
role-persona-mcp --port 3001
```

## File Locations

- Roles: `~/.pi/roles/<role-name>/`
- Memory: `~/.pi/roles/<role>/memory/`
- Knowledge: `~/.pi/roles/<role>/knowledge/`
- Daemon PID: `~/.pi/role-persona-daemon.pid`
- Config: `~/.pi/roles/pi-role-persona.jsonc`

## Tips

- Memory quality matters: prefer specific, reusable entries over verbose descriptions
- Run `consolidate` periodically to merge similar entries
- Use `conflicts` to find and resolve contradictory preferences
- The daemon auto-starts on first CLI call — no manual startup needed
- `--direct` bypasses the daemon for debugging or one-off operations
