/**
 * Goal v2 - 事件处理
 * 对齐 Codex codex-rs/core/src/goals.rs
 *
 * 事件监听：
 * 1. agent_end - 预算检查 + 卡住检测 + 注入下一轮
 * 2. session_start - 自动恢复进行中的目标
 * 3. session_before_compact - 保留 goal 上下文
 * 4. session_switch - 切换会话时恢复状态
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GoalData } from "./types";
import {
  getGoalState,
  persistGoal,
  clearGoal,
  incrementLoop,
  calculateTokensUsed,
  isBudgetExhausted,
  isNearBudgetLimit,
  isActiveGoal,
} from "./state";
import { updateGoalWidget } from "./ui";
import {
  buildContinuationPrompt,
  buildBudgetLimitPrompt,
  buildStuckPrompt,
  buildBudgetWarningPrompt,
} from "./prompts";
import {
  GOAL_CONTINUATION_TYPE,
  GOAL_BUDGET_LIMIT_TYPE,
  GOAL_STUCK_TYPE,
  BUDGET_WARN_RATIO,
  STUCK_THRESHOLD_MS,
} from "./constants";

// ============================================================================
// agent_end 事件处理
// 对齐 Codex goals.rs 中的 agent_end 处理逻辑
// ============================================================================

/**
 * 处理 agent_end 事件
 * - 检查预算耗尽
 * - 检查预算警告（80%）
 * - 检查卡住（5 分钟无进展）
 * - 正常继续下一轮
 */
export function registerAgentEndHandler(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  pi.on("agent_end", async (_event, ctx) => {
    const goal = getGoalState(ctx);
    goalStateRef.current = goal;

    // 仅处理活动目标
    if (!goal || goal.status !== "pursuing") return;

    // 更新 token 使用
    const tokensUsed = calculateTokensUsed(ctx, goal.createdAt);

    // 检查预算耗尽
    if (goal.tokenBudget && tokensUsed >= goal.tokenBudget) {
      const limited: GoalData = {
        ...goal,
        tokensUsed,
        status: "budget_limited",
        updatedAt: Date.now(),
      };
      persistGoal(pi, limited);
      goalStateRef.current = limited;
      updateGoalWidget(ctx, limited);

      // 注入 budget limit prompt
      pi.sendMessage(
        {
          customType: GOAL_BUDGET_LIMIT_TYPE,
          content: buildBudgetLimitPrompt(limited),
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: true }
      );
      return;
    }

    // 检查接近预算警告（80%）
    if (goal.tokenBudget && tokensUsed >= goal.tokenBudget * BUDGET_WARN_RATIO) {
      const remaining = goal.tokenBudget - tokensUsed;
      const updated: GoalData = {
        ...goal,
        tokensUsed,
        loopCount: goal.loopCount + 1,
        lastLoopAt: Date.now(),
        updatedAt: Date.now(),
      };
      persistGoal(pi, updated);
      goalStateRef.current = updated;
      updateGoalWidget(ctx, updated);

      // 注入警告 + continuation
      pi.sendMessage(
        {
          customType: GOAL_CONTINUATION_TYPE,
          content:
            buildBudgetWarningPrompt(updated) +
            `\n⚠️ Budget nearly exhausted, ${remaining} tokens remaining. Please complete soon.`,
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: true }
      );
      return;
    }

    // 检查卡住（5 分钟无进展）
    const timeSinceLastLoop = Date.now() - goal.lastLoopAt;
    if (goal.loopCount > 0 && timeSinceLastLoop > STUCK_THRESHOLD_MS) {
      const updated: GoalData = {
        ...goal,
        tokensUsed,
        loopCount: goal.loopCount + 1,
        lastLoopAt: Date.now(),
        updatedAt: Date.now(),
      };
      persistGoal(pi, updated);
      goalStateRef.current = updated;
      updateGoalWidget(ctx, updated);

      // 注入 stuck prompt
      pi.sendMessage(
        {
          customType: GOAL_STUCK_TYPE,
          content: buildStuckPrompt(updated),
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: true }
      );
      return;
    }

    // 正常继续下一轮
    const updated: GoalData = {
      ...goal,
      tokensUsed,
      loopCount: goal.loopCount + 1,
      lastLoopAt: Date.now(),
      updatedAt: Date.now(),
    };
    persistGoal(pi, updated);
    goalStateRef.current = updated;
    updateGoalWidget(ctx, updated);

    // 触发下一轮
    triggerNextLoop(pi, ctx, updated);
  });
}

// ============================================================================
// session_start 事件处理
// 对齐 Codex goals.rs 中的 session_start 处理逻辑
// ============================================================================

/**
 * 处理 session_start 事件
 * 自动恢复进行中的目标
 */
export function registerSessionStartHandler(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  pi.on("session_start", async (_event, ctx) => {
    const goal = getGoalState(ctx);
    goalStateRef.current = goal;

    if (!goal) return;

    // 更新 widget
    updateGoalWidget(ctx, goal);

    // 如果目标正在执行，继续循环
    if (goal.status === "pursuing") {
      setTimeout(() => {
        triggerNextLoop(pi, ctx, goal);
      }, 500);
    }
  });
}

// ============================================================================
// session_switch 事件处理
// ============================================================================

/**
 * 处理 session_switch 事件
 * 切换会话时恢复状态
 */
export function registerSessionSwitchHandler(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  pi.on("session_switch", async (_event, ctx) => {
    const goal = getGoalState(ctx);
    goalStateRef.current = goal;
    updateGoalWidget(ctx, goal);
  });
}

// ============================================================================
// session_before_compact 事件处理
// 对齐 Codex goals.rs 中的 session_before_compact 处理逻辑
// ============================================================================

/**
 * 处理 session_before_compact 事件
 * 保留 goal 上下文，防止 compaction 丢失目标信息
 */
export function registerSessionBeforeCompactHandler(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pi.on("session_before_compact" as any, async (event: any, ctx: any) => {
    const goal = getGoalState(ctx);
    goalStateRef.current = goal;

    if (!goal || goal.status !== "pursuing") return;

    const remaining = goal.tokenBudget
      ? `${goal.tokenBudget - goal.tokensUsed} tokens remaining`
      : "unlimited";

    const instruction =
      `Goal loop in progress. ` +
      `Objective: ${goal.objective}. ` +
      `Tokens used: ${goal.tokensUsed}` +
      (goal.tokenBudget ? `/${goal.tokenBudget}` : "") +
      `. Loops: ${goal.loopCount}. ` +
      `Budget: ${remaining}. ` +
      `Please preserve this goal state in the summary.`;

    // 注入自定义指令到 compaction 上下文
    if (event && typeof event === 'object') {
      event.customInstructions = [event.customInstructions, instruction].filter(Boolean).join("\n\n");
    }
  });
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 触发下一轮循环
 */
function triggerNextLoop(pi: ExtensionAPI, ctx: ExtensionContext, goal: GoalData): void {
  if (ctx.hasPendingMessages()) return;

  const updated = incrementLoop(goal);
  persistGoal(pi, updated);

  pi.sendMessage(
    {
      customType: GOAL_CONTINUATION_TYPE,
      content: buildContinuationPrompt(updated),
      display: true,
    },
    { deliverAs: "followUp", triggerTurn: true }
  );
}

// ============================================================================
// 注册所有事件处理器
// ============================================================================

/**
 * 注册所有 goal 相关事件处理器
 */
export function registerGoalEvents(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  registerAgentEndHandler(pi, goalStateRef);
  registerSessionStartHandler(pi, goalStateRef);
  registerSessionSwitchHandler(pi, goalStateRef);
  registerSessionBeforeCompactHandler(pi, goalStateRef);
}
