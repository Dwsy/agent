#!/bin/bash

# CodeMap 启动/停止脚本
# 使用方法: ./run.sh [start|stop|restart|status]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STOP_SCRIPT="$SCRIPT_DIR/stop.sh"
START_SCRIPT="$SCRIPT_DIR/start.sh"

# 显示帮助信息
show_help() {
    echo -e "${CYAN}CodeMap 控制脚本${NC}"
    echo ""
    echo -e "使用方法:"
    echo -e "  $0 ${GREEN}start${NC}     - 启动 CodeMap（前端+后端）"
    echo -e "  $0 ${GREEN}stop${NC}      - 停止所有 CodeMap 进程"
    echo -e "  $0 ${GREEN}restart${NC}   - 重启 CodeMap"
    echo -e "  $0 ${GREEN}status${NC}    - 查看运行状态"
    echo -e "  $0 ${GREEN}logs${NC}      - 查看日志"
    echo -e "  $0 ${GREEN}help${NC}      - 显示此帮助信息"
    echo ""
    echo -e "${YELLOW}快捷键: Ctrl+C 停止所有进程${NC}"
}

# 查看状态
show_status() {
    echo -e "${CYAN}CodeMap 运行状态${NC}"
    echo ""
    
    # 检查 Vite 进程
    VITE_PIDS=$(pgrep -f "vite.*1420" || echo "")
    if [ -n "$VITE_PIDS" ]; then
        echo -e "${GREEN}✓ 前端运行中 (Vite)${NC}"
        for pid in $VITE_PIDS; do
            echo -e "   PID: $pid"
        done
    else
        echo -e "${RED}✗ 前端未运行${NC}"
    fi
    echo ""
    
    # 检查 Tauri 进程
    TAURI_PIDS=$(pgrep -f "tauri.*codemap" || echo "")
    if [ -n "$TAURI_PIDS" ]; then
        echo -e "${GREEN}✓ 后端运行中 (Tauri)${NC}"
        for pid in $TAURI_PIDS; do
            echo -e "   PID: $pid"
        done
    else
        echo -e "${RED}✗ 后端未运行${NC}"
    fi
    echo ""
    
    # 检查端口占用
    echo -e "${CYAN}端口占用情况${NC}"
    if command -v lsof &> /dev/null; then
        echo -e "端口 1420: $(lsof -ti:1420 || echo '未占用')"
        echo -e "端口 8080: $(lsof -ti:8080 || echo '未占用')"
    fi
    echo ""
}

# 查看日志
show_logs() {
    LOG_DIR="$HOME/.codemap/logs"
    
    if [ ! -d "$LOG_DIR" ]; then
        echo -e "${RED}✗ 日志目录不存在: $LOG_DIR${NC}"
        return 1
    fi
    
    echo -e "${CYAN}CodeMap 日志${NC}"
    echo ""
    
    FRONTEND_LOG="$LOG_DIR/frontend.log"
    BACKEND_LOG="$LOG_DIR/backend.log"
    
    if [ ! -f "$FRONTEND_LOG" ]; then
        echo -e "${YELLOW}前端日志不存在: $FRONTEND_LOG${NC}"
        return 1
    fi
    
    echo -e "${BLUE}前端日志 (tail -f)${NC}"
    echo -e "文件: $FRONTEND_LOG"
    echo ""
    echo -e "${YELLOW}按 Ctrl+C 退出日志查看${NC}"
    echo ""
    
    tail -f "$FRONTEND_LOG" &
    TAIL_PID=$!
    
    trap "kill $TAIL_PID 2>/dev/null || true" INT TERM
    
    wait $TAIL_PID
}

# 主逻辑
case "${1:-help}" in
    start)
        echo -e "${CYAN}启动 CodeMap...${NC}"
        bash "$START_SCRIPT"
        ;;
    stop)
        echo -e "${CYAN}停止 CodeMap...${NC}"
        bash "$STOP_SCRIPT"
        ;;
    restart)
        echo -e "${CYAN}重启 CodeMap...${NC}"
        bash "$STOP_SCRIPT"
        sleep 2
        bash "$START_SCRIPT"
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    *)
        show_help
        ;;
esac

exit 0
