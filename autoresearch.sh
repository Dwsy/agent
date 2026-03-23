#!/bin/bash
# Autoresearch: 记忆系统分层与质量优化
# 测量记忆系统质量评分

set -euo pipefail

ROLE_PATH="${HOME}/.pi/roles/zero"
MEMORY_DIR="${ROLE_PATH}/memory"
CONSOLIDATED="${MEMORY_DIR}/consolidated.md"
PENDING="${MEMORY_DIR}/pending.md"
DAILY_DIR="${MEMORY_DIR}/daily"

# ============================================================
# 评分函数
# ============================================================

calculate_memory_score() {
  local score=0
  local dedup_ratio=0
  local pending_exists=0
  local consolidated_count=0
  local daily_count=0
  
  # 1. Pending 层存在性 (20分)
  if [[ -f "$PENDING" ]] && [[ -s "$PENDING" ]]; then
    score=$((score + 20))
    pending_exists=1
  fi
  
  # 2. 读取 consolidated 分析
  if [[ -f "$CONSOLIDATED" ]]; then
    # 统计各类型记忆数量
    local learnings=$(grep -c "^\- \[" "$CONSOLIDATED" 2>/dev/null || echo 0)
    local preferences=$(grep -c "^# Preferences:" "$CONSOLIDATED" 2>/dev/null || echo 0)
    local events=$(grep -c "^## \[" "$CONSOLIDATED" 2>/dev/null || echo 0)
    consolidated_count=$((learnings + preferences + events))
    
    # 记忆分类准确性 (20分)
    # 有三种类型且分布合理给满分
    if [[ $learnings -gt 0 ]] && [[ $preferences -gt 0 ]] && [[ $events -gt 0 ]]; then
      score=$((score + 20))
    elif [[ $learnings -gt 0 ]] && [[ $preferences -gt 0 ]]; then
      score=$((score + 15))
    elif [[ $learnings -gt 0 ]]; then
      score=$((score + 10))
    fi
  fi
  
  # 3. 去重有效性 (30分)
  # 检查是否有重复的记忆条目（简单检查：相同 [Nx] 前缀）
  if [[ -f "$CONSOLIDATED" ]]; then
    local total_lines=$(grep -c "^\- \[" "$CONSOLIDATED" 2>/dev/null || echo 0)
    local unique_lines=$(grep "^\- \[" "$CONSOLIDATED" 2>/dev/null | sort -u | wc -l || echo 0)
    
    if [[ $total_lines -gt 0 ]]; then
      dedup_ratio=$(echo "scale=2; $unique_lines / $total_lines" | bc)
      local dedup_score=$(echo "scale=0; $dedup_ratio * 30 / 1" | bc)
      score=$((score + dedup_score))
    fi
  fi
  
  # 4. 使用驱动提升率 (30分)
  # 检查 reinforced 记忆的比例（used >= 1 表示被使用过）
  if [[ -f "$CONSOLIDATED" ]]; then
    local reinforced=$(grep -c "^\- \[*[1-9]" "$CONSOLIDATED" 2>/dev/null || echo 0)
    local total=$(grep -c "^\- \[" "$CONSOLIDATED" 2>/dev/null || echo 0)
    
    if [[ $total -gt 0 ]]; then
      local reinforce_ratio=$(echo "scale=2; $reinforced / $total" | bc)
      local reinforce_score=$(echo "scale=0; $reinforce_ratio * 30 / 1" | bc)
      score=$((score + reinforce_score))
    else
      # 没有记忆，给使用驱动部分基础分
      score=$((score + 5))
    fi
  fi
  
  echo $score
}

count_daily_memories() {
  local count=0
  if [[ -d "$DAILY_DIR" ]]; then
    # 统计 daily 目录下所有 .md 文件的行数
    count=$(find "$DAILY_DIR" -name "*.md" -exec cat {} \; 2>/dev/null | grep -c "## \[" || echo 0)
  fi
  echo $count
}

count_consolidated_memories() {
  local count=0
  if [[ -f "$CONSOLIDATED" ]]; then
    count=$(grep -c "^\- \[" "$CONSOLIDATED" 2>/dev/null || echo 0)
  fi
  echo $count
}

count_pending_memories() {
  local count=0
  if [[ -f "$PENDING" ]] && [[ -s "$PENDING" ]]; then
    local raw=$(grep -c "^\- \[" "$PENDING" 2>/dev/null || echo 0)
    count=${raw//[^0-9]/}
    [[ -z "$count" ]] && count=0
  fi
  echo $count
}

calculate_promotion_rate() {
  local rate=0.0
  if [[ -f "$PENDING" ]] && [[ -s "$PENDING" ]]; then
    local raw_total=$(grep -c "^\- \[" "$PENDING" 2>/dev/null || echo 0)
    local raw_promoted=$(grep -c "^\- \[✓\]" "$PENDING" 2>/dev/null || echo 0)
    local total=${raw_total//[^0-9]/}
    local promoted=${raw_promoted//[^0-9]/}
    [[ -z "$total" ]] && total=0
    [[ -z "$promoted" ]] && promoted=0
    
    if [[ $total -gt 0 ]]; then
      rate=$(echo "scale=2; $promoted / $total" | bc)
    fi
  fi
  echo $rate
}

calculate_dedup_ratio() {
  local ratio=0.0
  if [[ -f "$CONSOLIDATED" ]]; then
    local total=$(grep -c "^\- \[" "$CONSOLIDATED" 2>/dev/null || echo 0)
    local unique=$(grep "^\- \[" "$CONSOLIDATED" 2>/dev/null | sort -u | wc -l || echo 0)
    
    if [[ $total -gt 0 ]]; then
      ratio=$(echo "scale=2; $unique / $total" | bc)
    fi
  fi
  echo $ratio
}

# ============================================================
# 主程序
# ============================================================

# 确保 role 路径存在
if [[ ! -d "$ROLE_PATH" ]]; then
  echo "Role path not found: $ROLE_PATH"
  exit 1
fi

# 计算指标
memory_score=$(calculate_memory_score)
daily_count=$(count_daily_memories)
consolidated_count=$(count_consolidated_memories)
pending_count=$(count_pending_memories)
dedup_ratio=$(calculate_dedup_ratio)
promotion_rate=$(calculate_promotion_rate)

# 输出结构化指标
echo "METRIC memory_score=${memory_score}"
echo "METRIC daily_count=${daily_count}"
echo "METRIC consolidated_count=${consolidated_count}"
echo "METRIC pending_count=${pending_count}"
echo "METRIC dedup_ratio=${dedup_ratio}"
echo "METRIC promotion_rate=${promotion_rate}"
