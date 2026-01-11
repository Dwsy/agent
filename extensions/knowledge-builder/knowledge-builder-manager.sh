#!/usr/bin/env bash
# Knowledge Builder Manager - Manage knowledge builder sessions

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default session prefix
SESSION_PREFIX="knowledge-builder"

# List sessions
list_sessions() {
    echo -e "${BLUE}Knowledge Builder Sessions:${NC}"
    echo ""
    
    local sessions=$(tmux list-sessions 2>/dev/null | grep "^$SESSION_PREFIX-" || true)
    
    if [ -z "$sessions" ]; then
        echo "No active sessions found."
        return 0
    fi
    
    echo "$sessions" | while read -r line; do
        local session_name=$(echo "$line" | cut -d: -f1)
        local session_info=$(echo "$line" | cut -d: -f2-)
        
        # Check if state file exists
        local state_file=".pi/knowledge-builder.local.md"
        if [ -f "$state_file" ]; then
            local iteration=$(grep -o "Iteration [0-9]*" "$state_file" | tail -1 | grep -o "[0-9]*" || echo "0")
            echo -e "${GREEN}✓${NC} $session_name (Iteration: $iteration) $session_info"
        else
            echo -e "${YELLOW}?${NC} $session_name $session_info"
        fi
    done
}

# Attach to session
attach_session() {
    local session_name=$1
    
    if [ -z "$session_name" ]; then
        # Find the first available session
        session_name=$(tmux list-sessions 2>/dev/null | grep "^$SESSION_PREFIX-" | head -1 | cut -d: -f1)
        
        if [ -z "$session_name" ]; then
            echo -e "${RED}Error: No active sessions found${NC}"
            exit 1
        fi
    fi
    
    # Add prefix if not present
    if [[ ! "$session_name" =~ ^$SESSION_PREFIX- ]]; then
        session_name="$SESSION_PREFIX-$session_name"
    fi
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        echo -e "${RED}Error: Session '$session_name' not found${NC}"
        echo "Available sessions:"
        list_sessions
        exit 1
    fi
    
    echo -e "${GREEN}Attaching to session: $session_name${NC}"
    tmux attach -t "$session_name"
}

# Kill session
kill_session() {
    local session_name=$1
    
    if [ -z "$session_name" ]; then
        echo -e "${RED}Error: Please specify a session name${NC}"
        echo "Usage: knowledge-builder-manager kill <session-name>"
        exit 1
    fi
    
    # Add prefix if not present
    if [[ ! "$session_name" =~ ^$SESSION_PREFIX- ]]; then
        session_name="$SESSION_PREFIX-$session_name"
    fi
    
    if ! tmux list-sessions 2>/dev/null | grep -q "^$session_name:"; then
        echo -e "${RED}Error: Session '$session_name' not found${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Killing session: $session_name${NC}"
    tmux kill-session -t "$session_name"
    echo -e "${GREEN}✓ Session killed${NC}"
}

# Show status
show_status() {
    echo -e "${BLUE}Knowledge Builder Status:${NC}"
    echo ""
    
    # Check state file
    local state_file=".pi/knowledge-builder.local.md"
    if [ -f "$state_file" ]; then
        echo -e "${GREEN}✓${NC} State file exists: $state_file"
        
        # Extract key information
        local started=$(grep "Started:" "$state_file" | cut -d: -f2- | xargs || echo "N/A")
        local max_iter=$(grep "Max Iterations:" "$state_file" | cut -d: -f2- | xargs || echo "N/A")
        local current_iter=$(grep -o "Iteration [0-9]*" "$state_file" | tail -1 | grep -o "[0-9]*" || echo "0")
        
        echo "  Started: $started"
        echo "  Max Iterations: $max_iter"
        echo "  Current Iteration: $current_iter"
        echo "  Progress: $((current_iter * 100 / max_iter))%"
    else
        echo -e "${YELLOW}✗${NC} No state file found"
    fi
    
    echo ""
    
    # Check log file
    local log_file=".pi/knowledge-builder.log"
    if [ -f "$log_file" ]; then
        local log_size=$(du -h "$log_file" | cut -f1)
        local log_lines=$(wc -l < "$log_file")
        echo -e "${GREEN}✓${NC} Log file: $log_file ($log_size, $log_lines lines)"
    else
        echo -e "${YELLOW}✗${NC} No log file found"
    fi
    
    echo ""
    
    # Check iteration files
    local iter_count=$(ls -1 .pi/knowledge-builder-iteration-*.txt 2>/dev/null | wc -l)
    if [ $iter_count -gt 0 ]; then
        echo -e "${GREEN}✓${NC} Iteration files: $iter_count"
    else
        echo -e "${YELLOW}✗${NC} No iteration files found"
    fi
    
    echo ""
    
    # Show tmux sessions
    echo -e "${BLUE}Active Tmux Sessions:${NC}"
    list_sessions
}

# Show logs
show_logs() {
    local log_file=".pi/knowledge-builder.log"
    
    if [ ! -f "$log_file" ]; then
        echo -e "${RED}Error: Log file not found: $log_file${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Knowledge Builder Logs (Ctrl+C to exit):${NC}"
    echo ""
    tail -f "$log_file"
}

# Show state
show_state() {
    local state_file=".pi/knowledge-builder.local.md"
    
    if [ ! -f "$state_file" ]; then
        echo -e "${RED}Error: State file not found: $state_file${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Knowledge Builder State:${NC}"
    echo ""
    cat "$state_file"
}

# Show help
show_help() {
    cat << EOF
Knowledge Builder Manager - Manage knowledge builder sessions

Usage: knowledge-builder-manager <command> [options]

Commands:
  list                    List all active sessions
  attach [session]        Attach to a session (default: first available)
  kill <session>          Kill a session
  status                  Show detailed status
  logs                    View logs in real-time (Ctrl+C to exit)
  state                   Show current state file
  help                    Show this help

Examples:
  # List all sessions
  knowledge-builder-manager list
  
  # Attach to a session
  knowledge-builder-manager attach
  knowledge-builder-manager attach my-project
  
  # Kill a session
  knowledge-builder-manager kill my-project
  
  # Show status
  knowledge-builder-manager status
  
  # View logs
  knowledge-builder-manager logs
  
  # Show state
  knowledge-builder-manager state

Tmux Shortcuts (when attached):
  Ctrl+B, D    Detach from session (keep it running)
  Ctrl+B, C    Create new window
  Ctrl+B, N    Next window
  Ctrl+B, P    Previous window

EOF
}

# Main
case "${1:-}" in
    list)
        list_sessions
        ;;
    attach)
        attach_session "$2"
        ;;
    kill)
        kill_session "$2"
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    state)
        show_state
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Error: Unknown command '${1:-}'${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac