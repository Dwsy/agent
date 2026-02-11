/**
 * Tool Executor — Resolves and executes registered plugin tools.
 *
 * Extracted from server.ts (P1 modularization).
 *
 * Handles:
 * - GET  /api/tools       → list registered tool specs
 * - POST /api/tools/call  → execute a tool by name
 * - executeRegisteredTool  → core execution with hooks + delegate interception
 *
 * Delegate interception (delegate_to_agent) lives here because it's a tool-level
 * concern. The DelegateExecutor itself stays in core/ — we only call it.
 * Message pipeline dispatch (P2 scope) is NOT extracted here.
 *
 * Source lines in server.ts (pre-extraction):
 * - getRegisteredToolSpecs:   L749-760
 * - resolveToolPlugin:        L762-769
 * - executeRegisteredTool:    L771-853 (includes delegate interception L776-798)
 * - handleApiToolCall:        L1507-1528
 * - /api/tools list:          L1439-1442 (inline in handleHttp)
 */

import type { GatewayContext } from "./types.ts";
import type { SessionKey } from "../core/types.ts";
import type { ToolPlugin } from "../plugins/types.ts";
import { createLogger as createConsoleLogger } from "../core/types.ts";
import { createFileLogger } from "../core/logger-file.ts";
import { DELEGATE_TO_AGENT_TOOL_NAME, validateDelegateParams } from "../tools/delegate-to-agent.ts";

// ============================================================================
// Tool Specs (GET /api/tools)
// ============================================================================

export function getRegisteredToolSpecs(ctx: GatewayContext) {
  return Array.from(ctx.registry.tools.values()).map((tool) => ({
    plugin: tool.name,
    description: tool.description,
    tools: tool.tools.map((def) => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters ?? {},
      optional: def.optional ?? false,
    })),
  }));
}

// ============================================================================
// Tool Resolution
// ============================================================================

function resolveToolPlugin(toolName: string, ctx: GatewayContext): ToolPlugin | null {
  for (const plugin of ctx.registry.tools.values()) {
    if (plugin.tools.some((def) => def.name === toolName)) {
      return plugin;
    }
  }
  return null;
}

// ============================================================================
// Tool Execution (with hooks + delegate interception)
// ============================================================================

/**
 * Execute a registered tool by name.
 *
 * Intercepts delegate_to_agent calls and routes them to DelegateExecutor.
 * All other tools go through the plugin registry with before/after hooks.
 */
export async function executeRegisteredTool(
  toolName: string,
  params: Record<string, unknown>,
  sessionKey: SessionKey,
  ctx: GatewayContext,
) {
  // Delegate interception — tool-level concern, not pipeline
  if (toolName === DELEGATE_TO_AGENT_TOOL_NAME && ctx.delegateExecutor) {
    const validation = validateDelegateParams(params);
    if (!validation.valid) {
      return {
        content: [{ type: "text", text: `Invalid delegation: ${validation.error}` }],
        isError: true,
      };
    }

    const result = await ctx.delegateExecutor.executeDelegation(sessionKey, validation.data);

    if (result.status === "completed") {
      return {
        content: [{ type: "text", text: result.response ?? "Task completed" }],
      };
    } else {
      return {
        content: [{ type: "text", text: result.error ?? `Delegation ${result.status}` }],
        isError: true,
      };
    }
  }

  const plugin = resolveToolPlugin(toolName, ctx);
  if (!plugin) {
    throw new Error(`Tool not found: ${toolName}`);
  }

  const beforePayload = {
    sessionKey,
    toolName,
    args: { ...params },
  };
  await ctx.registry.hooks.dispatch("before_tool_call", beforePayload);

  const toolLogger = ctx.config.logging.file
    ? createFileLogger(`tool:${toolName}`)
    : createConsoleLogger(`tool:${toolName}`);

  try {
    const result = await plugin.execute(toolName, beforePayload.args, {
      sessionKey,
      logger: toolLogger,
    });

    const afterPayload = {
      sessionKey,
      toolName,
      result,
      isError: Boolean(result?.isError),
    };
    await ctx.registry.hooks.dispatch("after_tool_call", afterPayload);

    const persistPayload = {
      sessionKey,
      toolName,
      result: afterPayload.result,
    };
    await ctx.registry.hooks.dispatch("tool_result_persist", persistPayload);

    return persistPayload.result;
  } catch (err: any) {
    const errorResult = {
      content: [{ type: "text", text: `Tool error: ${err?.message ?? String(err)}` }],
      isError: true,
    };
    await ctx.registry.hooks.dispatch("after_tool_call", {
      sessionKey,
      toolName,
      result: errorResult,
      isError: true,
    });
    throw err;
  }
}

// ============================================================================
// HTTP Handlers
// ============================================================================

/** GET /api/tools — list all registered tools */
export async function handleToolsList(
  _req: Request,
  _url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  return Response.json({ tools: getRegisteredToolSpecs(ctx) });
}

/** POST /api/tools/call — execute a tool */
export async function handleToolCall(
  req: Request,
  _url: URL,
  ctx: GatewayContext,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      tool?: string;
      toolName?: string;
      params?: Record<string, unknown>;
      sessionKey?: string;
    };

    const toolName = (body.toolName ?? body.tool ?? "").trim();
    if (!toolName) {
      return Response.json({ error: "toolName is required" }, { status: 400 });
    }

    const sessionKey = (body.sessionKey ?? "agent:main:main:main") as SessionKey;
    const params = body.params && typeof body.params === "object" ? body.params : {};
    const result = await executeRegisteredTool(toolName, params, sessionKey, ctx);
    return Response.json({ ok: true, toolName, sessionKey, result });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Tool call failed" }, { status: 500 });
  }
}
