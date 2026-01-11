#!/bin/bash

# CodeMap 一键启动脚本
# 只启动 Tauri（会自动启动前端）

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
CLIENT_DIR="$PROJECT_ROOT/client"
LOG_DIR="$PROJECT_ROOT/logs"
PID_FILE="$PROJECT_ROOT/.pids"

# 日志文件
BACKEND_LOG="$PROJECT_ROOT/logs/backend.log"

# 进程 ID
TAURI_PID=""

# 清理函数
cleanup() {
    echo -e "\n${YELLOW}正在停止进程...${NC}"
    
    if [ -n "$TAURI_PID" ]; then
        kill $TAURI_PID 2>/dev/null || true
        echo -e "${GREEN}✓ 已停止 Tauri 进程 (PID: $TAURI_PID)${NC}"
    fi
    
    # 清理 PID 文件
    [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    echo -e "${GREEN}✓ 已清理 PID 文件${NC}"
    
    # 清理 tmux session
    tmux has-session -t codemap 2>/dev/null && {
        tmux kill-session -t codemap 2>/dev/null || true
        echo -e "${GREEN}✓ 已清理 tmux session${NC}"
    }
    
    exit 0
}

# 捕获退出信号
trap cleanup SIGINT SIGTERM

# 创建必要目录
mkdir -p "$LOG_DIR"
mkdir -p "$HOME/.codemap/.pids"

# 停止已存在的进程
echo -e "${BLUE}检查并停止现有进程...${NC}"
if [ -f "$PID_FILE" ]; then
    while IFS= read pid; do
        if ps -p $pid > /dev/null 2>&1; then
            echo -e "${YELLOW}  停止现有进程: $pid${NC}"
            kill $pid 2>/dev/null || true
            echo -e "${GREEN} ✓ 已停止${NC}"
        fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
fi

# 检查端口占用
echo -e "${BLUE}检查端口占用...${NC}"
if lsof -i:1420 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "${YELLOW}端口 1420 被占用，尝试清理...${NC}"
    lsof -ti:1420 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# 启动后端（Tauri）
echo -e "${BLUE}🚀 启动 Tauri（会自动启动前端）...${NC}"
cd "$CLIENT_DIR"
pnpm run tauri:dev > "$BACKEND_LOG" 2>&1 &
TAURI_PID=$!
echo $TAURI_PID >> "$PID_FILE"
echo -e "${GREEN}✓ Tauri 后端已启动 (PID: $TAURI_PID)${NC}"
echo -e "   日志: $BACKEND_LOG"
echo -e "   Tauri 窗口将自动打开前端界面"
echo ""

# 等待 Tauri 启动
sleep 8

# 检查 Tauri 是否成功启动
if ! ps -p $TAURI_PID > /dev/null 2>&1; then
    echo -e "${RED}✗ Tauri 启动失败！${NC}"
    tail -20 "$BACKEND_LOG"
    cleanup
fi

# 显示启动信息
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              CodeMap 开发环境已启动                       ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Tauri 窗口已打开（包含前端）                      ║${NC}"
echo -e "${GREEN}║  地址: http://localhost:1420/                       ║${GREEN}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  PID - Tauri: $TAURI_PID                                 ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}提示: 按 Ctrl+C 停止进程${NC}"
echo -e "${YELLOW}后端日志: tail -f $BACKEND_LOG${NC}"
echo ""

# 保持脚本运行
wait