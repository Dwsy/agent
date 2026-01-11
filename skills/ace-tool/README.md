# ACE Tool Skill

Semantic, fuzzy search over the codebase using AugmentCode. Designed for high-level understanding and exploration when exact file names, symbols, or locations are unknown.

## 🎯 Overview

ACE Tool provides semantic code search capabilities through the AugmentCode MCP (Model Context Protocol) server. It interprets natural language queries and retrieves conceptually relevant code rather than exact string matches.

## ✨ Features

- 🔍 **Semantic Search**: Understand code intent, not just string matching
- 🧠 **High-Level Understanding**: Get code overviews and relationships
- 🎯 **Context-Aware**: Provides relevant code snippets with context
- 🚀 **Persistent Index**: Maintains index state through daemon process
- 📊 **Multiple Queries**: Support for various query types

## ⚠️ Important Note

- **When to Use**: When you don't know exact file names, symbols, or locations, and need semantic understanding
- **When NOT to Use**: For exact identifier, symbol name, or literal string matching - use `rg` (ripgrep) instead
- **Pre-Edit Rule**: Before editing any file, ALWAYS first use ACE Tool to gather detailed context

## 📋 Prerequisites

### Required Dependencies

1. **Bun runtime**: JavaScript runtime
2. **ACE CLI Tool**: Required CLI tool for ACE MCP server
   - Repository: https://github.com/eastxiaodong/ace-tool
   - Installation: See the CLI tool repository for setup instructions

### Installation

```bash
cd ~/.pi/agent/skills/ace-tool

# 1. Install ACE CLI Tool (required dependency)
# Visit: https://github.com/eastxiaodong/ace-tool
# Follow the installation instructions in that repository

# 2. Install dependencies (if needed)
bun install

# 3. Configure ACE MCP Server
cp .env.example .env
# Edit .env with your ACE server credentials
```

### ACE CLI Tool Setup

The ACE CLI Tool provides the underlying functionality for semantic code search. You must install it before using this skill:

```bash
# Clone the ACE CLI Tool
git clone https://github.com/eastxiaodong/ace-tool.git
cd ace-tool

# Install and configure
# Follow the repository's README for installation steps

# Make sure the CLI is available in your PATH
ace-tool --version  # Verify installation
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the skill directory:

```bash
# ACE CLI Tool Configuration
ACE_CLI_PATH="/path/to/ace-tool"  # Path to ACE CLI tool (optional if in PATH)

# ACE MCP Server Configuration
ACE_BASE_URL="https://your-ace-server.com/relay"
ACE_API_KEY="your-ace-api-key-here"
ACE_PORT=4231
```

**⚠️ Security**: Never commit `.env` to version control. Use `.env.example` as a template.

### Verifying ACE CLI Tool Installation

Before using this skill, verify that the ACE CLI Tool is properly installed:

```bash
# Check if ACE CLI is available
ace-tool --version

# Test basic functionality
ace-tool search "test query"  # Should work if configured
```

## 🚀 Usage

### Start the Daemon

The daemon maintains the index state and should be started once:

```bash
cd ~/.pi/agent/skills/ace-tool
bun run daemon.ts
```

The daemon starts automatically when you use the client.

### Start Debug Web UI

For testing and development, start the web interface:

```bash
cd ~/.pi/agent/skills/ace-tool
bun run start
# or
bun run server
```

Open your browser to `http://localhost:4231`

### Dev Mode (Daemon + Web UI)

Run both daemon and web UI simultaneously:

```bash
cd ~/.pi/agent/skills/ace-tool
bun run dev
```

### Search Codebase

```bash
# From skill directory
bun run client.ts search "Where is the user authentication handled?"

# From any project directory
bun ~/.pi/agent/skills/ace-tool/client.ts search "How does the payment flow work?"
```

### Enhance Prompts (Web UI)

```bash
bun run client.ts enhance "Add a login page"
```

This opens a Web UI for prompt enhancement.

### Debug Web UI

Start the debug web interface for testing and development:

```bash
cd ~/.pi/agent/skills/ace-tool
bun run server
```

Then open your browser to: `http://localhost:4231`

The web UI provides:
- 🎨 Minimalist dark interface
- 🔍 Real-time search testing
- 📊 Status indicator
- 💡 Quick example queries
- 📝 Code results display

#### Web UI Features

- **Status Indicator**: Shows ACE server connection status
- **Query Input**: Textarea for natural language queries
- **Quick Examples**: Pre-configured example queries
- **Results Display**: Shows search results with file paths and scores
- **Error Handling**: Clear error messages for debugging

#### Using the Web UI

1. Open browser to `http://localhost:4231`
2. Check the status indicator (green = online, red = offline)
3. Enter your search query in the textarea
4. Click "Search" button
5. View results with file paths and code snippets
6. Use quick examples for common queries

#### Web UI Screenshot

The web UI features:
- Clean, minimalist dark theme
- Status indicator showing ACE server connectivity
- Large textarea for queries
- Quick example buttons
- Real-time search results display
- Error messages for debugging
3. Click "Search" button
4. View results with file paths and code snippets
5. Use quick examples for common queries

#### API Endpoints

- `GET /`: Web UI page
- `GET /api/status`: Check ACE server status
- `POST /api/search`: Perform semantic search

**Example API Call**:
```bash
curl -X POST http://localhost:4231/api/search \\
  -H "Content-Type: application/json" \\
  -d '{"query": "Where is authentication handled?"}'
```

## 📖 Query Examples

### Good Semantic Queries

```bash
# Search for functionality
"Where is the user authentication handled?"
"How does the payment flow work?"
"Where are API endpoints defined?"

# Search for patterns
"How are errors handled in this codebase?"
"Where is state management implemented?"
"How do components communicate with each other?"

# Search for concepts
"Where is the database connection established?"
"How are user sessions managed?"
"Where is authentication middleware defined?"
```

### When to Use rg Instead

```bash
# Use rg for exact matches
rg "class UserAuthentication"
rg "function authenticateUser"
rg "API_KEY"
```

## 🏗️ Architecture

### Components

1. **daemon.ts**: Persistent daemon that maintains index state
2. **client.ts**: Client script for interacting with ACE MCP server
3. **server.ts**: Web UI server for testing and development
4. **ACE CLI Tool**: External dependency providing core functionality
5. **.ace-tool/**: Runtime directory for logs and cache

### Data Flow

```
User Query → Web UI / Client → ACE CLI Tool → ACE MCP Server → Indexed Code → Results
```

### Dependency Relationship

```
ACE Tool Skill (this repository)
        ↓ depends on
ACE CLI Tool (eastxiaodong/ace-tool)
        ↓ uses
ACE MCP Server
```

**ACE CLI Tool** acts as a bridge between this skill and the ACE MCP server, providing the core semantic search functionality.

### Web UI Architecture

```
Browser → server.ts → ACE MCP Server → Results → Display
         ↓
     Static HTML
```

## 📊 Output Format

Search results include:
- Relevant code snippets
- File paths
- Context around matches
- Semantic relevance scores

## 🛠️ Troubleshooting

### Daemon Won't Start

```bash
# Check if port is available
lsof -i :4231

# Check ACE server connectivity
curl https://your-ace-server.com/relay/health
```

### No Results Found

- Try rephrasing your query
- Check if the daemon is running
- Verify ACE MCP server is accessible

### Connection Errors

- Verify ACE_BASE_URL in `.env`
- Check ACE_API_KEY is correct
- Ensure network connectivity to ACE server

## 🔒 Security Considerations

- 🔐 **Never commit `.env`** - It contains sensitive API keys
- 🔐 **Use `.env.example`** - Template for configuration
- 🔐 **Rotate API keys** - Regularly update your ACE API key
- 🔐 **Access control** - Limit access to ACE MCP server

## 📚 Integration

### With Knowledge Base Skill

ACE Tool can be used to scan code for knowledge base documentation:

```bash
# Scan codebase for concepts
bun ~/.pi/agent/skills/knowledge-base/lib.ts scan

# This internally uses ACE Tool for semantic understanding
```

### With Other Skills

ACE Tool can be integrated with other Pi Agent skills that need code understanding:
- **Knowledge Builder**: Analyze project structure
- **System Design**: Understand code architecture
- **Project Planner**: Analyze existing code patterns

## 📝 Best Practices

1. **Use Semantic Queries**: Describe what you're looking for, not exact terms
2. **Pre-Edit Context**: Always gather context before editing files
3. **Combine with rg**: Use ACE for understanding, rg for exact matches
4. **Iterate Queries**: Refine your query if results aren't relevant
5. **Check Daemon**: Ensure daemon is running for best performance

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - See [LICENSE](LICENSE) file

## 🔗 Resources

- **ACE CLI Tool**: https://github.com/eastxiaodong/ace-tool - Required dependency
- **AugmentCode**: https://augmentcode.dev/
- **MCP Protocol**: https://modelcontextprotocol.io/
- **Pi Agent**: https://github.com/badlogic/pi-mono
- **ACE MCP Server**: Contact your administrator for access

## 🤝 Dependencies

### External Dependencies

This skill depends on the following external tool:

- **[ACE CLI Tool](https://github.com/eastxiaodong/ace-tool)**: Required CLI tool for ACE MCP server
  - Provides core semantic search functionality
  - Acts as a bridge between this skill and ACE MCP server
  - Must be installed and configured separately

### Installation Order

1. Install ACE CLI Tool from https://github.com/eastxiaodong/ace-tool
2. Configure ACE CLI Tool according to its documentation
3. Install this skill (clone and configure)
4. Configure `.env` with your ACE server credentials
5. Start using

### Integration

This skill wraps the ACE CLI Tool to provide:
- Web UI interface
- Pi Agent integration
- Standardized configuration
- Enhanced user experience

## 📞 Support

For issues or questions:
- Check the [Issues](https://github.com/Dwsy/ace-tool-skill/issues) page
- Review existing documentation
- Contact your ACE MCP server administrator

---

**Status**: ✅ Production Ready

**Version**: 1.0.0

**Last Updated**: 2026-01-07

**Maintainer**: Dwsy