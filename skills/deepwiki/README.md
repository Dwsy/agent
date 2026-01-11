# DeepWiki

A powerful CLI tool for retrieving GitHub repository documentation and knowledge via DeepWiki MCP SSE protocol.

## Features

- 🔍 **Explore Repository Structure**: View all available documentation topics
- 📖 **Read Documentation Content**: Access detailed wiki contents
- 💬 **Ask Questions**: Query repository knowledge using natural language

## Installation

```bash
npm install -g deepwiki-cli
```

Or using pnpm:

```bash
pnpm add -g deepwiki-cli
```

## Usage

### 1. Get repository documentation structure

```bash
deepwiki read_wiki_structure --repoName "owner/repo"
# or using short alias
dw rws -r "owner/repo"
```

### 2. View specific documentation content

```bash
deepwiki read_wiki_contents --repoName "owner/repo" --topic "topic_name"
# or using short alias
dw rwc -r "owner/repo" -t "topic_name"
```

### 3. Ask questions about the repository

```bash
deepwiki ask_question --repoName "owner/repo" --question "Your question here"
# or using short alias
dw aq -r "owner/repo" -q "Your question here"
```

## Prerequisites

- Node.js 14 or higher
- DeepWiki MCP server access
- Valid GitHub repository path

## Examples

### OpenAI Node.js SDK

```bash
# Explore repository structure
dw rws -r "openai/openai-node"

# Read installation guide
dw rwc -r "openai/openai-node" -t "Installation and Setup"

# Ask about authentication
dw aq -r "openai/openai-node" -q "How do I authenticate?"
```

### Linux Kernel

```bash
# Explore Linux kernel documentation
dw rws -r "torvalds/linux"

# Ask about Linux boot process
dw aq -r "torvalds/linux" -q "How does Linux boot?"

# Ask about kernel initialization
dw aq -r "torvalds/linux" -q "How is the Linux kernel initialized during boot?"
```

### React

```bash
# Explore React documentation
dw rws -r "facebook/react"

# Ask about React hooks
dw aq -r "facebook/react" -q "How do useEffect and useState work?"
```

## Command Aliases

The CLI provides convenient aliases for all commands:

| Full Command | Short Aliases | Description |
|--------------|---------------|-------------|
| `read_wiki_structure` | `rws`, `str` | Get repository documentation structure |
| `read_wiki_contents` | `rwc`, `cont` | Read specific documentation content |
| `ask_question` | `aq`, `ask` | Ask questions about the repository |

## Parameter Shorthands

| Full Parameter | Short Form | Description |
|----------------|------------|-------------|
| `--repoName` | `-r`, `--repo` | Repository name (e.g., "owner/repo") |
| `--topic` | `-t` | Documentation topic name |
| `--question` | `-q` | Your question about the repository |
| `--lang` | `-l` | Language (en|zh, default: auto) |
| `--help` | `-h` | Show help |

## Dependencies

- `axios` - HTTP client
- `eventsource` - SSE protocol support

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Repository

https://github.com/Dwsy/deepwiki-skills

---

[中文文档](./README.zh-CN.md)