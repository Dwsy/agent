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
  HttpHandler,
  WsMethodHandler,
} from "./types.ts";
import type { SessionKey } from "../core/types.ts";

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
      ctx.registry.channels.set(channel.id, channel);
      ctx.channelApis.set(channel.id, this);
      pluginLogger.info(`Registered channel: ${channel.id}`);
    },

    registerTool(tool: ToolPlugin) {
      const existing = ctx.registry.tools.get(tool.name);
      if (existing) {
        pluginLogger.warn(`Tool "${tool.name}" already registered by another plugin, overwriting`);
        ctx.registry.conflicts.push({
          type: "tool", name: tool.name,
          existingPlugin: "unknown", newPlugin: pluginId, resolution: "overwritten",
        });
      }
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

    registerCommand(name: string, handler: CommandHandler) {
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
      ctx.registry.commands.set(normalized, { pluginId, handler });
      pluginLogger.info(`Registered command: /${normalized}`);
    },

    registerService(service: BackgroundService) {
      ctx.registry.services.push(service);
      pluginLogger.info(`Registered service: ${service.name}`);
    },

    registerCli(registrar: (program: unknown) => void) {
      ctx.registry.cliRegistrars.push({ pluginId, registrar: registrar as any });
      pluginLogger.info("Registered CLI commands");
    },

    on<T extends PluginHookName>(hook: T, handler: HookHandler<T>) {
      ctx.registry.hooks.register(pluginId, [hook], handler);
    },

    async dispatch(msg) {
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
      const rpc = ctx.pool.getForSession(sessionKey);
      if (rpc) {
        await rpc.setThinkingLevel(level);
      }
    },

    async cycleThinkingLevel(sessionKey: SessionKey) {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) throw new Error(`No RPC process for session ${sessionKey}`);
      return rpc.cycleThinkingLevel();
    },

    async setModel(sessionKey: SessionKey, provider: string, modelId: string) {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (rpc) {
        await rpc.setModel(provider, modelId);
      }
    },

    async getAvailableModels(sessionKey: SessionKey) {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) return [];
      const models = await rpc.getAvailableModels();
      return Array.isArray(models) ? models : [];
    },

    async getSessionMessageMode(sessionKey: SessionKey) {
      return ctx.resolveTelegramMessageMode(sessionKey);
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
      ctx.log.info(`[forwardCommand] ${sessionKey}: ${command} ${args}`);

      switch (command) {
        case "/compact":
          await rpc.compact(args || undefined);
          break;
        case "/stop":
          await rpc.abort();
          break;
        case "/think": {
          const level = args || "medium";
          await rpc.setThinkingLevel(level);
          break;
        }
        case "/model": {
          if (!args || !args.includes("/")) {
            throw new Error("Usage: /model provider/modelId");
          }
          const slash = args.indexOf("/");
          const provider = args.slice(0, slash);
          const modelId = args.slice(slash + 1);
          await rpc.setModel(provider, modelId);
          break;
        }
        default: {
          const fullCommand = args ? `${command} ${args}` : command;
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

    async getSessionStats(sessionKey: SessionKey): Promise<unknown> {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) return null;
      return rpc.getSessionStats();
    },

    async getRpcState(sessionKey: SessionKey): Promise<unknown> {
      const rpc = ctx.pool.getForSession(sessionKey);
      if (!rpc) return null;
      return rpc.getState();
    },

    cronEngine: ctx.cron ?? undefined,

    systemEvents: ctx.systemEvents,

    sessionStore: ctx.sessions,

    requestHeartbeat: ctx.heartbeat ? (agentId: string, reason?: string) => ctx.heartbeat!.requestNow(agentId, reason) : undefined,

    getChannels: () => ctx.registry.channels,

    rpcPool: ctx.pool,

    listSessions() {
      return ctx.sessions.toArray().sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
    },

    releaseSession(sessionKey: SessionKey) {
      ctx.pool.release(sessionKey);
    },

    readTranscript(sessionKey: SessionKey, lastN = 100) {
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
