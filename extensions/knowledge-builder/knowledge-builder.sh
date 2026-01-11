#!/usr/bin/env bash
# Knowledge Builder - Autonomous Knowledge Base Generation
# Based on Ralph Loop technique for Pi Agent

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MAX_ITERATIONS=50
PROMISE="KNOWLEDGE_BASE_COMPLETE"
SESSION_NAME="knowledge-builder"
USE_TMUX=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        -p|--promise)
            PROMISE="$2"
            shift 2
            ;;
        -s|--session)
            SESSION_NAME="$2"
            shift 2
            ;;
        --name)
            SESSION_NAME="$2"
            shift 2
            ;;
        --tmux)
            USE_TMUX=true
            shift
            ;;
        -h|--help)
            echo "Usage: knowledge-builder [OPTIONS] <prompt>"
            echo ""
            echo "Options:"
            echo "  -m, --max-iterations N    Maximum iterations (default: 50)"
            echo "  -p, --promise TEXT        Completion promise (default: KNOWLEDGE_BASE_COMPLETE)"
            echo "  -s, --session NAME        Session name (default: knowledge-builder)"
            echo "      --name NAME           Session name (alternative to -s)"
            echo "      --tmux                Run in tmux background mode"
            echo "  -h, --help               Show this help"
            echo ""
            echo "Examples:"
            echo "  # Basic usage"
            echo "  knowledge-builder \"Build a knowledge base for my React project\""
            echo ""
            echo "  # With tmux (recommended for large projects)"
            echo "  knowledge-builder \"Build a comprehensive knowledge base\" --tmux -m 100"
            echo ""
            echo "  # Custom session name"
            echo "  knowledge-builder \"Document API endpoints\" --session api-docs -m 30"
            exit 0
            ;;
        *)
            PROMPT="$1"
            shift
            ;;
    esac
done

if [ -z "$PROMPT" ]; then
    echo -e "${RED}Error: No prompt provided${NC}"
    echo "Usage: knowledge-builder [OPTIONS] <prompt>"
    echo "Run 'knowledge-builder --help' for more information"
    exit 1
fi

# Add 'knowledge-builder-' prefix if not already present
if [[ ! "$SESSION_NAME" =~ ^knowledge-builder- ]]; then
    SESSION_NAME="knowledge-builder-$SESSION_NAME"
fi

# Create .pi directory if it doesn't exist
mkdir -p .pi

# State file
STATE_FILE=".pi/knowledge-builder.local.md"
LOG_FILE=".pi/knowledge-builder.log"

# Initialize state file
init_state() {
    cat > "$STATE_FILE" << EOF
# Knowledge Builder State

## Configuration
- Max Iterations: $MAX_ITERATIONS
- Completion Promise: $PROMISE
- Session: $SESSION_NAME
- Started: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

## User Prompt
$PROMPT

## Iteration 0
**Status**: Initialized
**Time**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

### Context
Knowledge builder initialized. Ready to start autonomous knowledge base generation.

### Actions
- Analyze user prompt
- Scan project structure
- Identify knowledge domains
- Generate knowledge base structure
- Create documentation
- Iterate until completion

### Next Steps
1. Scan project codebase
2. Identify key concepts and domains
3. Design knowledge base structure
4. Generate documentation
5. Validate and refine

### State
- Iteration: 0
- Documents Created: 0
- Categories: 0
- Progress: 0%
EOF
}

# Log function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

# Run single iteration
run_iteration() {
    local iteration=$1
    
    log "INFO" "Starting iteration $iteration"
    
    # Read current state
    local current_state=$(cat "$STATE_FILE")
    
    # Build prompt for AI
    local ai_prompt="You are a Knowledge Builder AI. Your task is to autonomously generate a comprehensive knowledge base based on the following user prompt.

## User Prompt
$PROMPT

## Current State
$current_state

## Instructions

You are currently on iteration $iteration of $MAX_ITERATIONS.

Your task is to:
1. Analyze the current state
2. Determine the next action to build the knowledge base
3. Execute the action (create documents, organize structure, etc.)
4. Update the state with your progress
5. Decide if the knowledge base is complete

## Available Actions
- Scan project codebase using: \`bun ~/.pi/agent/skills/knowledge-base/lib.ts scan\`
- Discover project structure: \`bun ~/.pi/agent/skills/knowledge-base/lib.ts discover\`
- Create concept documents: \`bun ~/.pi/agent/skills/knowledge-base/lib.ts create concept \"Name\" [category]\`
- Create guide documents: \`bun ~/.pi/agent/skills/knowledge-base/lib.ts create guide \"Name\" [category]\`
- Create decision documents: \`bun ~/.pi/agent/skills/knowledge-base/lib.ts create decision \"Name\" [category]\`
- Generate index: \`bun ~/.pi/agent/skills/knowledge-base/lib.ts index\`
- Search existing docs: \`bun ~/.pi/agent/skills/knowledge-base/lib.ts search \"keyword\"\`
- Reorganize structure: Use natural language to describe moves

## Completion Criteria

The knowledge base is COMPLETE when ALL of the following are satisfied:
1. All major concepts in the codebase are documented
2. All key workflows and patterns have guides
3. Important architectural decisions are recorded
4. The knowledge base index is up to date
5. The knowledge base provides comprehensive coverage of the project

## Output Format

Provide your response in this exact format:

\`\`\`
## Analysis
[Your analysis of current state and what needs to be done]

## Action
[The action you are taking, with the actual command to execute]

## Execution
[Show the command execution and its output]

## State Update
[Provide the new state section to append to the state file]

## Progress
[Current progress percentage and what's been accomplished]

## Completion Check
[State whether the knowledge base is complete or not. If complete, output exactly: <promise>$PROMISE</promise>]
\`\`\`

IMPORTANT: Only output <promise>$PROMISE</promise> when the knowledge base is TRULY COMPLETE. Do not output it prematurely."

    # Call AI (using pi)
    log "INFO" "Calling AI for iteration $iteration"
    
    # Save iteration prompt for debugging
    echo "=== Iteration $iteration Prompt ===" >> ".pi/knowledge-builder-iteration-$iteration.txt"
    echo "$ai_prompt" >> ".pi/knowledge-builder-iteration-$iteration.txt"
    
    # Get AI response
    local response=$(pi "$ai_prompt" 2>> "$LOG_FILE" | tee -a ".pi/knowledge-builder-iteration-$iteration.txt")
    
    log "INFO" "Received AI response for iteration $iteration"
    
    # Parse response and update state
    echo "" >> "$STATE_FILE"
    echo "---" >> "$STATE_FILE"
    echo "" >> "$STATE_FILE"
    echo "## Iteration $iteration" >> "$STATE_FILE"
    echo "**Time**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$STATE_FILE"
    echo "" >> "$STATE_FILE"
    echo "$response" >> "$STATE_FILE"
    
    # Check for completion promise
    if [[ "$response" =~ \<promise\>$PROMISE\<\/promise\> ]]; then
        log "SUCCESS" "Knowledge base completion detected!"
        return 0
    fi
    
    return 1
}

# Run in foreground
run_foreground() {
    log "INFO" "Starting Knowledge Builder (foreground mode)"
    log "INFO" "Max iterations: $MAX_ITERATIONS"
    log "INFO" "Completion promise: $PROMISE"
    
    init_state
    
    for ((i=1; i<=MAX_ITERATIONS; i++)); do
        log "INFO" "=== Iteration $i/$MAX_ITERATIONS ==="
        
        if run_iteration $i; then
            log "SUCCESS" "Knowledge base completed successfully in $i iterations"
            echo -e "${GREEN}✅ Knowledge base completed in $i iterations!${NC}"
            exit 0
        fi
        
        # Small delay between iterations
        sleep 1
    done
    
    log "WARN" "Max iterations reached without completion"
    echo -e "${YELLOW}⚠️  Max iterations ($MAX_ITERATIONS) reached. Check $STATE_FILE for details.${NC}"
    exit 1
}

# Run in tmux background
run_tmux() {
    log "INFO" "Starting Knowledge Builder (tmux mode)"
    log "INFO" "Session: $SESSION_NAME"
    
    # Check if session already exists
    if tmux list-sessions 2>/dev/null | grep -q "^$SESSION_NAME:"; then
        echo -e "${RED}Error: Session '$SESSION_NAME' already exists${NC}"
        echo "Use: tmux attach -t $SESSION_NAME"
        exit 1
    fi
    
    # Create tmux session
    tmux new-session -d -s "$SESSION_NAME" -n "knowledge-builder"
    
    # Set up tmux pane
    tmux send-keys -t "$SESSION_NAME:0" "cd $(pwd)" C-m
    tmux send-keys -t "$SESSION_NAME:0" "init_state" C-m
    tmux send-keys -t "$SESSION_NAME:0" "run_foreground" C-m
    
    log "INFO" "Tmux session '$SESSION_NAME' started"
    echo -e "${GREEN}✅ Knowledge Builder started in tmux session: $SESSION_NAME${NC}"
    echo ""
    echo "Monitor progress:"
    echo "  tmux attach -t $SESSION_NAME"
    echo ""
    echo "View logs:"
    echo "  tail -f $LOG_FILE"
    echo ""
    echo "Detach from session (keep running):"
    echo "  Ctrl+B, then D"
}

# Main
if [ "$USE_TMUX" = true ]; then
    run_tmux
else
    run_foreground
fi