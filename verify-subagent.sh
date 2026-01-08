#!/bin/bash

echo "========================================="
echo "Subagent 原生集成验证"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0

# 测试函数
test_item() {
    local name="$1"
    local command="$2"

    echo -n "测试: $name ... "
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASS++))
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((FAIL++))
    fi
}

# 扩展文件
echo "1. 扩展文件验证"
echo "-----------------------------------"
test_item "extensions/subagent/index.ts 存在" "[ -f $HOME/.pi/agent/extensions/subagent/index.ts ]"
test_item "extensions/subagent/agents.ts 存在" "[ -f $HOME/.pi/agent/extensions/subagent/agents.ts ]"
echo ""

# 代理定义
echo "2. 代理定义验证"
echo "-----------------------------------"
test_item "agents/scout.md 存在" "[ -f $HOME/.pi/agent/agents/scout.md ]"
test_item "agents/planner.md 存在" "[ -f $HOME/.pi/agent/agents/planner.md ]"
test_item "agents/reviewer.md 存在" "[ -f $HOME/.pi/agent/agents/reviewer.md ]"
test_item "agents/worker.md 存在" "[ -f $HOME/.pi/agent/agents/worker.md ]"
echo ""

# 配置文件
echo "3. 配置文件验证"
echo "-----------------------------------"
test_item "subagent-config.md 存在" "[ -f $HOME/.pi/agent/subagent-config.md ]"
test_item "SYSTEM.md 包含 subagent 扩展" "grep -q 'subagent' $HOME/.pi/agent/SYSTEM.md"
echo ""

# 语法检查
echo "4. 语法检查"
echo "-----------------------------------"
test_item "agents.ts 语法正确" "node -c $HOME/.pi/agent/extensions/subagent/agents.ts"
echo ""

# YAML 解析
echo "5. YAML frontmatter 验证"
echo "-----------------------------------"
test_item "scout.md 包含 name 字段" "grep -q '^name:' $HOME/.pi/agent/agents/scout.md"
test_item "scout.md 不包含 model 字段（使用默认值）" "! grep -q '^model:' $HOME/.pi/agent/agents/scout.md"
test_item "scout.md 包含 ace-tool 工具" "grep -q 'ace-tool' $HOME/.pi/agent/agents/scout.md"
echo ""

# 模型配置验证
echo "6. 模型配置验证"
echo "-----------------------------------"
test_item "agents.ts 包含默认模型配置" "grep -q 'claude-opus-4-5-thinking' $HOME/.pi/agent/extensions/subagent/agents.ts"
test_item "agents.ts 包含 glm-4.7 配置" "grep -q 'glm-4.7' $HOME/.pi/agent/extensions/subagent/agents.ts"
test_item "agents.ts 包含 gemini-3-pro-high 配置" "grep -q 'gemini-3-pro-high' $HOME/.pi/agent/extensions/subagent/agents.ts"
echo ""

# 总结
echo "========================================="
echo "测试总结"
echo "========================================="
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！${NC}"
    echo ""
    echo "默认模型配置："
    echo "  scout  → glm-4.7 (快速侦察)"
    echo "  planner → claude-opus-4-5-thinking (推理能力强)"
    echo "  reviewer → gemini-3-pro-high (审查能力强)"
    echo "  worker → glm-4.7 (通用任务)"
    echo ""
    echo "环境变量覆盖："
    echo "  export MODEL_SCOUT=\"glm-4.7\""
    echo "  export MODEL_PLANNER=\"claude-opus-4-5-thinking\""
    echo "  export MODEL_REVIEWER=\"gemini-3-pro-high\""
    echo "  export MODEL_WORKER=\"glm-4.7\""
    echo ""
    echo "在 Pi Agent 中使用："
    echo "  /implement add feature"
    echo "  /scout-and-plan analyze code"
    echo "  /implement-and-review review code"
    echo ""
    echo "查看详细文档："
    echo "  cat ~/.pi/agent/subagent.md"
    exit 0
else
    echo -e "${RED}✗ 有 $FAIL 个测试失败！${NC}"
    exit 1
fi