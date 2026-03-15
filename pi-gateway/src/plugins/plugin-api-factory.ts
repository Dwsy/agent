/**
 * Plugin API Factory — extracted from server.ts (v3.4 R2)
 *
 * Constructs the GatewayPluginApi object passed to plugins during init.
 * Each plugin gets its own API instance with scoped logger and registration methods.
 */

import { createLogger as createConsoleLogger } from "../core/types.ts";
import { createFileLogger } from "../core/logger-file.ts";
import type { GatewayContext } from "../gateway/types.ts";
import { resetSession } from "../gateway/session-reset.ts";
import type { RpcClient } from "../core/rpc-client.ts";
import type {
  GatewayPluginApi,
  PluginManifest,
  PluginHookName,
  HookHandler,
  ChannelPlugin,
  ToolPlugin,
  BackgroundService,
  CommandHandler,
  CliProgram,
  HttpHandler,
  WsMethodHandler,
  SessionKey,
} from "../core/index.ts";
import type { CommandCatalogEntry, NativeCommandSpec } from "../gateway/command-types.ts";

export function createPluginApi(
  pluginId: string,
  manifest: PluginManifest,
  ctx: GatewayContext,
): GatewayPluginApi {
  const pluginLogger = ctx.config.logging.file
    ? createFileLogger(`plugin:${pluginId}`)
    : createConsoleLogger(`plugin:${pluginId}`);

  return {
    id: pluginId,
    name: manifest.name,
    source: "gateway",
    config: ctx.config,
    pluginConfig: ctx.config.plugins.config?.[pluginId],
    logger: pluginLogger,

    onHook(name: string, handler: any) {
      ctx.registry.hooks.register(pluginId, [name as PluginHookName], handler);
    },

    emitEvent(event: any) {
      // SystemEventsQueue uses inject(sessionKey, text)
      pluginLogger.debug(`[emitEvent] ${JSON.stringify(event)}`);
    },

    getConfig<T = unknown>(): T {
      return ctx.config as unknown as T;
    },

    broadcastToWs(event: string, payload: unknown) {
      ctx.broadcastToWs?.(event, payload);
    },

    registerChannel(channel: ChannelPlugin) {
      if (ctx.registry.channels.has(channel.id)) {
        pluginLogger.warn(`Channel ${channel.id} already registered, skipping`);
        ctx.registry.conflicts.push({
          type: "channel", name: channel.id,
          existingPlugin: ctx.channelApis.get(channel.id)?.id ?? "unknown",
          newPlugin: pluginId, resolution: "skipped",
        });
        return;
      }
      // Attach pluginId for hot reload teardown
      (channel as any).__pluginId = pluginId;
      ctx.registry.channels.set(channel.id, channel);
      ctx.channelApis.set(channel.id, this);
      pluginLogger.info(`Registered channel: ${channel.id}`);
    },

    registerTool(...args: [ToolPlugin] | [string, any]) {
      const tool: ToolPlugin = typeof args[0] === "string"
        ? { name: args[0], ...args[1] } as ToolPlugin
        : args[0] as ToolPlugin;
      const existing = ctx.registry.tools.get(tool.name);
      if (existing) {
        pluginLogger.warn(`Tool "${tool.name}" already registered by another plugin, overwriting`);
        ctx.registry.conflicts.push({
          type: "tool", name: tool.name,
          existingPlugin: "unknown", newPlugin: pluginId, resolution: "overwritten",
        });
      }
      // Attach pluginId for hot reload teardown
      (tool as any).__pluginId = pluginId;
      ctx.registry.tools.set(tool.name, tool);
      pluginLogger.info(`Registered tool: ${tool.name}`);
    },

    registerHook(events: PluginHookName[], handler: HookHandler) {
      ctx.registry.hooks.register(pluginId, events, handler);
    },

    registerHttpRoute(method: string, path: string, handler: HttpHandler) {
      const dup = ctx.registry.httpRoutes.find(r => r.method === method.toUpperCase() && r.path === path);
      if (dup) {
        pluginLogger.warn(`HTTP route ${method.toUpperCase()} ${path} already registered by ${dup.pluginId}, adding duplicate`);
        ctx.registry.conflicts.push({
          type: "httpRoute", name: `${method.toUpperCase()} ${path}`,
          existingPlugin: dup.pluginId, newPlugin: pluginId, resolution: "duplicate",
        });
      }
      ctx.registry.httpRoutes.push({ method: method.toUpperCase(), path, handler, pluginId });
      pluginLogger.info(`Registered HTTP route: ${method} ${path}`);
    },

    registerGatewayMethod(method: string, handler: WsMethodHandler) {
      const existing = ctx.registry.gatewayMethods.get(method);
      if (existing) {
        pluginLogger.warn(`Gateway method ${method} already registered, skipping`);
        ctx.registry.conflicts.push({
          type: "wsMethod", name: method,
          existingPlugin: existing.pluginId, newPlugin: pluginId, resolution: "skipped",
        });
        return;
      }
      ctx.registry.gatewayMethods.set(method, { handler, pluginId });
      pluginLogger.info(`Registered gateway method: ${method}`);
    },

    registerCommand(name: string, handler: CommandHandler, meta?: { description?: string; exposeInNativeUi?: boolean; group?: string; supportsArgs?: boolean }) {
      const normalized = name.replace(/^\//, "").trim().toLowerCase();
      if (!normalized) {
        pluginLogger.warn("Skipped empty command registration");
        return;
      }
      const existing = ctx.registry.commands.get(normalized);
      if (existing) {
        pluginLogger.warn(`Command "/${normalized}" already registered by ${existing.pluginId}, overwriting`);
        ctx.registry.conflicts.push({
          type: "command", name: `/${normalized}`,
          existingPlugin: existing.pluginId, newPlugin: pluginId, resolution: "overwritten",
        });
      }
      ctx.registry.commands.set(normalized, {
        pluginId,
        handler,
        meta: meta ? {
          name: normalized,
          description: meta.description ?? `/${normalized}`,
          source: "builtin",
          exposeInNativeUi: meta.exposeInNativeUi,
          group: meta.group,
          supportsArgs: meta.supportsArgs,
        } satisfies CommandCatalogEntry : undefined,
      });
      pluginLogger.info(`Registered command: /${normalized}`);
    },

    registerService(service: BackgroundService) {
      // Attach pluginId for hot reload teardown
      (service as any).__pluginId = pluginId;
      ctx.registry.services.push(service);
      pluginLogger.info(`Registered service: ${service.name}`);
    },

    registerCli(registrar: (program: CliProgram) => void) {
      ctx.registry.cliRegistrars.push({ pluginId, registrar: registrar as any });
      pluginLogger.info("Registered CLI commands");
    },

    on(hook: string, handler: any) {
      ctx.registry.hooks.register(pluginId, [hook as PluginHookName], handler);
    },

    async dispatch(msg: any) {
      return ctx.dispatch(msg);
    },

    async sendToChannel(channel: string, target: string, text: string) {
      const ch = ctx.registry.channels.get(channel);
      if (!ch) throw new Error(`Channel not found: ${channel}`);
      await ch.outbound.sendText(target, text);
    },

    getSessionState(sessionKey: SessionKey) {
      return ctx.sessions.get(sessionKey) ?? null;
    },

    async resetSession(sessionKey: SessionKey) {
      await resetSession(ctx, sessionKey);
    },

    async setThinkingLevel(sessionKey: SessionKey, level: string) {
      const normalizedLevel = String(level ?? "").trim();
      if (!normalizedLevel) {
        throw new Error("level is required");
      }

      const session = ctx.sessions.get(sessionKey);
      if (session) {
        session.lastThinkingLevel = normalizedLevel as any;
        session.lastThinkingLevelSource = "runtime.command";
        session.appliedThinkingLevel = undefined;
        session.appliedThinkingRpcProcessId = undefined;
        ctx.sessions.touch(sessionKey);
      }

      let rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) {
        const role = session?.role ?? "default";
        const profile = ctx.buildSessionProfile(sessionKey, role);
        rpc = await ctx.pool.acquire(sessionKey, profile);
      }

      await rpc.setThinkingLevel(normalizedLevel);
    },

    async cycleThinkingLevel(sessionKey: SessionKey): Promise<string | undefined> {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) throw new Error(`No RPC process for session ${sessionKey}`);
      return rpc.cycleThinkingLevel() as Promise<string | undefined>;
    },

    async setModel(sessionKey: SessionKey, provider: string, modelId: string) {
      const normalizedProvider = String(provider ?? "").trim();
      const normalizedModelId = String(modelId ?? "").trim();
      if (!normalizedProvider || !normalizedModelId) {
        throw new Error("provider and modelId are required");
      }

      const session = ctx.sessions.get(sessionKey);
      if (session) {
        session.lastModel = `${normalizedProvider}/${normalizedModelId}`;
        session.lastModelSource = "runtime.command";
        session.appliedModel = undefined;
        session.appliedModelRpcProcessId = undefined;
        ctx.sessions.touch(sessionKey);
      }

      let rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) {
        const role = session?.role ?? "default";
        const profile = ctx.buildSessionProfile(sessionKey, role);
        rpc = await ctx.pool.acquire(sessionKey, profile);
      }

      await rpc.setModel(normalizedProvider, normalizedModelId);
    },

    async getAvailableModels(sessionKey: SessionKey) {
      let rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) {
        const session = ctx.sessions.get(sessionKey);
        const role = session?.role ?? "default";
        const profile = ctx.buildSessionProfile(sessionKey, role);
        rpc = await ctx.pool.acquire(sessionKey, profile);
      }
      const models = await rpc.getAvailableModels();
      return Array.isArray(models) ? models : [];
    },

    async getSessionMessageMode(sessionKey: SessionKey) {
      const session = ctx.sessions.get(sessionKey);
      const channel = session?.lastChannel || sessionKey.split(":")[2] || "telegram";
      const accountId = session?.lastAccountId;
      return ctx.resolveSessionMessageMode(sessionKey, { channel, accountId });
    },

    async setSessionMessageMode(sessionKey: SessionKey, mode: "steer" | "follow-up" | "interrupt") {
      ctx.sessionMessageModeOverrides.set(sessionKey, mode);
    },

    async compactSession(sessionKey: SessionKey, instructions?: string) {
      await ctx.compactSessionWithHooks(sessionKey, instructions);
    },

    async abortSession(sessionKey: SessionKey) {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (rpc) {
        await rpc.abort();
      }
    },

    async forwardCommand(sessionKey: SessionKey, command: string, args: string) {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) {
        throw new Error(`No RPC process for session ${sessionKey}`);
      }

      const rawCommand = String(command ?? "");
      const normalizedCommand = rawCommand.trim().toLowerCase();
      const canonicalCommand = normalizedCommand === "/relaod" ? "/reload" : normalizedCommand;
      const normalizedArgs = typeof args === "string" ? args : "";

      ctx.log.info("[forwardCommand] routing command", {
        sessionKey,
        rawCommand,
        normalizedCommand: canonicalCommand,
        args: normalizedArgs,
      });

      if (normalizedCommand === "/relaod") {
        ctx.log.warn("[forwardCommand] corrected typo alias", {
          sessionKey,
          rawCommand,
          normalizedCommand: canonicalCommand,
        });
      }

      switch (canonicalCommand) {
        case "/compact":
          await rpc.compact(normalizedArgs || undefined);
          break;
        case "/stop":
          await rpc.abort();
          break;
        case "/think": {
          const level = normalizedArgs || "medium";
          await rpc.setThinkingLevel(level);
          break;
        }
        case "/model": {
          if (!normalizedArgs || !normalizedArgs.includes("/")) {
            throw new Error("Usage: /model provider/modelId");
          }
          const slash = normalizedArgs.indexOf("/");
          const provider = normalizedArgs.slice(0, slash);
          const modelId = normalizedArgs.slice(slash + 1);
          await rpc.setModel(provider, modelId);
          break;
        }
        default: {
          const fullCommand = normalizedArgs ? `${canonicalCommand} ${normalizedArgs}` : canonicalCommand;
          await rpc.prompt(fullCommand);
        }
      }
    },

    async getPiCommands(_sessionKey: SessionKey): Promise<{ name: string; description?: string }[]> {
      const pool = ctx.pool as any;
      let rpc: RpcClient | null = null;
      if (pool.clients) {
        for (const client of pool.clients.values()) {
          if (client.isIdle && client.isAlive) {
            rpc = client;
            break;
          }
        }
      }
      if (!rpc) {
        ctx.log.debug(`[getPiCommands] no idle RPC available`);
        return [];
      }
      try {
        const commands = await rpc.getCommands();
        ctx.log.info(`[getPiCommands] got ${commands.length} commands from ${rpc.id}`);
        return commands;
      } catch (err) {
        ctx.log.warn(`[getPiCommands] failed to get commands: ${err}`);
        return [];
      }
    },

    async getSessionStats(sessionKey: SessionKey) {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) return null;
      return rpc.getSessionStats() as any;
    },

    async getRpcState(sessionKey: SessionKey) {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) return null;
      return rpc.getState() as any;
    },

    cronEngine: ctx.cron ?? undefined,

    systemEvents: ctx.systemEvents,

    sessionStore: ctx.sessions,

    requestHeartbeat: ctx.heartbeat ? (agentId: string, reason?: string) => ctx.heartbeat!.requestNow(agentId, reason) : undefined,

    getChannels: () => ctx.registry.channels,

    rpcPool: ctx.pool,

    get modelHealth() {
      return ctx.modelHealth;
    },

    listSessions() {
      return ctx.sessions.toArray().sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
    },

    releaseSession(sessionKey: SessionKey) {
      ctx.pool.release(sessionKey);
    },

    readTranscript(sessionKey: SessionKey, lastN = 100): any[] {
      return ctx.transcripts.readTranscript(sessionKey, lastN);
    },

    listAvailableRoles() {
      return ctx.listAvailableRoles();
    },

    async setSessionRole(sessionKey: SessionKey, role: string) {
      return ctx.setSessionRole(sessionKey, role);
    },

    async createRole(role: string) {
      return ctx.createRole(role);
    },

    async deleteRole(role: string) {
      return ctx.deleteRole(role);
    },
  };
}
