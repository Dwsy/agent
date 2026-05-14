/**
 * Goal v2 - 状态管理
 * 对齐 Codex codex-rs/state/src/runtime/goals.rs
 *
 * 状态持久化使用 Pi 的 appendEntry API
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GoalData, GoalStatus, GoalToolResponse } from "./types";
import { GOAL_STATE_ENTRY } from "./constants";

// ============================================================================
// 状态读取（对齐 Codex get_thread_goal）
// ============================================================================

/**
 * 获取当前目标状态
 * 从 session entries 中读取最新的 goal-state 条目
 */
export function getGoalState(ctx: ExtensionContext): GoalData | null {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as { type: string; customType?: string; data?: GoalData };
    if (entry.type === "custom" && entry.customType === GOAL_STATE_ENTRY && entry.data) {
      return entry.data;
    }
  }
  return null;
}

// ============================================================================
// 状态持久化（对齐 Codex replace_thread_goal / update_thread_goal）
// ============================================================================

/**
 * 持久化目标状态
 * 使用 Pi 的 appendEntry API 写入 session
 */
export function persistGoal(
  pi: { appendEntry: (type: string, data: unknown) => void },
  goal: GoalData
): void {
  pi.appendEntry(GOAL_STATE_ENTRY, goal);
}

/**
 * 清除目标状态
 * 写入 null 表示目标已清除
 */
export function clearGoal(
  pi: { appendEntry: (type: string, data: unknown) => void },
  ctx: ExtensionContext
): void {
  pi.appendEntry(GOAL_STATE_ENTRY, null);
  // 清除 UI widget
  if (ctx.hasUI) {
    ctx.ui.setWidget("goal", undefined);
  }
}

// ============================================================================
// 状态创建（对齐 Codex insert_thread_goal）
// ============================================================================

/**
 * 创建新目标
 * 仅在无目标时可用
 */
export function createGoalState(
  objective: string,
  tokenBudget?: number
): GoalData {
  const now = Date.now();
  return {
    objective,
    status: "pursuing",
    tokenBudget,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: now,
    updatedAt: now,
    loopCount: 0,
    lastLoopAt: now,
  };
}

/**
 * 更新目标状态
 * 对齐 Codex update_thread_goal
 */
export function updateGoalStatus(
  goal: GoalData,
  status: GoalStatus,
  options?: {
    tokensUsed?: number;
    timeUsedSeconds?: number;
    objective?: string;
  }
): GoalData {
  return {
    ...goal,
    status,
    tokensUsed: options?.tokensUsed ?? goal.tokensUsed,
    timeUsedSeconds: options?.timeUsedSeconds ?? goal.timeUsedSeconds,
    objective: options?.objective ?? goal.objective,
    updatedAt: Date.now(),
  };
}

/**
 * 增加循环计数
 */
export function incrementLoop(goal: GoalData): GoalData {
  return {
    ...goal,
    loopCount: goal.loopCount + 1,
    lastLoopAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================================
// 响应构建（对齐 Codex GoalToolResponse）
// ============================================================================

/**
 * 构建工具响应
 * 对齐 Codex goal.rs 中的 GoalToolResponse
 */
export function buildGoalResponse(
  goal: GoalData | null,
  includeCompletionReport: boolean = false
): GoalToolResponse {
  const remainingTokens = goal?.tokenBudget
    ? Math.max(0, goal.tokenBudget - goal.tokensUsed)
    : null;

  let completionBudgetReport: string | null = null;
  if (includeCompletionReport && goal?.status === "achieved") {
    const parts: string[] = [];
    if (goal.tokenBudget) {
      parts.push(`tokens used: ${goal.tokensUsed} of ${goal.tokenBudget}`);
    }
    if (goal.timeUsedSeconds > 0) {
      parts.push(`time used: ${goal.timeUsedSeconds} seconds`);
    }
    if (parts.length > 0) {
      completionBudgetReport = `Goal achieved. Report final budget usage to the user: ${parts.join("; ")}.`;
    }
  }

  return {
    goal,
    remainingTokens,
    completionBudgetReport,
  };
}

// ============================================================================
// Token 计算（对齐 Codex calculateTokensUsed）
// ============================================================================

/**
 * 计算已使用的 token
 * 对齐 Codex goals.rs 中的 token 计算逻辑
 */
export function calculateTokensUsed(
  ctx: ExtensionContext,
  sinceTimestamp: number
): number {
  let total = 0;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && (entry.message as { role?: string }).role === "assistant") {
      const msg = entry.message as { usage?: { input?: number; output?: number }; timestamp?: number };
      const ts = msg.timestamp ?? 0;
      if (ts >= sinceTimestamp && msg.usage) {
        total += (msg.usage.input ?? 0) + (msg.usage.output ?? 0);
      }
    }
  }
  return total;
}

/**
 * 计算已使用的时间（秒）
 */
export function calculateTimeUsed(goal: GoalData): number {
  if (goal.status === "paused" || goal.status === "achieved" || goal.status === "unmet") {
    return goal.timeUsedSeconds;
  }
  // 对于 pursuing 和 budget_limited，加上当前进行中的时间
  const elapsed = Math.floor((Date.now() - goal.updatedAt) / 1000);
  return goal.timeUsedSeconds + elapsed;
}

// ============================================================================
// 状态检查
// ============================================================================

/**
 * 检查目标是否处于活动状态
 */
export function isActiveGoal(goal: GoalData | null): boolean {
  return goal !== null && goal.status === "pursuing";
}

/**
 * 检查目标是否处于终态
 * 对齐 Codex ThreadGoalStatus::is_terminal()
 */
export function isTerminalGoal(goal: GoalData | null): boolean {
  return goal !== null && (goal.status === "budget_limited" || goal.status === "achieved" || goal.status === "unmet");
}

/**
 * 检查预算是否耗尽
 */
export function isBudgetExhausted(goal: GoalData): boolean {
  if (!goal.tokenBudget) return false;
  return goal.tokensUsed >= goal.tokenBudget;
}

/**
 * 检查是否接近预算限制（80%）
 */
export function isNearBudgetLimit(goal: GoalData): boolean {
  if (!goal.tokenBudget) return false;
  return goal.tokensUsed >= goal.tokenBudget * 0.8;
}
