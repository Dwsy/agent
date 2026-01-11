# Knowledge Builder Extension for Pi Agent

Autonomous knowledge base generation using natural language and the Ralph Loop technique.

## 🎯 Overview

Knowledge Builder is an autonomous AI agent that builds comprehensive knowledge bases for your projects using only natural language descriptions. It combines the power of:

- **Ralph Loop**: Autonomous multi-iteration development loop
- **Knowledge Base Skill**: Structured documentation system
- **Natural Language**: Describe what you want, the AI does the rest

## 🔗 Dependencies

**Requires**: [Knowledge Base Skill](https://github.com/Dwsy/knowledge-base-skill)

Knowledge Builder Extension depends on Knowledge Base Skill for all document management operations. Make sure to install Knowledge Base Skill first:

```bash
# Clone and set up Knowledge Base Skill
git clone https://github.com/Dwsy/knowledge-base-skill.git
cd knowledge-base-skill

# Initialize in your project
cd /path/to/your/project
bun ~/.pi/agent/skills/knowledge-base/lib.ts init
```

## 🚀 Quick Start

### Basic Usage (Foreground)

```bash
knowledge-builder "Build a knowledge base for my React project"
```

### Background Usage with Tmux (Recommended)

```bash
# Start knowledge builder in background
knowledge-builder "Build a comprehensive knowledge base for my API" --tmux -m 100

# The builder continues running even if you close the terminal!
```

## 📋 Commands

### Start Knowledge Builder

```bash
# Basic usage
knowledge-builder "<prompt>"

# With custom max iterations
knowledge-builder "<prompt>" -m 50

# With custom completion promise
knowledge-builder "<prompt>" -p "DOCUMENTATION_COMPLETE"

# With tmux background mode (recommended)
knowledge-builder "<prompt>" --tmux

# With custom session name
knowledge-builder "<prompt>" --session my-project --tmux

# Full example
knowledge-builder "Build a knowledge base for my e-commerce system" \
  --tmux \
  --session ecommerce \
  -m 100 \
  -p "KNOWLEDGE_BASE_COMPLETE"
```

### Manage Sessions

```bash
# List all active sessions
knowledge-builder-manager list

# Attach to a session
knowledge-builder-manager attach
knowledge-builder-manager attach my-project

# Kill a session
knowledge-builder-manager kill my-project

# Show detailed status
knowledge-builder-manager status

# View logs in real-time
knowledge-builder-manager logs

# Show current state
knowledge-builder-manager state
```

## 🎯 Usage Examples

### Example 1: Document a React Project

```bash
knowledge-builder "Build a comprehensive knowledge base for my React project.

Requirements:
- Document all components
- Explain state management patterns
- Document API integrations
- Create guides for common workflows
- Record architectural decisions

Process:
1. Scan the codebase
2. Identify key concepts
3. Create concept documents
4. Write guides
5. Document decisions
6. Generate index

Output <promise>KNOWLEDGE_BASE_COMPLETE</promise>" \
--tmux \
-m 50 \
-p "KNOWLEDGE_BASE_COMPLETE"
```

### Example 2: Overnight Knowledge Base Building

```bash
# Start before going to bed
knowledge-builder "Build a complete knowledge base for our microservices architecture.

Requirements:
- Document all services
- Explain communication patterns
- Document deployment strategies
- Create troubleshooting guides
- Record scaling decisions

Make sure every service, pattern, and decision is thoroughly documented.

Output <promise>COMPREHENSIVE_KNOWLEDGE_BASE</promise>" \
--tmux \
-m 100 \
-p "COMPREHENSIVE_KNOWLEDGE_BASE"

# Close terminal, go to sleep
# Wake up and check progress
knowledge-builder-manager status
```

### Example 3: API Documentation

```bash
knowledge-builder "Document all API endpoints and their usage.

Requirements:
- List all endpoints
- Document request/response formats
- Explain authentication
- Create usage examples
- Document error handling

Focus on making it easy for developers to understand and use the API.

Output <promise>API_DOCUMENTATION_COMPLETE</promise>" \
--tmux \
-m 30 \
-p "API_DOCUMENTATION_COMPLETE"
```

### Example 4: Onboarding Knowledge Base

```bash
knowledge-builder "Create an onboarding knowledge base for new team members.

Requirements:
- Explain project architecture
- Document development workflow
- Create setup guides
- Explain coding standards
- Document common tasks
- Provide troubleshooting tips

Make it comprehensive for someone completely new to the project.

Output <promise>ONBOARDING_COMPLETE</promise>" \
--tmux \
-m 75 \
-p "ONBOARDING_COMPLETE"
```

## 📊 State File Structure

```
项目根目录/
└── .pi/
    ├── knowledge-builder.local.md      # State file (Markdown + YAML)
    ├── knowledge-builder.log           # Execution log
    └── knowledge-builder-iteration-*.txt  # Iteration outputs
```

### State File Format

```markdown
# Knowledge Builder State

## Configuration
- Max Iterations: 50
- Completion Promise: KNOWLEDGE_BASE_COMPLETE
- Session: knowledge-builder
- Started: 2026-01-07T13:45:07Z

## User Prompt
Build a knowledge base for my React project...

## Iteration 0
**Status**: Initialized
**Time**: 2026-01-07T13:45:07Z

### Context
...

### Actions
...

### Next Steps
...

### State
- Iteration: 0
- Documents Created: 0
- Categories: 0
- Progress: 0%

---

## Iteration 1
**Time**: 2026-01-07T13:45:15Z

## Analysis
...

## Action
...

## Execution
...

## State Update
...

## Progress
...

## Completion Check
...
```

## 🎨 How It Works

### The Ralph Loop Process

1. **Initialize**: Set up state and configuration
2. **Analyze**: AI analyzes current state and determines next action
3. **Execute**: Perform the action (scan, create document, etc.)
4. **Update**: Update state with progress
5. **Check**: Determine if knowledge base is complete
6. **Repeat**: Continue until completion or max iterations

### AI Capabilities

The AI can:
- Scan project codebase
- Identify key concepts and domains
- Design knowledge base structure
- Create concept documents
- Write guides and tutorials
- Document architectural decisions
- Reorganize directory structure
- Generate indexes
- Search existing documentation
- Validate completeness

### Available Actions

```bash
# Scan codebase
bun ~/.pi/agent/skills/knowledge-base/lib.ts scan

# Discover project structure
bun ~/.pi/agent/skills/knowledge-base/lib.ts discover

# Create documents
bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept "Name" [category]
bun ~/.pi/agent/skills/knowledge-base/lib.ts create guide "Name" [category]
bun ~/.pi/agent/skills/knowledge-base/lib.ts create decision "Name" [category]

# Generate index
bun ~/.pi/agent/skills/knowledge-base/lib.ts index

# Search
bun ~/.pi/agent/skills/knowledge-base/lib.ts search "keyword"

# Reorganize structure
# Use natural language: "Move all frontend docs to frontend/ directory"
```

## 🛡️ Safety Guidelines

### Critical Rule: Completion Promises

**STRICT REQUIREMENTS:**
- ✅ Use `<promise>` XML tags EXACTLY as shown
- ✅ The statement MUST be completely and unequivocally TRUE
- ✅ Do NOT output false statements to exit the loop
- ✅ Only output promise when knowledge base is TRULY COMPLETE

### Always Use Max Iterations

```bash
# Simple: 10-20 iterations
knowledge-builder "Quick documentation" -m 15

# Medium: 20-50 iterations
knowledge-builder "Standard knowledge base" -m 30

# Complex: 50-100 iterations
knowledge-builder "Comprehensive documentation" -m 75

# Very complex: 100+ iterations
knowledge-builder "Enterprise knowledge base" -m 150
```

## 💰 Cost Estimation

- **Simple**: 10-20 iterations × $0.10-0.50 = $1-10
- **Medium**: 20-50 iterations × $0.10-0.50 = $2-25
- **Complex**: 50-100 iterations × $0.10-0.50 = $5-50
- **Enterprise**: 100+ iterations × $0.10-0.50 = $10-100

## 📈 Monitoring Progress

### Without Attaching

```bash
# View logs in real-time
tail -f .pi/knowledge-builder.log

# View current state
cat .pi/knowledge-builder.local.md

# View iteration outputs
cat .pi/knowledge-builder-iteration-*.txt

# Check if tmux session is running
tmux list-sessions | grep knowledge-builder
```

### With Manager

```bash
# Show detailed status
knowledge-builder-manager status

# View logs
knowledge-builder-manager logs

# Show state
knowledge-builder-manager state
```

## 🎯 When to Use Tmux Mode

**✅ Use Tmux for:**
- Large projects (> 30 iterations)
- Overnight tasks
- Multiple concurrent projects
- Unstable network connections
- Need to close terminal while running

**❌ Use Normal Mode for:**
- Small projects (< 30 iterations)
- Quick documentation tasks
- Need to see real-time output
- Testing and debugging

## 📚 Best Practices

### 1. Be Specific in Your Prompt

```bash
# Good
knowledge-builder "Build a knowledge base for my React e-commerce project.
Focus on:
- Component architecture
- State management with Redux
- API integration patterns
- Payment flow
- User authentication
Document all key concepts and create guides for common workflows."

# Bad
knowledge-builder "Document my project"
```

### 2. Set Appropriate Iteration Limits

```bash
# Small project
knowledge-builder "Document API" -m 20

# Medium project
knowledge-builder "Document React app" -m 50

# Large project
knowledge-builder "Document microservices" -m 100
```

### 3. Use Meaningful Completion Promises

```bash
# Good
-p "KNOWLEDGE_BASE_COMPLETE"
-p "ALL_CONCEPTS_DOCUMENTED"
-p "COMPREHENSIVE_DOCUMENTATION"

# Bad (too vague)
-p "DONE"
-p "COMPLETE"
```

### 4. Monitor Progress

```bash
# Start in tmux
knowledge-builder "Build knowledge base" --tmux

# In another terminal, monitor
watch -n 5 'knowledge-builder-manager status'
```

## 🔧 Troubleshooting

### Session Won't Start

```bash
# Check if tmux is installed
tmux -V

# Install if needed
brew install tmux  # macOS
sudo apt-get install tmux  # Ubuntu
```

### Can't Attach to Session

```bash
# List all sessions
knowledge-builder-manager list

# Kill stuck session
knowledge-builder-manager kill my-session

# Start fresh
knowledge-builder "Your prompt" --tmux
```

### Session Not Responding

```bash
# Check session status
knowledge-builder-manager status

# Kill and restart
knowledge-builder-manager kill my-session
knowledge-builder "Your prompt" --tmux
```

### Knowledge Base Incomplete

```bash
# Check state
knowledge-builder-manager state

# Run again with more iterations
knowledge-builder "Continue building the knowledge base" \
  --tmux \
  -m 50 \
  -p "KNOWLEDGE_BASE_COMPLETE"
```

## 📁 Files

```
~/.pi/agent/extensions/knowledge-builder/
├── knowledge-builder.sh           # Main builder script
├── knowledge-builder-manager.sh   # Session management
└── README.md                      # This file
```

## 🔗 Related Tools

- **Knowledge Base Skill**: `~/.pi/agent/skills/knowledge-base/`
- **Ralph Loop Plugin**: `~/.pi/agent/plugin/ralph-loop/`
- **Pi Agent**: https://github.com/badlogic/pi-mono

## 🎯 Real-World Use Cases

### 1. Legacy Project Documentation

```bash
knowledge-builder "Document this legacy codebase.
Focus on:
- Understanding the architecture
- Identifying key modules
- Documenting data flow
- Explaining business logic
- Creating migration guides

Make it comprehensive for future developers." \
--tmux \
-m 100 \
-p "LEGACY_DOCUMENTATION_COMPLETE"
```

### 2. API Documentation Generation

```bash
knowledge-builder "Generate complete API documentation.
Include:
- All endpoints
- Request/response schemas
- Authentication methods
- Error codes
- Rate limiting
- Usage examples
- Integration guides

Make it production-ready." \
--tmux \
-m 75 \
-p "API_DOCS_COMPLETE"
```

### 3. Onboarding Kit

```bash
knowledge-builder "Create an onboarding knowledge base.
Include:
- Project overview
- Architecture diagrams
- Setup instructions
- Development workflow
- Coding standards
- Common tasks
- Troubleshooting guide
- Team contact information

Make it comprehensive for new hires." \
--tmux \
-m 80 \
-p "ONBOARDING_KIT_COMPLETE"
```

## 🎊 Tips

1. **Start with Tmux**: Use tmux mode for all non-trivial tasks
2. **Be Specific**: Provide detailed requirements in your prompt
3. **Set Realistic Limits**: Estimate iterations based on project size
4. **Monitor Progress**: Check status regularly
5. **Review Output**: Review generated documents for quality
6. **Iterate**: Run multiple times if needed for large projects

---

**Tip**: Use tmux mode for large knowledge base building tasks and let the AI work autonomously!