/**
 * Goal v2 - 工具注册
 * 对齐 Codex codex-rs/core/src/tools/handlers/goal/
 *
 * 3 个独立工具：
 * 1. create_goal - 创建新目标（仅在无目标时可用）
 * 2. get_goal - 获取当前目标状态
 * 3. update_goal - 标记目标完成或阻塞
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GoalData, GoalToolResponse } from "./types";
import {
  getGoalState,
  persistGoal,
  createGoalState,
  updateGoalStatus,
  buildGoalResponse,
  calculateTokensUsed,
} from "./state";
import { updateGoalWidget } from "./ui";
import {
  buildContinuationPrompt,
  buildCompletionReport,
  buildBlockedPrompt,
} from "./prompts";
import { GOAL_CONTINUATION_TYPE } from "./constants";

// ============================================================================
// 工具名称常量（对齐 Codex goal_spec.rs）
// ============================================================================

const CREATE_GOAL_TOOL_NAME = "create_goal";
const GET_GOAL_TOOL_NAME = "get_goal";
const UPDATE_GOAL_TOOL_NAME = "update_goal";

// ============================================================================
// create_goal 工具（对齐 Codex create_goal.rs）
// ============================================================================

/**
 * 注册 create_goal 工具
 * 对齐 Codex create_goal_handler
 */
export function registerCreateGoalTool(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  pi.registerTool({
    name: CREATE_GOAL_TOOL_NAME,
    label: "Create goal",
    description:
      "Create a goal only when explicitly requested by the user or system/developer instructions; do not infer goals from ordinary tasks. " +
      "Set token_budget only when an explicit token budget is requested. Fails if a goal exists; use update_goal only for status.",
    parameters: Type.Object({
      objective: Type.String({
        description:
          "Required. The concrete objective to start pursuing. This starts a new active goal only when no goal is currently defined; if a goal already exists, this tool fails.",
      }),
      token_budget: Type.Optional(
        Type.Number({
          description: "Optional positive token budget for the new active goal.",
        })
      ),
    }),
    promptSnippet: "create_goal: Create a new goal for the current thread.",
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { objective, token_budget } = params as {
        objective: string;
        token_budget?: number;
      };

      // 检查是否已有目标（对齐 Codex "already has a goal" 错误）
      const existingGoal = getGoalState(ctx);
      if (existingGoal) {
        return {
          content: [
            {
              type: "text",
              text: "Cannot create a new goal because this thread already has a goal; use update_goal only when the existing goal is complete.",
            },
          ],
          details: { status: "error", code: "goal_exists" },
        };
      }

      // 创建新目标
      const newGoal = createGoalState(objective, token_budget);
      persistGoal(pi, newGoal);
      goalStateRef.current = newGoal;
      updateGoalWidget(ctx, newGoal);

      // 触发第一轮 continuation
      pi.sendMessage(
        {
          customType: GOAL_CONTINUATION_TYPE,
          content: buildContinuationPrompt(newGoal),
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: true }
      );

      const response = buildGoalResponse(newGoal, false);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
        details: { status: "created" },
      };
    },
  });
}

// ============================================================================
// get_goal 工具（对齐 Codex get_goal.rs）
// ============================================================================

/**
 * 注册 get_goal 工具
 * 对齐 Codex get_goal_handler
 */
export function registerGetGoalTool(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  pi.registerTool({
    name: GET_GOAL_TOOL_NAME,
    label: "Get goal",
    description:
      "Get the current goal for this thread, including status, budgets, token and elapsed-time usage, and remaining token budget.",
    parameters: Type.Object({}),
    promptSnippet: "get_goal: Query the current thread goal status.",
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const goal = getGoalState(ctx);
      goalStateRef.current = goal;

      const response = buildGoalResponse(goal, false);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
        details: { status: goal ? "active" : "none" },
      };
    },
  });
}

// ============================================================================
// update_goal 工具（对齐 Codex update_goal.rs）
// ============================================================================

/**
 * 注册 update_goal 工具
 * 对齐 Codex update_goal_handler
 *
 * 注意：Codex 仅支持 status="complete"
 * Pi 扩展额外支持 status="blocked"
 */
export function registerUpdateGoalTool(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  pi.registerTool({
    name: UPDATE_GOAL_TOOL_NAME,
    label: "Update goal status",
    description:
      "Update the existing goal. " +
      "Use this tool only to mark the goal complete or genuinely blocked. " +
      'Set status to "complete" only when the objective has actually been achieved and no required work remains. ' +
      'Set status to "blocked" only after repeated in-scope attempts reach a genuine impasse and meaningful progress requires user input or an external-state change. ' +
      "Do not mark a goal complete merely because its budget is nearly exhausted or because you are stopping work. " +
      "You cannot use this tool to pause, resume, or budget-limit a goal; those status changes are controlled by the user or system. " +
      "When marking a budgeted goal achieved with status \"complete\", report the final token usage from the tool result to the user.",
    parameters: Type.Object({
      status: Type.Union(
        [
          Type.Literal("complete", {
            description: "Set to complete only when the objective is achieved and no required work remains.",
          }),
          Type.Literal("blocked", {
            description: "Set to blocked only at a genuine impasse after repeated in-scope attempts, when progress requires user input or an external-state change.",
          }),
        ],
        { description: "Goal status" }
      ),
      summary: Type.Optional(
        Type.String({
          description: "Optional brief summary of completion or blocking reason.",
        })
      ),
    }),
    promptSnippet:
      "update_goal: Mark a verified completion, or a genuine repeated-attempt impasse, as final.",
    promptGuidelines: [
      "Audit completion before status=complete",
      "Uncertain = not complete",
      "A hard or slow step is not blocked while meaningful progress remains possible",
      "Do not mark complete just because budget is exhausted",
    ],
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { status, summary } = params as {
        status: "complete" | "blocked";
        summary?: string;
      };

      const goal = getGoalState(ctx);
      goalStateRef.current = goal;

      // 检查是否有活动目标
      if (!goal || goal.status !== "pursuing") {
        return {
          content: [
            {
              type: "text",
              text: "No active goal to update.",
            },
          ],
          details: { status: "idle" },
        };
      }

      // 实时计算 token
      const currentTokens = calculateTokensUsed(ctx, goal.createdAt);

      if (status === "complete") {
        // 标记完成
        const achieved = updateGoalStatus(goal, "achieved", {
          tokensUsed: currentTokens,
        });
        persistGoal(pi, achieved);
        goalStateRef.current = achieved;
        updateGoalWidget(ctx, achieved);

        const report = buildCompletionReport(achieved);
        const budgetReport = buildGoalResponse(achieved, true);

        return {
          content: [
            {
              type: "text",
              text: report + (budgetReport.completionBudgetReport ? `\n${budgetReport.completionBudgetReport}` : ""),
            },
          ],
          details: { status: "complete" },
        };
      }

      // blocked
      const unmet = updateGoalStatus(goal, "unmet", {
        tokensUsed: currentTokens,
      });
      persistGoal(pi, unmet);
      goalStateRef.current = unmet;
      updateGoalWidget(ctx, unmet);

      const blockedReport = buildBlockedPrompt(unmet, summary);
      return {
        content: [
          {
            type: "text",
            text: blockedReport,
          },
        ],
        details: { status: "blocked" },
      };
    },
  });
}

// ============================================================================
// 注册所有工具
// ============================================================================

/**
 * 注册所有 goal 相关工具
 */
export function registerGoalTools(
  pi: ExtensionAPI,
  goalStateRef: { current: GoalData | null }
): void {
  registerCreateGoalTool(pi, goalStateRef);
  registerGetGoalTool(pi, goalStateRef);
  registerUpdateGoalTool(pi, goalStateRef);
}
