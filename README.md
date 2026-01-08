# Pi Agent

Enterprise-grade AI Agent system for code generation, analysis, and orchestration.

## Overview

Autonomous AI orchestrator managing complex software development workflows through a structured skill system. Enforces enterprise-level protocols for code quality, documentation, and multi-model collaboration.

## Features

- **Multi-Model Orchestration**: Codex, Gemini, and other AI models
- **Skill-Based Architecture**: Modular capabilities
- **Enterprise Workflows**: Phase-driven development with automated code review
- **Documentation**: Built-in workhub for issues, PRs, and architecture decisions
- **Context-Aware Search**: Semantic (ace-tool) and AST-based (ast-grep) code search
- **Clean Code**: Minimal, efficient, production-ready code

## Quick Start

```bash
# Initialize documentation structure
~/.pi/agent/skills/workhub/lib.ts init

# Create a new issue
~/.pi/agent/skills/workhub/lib.ts create issue "Task description"
```

## Core Skills

| Skill | Purpose |
|-------|---------|
| `workhub` | Documentation management (Issues/PRs) |
| `ace-tool` | Semantic code search |
| `ast-grep` | AST-aware code search/rewrite |
| `codemap` | Code flow analysis |
| `context7` | GitHub Issues/PRs search |
| `deepwiki` | GitHub repository docs |
| `exa` / `tavily-search-free` | Web search |
| `project-planner` | Project planning |
| `system-design` | Architecture design |
| `sequential-thinking` | Systematic reasoning |

## Workflow

1. **Context Retrieval**: Understand codebase
2. **Analysis & Planning**: Strategy (complex tasks)
3. **Prototyping**: Get implementation prototypes
4. **Implementation**: Refactor to production code
5. **Audit & Delivery**: Automated code review

## Workflow Commands

| Command | Purpose |
|---------|---------|
| `/analyze` | Deep code analysis with worker agent |
| `/brainstorm` | Design exploration with brainstormer agent |
| `/research` | Parallel codebase research with multiple tools |
| `/scout` | Quick reconnaissance with scout agent |

## Agents

| Agent | Purpose |
|-------|---------|
| `scout` | Fast codebase recon and file location |
| `worker` | Deep analysis and pattern finding |
| `reviewer` | Code review and quality checks |
| `planner` | Task planning and breakdown |
| `brainstormer` | Design ideation and architecture |

See `SYSTEM.md` for detailed protocols.

## Configuration

- `SYSTEM.md` - Core protocols and workflow
- `settings.json` - Agent settings
- `models.json` - Model configurations
- `auth.json` - Authentication credentials

## Documentation Structure

```
docs/
├── adr/           # Architecture Decision Records
├── architecture/  # System design documents
├── issues/        # Task tracking
└── pr/            # Change logs
```