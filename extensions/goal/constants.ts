/**
 * Goal v2 - 常量配置
 * 对齐 Codex codex-rs/core/src/goals.rs 和 codex-rs/tui/src/chatwidget/goal_validation.rs
 */

// ============================================================================
// 预算警告阈值
// ============================================================================

/**
 * 预算警告比例（80%）
 * 当 token 使用达到预算的 80% 时触发警告
 */
export const BUDGET_WARN_RATIO = 0.8;

// ============================================================================
// 卡住检测
// ============================================================================

/**
 * 卡住检测阈值（5 分钟）
 * 超过 5 分钟无进展视为卡住
 */
export const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

// ============================================================================
// 输入验证（对齐 Codex MAX_THREAD_GOAL_OBJECTIVE_CHARS）
// ============================================================================

/**
 * 目标描述最大字符数
 * 对齐 Codex codex_protocol::protocol::MAX_THREAD_GOAL_OBJECTIVE_CHARS
 */
export const MAX_OBJECTIVE_CHARS = 1000;

/**
 * 文件引用提示（当目标过长时）
 * 对齐 Codex goal_validation.rs GOAL_TOO_LONG_FILE_HINT
 */
export const GOAL_TOO_LONG_FILE_HINT =
  "Put longer instructions in a file and refer to that file in the goal, for example: /goal follow the instructions in docs/goal.md.";

// ============================================================================
// 状态常量
// ============================================================================

/**
 * Session entry 类型标识
 */
export const GOAL_STATE_ENTRY = "goal-state";

/**
 * 目标 continuation 消息类型
 */
export const GOAL_CONTINUATION_TYPE = "goal-continuation";

/**
 * 目标预算限制消息类型
 */
export const GOAL_BUDGET_LIMIT_TYPE = "goal-budget-limit";

/**
 * 目标卡住消息类型
 */
export const GOAL_STUCK_TYPE = "goal-stuck";

/**
 * 目标更新消息类型
 */
export const GOAL_OBJECTIVE_UPDATED_TYPE = "goal-objective-updated";

// ============================================================================
// UI 常量
// ============================================================================

/**
 * 状态栏目标摘要最大显示长度
 */
export const WIDGET_MAX_OBJECTIVE_LENGTH = 35;

/**
 * 状态图标映射
 */
export const GOAL_STATUS_ICONS: Record<string, string> = {
  pursuing: "🎯",
  paused: "⏸️",
  budget_limited: "💰",
  achieved: "✅",
  unmet: "❌",
};

/**
 * 状态标签映射（对齐 Codex goal_display.rs）
 */
export const GOAL_STATUS_LABELS: Record<string, string> = {
  pursuing: "active",
  paused: "paused",
  budget_limited: "limited by budget",
  achieved: "complete",
  unmet: "blocked",
};

// ============================================================================
// 时间格式化常量
// ============================================================================

/**
 * 时间单位（秒）
 */
export const TIME_UNITS = {
  SECOND: 1,
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400,
} as const;

// ============================================================================
// 模板变量占位符
// ============================================================================

/**
 * 模板变量名
 */
export const TEMPLATE_VARS = {
  OBJECTIVE: "objective",
  TOKENS_USED: "tokens_used",
  TOKEN_BUDGET: "token_budget",
  REMAINING_TOKENS: "remaining_tokens",
  TIME_USED_SECONDS: "time_used_seconds",
  LOOP_COUNT: "loop_count",
} as const;
