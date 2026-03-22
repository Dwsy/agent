/**
 * Discord subagent hooks — thread binding for spawned subagents.
 *
 * When the framework spawns a subagent with `threadRequested: true` for Discord,
 * this module creates a Discord thread and binds it to the subagent's session.
 *
 * Reference: openclaw-discord@2026.3.13 src/subagent-hooks.ts
 */
import type { GatewayPluginApi } from "../../types.ts";
import type { DiscordPluginRuntime } from "./types.ts";

// ── Thread Binding Store ───────────────────────────────────────────

export interface ThreadBinding {
  threadId: string;
  channelId: string;
  guildId?: string;
  sessionKey: string;
  accountId: string;
  boundAt: number;
  label?: string;
}

interface ThreadBindingsStore {
  bySessionKey: Map<string, ThreadBinding>;
  byThreadId: Map<string, ThreadBinding>;
}

/** Log via the API logger */
function log(api: GatewayPluginApi, level: "debug" | "info" | "warn" | "error", msg: string): void {
  const logger = (api as any).__logger ?? { debug: console.log, info: console.log, warn: console.warn, error: console.error };
  logger[level](`[discord:subagent] ${msg}`);
}

const store: ThreadBindingsStore = {
  bySessionKey: new Map(),
  byThreadId: new Map(),
};

/** Get the Discord plugin runtime from the API */
function getDiscordRuntime(api: GatewayPluginApi): DiscordPluginRuntime | null {
  // The runtime is attached to the plugin via the gateway's internal state.
  // We access it through the api's channel registry if available.
  return (api as any).__discordRuntime ?? null;
}

/** Set Discord runtime (called from discord/index.ts init) */
export function setDiscordSubagentRuntime(rt: DiscordPluginRuntime): void {
  (arguments[0] as any).__discordRuntime = rt;
}

// ── Thread Binding Operations ───────────────────────────────────────

/**
 * Create a Discord thread and bind it to a subagent session.
 * Called when subagent_spawning fires with threadRequested: true.
 */
export async function createDiscordThreadBinding(
  api: GatewayPluginApi,
  params: {
    channel: string;
    to: string;
    threadId?: string;
    childSessionKey: string;
    agentId?: string;
    label?: string;
    accountId?: string;
  }
): Promise<{ ok: boolean; threadId?: string; error?: string }> {
  const rt = getDiscordRuntime(api);
  if (!rt) {
    return { ok: false, error: "Discord not initialized" };
  }

  const { to, childSessionKey, label, accountId } = params;

  // Parse target: channelId or channel:threadId
  const [targetChannelId, scope, existingThreadId] = to.split(":");
  const channelId = scope === "thread" ? existingThreadId ?? targetChannelId : to;

  try {
    const parentChannel = await rt.client.channels.fetch(channelId);
    if (!parentChannel?.isTextBased()) {
      return { ok: false, error: "Channel not found or not text-based" };
    }

    // Create a new thread
    const threadName = label ?? `agent-${childSessionKey.slice(0, 8)}`;
    const thread = await (parentChannel as any).threads.create({
      name: threadName,
      autoArchiveDuration: 1440, // 24 hours
      reason: `Subagent session: ${childSessionKey}`,
    });

    const binding: ThreadBinding = {
      threadId: thread.id,
      channelId,
      guildId: (parentChannel as any).guildId,
      sessionKey: childSessionKey,
      accountId: accountId ?? rt.clientId,
      boundAt: Date.now(),
      label,
    };

    store.bySessionKey.set(childSessionKey, binding);
    store.byThreadId.set(thread.id, binding);

    log(api, "info", `created thread ${thread.id} for session ${childSessionKey}`);
    return { ok: true, threadId: thread.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(api, "error", `failed to create thread: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Remove thread binding for a session.
 * Called when subagent_ended fires.
 */
export async function removeDiscordThreadBinding(
  api: GatewayPluginApi,
  sessionKey: string,
  reason?: string
): Promise<void> {
  const binding = store.bySessionKey.get(sessionKey);
  if (!binding) return;

  store.bySessionKey.delete(sessionKey);
  store.byThreadId.delete(binding.threadId);

  log(api, "info", `unbound thread ${binding.threadId} (${reason ?? "session ended"})`);
}

/**
 * Get thread binding for a session.
 */
export function getDiscordThreadBinding(sessionKey: string): ThreadBinding | undefined {
  return store.bySessionKey.get(sessionKey);
}

/**
 * List thread bindings for an account.
 */
export function listDiscordThreadBindings(accountId?: string): ThreadBinding[] {
  const all = Array.from(store.bySessionKey.values());
  if (accountId) return all.filter((b) => b.accountId === accountId);
  return all;
}

/**
 * Register subagent lifecycle hooks on the pi-gateway API.
 * This enables Discord thread binding when subagents are spawned for Discord sessions.
 */
export function registerDiscordSubagentHooks(api: GatewayPluginApi): void {
  // Wire runtime so hooks can access the Discord client
  const rt = getDiscordRuntime(api);
  if (rt) setDiscordSubagentRuntime(rt);

  // subagent_spawning — create thread binding if threadRequested
  // Note: return values are informational; pi-gateway hooks don't propagate spawn results
  api.on("subagent_spawning" as any, async (event: any) => {
    if (!event.threadRequested) return;

    const channel = event.requester?.channel?.trim().toLowerCase();
    if (channel !== "discord") return;

    const flags = resolveThreadBindingFlags(api, event.requester?.accountId);
    if (!flags.enabled) return;
    if (!flags.spawnSubagentSessions) return;

    const result = await createDiscordThreadBinding(api, {
      channel: channel,
      to: event.requester?.to ?? "",
      threadId: event.requester?.threadId,
      childSessionKey: event.childSessionKey ?? "",
      agentId: event.agentId,
      label: event.label,
      accountId: event.requester?.accountId,
    });

    if (!result.ok) {
      log(api, "error", `thread binding failed: ${result.error}`);
    }
  });

  // subagent_ended — clean up thread binding
  api.on("subagent_ended" as any, (event: any) => {
    if (!event.targetSessionKey) return;
    removeDiscordThreadBinding(api, event.targetSessionKey, event.reason);
  });

  // subagent_delivery_target — route completion message to bound thread
  // Note: pi-gateway hooks don't propagate delivery target results, but we log the binding
  api.on("subagent_delivery_target" as any, (event: any) => {
    if (!event.expectsCompletionMessage) return;

    const requesterChannel = event.requesterOrigin?.channel?.trim().toLowerCase();
    if (requesterChannel !== "discord") return;

    const bindings = listDiscordThreadBindings(event.requesterOrigin?.accountId);
    if (!bindings.length) return;

    const requesterThreadId = event.requesterOrigin?.threadId;
    let binding: ThreadBinding | undefined;

    if (requesterThreadId) {
      binding = bindings.find(
        (b) =>
          b.threadId === requesterThreadId &&
          (!event.requesterOrigin?.accountId || b.accountId === event.requesterOrigin.accountId)
      );
    }
    if (!binding && bindings.length === 1) {
      binding = bindings[0];
    }

    if (binding) {
      log(api, "debug", `delivery target resolved to thread ${binding.threadId}`);
    }
  });

  (api.logger as any)?.debug?.("[discord:subagent] hooks registered");
}

// ── Config Resolution ───────────────────────────────────────────────

interface ThreadBindingFlags {
  enabled: boolean;
  spawnSubagentSessions: boolean;
}

function resolveThreadBindingFlags(api: GatewayPluginApi, accountId?: string): ThreadBindingFlags {
  const discordCfg = (api.config.channels?.discord as any) ?? {};
  const base = discordCfg.threadBindings ?? {};
  const account = accountId ? discordCfg.accounts?.[accountId] : null;
  const accountFlags = account?.threadBindings ?? {};

  return {
    enabled: accountFlags.enabled ?? base.enabled ?? ((api.config.session as any)?.threadBindings?.enabled ?? true),
    spawnSubagentSessions:
      accountFlags.spawnSubagentSessions ?? base.spawnSubagentSessions ?? false,
  };
}
