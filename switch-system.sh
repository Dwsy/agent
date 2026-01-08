#!/bin/bash
# SYSTEM.md 版本切换脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SYSTEM_FILE="$SCRIPT_DIR/SYSTEM.md"
ORIGINAL_FILE="$SCRIPT_DIR/SYSTEM_ORIGINAL.md"
REFINED_FILE="$SCRIPT_DIR/SYSTEM_REFINED.md"
LOSSLESS_FILE="$SCRIPT_DIR/SYSTEM_LOSSLESS.md"
FINAL_FILE="$SCRIPT_DIR/SYSTEM_FINAL.md"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 显示当前版本
show_current() {
    echo -e "${GREEN}当前版本：${NC}"
    ls -lh "$SYSTEM_FILE"
    echo ""
}

# 显示所有版本
show_versions() {
    echo -e "${YELLOW}可用版本：${NC}"
    echo ""
    echo "1. SYSTEM.md (当前使用)"
    ls -lh "$SYSTEM_FILE" 2>/dev/null || echo "  不存在"
    echo ""
    echo "2. SYSTEM_REFINED.md (精炼优化版)"
    ls -lh "$REFINED_FILE" 2>/dev/null || echo "  不存在"
    echo ""
    echo "3. SYSTEM_LOSSLESS.md (无损压缩版)"
    ls -lh "$LOSSLESS_FILE" 2>/dev/null || echo "  不存在"
    echo ""
    echo "4. SYSTEM_FINAL.md (最终优化版) ⭐ 推荐"
    ls -lh "$FINAL_FILE" 2>/dev/null || echo "  不存在"
    echo ""
    echo "5. SYSTEM_ORIGINAL.md (原始版本)"
    ls -lh "$ORIGINAL_FILE" 2>/dev/null || echo "  不存在"
    echo ""
}

# 切换到精炼版本
switch_to_refined() {
    if [ ! -f "$REFINED_FILE" ]; then
        echo -e "${RED}错误：SYSTEM_REFINED.md 不存在${NC}"
        exit 1
    fi
    cp "$REFINED_FILE" "$SYSTEM_FILE"
    echo -e "${GREEN}✓ 已切换到精炼优化版${NC}"
    show_current
}

# 切换到无损压缩版
switch_to_lossless() {
    if [ ! -f "$LOSSLESS_FILE" ]; then
        echo -e "${RED}错误：SYSTEM_LOSSLESS.md 不存在${NC}"
        exit 1
    fi
    cp "$LOSSLESS_FILE" "$SYSTEM_FILE"
    echo -e "${GREEN}✓ 已切换到无损压缩版${NC}"
    show_current
}

# 切换到原始版本
switch_to_original() {
    if [ ! -f "$ORIGINAL_FILE" ]; then
        echo -e "${RED}错误：SYSTEM_ORIGINAL.md 不存在${NC}"
        exit 1
    fi
    cp "$ORIGINAL_FILE" "$SYSTEM_FILE"
    echo -e "${GREEN}✓ 已切换到原始版本${NC}"
    show_current
}

# 切换到最终优化版
switch_to_final() {
    if [ ! -f "$FINAL_FILE" ]; then
        echo -e "${RED}错误：SYSTEM_FINAL.md 不存在${NC}"
        exit 1
    fi
    cp "$FINAL_FILE" "$SYSTEM_FILE"
    echo -e "${GREEN}✓ 已切换到最终优化版${NC}"
    show_current
}

# 显示帮助
show_help() {
    echo "SYSTEM.md 版本切换脚本"
    echo ""
    echo "用法："
    echo "  $0 [命令]"
    echo ""
    echo "命令："
    echo "  final      切换到最终优化版（推荐）"
    echo "  refined    切换到精炼优化版"
    echo "  lossless   切换到无损压缩版"
    echo "  original   切换到原始版本"
    echo "  current    显示当前版本"
    echo "  versions   显示所有可用版本"
    echo "  help       显示此帮助信息"
    echo ""
    echo "示例："
    echo "  $0 final     # 切换到最终优化版（推荐）"
    echo "  $0 original  # 切换到原始版本"
    echo "  $0 current   # 查看当前版本"
}

# 主逻辑
case "${1:-}" in
    refined)
        switch_to_refined
        ;;
    original)
        switch_to_original
        ;;
    lossless)
        switch_to_lossless
        ;;
    final)
        switch_to_final
        ;;
    current)
        show_current
        ;;
    versions)
        show_versions
        ;;
    help|--help|-h)
        show_help
        ;;
    "")
        show_versions
        echo -e "${YELLOW}提示：使用 '$0 final' 切换到最终优化版${NC}"
        ;;
    *)
        echo -e "${RED}错误：未知命令 '$1'${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac