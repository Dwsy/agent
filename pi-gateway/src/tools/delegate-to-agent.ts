/**
 * delegate_to_agent Tool — v3 Multi-Agent Routing
 *
 * Allows an agent to delegate tasks to another specialized agent.
 * Gateway intercepts this tool call and routes to the target agent's RPC process.
 */

import type { ToolDefinition } from "../plugins/types.ts";

export const DELEGATE_TO_AGENT_TOOL_NAME = "delegate_to_agent";

/**
 * Tool definition for gateway tool registration
 */
export const delegateToAgentTool: ToolDefinition = {
  name: DELEGATE_TO_AGENT_TOOL_NAME,
  description: `Delegate a task to another specialized agent and optionally wait for the result.

Use this when you need expertise outside your domain. For example:
- Code agent: use /ops to check deployment status
- Docs agent: use /code to generate code examples
- General agent: use /code, /docs, or /ops based on task type

The target agent will receive your task description and respond. In sync mode, you'll receive the complete response.

Available agents are configured in the gateway. Ask the user for clarification if unsure which agent to use.

Note: Async mode and streaming are planned for v3.1.`,
  parameters: {
    type: "object",
    properties: {
      agentId: {
        type: "string",
        description: "ID of the target agent to delegate to. Must match an agent defined in gateway config (e.g., 'code', 'docs', 'ops').",
      },
      task: {
        type: "string",
        description: "Clear, specific task description for the target agent. Include relevant context but keep it concise.",
      },
      mode: {
        type: "string",
        enum: ["sync"],
        description: "Execution mode. 'sync' waits for completion and returns the response. (Note: 'async' mode coming in v3.1)",
      },
      timeoutMs: {
        type: "number",
        description: "Timeout in milliseconds for sync mode (default: 60000). Ignored in async mode.",
        minimum: 1000,
        maximum: 300000,
      },
      stream: {
        type: "boolean",
        description: "Whether to forward the target agent's streaming output to the user in real-time (default: false). Only applicable in sync mode.",
      },
    },
    required: ["agentId", "task", "mode"],
  },
};

/**
 * Parameters for delegate_to_agent tool call
 */
export interface DelegateToAgentParams {
  agentId: string;
  task: string;
  mode: "sync" | "async";
  timeoutMs?: number;
  stream?: boolean;
}

/**
 * Result of a successful delegation
 */
export interface DelegateResult {
  status: "completed" | "timeout" | "error" | "rejected";
  response?: string;
  sessionKey?: string;
  error?: string;
  agentId: string;
  durationMs?: number;
}

/**
 * Validates delegate parameters
 */
export function validateDelegateParams(params: unknown): { valid: true; data: DelegateToAgentParams } | { valid: false; error: string } {
  if (typeof params !== "object" || params === null) {
    return { valid: false, error: "Parameters must be an object" };
  }

  const p = params as Record<string, unknown>;

  // agentId validation
  if (typeof p.agentId !== "string" || p.agentId.length === 0) {
    return { valid: false, error: "agentId must be a non-empty string" };
  }

  // task validation
  if (typeof p.task !== "string" || p.task.length === 0) {
    return { valid: false, error: "task must be a non-empty string" };
  }

  // mode validation (v3.0: sync only)
  if (p.mode !== "sync") {
    return { valid: false, error: "mode must be 'sync' (v3.0)" };
  }

  // timeoutMs validation (optional)
  if (p.timeoutMs !== undefined) {
    if (typeof p.timeoutMs !== "number" || p.timeoutMs < 1000 || p.timeoutMs > 300000) {
      return { valid: false, error: "timeoutMs must be between 1000 and 300000" };
    }
  }

  // stream validation (optional)
  if (p.stream !== undefined && typeof p.stream !== "boolean") {
    return { valid: false, error: "stream must be a boolean" };
  }

  return {
    valid: true,
    data: {
      agentId: p.agentId,
      task: p.task,
      mode: p.mode,
      timeoutMs: p.timeoutMs,
      stream: p.stream,
    } as DelegateToAgentParams,
  };
}

/**
 * Handler interface for delegate execution
 * Implemented by GatewayServer to process delegation requests
 */
export interface DelegateHandler {
  /**
   * Execute delegation to target agent
   * @param sourceSessionKey - Session key of the delegating agent
   * @param params - Delegation parameters
   * @returns Delegation result
   */
  executeDelegation(
    sourceSessionKey: string,
    params: DelegateToAgentParams
  ): Promise<DelegateResult>;

  /**
   * Check if agent exists and is available
   * @param agentId - Target agent ID
   * @returns true if agent is available
   */
  isAgentAvailable(agentId: string): boolean;

  /**
   * Get list of available agent IDs
   */
  getAvailableAgents(): string[];
}
