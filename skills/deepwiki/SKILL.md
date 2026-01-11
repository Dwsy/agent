---
name: deepwiki
description: Retrieve GitHub repository documentation and knowledge from DeepWiki. Supports viewing document structure, content, and asking questions about repositories.
---

# DeepWiki Skill

This skill connects to DeepWiki via MCP SSE protocol.

## Execution Environment

| Path Type | Path | Base Directory |
|-----------|------|----------------|
| **Skill Directory** | `~/.pi/agent/skills/deepwiki/` | Fixed location |
| **Main Script** | `~/.pi/agent/skills/deepwiki/dw.js` | Skill directory |

## Installation

### Local Usage (Skill Directory)
```bash
cd ~/.pi/agent/skills/deepwiki
npm install eventsource axios
```

### Global Installation (Recommended)
```bash
npm install -g deepwiki-cli
```

Or using pnpm:
```bash
pnpm add -g deepwiki-cli
```

## Usage

### 1. Get Repository Documentation Structure
```bash
cd ~/.pi/agent/skills/deepwiki
node dw.js read_wiki_structure --repoName "owner/repo"
```

### 2. View Specific Documentation Content
```bash
cd ~/.pi/agent/skills/deepwiki
node dw.js read_wiki_contents --repoName "owner/repo" --topic "topic_name"
```

### 3. Ask Questions About Repository
```bash
cd ~/.pi/agent/skills/deepwiki
node dw.js ask_question --repoName "owner/repo" --question "your question"
```

## Global CLI Usage

After global installation, you can use the `deepwiki` or `dw` command from anywhere:

```bash
# Using full command name
deepwiki read_wiki_structure --repoName "owner/repo"
deepwiki read_wiki_contents --repoName "owner/repo" --topic "topic_name"
deepwiki ask_question --repoName "owner/repo" --question "your question"

# Using short alias
dw rws -r "owner/repo"
dw rwc -r "owner/repo" -t "topic_name"
dw aq -r "owner/repo" -q "your question"
```

## Command Aliases

The CLI provides convenient aliases for all commands:

| Full Command | Short Aliases | Description |
|--------------|---------------|-------------|
| `read_wiki_structure` | `rws`, `str` | Get repository documentation structure |
| `read_wiki_contents` | `rwc`, `cont` | Read specific documentation content |
| `ask_question` | `aq`, `ask` | Ask questions about the repository |

## Parameter Aliases

Parameters also support shorthand forms:

| Full Parameter | Short Form | Description |
|----------------|------------|-------------|
| `--repoName` | `-r`, `--repo` | Repository name (e.g., "owner/repo") |
| `--topic` | `-t` | Documentation topic name |
| `--question` | `-q` | Your question about the repository |
| `--lang` | `-l` | Language (en|zh, default: auto) |
| `--help` | `-h` | Show help |

## Shell Completions

The package includes shell completion scripts for bash, zsh, and fish.

### Bash
```bash
source ~/.pi/agent/skills/deepwiki/completions/bash
```

### Zsh
```bash
source ~/.pi/agent/skills/deepwiki/completions/zsh
```

### Fish
```bash
source ~/.pi/agent/skills/deepwiki/completions/deepwiki.fish
source ~/.pi/agent/skills/deepwiki/completions/dw.fish
```

## Path Notes

- **All scripts must be executed from the `~/.pi/agent/skills/deepwiki/` directory**
- The `dw.js` file is located in the skill installation directory and does not change with the working directory
- If executing from another directory, you must first `cd ~/.pi/agent/skills/deepwiki/`

## Repository

- **GitHub**: https://github.com/Dwsy/deepwiki-skills
- **npm**: https://www.npmjs.com/package/deepwiki-cli

## Documentation

- [English Documentation](./README.md)
- [中文文档](./README.zh-CN.md)