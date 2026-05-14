/**
 * Goal v2 - 类型定义
 * 对齐 Codex codex-rs/state/src/model/thread_goal.rs
 */

// ============================================================================
// 状态枚举（对齐 Codex ThreadGoalStatus）
// ============================================================================

/**
 * 目标状态
 * - pursuing: 正在执行（对应 Codex Active）
 * - paused: 已暂停
 * - budget_limited: 预算耗尽（系统自动）
 * - achieved: 已完成（工具调用）
 * - unmet: 阻塞/未完成（Pi 独有，由 blocked 状态触发）
 */
export type GoalStatus = "pursuing" | "paused" | "budget_limited" | "achieved" | "unmet";

// ============================================================================
// 核心数据结构（对齐 Codex ThreadGoal）
// ============================================================================

/**
 * 目标数据
 * 对齐 Codex ThreadGoal 结构
 */
export interface GoalData {
  /** 目标描述 */
  objective: string;
  /** 当前状态 */
  status: GoalStatus;
  /** Token 预算（可选） */
  tokenBudget?: number;
  /** 已使用 token */
  tokensUsed: number;
  /** 已使用时间（秒） */
  timeUsedSeconds: number;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 更新时间戳（毫秒） */
  updatedAt: number;
  /** 循环次数 */
  loopCount: number;
  /** 上次循环时间戳（毫秒） */
  lastLoopAt: number;
}

// ============================================================================
// 工具响应（对齐 Codex GoalToolResponse）
// ============================================================================

/**
 * 工具响应格式
 * 对齐 Codex goal.rs 中的 GoalToolResponse
 */
export interface GoalToolResponse {
  /** 当前目标（可能为空） */
  goal: GoalData | null;
  /** 剩余 token 预算 */
  remainingTokens: number | null;
  /** 完成预算报告（仅 achieved 状态时返回） */
  completionBudgetReport: string | null;
}

// ============================================================================
// 工具参数
// ============================================================================

/**
 * create_goal 工具参数
 */
export interface CreateGoalArgs {
  /** 目标描述（必填） */
  objective: string;
  /** Token 预算（可选） */
  token_budget?: number;
}

/**
 * update_goal 工具参数
 * 注意：Codex 仅支持 status="complete"，Pi 扩展支持 "blocked"
 */
export interface UpdateGoalArgs {
  /** 目标状态 */
  status: "complete" | "blocked";
  /** 简要说明（可选） */
  summary?: string;
}

/**
 * get_goal 工具参数（无参数）
 */
export type GetGoalArgs = Record<string, never>;

// ============================================================================
// 辅助类型
// ============================================================================

/**
 * 目标会计快照（用于并发安全）
 */
export interface GoalAccountingSnapshot {
  turnId: string;
  tokenUsage: {
    input: number;
    output: number;
  };
}

/**
 * 目标事件类型
 */
export type GoalEventType =
  | "created"
  | "updated"
  | "paused"
  | "resumed"
  | "completed"
  | "blocked"
  | "budget_limited";

/**
 * 目标事件
 */
export interface GoalEvent {
  type: GoalEventType;
  timestamp: number;
  goalId?: string;
  metadata?: Record<string, unknown>;
}
