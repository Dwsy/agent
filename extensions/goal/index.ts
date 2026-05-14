/**
 * Goal v2 - 入口文件
 * 对齐 Codex codex-rs/core/src/goals.rs
 *
 * 组装所有模块：
 * - types.ts - 类型定义
 * - constants.ts - 常量配置
 * - prompts.ts - Prompt 模板
 * - state.ts - 状态管理
 * - tools.ts - 工具注册
 * - commands.ts - 命令注册
 * - events.ts - 事件处理
 * - ui.ts - UI 组件
 *
 * 使用方式：
 *   pi -e ~/.pi/agent/extensions/goal-v2/index.ts
 *
 * 或自动加载（放置在 ~/.pi/agent/extensions/ 目录下）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GoalData } from "./types";
import { registerGoalTools } from "./tools";
import { registerGoalCommand, setGoalStateRef } from "./commands";
import { registerGoalEvents } from "./events";
import { getGoalState } from "./state";
import { updateGoalWidget } from "./ui";

/**
 * Goal v2 Extension
 *
 * 目标驱动的自主编码循环，全面对齐 OpenAI Codex /goal 系统
 */
export default function goalV2Extension(pi: ExtensionAPI): void {
  // 共享状态引用（跨模块同步）
  const goalStateRef: { current: GoalData | null } = { current: null };

  // 设置 commands.ts 的状态引用
  setGoalStateRef(goalStateRef);

  // 注册 3 个独立工具（对齐 Codex 工具分离设计）
  // - create_goal: 创建新目标
  // - get_goal: 查询当前状态
  // - update_goal: 标记完成或阻塞
  registerGoalTools(pi, goalStateRef);

  // 注册 /goal 命令及子命令
  // - /goal <objective>: 设置新目标
  // - /goal pause: 暂停目标
  // - /goal resume: 恢复目标
  // - /goal clear: 清除目标
  // - /goal status: 查看状态
  // - /goal edit: 修改目标描述
  registerGoalCommand(pi, goalStateRef);

  // 注册事件处理器
  // - agent_end: 预算检查 + 卡住检测 + 下一轮注入
  // - session_start: 自动恢复进行中的目标
  // - session_switch: 切换会话时恢复状态
  // - session_before_compact: 保留 goal 上下文
  registerGoalEvents(pi, goalStateRef);

  // session_start 时恢复状态（额外的初始化）
  pi.on("session_start", async (_event, ctx) => {
    const goal = getGoalState(ctx);
    goalStateRef.current = goal;
    if (goal) {
      updateGoalWidget(ctx, goal);
    }
  });
}

// ============================================================================
// 导出（供测试和外部使用）
// ============================================================================

export type { GoalData, GoalStatus, GoalToolResponse } from "./types";
export {
  getGoalState,
  persistGoal,
  clearGoal,
  createGoalState,
  updateGoalStatus,
  buildGoalResponse,
} from "./state";
export {
  buildContinuationPrompt,
  buildBudgetLimitPrompt,
  buildObjectiveUpdatedPrompt,
  buildStuckPrompt,
  buildBlockedPrompt,
  buildCompletionReport,
} from "./prompts";
export {
  updateGoalWidget,
  formatGoalElapsedSeconds,
  formatTokensCompact,
  goalUsageSummary,
  goalStatusLabel,
  formatGoalDetails,
  formatBudgetReport,
} from "./ui";
