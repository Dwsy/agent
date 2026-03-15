import type { CommandResponse, InteractionEvent } from "./command-types.ts";
import type { GatewayContext } from "./types.ts";
import { parseKeyboardCallback, resolveKeyboard } from "../api/keyboard-interact.ts";
import { parseModelCallbackData, buildProviderKeyboard } from "../plugins/builtin/telegram/model-buttons.ts";
import { buildCommandHelpPage } from "./command-catalog.ts";
import { getConciseStateManager, getConciseConfigDefault } from "../plugins/builtin/concise-mode/index.ts";

function sessionLabel(sessionKey?: string): string {
  return sessionKey ?? "unknown-session";
}


function buildConciseResponse(sessionKey: string): CommandResponse {
  const manager = getConciseStateManager();
  const configDefault = getConciseConfigDefault();
  const effective = manager?.getEffectiveState(sessionKey, configDefault) ?? configDefault;
  const override = manager?.getSessionOverride(sessionKey);
  const src = override !== undefined ? "override" : "config";
  return {
    text: `<b>当前简洁模式</b>：${effective ? "✅ ON" : "⭕ OFF"} <i>(${src})</i>`,
    parseMode: "HTML",
    keyboard: {
      inline_keyboard: [[
        { text: effective ? "✅ ON" : "ON", callbackData: "csm:on" },
        { text: effective ? "OFF" : "⭕ OFF", callbackData: "csm:off" },
        { text: "🔁 Refresh", callbackData: "csm:status" },
      ], [
        { text: "🔄 Default", callbackData: "csm:reset" },
      ]],
    },
  };
}


async function handleConciseAction(event: InteractionEvent): Promise<boolean> {
  if (!event.sessionKey || !event.actionData.startsWith("csm:")) return false;
  const manager = getConciseStateManager();
  if (!manager) return false;

  if (event.actionData === "csm:on") {
    manager.setSessionOverride(event.sessionKey, true);
    await event.ack({ ok: true, message: "Concise ON" });
  } else if (event.actionData === "csm:off") {
    manager.setSessionOverride(event.sessionKey, false);
    manager.clearSessionSuppressRoutes(event.sessionKey);
    await event.ack({ ok: true, message: "Concise OFF" });
  } else if (event.actionData === "csm:reset") {
    manager.clearSessionOverride(event.sessionKey);
    await event.ack({ ok: true, message: "Reset to config default" });
  } else if (event.actionData === "csm:status") {
    await event.ack({ ok: true, message: "Refreshed" });
  } else {
    return false;
  }

  if (event.respondWith) {
    await event.respondWith(buildConciseResponse(event.sessionKey));
  }
  return true;
}

async function handleSkillRunAction(event: InteractionEvent): Promise<boolean> {
  if (!event.actionData.startsWith("skill_run:")) return false;
  const skillName = event.actionData.slice("skill_run:".length).trim();
  if (!skillName || !event.chatId || !event.senderId) return false;

  await event.ack({ ok: true, message: `Running /${skillName}...` });
  const source = {
    channel: event.channel,
    accountId: event.accountId,
    chatType: "dm" as const,
    chatId: event.chatId,
    senderId: event.senderId,
  };
  const route = { agentId: "main", text: `/${skillName}` };
  const sessionKey = event.sessionKey ?? `agent:${route.agentId}:${event.channel}:dm:${event.chatId}`;
  await event.api?.dispatch?.({
    source,
    sessionKey,
    text: route.text,
    respond: async (text: string) => {
      if (event.respondWith && text?.trim()) {
        await event.respondWith({ text, parseMode: "HTML" });
      }
    },
    setTyping: async () => {},
  } as any);
  return true;
}

async function handleHelpAction(event: InteractionEvent): Promise<boolean> {
  if (!event.actionData.startsWith("cmd_page:")) return false;
  const page = Math.max(1, Number.parseInt(event.actionData.slice("cmd_page:".length), 10) || 1);
  const view = buildCommandHelpPage(page);
  await event.ack({ ok: true });
  if (event.respondWith) {
    await event.respondWith({ text: view.text, keyboard: view.keyboard, parseMode: "HTML", pageId: `cmd_page:${page}` });
  }
  return true;
}

async function handleRoleAction(event: InteractionEvent, ctx: GatewayContext): Promise<boolean> {
  if (!event.sessionKey) return false;
  if (event.actionData.startsWith("role:set:")) {
    const role = event.actionData.slice("role:set:".length).trim();
    const ok = await ctx.setSessionRole(event.sessionKey, role);
    await event.ack({ ok, message: ok ? `Switched: ${role}` : "Switch failed" });
    if (ok && event.respondWith) {
      await event.respondWith({ text: `Role switched to: ${role}` });
    }
    return true;
  }

  if (event.actionData.startsWith("role:del:")) {
    const role = event.actionData.slice("role:del:".length).trim();
    const result = await ctx.deleteRole(role);
    await event.ack({ ok: result.ok, message: result.ok ? `Deleted: ${role}` : (result.error ?? "Delete failed") });
    if (event.respondWith) {
      await event.respondWith({
        text: result.ok ? `Role deleted: ${role}` : `Failed to delete role '${role}': ${result.error ?? "unknown error"}`,
      });
    }
    return true;
  }

  if (event.actionData === "role:hint:create" || event.actionData === "role:hint:delete") {
    await event.ack({ ok: true });
    if (event.respondWith) {
      await event.respondWith({
        text: event.actionData.endsWith("create")
          ? "Use /role create <name> to create role."
          : "Use /role delete <name> to delete role.",
      });
    }
    return true;
  }

  return false;
}

async function handleModelAction(event: InteractionEvent): Promise<boolean> {
  const parsed = parseModelCallbackData(event.actionData);
  if (!parsed || !event.sessionKey) return false;

  if (parsed.type === "select") {
    await event.api?.setModel?.(event.sessionKey, parsed.provider, parsed.modelId);
    await event.ack({ ok: true, message: `已切换到 ${parsed.provider}/${parsed.modelId}` });
    if (event.respondWith) {
      await event.respondWith({ text: `Model: ${parsed.provider}/${parsed.modelId}` });
    }
    return true;
  }

  if (parsed.type === "providers" || parsed.type === "back") {
    const models = await event.api?.getAvailableModels?.(event.sessionKey) ?? [];
    const providers = Array.from(new Set(
      (Array.isArray(models) ? models : [])
        .map((item: any) => String(item?.provider ?? "").trim())
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b));
    await event.ack({ ok: true });
    if (event.respondWith) {
      await event.respondWith({
        text: "选择 Provider：",
        keyboard: { inline_keyboard: buildProviderKeyboard(providers, 2).map((row) => row.map((button) => ({ text: button.text, callbackData: button.callback_data }))) },
      });
    }
    return true;
  }

  await event.ack({ ok: true, message: `${parsed.type}:${sessionLabel(event.sessionKey)}` });
  return true;
}

async function handleKeyboardAction(event: InteractionEvent): Promise<boolean> {
  const parsed = parseKeyboardCallback(event.actionData);
  if (!parsed) return false;
  const resolved = resolveKeyboard(parsed.requestId, parsed.optionId);
  await event.ack({ ok: resolved, message: resolved ? "✅" : "Expired" });
  return true;
}

export async function routeInteractionAction(event: InteractionEvent, ctx?: GatewayContext): Promise<boolean> {
  if (await handleHelpAction(event)) return true;
  if (await handleConciseAction(event)) return true;
  if (ctx && await handleRoleAction(event, ctx)) return true;
  if (await handleSkillRunAction(event)) return true;
  if (await handleKeyboardAction(event)) return true;
  if (await handleModelAction(event)) return true;
  return false;
}
