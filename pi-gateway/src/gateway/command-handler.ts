/**
 * Command Handler — slash command parsing + dispatch.
 *
 * Extracted from server.ts (Gateway.tryHandleRegisteredCommand + parseSlashCommand).
 *
 * Source locations in server.ts:
 *   - parseSlashCommand():632-639
 *   - tryHandleRegisteredCommand():648-744
 *   - TUI command guard:881-889
 *   - registerBuiltinCommands():2442-2475
 *
 * Responsibilities:
 *   1. Parse incoming text for /command syntax
 *   2. Check registry.commands for local (plugin-registered) handlers
 *   3. Forward unhandled commands to pi RPC
 *   4. Guard against TUI-dependent commands that would hang in RPC mode
 *   5. Register built-in commands (/role)
 */

import type { GatewayContext } from "./types.ts";
import type { InboundMessage } from "../core/types.ts";
import type { RpcClient } from "../core/rpc-client.ts";

// TUI-dependent commands that hang in RPC mode
const TUI_COMMANDS = [
  "/memories", "/memory-fix", "/memory-tidy", "/plan",
];

interface ParsedCommand {
  name: string;
  args: string;
}

/**
 * Parse text as a slash command.
 * Returns null if text is not a command.
 */
export function parseSlashCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/([a-zA-Z0-9._-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return {
    name: match[1].toLowerCase(),
    args: (match[2] ?? "").trim(),
  };
}

/**
 * Check if a command text matches a TUI-dependent command.
 */
export function isTuiCommand(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return TUI_COMMANDS.some((cmd) => lower.startsWith(cmd));
}

/**
 * Try to handle a message as a slash command.
 * Returns true if handled (caller should not process further).
 *
 * Flow:
 *   1. Parse as /command
 *   2. Check TUI guard
 *   3. Try registered (local) command handler
 *   4. Forward to pi RPC if no local handler
 */
export async function tryHandleCommand(
  msg: InboundMessage,
  ctx: GatewayContext,
  startedAt: number,
  rpc?: RpcClient,
): Promise<boolean> {
  const parsed = parseSlashCommand(msg.text);
  if (!parsed) return false;

  ctx.log.info(`[SLASH-CMD] ${msg.sessionKey} parsed: name=${parsed.name}, args=${parsed.args}`);

  // TUI guard
  if (isTuiCommand(msg.text)) {
    await msg.respond(
      `Command "${msg.text.trim()}" requires interactive TUI and is not available in gateway mode. Use the pi CLI directly for this command.`,
    );
    return true;
  }

  // Local registered command
  const registered = ctx.registry.commands.get(parsed.name);
  if (registered) {
    return await executeLocalCommand(msg, ctx, parsed, registered, startedAt);
  }

  // Forward to pi RPC
  if (rpc) {
    return await forwardToRpc(msg, ctx, parsed, rpc);
  }

  ctx.log.warn(`[SLASH-CMD] ${msg.sessionKey} no RPC available for /${parsed.name}`);
  return false;
}

/**
 * Register built-in gateway commands.
 * Currently empty — /role handled by role-persona via RPC.
 */
export function registerBuiltinCommands(_ctx: GatewayContext): void {
  // All slash commands forward to pi RPC
}

// ============================================================================
// Internal
// ============================================================================

async function executeLocalCommand(
  msg: InboundMessage,
  ctx: GatewayContext,
  parsed: ParsedCommand,
  registered: { pluginId: string; handler: Function },
  startedAt: number,
): Promise<boolean> {
  ctx.log.info(`[SLASH-CMD] ${msg.sessionKey} executing local command /${parsed.name}`);

  const sendReply = async (rawText: string) => {
    const text = typeof rawText === "string" ? rawText : String(rawText ?? "");
    const outbound = { channel: msg.source.channel, target: msg.source.chatId, text };
    await ctx.registry.hooks.dispatch("message_sending", { message: outbound });
    outbound.text = typeof outbound.text === "string" ? outbound.text : String(outbound.text ?? "");
    await msg.respond(outbound.text);
    await ctx.registry.hooks.dispatch("message_sent", { message: outbound });
    ctx.transcripts.logResponse(msg.sessionKey, outbound.text, Date.now() - startedAt);
  };

  try {
    await registered.handler({
      sessionKey: msg.sessionKey,
      senderId: msg.source.senderId,
      channel: msg.source.channel,
      args: parsed.args,
      respond: sendReply,
    });
    ctx.log.info(`[SLASH-CMD] ${msg.sessionKey} local command /${parsed.name} executed successfully`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.log.error(`[SLASH-CMD] ${msg.sessionKey} local command /${parsed.name} failed: ${errMsg}`);
    await sendReply(`Command /${parsed.name} failed: ${errMsg}`);
  }
  return true;
}

async function forwardToRpc(
  msg: InboundMessage,
  ctx: GatewayContext,
  parsed: ParsedCommand,
  rpc: RpcClient,
): Promise<boolean> {
  const rpcCmdName = parsed.name.startsWith("pi_") ? parsed.name.slice(3) : parsed.name;
  const rpcText = `/${rpcCmdName}${parsed.args ? " " + parsed.args : ""}`;
  ctx.log.info(`[SLASH-CMD] ${msg.sessionKey} forwarding /${parsed.name} → ${rpcText} to pi RPC`);

  try {
    const responses: string[] = [];
    const seen = new Set<string>();
    const cmdUnsub = rpc.onEvent((event) => {
      if (rpc.sessionKey !== msg.sessionKey) return;
      const ev = event as any;

      // Collect text_delta from assistant messages
      if (ev.type === "message_update") {
        const ame = ev.assistantMessageEvent ?? ev.assistant_message_event;
        if (ame?.type === "text_delta" && ame.delta) {
          responses.push(ame.delta);
        }
      }

      // Collect content from custom messages (e.g. role-persona sendMessage)
      if (ev.type === "message_end") {
        const content = ev.message?.content;
        if (typeof content === "string" && content && ev.message?.display !== false) {
          if (!seen.has(content)) {
            seen.add(content);
            responses.push(content);
          }
        }
      }
    });

    await rpc.prompt(rpcText);

    // Extension commands (e.g. role-persona) don't trigger agent_end,
    // so we can't use waitForIdle. Wait briefly for events to arrive,
    // then check if we got a response. If not, fall back to waitForIdle
    // for commands that DO trigger the agent loop.
    if (responses.length === 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (responses.length === 0) {
      try {
        await rpc.waitForIdle(15000);
      } catch {
        // Timeout is OK — command may have already completed without agent_end
      }
    }

    cmdUnsub();
    const cmdResponse = responses.join("").trim();
    await msg.respond(cmdResponse || `Command /${parsed.name} executed.`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.log.error(`[SLASH-CMD] ${msg.sessionKey} failed to execute /${parsed.name}: ${errMsg}`);
    await msg.respond(`Failed to execute command: ${errMsg}`);
  }
  return true;
}
