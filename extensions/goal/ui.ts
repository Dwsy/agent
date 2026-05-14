/**
 * Goal v2 - UI 组件
 * 对齐 Codex codex-rs/tui/src/goal_display.rs 和 goal_status.rs
 *
 * 功能：
 * 1. updateGoalWidget - 状态栏指示器
 * 2. formatGoalElapsedSeconds - 时间格式化
 * 3. formatTokensCompact - token 格式化
 * 4. goalUsageSummary - 目标摘要
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GoalData, GoalStatus } from "./types";
import {
  GOAL_STATUS_ICONS,
  GOAL_STATUS_LABELS,
  WIDGET_MAX_OBJECTIVE_LENGTH,
  TIME_UNITS,
} from "./constants";

// ============================================================================
// 状态栏 Widget（对齐 Codex goal_status.rs）
// ============================================================================

/**
 * 更新目标 widget（状态栏显示）
 * 对齐 Codex goal_status.rs GoalStatusIndicator
 */
export function updateGoalWidget(ctx: ExtensionContext, goal: GoalData | null): void {
  if (!ctx.hasUI) return;

  if (!goal) {
    ctx.ui.setWidget("goal", undefined);
    return;
  }

  const icon = GOAL_STATUS_ICONS[goal.status] ?? "🎯";
  const obj =
    goal.objective.length > WIDGET_MAX_OBJECTIVE_LENGTH
      ? goal.objective.slice(0, WIDGET_MAX_OBJECTIVE_LENGTH - 3) + "..."
      : goal.objective;

  // 构建进度信息
  let progress: string;
  if (goal.tokenBudget) {
    progress = ` ${formatTokensCompact(goal.tokensUsed)}/${formatTokensCompact(goal.tokenBudget)}`;
  } else if (goal.timeUsedSeconds > 0) {
    progress = ` ${formatGoalElapsedSeconds(goal.timeUsedSeconds)}`;
  } else {
    progress = "";
  }

  const text = `${icon} ${obj}${progress} #${goal.loopCount}`;
  ctx.ui.setWidget("goal", [ctx.ui.theme.fg("accent", text)]);
}

// ============================================================================
// 时间格式化（对齐 Codex goal_display.rs format_goal_elapsed_seconds）
// ============================================================================

/**
 * 格式化时间（秒）为人类可读格式
 * 对齐 Codex goal_display.rs format_goal_elapsed_seconds
 */
export function formatGoalElapsedSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));

  if (s < TIME_UNITS.MINUTE) {
    return `${s}s`;
  }

  const m = Math.floor(s / TIME_UNITS.MINUTE);
  if (m < TIME_UNITS.HOUR / TIME_UNITS.MINUTE) {
    return `${m}m`;
  }

  const h = Math.floor(m / (TIME_UNITS.HOUR / TIME_UNITS.MINUTE));
  const rm = m % (TIME_UNITS.HOUR / TIME_UNITS.MINUTE);

  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h ${rm}m`;
  }

  return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
}

// ============================================================================
// Token 格式化（对齐 Codex status.rs format_tokens_compact）
// ============================================================================

/**
 * 格式化 token 数量（紧凑格式）
 * 对齐 Codex status.rs format_tokens_compact
 */
export function formatTokensCompact(tokens: number): string {
  const abs = Math.abs(tokens);
  if (abs < 1000) return String(tokens);
  if (abs < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}

// ============================================================================
// 目标摘要（对齐 Codex goal_display.rs goal_usage_summary）
// ============================================================================

/**
 * 生成目标使用摘要
 * 对齐 Codex goal_display.rs goal_usage_summary
 */
export function goalUsageSummary(goal: GoalData): string {
  const parts: string[] = [];

  parts.push(`Objective: ${goal.objective}`);

  if (goal.timeUsedSeconds > 0) {
    parts.push(`Time: ${formatGoalElapsedSeconds(goal.timeUsedSeconds)}.`);
  }

  if (goal.tokenBudget) {
    parts.push(
      `Tokens: ${formatTokensCompact(goal.tokensUsed)}/${formatTokensCompact(goal.tokenBudget)}.`
    );
  }

  return parts.join(" ");
}

// ============================================================================
// 状态标签（对齐 Codex goal_display.rs goal_status_label）
// ============================================================================

/**
 * 获取状态标签
 * 对齐 Codex goal_display.rs goal_status_label
 */
export function goalStatusLabel(status: GoalStatus): string {
  return GOAL_STATUS_LABELS[status] ?? status;
}

/**
 * 获取状态图标
 */
export function goalStatusIcon(status: GoalStatus): string {
  return GOAL_STATUS_ICONS[status] ?? "🎯";
}

// ============================================================================
// 格式化目标详情
// ============================================================================

/**
 * 格式化目标详情（用于 /goal status 命令）
 */
export function formatGoalDetails(goal: GoalData): string {
  const lines: string[] = [];

  lines.push(`📋 Goal Status`);
  lines.push(`Status: ${goalStatusLabel(goal.status)}`);
  lines.push(`Objective: ${goal.objective}`);
  lines.push(`Time: ${formatGoalElapsedSeconds(goal.timeUsedSeconds)}`);
  lines.push(`Tokens: ${formatTokensCompact(goal.tokensUsed)}`);

  if (goal.tokenBudget) {
    lines.push(`Budget: ${formatTokensCompact(goal.tokenBudget)}`);
    const remaining = Math.max(0, goal.tokenBudget - goal.tokensUsed);
    lines.push(`Remaining: ${formatTokensCompact(remaining)}`);
  }

  lines.push(`Loops: ${goal.loopCount}`);

  return lines.join("\n");
}

/**
 * 格式化预算报告（用于 update_goal 完成时）
 */
export function formatBudgetReport(goal: GoalData): string {
  const parts: string[] = [];

  if (goal.tokenBudget) {
    parts.push(`tokens used: ${goal.tokensUsed} of ${goal.tokenBudget}`);
  }

  if (goal.timeUsedSeconds > 0) {
    parts.push(`time used: ${goal.timeUsedSeconds} seconds`);
  }

  if (parts.length === 0) return "";

  return `Goal achieved. Report final budget usage to the user: ${parts.join("; ")}.`;
}
