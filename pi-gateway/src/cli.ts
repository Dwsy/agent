#!/usr/bin/env bun
/**
 * CLI entry point for pi-gateway.
 *
 * Commands (aligned with OpenClaw CLI surface):
 *   pi-gw gateway [--port N] [--verbose]    Start the gateway
 *   pi-gw doctor                            Health check
 *   pi-gw send --to <target> --message <m>  Send a message
 *   pi-gw config show                       Show current config
 */

import { Gateway } from "./server.ts";
import { loadConfig, resolveConfigPath, type CronJob } from "./core/config.ts";
import { listPendingRequests, approvePairingRequest } from "./security/pairing.ts";
import { CronEngine } from "./core/cron.ts";
import { installDaemon, uninstallDaemon } from "./core/daemon.ts";
import { createPluginRegistry, PluginLoader } from "./plugins/loader.ts";
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
  CliProgram,
  CliCommandHandler,
} from "./plugins/types.ts";
import type { InboundMessage, SessionKey } from "./core/types.ts";
import type { DispatchResult } from "./gateway/types.ts";
import { createLogger } from "./core/types.ts";

// ============================================================================
// Argument Parsing
// ============================================================================

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function parseCliArgs(argv: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }

  return { positional, flags };
}

interface RegisteredCliEntry {
  pluginId: string;
  description: string;
  handler: CliCommandHandler;
}

function createCliOnlyPluginApi(
  config: ReturnType<typeof loadConfig>,
  pluginId: string,
  manifest: PluginManifest,
  registry: ReturnType<typeof createPluginRegistry>,
): GatewayPluginApi {
  const logger = createLogger(`plugin-cli:${pluginId}`);

  return {
    id: pluginId,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    source: "gateway",
    config,
    pluginConfig: config.plugins.config?.[pluginId],
    logger,

    registerChannel(_channel: ChannelPlugin): void {},
    registerTool(_tool: ToolPlugin): void {},
    registerHook(_events: PluginHookName[], _handler: HookHandler): void {},
    registerHttpRoute(_method: string, _path: string, _handler: HttpHandler): void {},
    registerGatewayMethod(_method: string, _handler: WsMethodHandler): void {},
    registerCommand(_name: string, _handler: CommandHandler): void {},
    registerService(_service: BackgroundService): void {},
    registerCli(registrar: (program: unknown) => void): void {
      registry.cliRegistrars.push({ pluginId, registrar: registrar as (program: CliProgram) => void });
    },
    on<T extends PluginHookName>(_hook: T, _handler: HookHandler<T>): void {},

    async dispatch(_msg: InboundMessage): Promise<DispatchResult> {
      throw new Error("dispatch is not available in CLI-only plugin context");
    },
    async sendToChannel(_channel: string, _target: string, _text: string): Promise<void> {
      throw new Error("sendToChannel is not available in CLI-only plugin context");
    },
    getSessionState(_sessionKey: SessionKey) {
      return null;
    },
    async resetSession(_sessionKey: SessionKey): Promise<void> {},
    async setThinkingLevel(_sessionKey: SessionKey, _level: string): Promise<void> {},
    async setModel(_sessionKey: SessionKey, _provider: string, _modelId: string): Promise<void> {},
    async getAvailableModels(_sessionKey: SessionKey): Promise<unknown[]> { return []; },
    async getSessionMessageMode(): Promise<"steer" | "follow-up" | "interrupt"> { return "steer"; },
    async setSessionMessageMode(): Promise<void> {},
    async compactSession(_sessionKey: SessionKey, _instructions?: string): Promise<void> {},
    async abortSession(_sessionKey: SessionKey): Promise<void> {},
    async forwardCommand(_sessionKey: SessionKey, _command: string, _args: string): Promise<void> {
      throw new Error("forwardCommand is not available in CLI-only plugin context");
    },
    async getPiCommands(_sessionKey: SessionKey): Promise<{ name: string; description?: string }[]> {
      return [];
    },
  };
}

async function loadPluginCliCommands(configPath?: string): Promise<Map<string, RegisteredCliEntry>> {
  const config = loadConfig(configPath);
  const registry = createPluginRegistry();
  const entries = new Map<string, RegisteredCliEntry>();

  const loader = new PluginLoader(
    config,
    registry,
    (pluginId, manifest) => createCliOnlyPluginApi(config, pluginId, manifest, registry),
  );

  await loader.loadAll();
  await loader.loadBuiltins();

  for (const { pluginId, registrar } of registry.cliRegistrars) {
    const program: CliProgram = {
      command(name: string, description: string, handler: CliCommandHandler) {
        const key = name.trim();
        if (!key) return;
        if (entries.has(key)) return;
        entries.set(key, { pluginId, description, handler });
      },
    };

    try {
      registrar(program);
    } catch (err: any) {
      console.warn(`Plugin CLI registrar failed (${pluginId}): ${err?.message ?? String(err)}`);
    }
  }

  return entries;
}

async function runPluginCliIfMatched(): Promise<boolean> {
  if (!command) return false;
  const pluginCommands = await loadPluginCliCommands(getArg("config"));
  const entry = pluginCommands.get(command);
  if (!entry) return false;

  const { positional, flags } = parseCliArgs(args.slice(1));
  await entry.handler(positional, flags);
  return true;
}

// ============================================================================
// Commands
// ============================================================================

async function runGateway(): Promise<void> {
  const port = getArg("port") ? parseInt(getArg("port")!, 10) : undefined;
  const verbose = getFlag("verbose");
  const noGui = getFlag("no-gui");
  const configPath = getArg("config");

  const gateway = new Gateway({ port, verbose, noGui, configPath });

  // Graceful shutdown
  const shutdown = async () => {
    await gateway.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await gateway.start();
}

async function runDoctor(): Promise<void> {
  const config = loadConfig(getArg("config"));
  const configPath = resolveConfigPath();
  const normalizeMessageMode = (value: unknown): "steer" | "follow-up" | "interrupt" | null => {
    return value === "steer" || value === "follow-up" || value === "interrupt" ? value : null;
  };

  console.log("pi-gateway doctor");
  console.log("=================\n");

  // Config
  console.log(`Config: ${configPath}`);
  console.log(`Port: ${config.gateway.port}`);
  console.log(`Bind: ${config.gateway.bind}`);
  console.log(`Auth: ${config.gateway.auth.mode}`);
  console.log(`Pi CLI: ${config.agent.piCliPath ?? "pi"}`);
  console.log(`Pool: min=${config.agent.pool.min}, max=${config.agent.pool.max}`);
  console.log();

  // Check pi CLI
  try {
    const proc = Bun.spawn([config.agent.piCliPath ?? "pi", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    console.log(`pi CLI: OK (${output.trim()})`);
  } catch {
    console.log("pi CLI: NOT FOUND — install with: npm install -g @mariozechner/pi-coding-agent");
  }

  // Channels
  console.log("\nChannels:");
  const tg = config.channels.telegram;
  if (tg?.enabled) {
    const topLevelMode = normalizeMessageMode(tg.messageMode) ?? "steer";
    const accountEntries = Object.entries(tg.accounts ?? {});
    if (accountEntries.length === 0) {
      const mode = tg.webhookUrl ? "webhook" : "polling";
      const tokenHint = tg.botToken ? `${tg.botToken.slice(0, 8)}...` : (tg.tokenFile ? `tokenFile:${tg.tokenFile}` : "env/none");
      console.log(`  Telegram[default]: enabled, mode=${mode}, messageMode=${topLevelMode}, token=${tokenHint}`);
    } else {
      const hasDefault = accountEntries.some(([id]) => id === "default");
      if (!hasDefault && (tg.botToken || tg.tokenFile)) {
        const mode = tg.webhookUrl ? "webhook" : "polling";
        const tokenHint = tg.botToken ? `${tg.botToken.slice(0, 8)}...` : `tokenFile:${tg.tokenFile}`;
        console.log(`  Telegram[default]: enabled, mode=${mode}, messageMode=${topLevelMode}, token=${tokenHint}`);
      }
      for (const [id, ac] of accountEntries) {
        const mode = ac.webhookUrl ? "webhook" : "polling";
        const enabled = ac.enabled !== false;
        const resolvedMessageMode = normalizeMessageMode(ac.messageMode) ?? topLevelMode;
        const tokenHint = ac.botToken ? `${ac.botToken.slice(0, 8)}...` : (ac.tokenFile ? `tokenFile:${ac.tokenFile}` : "inherit/env/none");
        console.log(
          `  Telegram[${id}]: ${enabled ? "enabled" : "disabled"}, mode=${mode}, messageMode=${resolvedMessageMode}, token=${tokenHint}`,
        );
      }
    }
    console.log("  Telegram commands: /queue [steer|follow-up|interrupt]");
  } else {
    console.log("  Telegram: not configured");
  }
  if (config.channels.discord?.enabled && config.channels.discord?.token) {
    console.log(`  Discord: configured (token: ${config.channels.discord.token.slice(0, 8)}...)`);
  } else {
    console.log("  Discord: not configured");
  }

  // Security
  console.log("\nSecurity:");
  if (config.gateway.auth.mode === "off") {
    console.log("  WARNING: Gateway auth is OFF. Anyone on the network can access the gateway.");
  } else {
    console.log(`  Auth mode: ${config.gateway.auth.mode}`);
  }

  const tgPolicy = config.channels.telegram?.dmPolicy ?? "pairing";
  console.log(`  Telegram DM policy: ${tgPolicy}`);
  if (tgPolicy === "open") {
    console.log("  WARNING: Telegram DMs are open to anyone.");
  }

  console.log("\nDone.");
}

async function runSend(): Promise<void> {
  const to = getArg("to");
  const message = getArg("message");

  if (!to || !message) {
    console.error(`Usage: pi-gw send --to <channel:target> --message <text>\nExamples: telegram:123456 | telegram:default:123456 | telegram:default:123456:topic:1`);
    process.exit(1);
  }

  const config = loadConfig(getArg("config"));
  const port = config.gateway.port;

  try {
    const res = await fetch(`http://localhost:${port}/api/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, message }),
    });

    if (res.ok) {
      console.log("Message sent.");
    } else {
      const body = await res.text();
      console.error(`Failed: ${res.status} ${body}`);
    }
  } catch (err: any) {
    console.error(`Cannot connect to gateway at :${port}. Is it running?`);
  }
}

function showConfig(): void {
  const configPath = resolveConfigPath();
  const config = loadConfig();

  console.log(`Config path: ${configPath}\n`);
  console.log(JSON.stringify(config, null, 2));
}

async function runPairing(): Promise<void> {
  const subcommand = args[1];
  const account = getArg("account");

  if (subcommand === "list") {
    const channel = getArg("channel");
    const requests = listPendingRequests(channel, account);

    if (requests.length === 0) {
      console.log("No pending pairing requests.");
      return;
    }

    console.log("Pending pairing requests:\n");
    console.log("  Channel      Code        Sender ID            Name              Age");
    console.log("  " + "-".repeat(78));
    for (const r of requests) {
      const ageMin = Math.round((Date.now() - r.createdAt) / 60000);
      const name = r.senderName ?? "-";
      console.log(
        `  ${r.channel.padEnd(12)} ${r.code.padEnd(11)} ${r.senderId.padEnd(20)} ${name.padEnd(17)} ${ageMin}m ago`,
      );
    }
    console.log();
  } else if (subcommand === "approve") {
    const channel = args[2];
    const code = args[3];

    if (!channel || !code) {
      console.error("Usage: pi-gw pairing approve <channel> <code>");
      process.exit(1);
    }

    const senderId = approvePairingRequest(channel, code, account);
    if (senderId) {
      console.log(`Approved! Sender ${senderId} added to ${channel}${account ? `(${account})` : ""} allowlist.`);
    } else {
      console.error(`Pairing code not found or expired: ${code}`);
      process.exit(1);
    }
  } else {
    console.log("Usage:");
    console.log("  pi-gw pairing list [--channel <channel>] [--account <accountId>]");
    console.log("  pi-gw pairing approve <channel> <code> [--account <accountId>]");
  }
}

async function runCron(): Promise<void> {
  const sub = args[1];
  const config = loadConfig(getArg("config"));
  const dataDir = config.session.dataDir.replace(/\/sessions$/, "");
  // Create a no-op dispatcher for listing only
  const engine = new CronEngine(dataDir, { dispatch: async () => {} });

  if (sub === "list") {
    const jobs = engine.listJobs();
    if (jobs.length === 0) {
      console.log("No cron jobs.");
      return;
    }
    console.log("Cron jobs:\n");
    console.log("  ID                Schedule               Session Key                   Text");
    console.log("  " + "-".repeat(90));
    for (const j of jobs) {
      const sched = `${j.schedule.kind}:${j.schedule.expr}`;
      const sk = j.sessionKey ?? `cron:${j.id}`;
      const enabled = j.enabled === false ? " [DISABLED]" : "";
      console.log(`  ${j.id.padEnd(18)} ${sched.padEnd(22)} ${sk.padEnd(30)} ${j.payload.text.slice(0, 30)}${enabled}`);
    }
    console.log();
  } else if (sub === "add") {
    const id = args[2];
    const schedule = getArg("schedule");
    const text = getArg("text");
    const sessionKey = getArg("session");
    const kind = (getArg("kind") ?? "cron") as "cron" | "at" | "every";

    if (!id || !schedule || !text) {
      console.error("Usage: pi-gw cron add <id> --schedule <expr> --text <text> [--kind cron|at|every] [--session <key>]");
      process.exit(1);
    }

    const job: CronJob = {
      id,
      schedule: { kind, expr: schedule },
      sessionKey,
      payload: { text },
      enabled: true,
    };

    engine.addJob(job);
    console.log(`Job added: ${id}`);
  } else if (sub === "remove") {
    const id = args[2];
    if (!id) {
      console.error("Usage: pi-gw cron remove <id>");
      process.exit(1);
    }
    if (engine.removeJob(id)) {
      console.log(`Job removed: ${id}`);
    } else {
      console.error(`Job not found: ${id}`);
      process.exit(1);
    }
  } else {
    console.log("Usage:");
    console.log("  pi-gw cron list");
    console.log("  pi-gw cron add <id> --schedule <expr> --text <text> [--kind cron|at|every]");
    console.log("  pi-gw cron remove <id>");
  }
}

function showHelp(): void {
  console.log(`
pi-gateway — Local AI Gateway for pi agent

Usage:
  pi-gw gateway [--port N] [--verbose] [--no-gui] [--config path]   Start the gateway
  pi-gw doctor [--config path]                            Health check
  pi-gw send --to <target> --message <text>               Send a message (telegram:<chatId> or telegram:<accountId>:<chatId>[:topic:<tid>])
  pi-gw config show                                       Show configuration
  pi-gw pairing list [--channel <ch>] [--account <id>]    List pending pairing requests
  pi-gw pairing approve <channel> <code> [--account <id>] Approve a pairing request
  pi-gw cron list                                         List cron jobs
  pi-gw cron add <id> --schedule <expr> --text <text>     Add a cron job
  pi-gw cron remove <id>                                  Remove a cron job
  pi-gw install-daemon [--port N]                         Install as system daemon
  pi-gw uninstall-daemon                                  Remove system daemon
  pi-gw help                                              Show this help
  pi-gw <plugin-command> [...]                            Run plugin-registered CLI command

Environment:
  PI_GATEWAY_CONFIG   Path to config file (default: ~/.pi/gateway/pi-gateway.jsonc)
`);
}

// ============================================================================
// Main
// ============================================================================

switch (command) {
  case "gateway":
  case "start":
    await runGateway();
    break;
  case "doctor":
    await runDoctor();
    break;
  case "send":
    await runSend();
    break;
  case "pairing":
    await runPairing();
    break;
  case "cron":
    await runCron();
    break;
  case "install-daemon": {
    const config = loadConfig(getArg("config"));
    const port = getArg("port") ? parseInt(getArg("port")!, 10) : config.gateway.port;
    installDaemon({ port, configPath: getArg("config") });
    break;
  }
  case "uninstall-daemon":
    uninstallDaemon();
    break;
  case "config":
    if (args[1] === "show") showConfig();
    else showHelp();
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    showHelp();
    break;
  default: {
    if (await runPluginCliIfMatched()) {
      break;
    }
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
  }
}
