/**
 * Goal v2 - 命令注册
 * 对齐 Codex codex-rs/tui/src/chatwidget/goal_menu.rs
 *
 * /goal 命令及子命令：
 * - /goal <objective> - 设置新目标
 * - /goal pause - 暂停目标
 * - /goal resume - 恢复目标
 * - /goal clear - 清除目标
 * - /goal status - 查看状态
 * - /goal edit - 修改目标描述
 */

import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { GoalData } from "./types";
import {
  getGoalState,
  persistGoal,
  clearGoal,
  updateGoalStatus,
  incrementLoop,
  calculateTimeUsed,
} from "./state";
import { updateGoalWidget, formatGoalElapsedSeconds, formatTokensCompact } from "./ui";
import {
  buildContinuationPrompt,
  buildObjectiveUpdatedPrompt,
} from "./prompts";
import {
  GOAL_CONTINUATION_TYPE,
  GOAL_OBJECTIVE_UPDATED_TYPE,
  MAX_OBJECTIVE_CHARS,
  GOAL_TOO_LONG_FILE_HINT,
} from "./constants";

// ============================================================================
// 命令注册
// ============================================================================

/**
 * 注册 /goal 命令
 * 对齐 Codex goal_menu.rs 和 thread_goal_actions.rs
 */
export function registerGoalCommand(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  pi.registerCommand("goal", {
    description:
      "Set goal, pause/resume/clear/status/edit. Usage: /goal <objective> | /goal pause | /goal resume | /goal clear | /goal status | /goal edit",
    getArgumentCompletions: (prefix) => {
      const subs = [
        { value: "pause", label: "pause - Pause current goal" },
        { value: "resume", label: "resume - Resume paused goal" },
        { value: "clear", label: "clear - Clear goal" },
        { value: "status", label: "status - Show goal status" },
        { value: "edit", label: "edit - Edit goal objective" },
      ];
      return subs
        .filter((s) => s.value.startsWith(prefix.toLowerCase()))
        .map((s) => ({ value: s.value, label: s.label }));
    },
    handler: async (args, ctx) => {
      const sub = args?.trim().toLowerCase();

      // 获取当前目标
      const goal = getGoalState(ctx);
      goalStateRef.current = goal;

      // 已有目标时处理子命令
      if (goal) {
        switch (sub) {
          case "pause":
            await handlePause(pi, goalStateRef, ctx, goal);
            return;
          case "resume":
            await handleResume(pi, goalStateRef, ctx, goal);
            return;
          case "clear":
            handleClear(pi, goalStateRef, ctx);
            return;
          case "status":
          case "":
            handleStatus(ctx, goal);
            return;
          case "edit":
            await handleEdit(pi, goalStateRef, ctx, goal);
            return;
        }
      }

      // 无目标时，处理设置新目标
      if (!sub) {
        ctx.ui.notify(
          "Usage: /goal <objective>\nSubcommands: /goal pause | /goal resume | /goal clear | /goal status | /goal edit",
          "warning"
        );
        return;
      }

      // 验证目标长度
      if (sub.length > MAX_OBJECTIVE_CHARS) {
        ctx.ui.notify(
          `Goal objective too long: ${sub.length} chars (max ${MAX_OBJECTIVE_CHARS}). ${GOAL_TOO_LONG_FILE_HINT}`,
          "error"
        );
        return;
      }

      // 设置新目标
      await handleCreateNew(pi, goalStateRef, ctx, args!.trim());
    },
  });
}

// ============================================================================
// 子命令处理
// ============================================================================

/**
 * /goal pause - 暂停目标
 */
async function handlePause(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null },
  ctx: ExtensionContext,
  goal: GoalData
): Promise<void> {
  if (goal.status !== "pursuing") {
    ctx.ui.notify("Goal is not active, cannot pause.", "warning");
    return;
  }

  const paused = updateGoalStatus(goal, "paused");
  persistGoal(pi, paused);
  goalStateRef.current = paused;
  updateGoalWidget(ctx, paused);
  ctx.ui.notify("⏸️ Goal paused.", "info");
}

/**
 * /goal resume - 恢复目标
 */
async function handleResume(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null },
  ctx: ExtensionContext,
  goal: GoalData
): Promise<void> {
  if (goal.status !== "paused") {
    ctx.ui.notify("Goal is not paused, cannot resume.", "warning");
    return;
  }

  const resumed = updateGoalStatus(goal, "pursuing");
  const withLoop = incrementLoop(resumed);
  persistGoal(pi, withLoop);
  goalStateRef.current = withLoop;
  updateGoalWidget(ctx, withLoop);
  ctx.ui.notify("▶️ Goal resumed.", "info");

  // 触发下一轮
  triggerNextLoop(pi, goalStateRef, ctx, withLoop);
}

/**
 * /goal clear - 清除目标
 */
function handleClear(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null },
  ctx: ExtensionContext
): void {
  clearGoal(pi, ctx);
  goalStateRef.current = null;
  ctx.ui.notify("🗑️ Goal cleared.", "info");
}

/**
 * /goal status - 查看状态
 * 对齐 Codex goal_menu.rs goal_summary_lines
 */
function handleStatus(ctx: ExtensionContext, goal: GoalData): void {
  const elapsed = calculateTimeUsed(goal);
  const statusLabel = getStatusLabel(goal.status);

  const lines = [
    `📋 Goal Status`,
    `Status: ${statusLabel}`,
    `Objective: ${goal.objective}`,
    `Time: ${formatGoalElapsedSeconds(elapsed)}`,
    `Tokens: ${formatTokensCompact(goal.tokensUsed)}`,
  ];

  if (goal.tokenBudget) {
    lines.push(`Budget: ${formatTokensCompact(goal.tokenBudget)}`);
    lines.push(`Remaining: ${formatTokensCompact(Math.max(0, goal.tokenBudget - goal.tokensUsed))}`);
  }

  lines.push("");
  lines.push(`Loops: ${goal.loopCount}`);

  ctx.ui.notify(lines.join("\n"), "info");
}

/**
 * /goal edit - 修改目标描述
 * 对齐 Codex goal_menu.rs show_goal_edit_prompt
 */
async function handleEdit(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null },
  ctx: ExtensionContext,
  goal: GoalData
): Promise<void> {
  // 在 TUI 模式下显示输入框
  if (ctx.hasUI) {
    const newObjective = await (ctx as ExtensionCommandContext).waitForIdle().then(() => {
      // 简化实现：使用 notify 提示用户
      ctx.ui.notify("Edit goal: use /goal <new objective> to set a new goal, or /goal clear to clear.", "info");
      return null;
    });

    if (!newObjective) return;
  }

  // 非 TUI 模式或用户直接输入新目标
  ctx.ui.notify(
    "To edit goal objective, use: /goal <new objective>\nThis will replace the current goal.",
    "info"
  );
}

/**
 * 创建新目标
 */
async function handleCreateNew(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null },
  ctx: ExtensionContext,
  objective: string
): Promise<void> {
  const { createGoalState } = await import("./state");
  const newGoal = createGoalState(objective);
  persistGoal(pi, newGoal);
  goalStateRef.current = newGoal;
  updateGoalWidget(ctx, newGoal);
  ctx.ui.notify(`🎯 Goal set: ${objective}`, "info");

  // 触发第一轮
  triggerNextLoop(pi, goalStateRef, ctx, newGoal);
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取状态标签（对齐 Codex goal_display.rs goal_status_label）
 */
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pursuing: "active",
    paused: "paused",
    budget_limited: "limited by budget",
    achieved: "complete",
    unmet: "blocked",
  };
  return labels[status] ?? status;
}

/**
 * 触发下一轮循环
 */
function triggerNextLoop(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null },
  ctx: ExtensionContext,
  goal: GoalData
): void {
  if (ctx.hasPendingMessages()) return;

  const updated = incrementLoop(goal);
  persistGoal(pi, updated);
  goalStateRef.current = updated;
  updateGoalWidget(ctx, updated);

  pi.sendMessage(
    {
      customType: GOAL_CONTINUATION_TYPE,
      content: buildContinuationPrompt(updated),
      display: true,
    },
    { deliverAs: "followUp", triggerTurn: true }
  );
}

// 需要在模块顶层声明 goalStateRef
let goalStateRef: { current: GoalData | null } = { current: null };

/**
 * 设置 goalStateRef 引用
 */
export function setGoalStateRef(ref: { current: GoalData | null }): void {
  goalStateRef = ref;
}
