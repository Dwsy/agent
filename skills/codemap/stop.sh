#!/bin/bash

# CodeMap 停止脚本
# 停止所有 CodeMap 相关进程

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PID_FILE="$HOME/.codemap/.pids"

echo -e "${YELLOW}正在停止 CodeMap 进程...${NC}"

if [ -f "$PID_FILE" ]; then
    while IFS= read pid; do
        if ps -p $pid > /dev/null 2>&1; then
            echo -e "${YELLOW}  停止进程: $pid${NC}"
            kill $pid 2>/dev/null || true
            echo -e "${GREEN} ✓ 已停止${NC}"
        fi
    done < "$PID_FILE"
    
    rm -f "$PID_FILE"
    echo -e "${GREEN}✓ PID 文件已清理${NC}"
fi

VITE_PIDS=$(pgrep -f "vite.*1420" || true)
if [ -n "$VITE_PIDS" ]; then
    for pid in $VITE_PIDS; do
        echo -e "${YELLOW}  停止 Vite: $pid${NC}"
        kill $pid 2>/dev/null || true
    done
fi

TAURI_PIDS=$(pgrep -f "tauri.*codemap" || true)
if [ -n "$TAURI_PIDS" ]; then
    for pid in $TAURI_PIDS; do
        echo -e "${YELLOW}  停止 Tauri: $pid${NC}"
        kill $pid 2>/dev/null || true
    done
fi

tmux has-session -t codemap 2>/dev/null && {
    tmux kill-session -t codemap 2>/dev/null || true
}

echo -e "${GREEN}✓ CodeMap 已完全停止${NC}"
