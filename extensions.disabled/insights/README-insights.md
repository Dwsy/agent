# Pi Insights Extension

Inspired by Claude Code's `/insights` command, this extension analyzes your conversation patterns and provides actionable suggestions to improve your prompting and workflow.

## Features

### `/insights` - Quick Analysis
Fast, heuristic-based analysis of your conversation:
- 📈 Basic statistics (messages, tool calls)
- 🔍 Pattern detection (repetitive, vague, verbose, efficient prompts)
- 🛠️ Tool usage analysis
- 💡 Immediate recommendations
- 📋 Suggested custom commands

### `/insights-deep` - LLM-Powered Analysis (Optional)
Deep analysis using an LLM to provide:
- ⭐ Prompt quality score (1-10)
- ✅ Your strengths
- ⚠️ Areas to improve
- 🧠 Repetitive task identification
- 📊 Efficiency metrics
- 🔧 Custom skill suggestions
- 📝 Prompt template recommendations

## Installation

```bash
# Copy to your pi extensions directory
cp insights.ts ~/.pi/agent/extensions/
cp insights-llm.ts ~/.pi/agent/extensions/

# Or project-local
cp insights.ts .pi/extensions/
```

## Usage

Start pi and type:

```
/insights      # Quick stats and patterns
/insights-deep # Deep LLM analysis (needs API)
```

## How It Works

### Pattern Detection

The extension analyzes your prompts for:

1. **Repetitive patterns** - Common starting phrases that suggest a custom template would help
2. **Vague prompts** - Short, unclear requests that could be more specific
3. **Verbose prompts** - Overly long prompts that could be split up
4. **Efficient prompts** - Good use of context (@files, specific details)

### Tool Usage Analysis

Tracks which tools you use most and suggests optimizations:
- High bash usage → Use @file references instead
- Repetitive grep/find → Create a skill

### Recommendations

Based on your patterns, suggests:
- Custom prompt templates (`~/.pi/agent/prompts/`)
- Custom skills (`~/.pi/agent/skills/`)
- Built-in pi features you might not be using

## Example Output

```
╔══════════════════════════════════════════════════════════════╗
║                    📊 Conversation Insights                  ║
╚══════════════════════════════════════════════════════════════╝

📈 Statistics:
   • Total messages: 45
   • Your messages: 18
   • Assistant responses: 18
   • Tool calls: 23

🔍 Patterns detected:
   🔄 You often start prompts with similar phrases
      Examples: "Can you help me"
      💡 Consider creating a custom prompt template or skill

   ⚠️ Several prompts were quite vague or short
      Examples: "help me fix this"
      💡 Try to be more specific: include file paths, error messages

🛠️ Tool usage:
   🟢 read: 12 calls
   🟡 bash: 8 calls
      → Consider using file references (@) instead of ls/cat
   🟢 edit: 3 calls

💡 Recommendations:
   1. Create a custom skill for "Can you help me" tasks
   2. Be more specific: mention file paths and expected behavior
   3. Use @file references instead of cat/ls commands

📋 Consider creating these custom commands:
   • /fix — Bug fixes
   • /refactor — Code refactoring tasks

   Create with: echo "Your prompt" > ~/.pi/agent/prompts/<name>.md
```

## Creating Custom Commands

After running insights, create suggested templates:

```bash
# Example: Create a /fix template
mkdir -p ~/.pi/agent/prompts
cat > ~/.pi/agent/prompts/fix.md << 'EOF'
Analyze and fix the following issue:
- File: {{file}}
- Error: {{error}}
- Expected behavior: {{expected}}

Steps:
1. Read the relevant code
2. Identify the root cause
3. Implement a minimal fix
4. Verify the fix works
EOF
```

Now you can use `/fix` in pi!

## Creating Skills

For more complex workflows, create a skill:

```bash
mkdir -p ~/.pi/agent/skills/my-workflow
cat > ~/.pi/agent/skills/my-workflow/SKILL.md << 'EOF'
# My Workflow Skill

Use this skill when the user wants to perform [task].

## Steps
1. First, do this
2. Then, do that
3. Finally, verify

## Examples
- "Run my workflow for X"
- "Process X using my workflow"
EOF
```

## Differences from Claude Code

| Feature | Claude Code | Pi Insights |
|---------|-------------|-------------|
| Speed | Server-side | Local, instant |
| Analysis | Full LLM | Heuristic + optional LLM |
| Privacy | Sent to Anthropic | Local analysis only |
| Customization | Limited | Fully customizable |

## Tips

1. **Run regularly** - Check insights after completing a task to see patterns
2. **Act on suggestions** - Create templates for repetitive tasks
3. **Review tool usage** - High bash usage often means you could use @files
4. **Track improvement** - Run /insights periodically to see your progress

## Future Enhancements

Possible additions:
- [ ] Historical tracking across sessions
- [ ] Export insights to file
- [ ] Custom analysis rules
- [ ] Integration with workhub for project-level patterns
