/**
 * Chat-SDK Command Registration — maps gateway slash commands to chat-sdk's onSlashCommand.
 *
 * Registers standard gateway commands (/new, /status, /stop, /model, /compact, /help)
 * that work across all chat-sdk adapters.
 */

import type { Chat } from "chat";
import type { GatewayPluginApi, CommandContext } from "../core/interface/plugins/types.ts";
import { buildSessionKey } from "./message-mapper.ts";

// ============================================================================
// Types
// ============================================================================

export interface ChatSdkCommand {
  name: string;
  description: string;
}

// ============================================================================
// Standard gateway commands
// ============================================================================

const GATEWAY_COMMANDS: ChatSdkCommand[] = [
  { name: "new", description: "Start new session" },
  { name: "status", description: "Show session status" },
  { name: "stop", description: "Stop current session" },
  { name: "model", description: "Switch model" },
  { name: "compact", description: "Compact session" },
  { name: "help", description: "Show help" },
];

// ============================================================================
// Registration
// ============================================================================

/**
 * Register gateway slash commands that work across all chat-sdk adapters.
 * Maps chat-sdk's onSlashCommand events to gateway's command dispatch.
 */
export function registerChatSdkCommands(chat: Chat, api: GatewayPluginApi, agentId = "main"): void {
  for (const cmd of GATEWAY_COMMANDS) {
    chat.onSlashCommand(`/${cmd.name}`, async (event) => {
      const threadId = event.channel?.id ?? "";
      const isDM = !threadId.includes("group");
      const sessionKey = buildSessionKey(event.adapter.name, threadId, isDM, agentId);

      const ctx: CommandContext = {
        sessionKey,
        senderId: event.user.userId,
        channel: event.adapter.name,
        args: event.text ?? "",
        respond: async (text: string) => {
          await event.channel.post(text);
        },
      };

      // Dispatch to gateway's registered command handler
      try {
        await dispatchGatewayCommand(api, cmd.name, ctx);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        api.logger.error(`[chat-sdk:commands] /${cmd.name} failed: ${msg}`);
        await event.channel.post(`❌ Command failed: ${msg}`).catch(() => {});
      }
    });
  }

  api.logger.info(`[chat-sdk:commands] registered ${GATEWAY_COMMANDS.length} slash commands`);
}

/**
 * Dispatch a command to the gateway's command system.
 * Falls back to direct API calls for known commands.
 */
async function dispatchGatewayCommand(api: GatewayPluginApi, name: string, ctx: CommandContext): Promise<void> {
  // Try gateway's registered command handler first
  if (typeof api.forwardCommand === "function") {
    try {
      await api.forwardCommand(ctx.sessionKey, name, ctx.args);
      return;
    } catch {
      // Fall through to built-in handlers
    }
  }

  // Built-in command implementations
  switch (name) {
    case "new": {
      await api.resetSession(ctx.sessionKey);
      await ctx.respond("✅ Session reset.");
      break;
    }
    case "stop": {
      await api.abortSession(ctx.sessionKey);
      await ctx.respond("⏹ Stopped.");
      break;
    }
    case "status": {
      const state = api.getSessionState(ctx.sessionKey);
      if (!state) {
        await ctx.respond("No active session.");
        return;
      }
      const lines = [
        `Session: ${ctx.sessionKey}`,
        `Messages: ${state.messageCount}`,
        `Streaming: ${state.isStreaming}`,
        `Role: ${state.role ?? "default"}`,
      ];
      await ctx.respond(lines.join("\n"));
      break;
    }
    case "model": {
      try {
        const models = await api.getAvailableModels(ctx.sessionKey);
        const rpcState = await api.getRpcState(ctx.sessionKey);
        const current = rpcState?.model?.id ?? "unknown";
        await ctx.respond(`Current model: ${current}\nAvailable: ${(models as any[]).length} models`);
      } catch {
        await ctx.respond("No active session. Send a message first.");
      }
      break;
    }
    case "compact": {
      try {
        await api.compactSession(ctx.sessionKey, ctx.args || undefined);
        await ctx.respond("✅ Context compacted.");
      } catch (err: unknown) {
        await ctx.respond(`Compact failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      break;
    }
    case "help": {
      const helpText = GATEWAY_COMMANDS
        .map(c => `/${c.name} — ${c.description}`)
        .join("\n");
      await ctx.respond(helpText);
      break;
    }
  }
}

/**
 * Get the list of registered commands (for external use).
 */
export function getRegisteredCommands(): readonly ChatSdkCommand[] {
  return GATEWAY_COMMANDS;
}
