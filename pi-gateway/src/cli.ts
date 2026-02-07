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

// ============================================================================
// Commands
// ============================================================================

async function runGateway(): Promise<void> {
  const port = getArg("port") ? parseInt(getArg("port")!, 10) : undefined;
  const verbose = getFlag("verbose");
  const configPath = getArg("config");

  const gateway = new Gateway({ port, verbose, configPath });

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
  if (config.channels.telegram?.enabled && config.channels.telegram?.botToken) {
    console.log(`  Telegram: configured (token: ${config.channels.telegram.botToken.slice(0, 8)}...)`);
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
    console.error("Usage: pi-gw send --to <channel:target> --message <text>");
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

  if (subcommand === "list") {
    const channel = getArg("channel");
    const requests = listPendingRequests(channel);

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

    const senderId = approvePairingRequest(channel, code);
    if (senderId) {
      console.log(`Approved! Sender ${senderId} added to ${channel} allowlist.`);
    } else {
      console.error(`Pairing code not found or expired: ${code}`);
      process.exit(1);
    }
  } else {
    console.log("Usage:");
    console.log("  pi-gw pairing list [--channel <channel>]");
    console.log("  pi-gw pairing approve <channel> <code>");
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
  pi-gw gateway [--port N] [--verbose] [--config path]   Start the gateway
  pi-gw doctor [--config path]                            Health check
  pi-gw send --to <target> --message <text>               Send a message
  pi-gw config show                                       Show configuration
  pi-gw pairing list [--channel <ch>]                     List pending pairing requests
  pi-gw pairing approve <channel> <code>                  Approve a pairing request
  pi-gw cron list                                         List cron jobs
  pi-gw cron add <id> --schedule <expr> --text <text>     Add a cron job
  pi-gw cron remove <id>                                  Remove a cron job
  pi-gw install-daemon [--port N]                         Install as system daemon
  pi-gw uninstall-daemon                                  Remove system daemon
  pi-gw help                                              Show this help

Environment:
  PI_GATEWAY_CONFIG   Path to config file (default: ~/.pi/gateway/pi-gateway.json)
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
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
