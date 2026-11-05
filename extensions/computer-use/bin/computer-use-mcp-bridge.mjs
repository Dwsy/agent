#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEBUG = process.env.COMPUTER_USE_BRIDGE_DEBUG === "1";

function debug(message) {
  if (DEBUG) process.stderr.write(`[computer-use-bridge] ${message}\n`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveUpstreamPath() {
  const override = process.env.COMPUTER_USE_CLIENT_PATH?.trim();
  if (override) return path.resolve(override);

  const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return path.join(
    codexHome,
    "computer-use",
    "Codex Computer Use.app",
    "Contents",
    "SharedSupport",
    "SkyComputerUseClient.app",
    "Contents",
    "MacOS",
    "SkyComputerUseClient",
  );
}

// 🎯 Sky 服务按父进程的签名团队（2DC432GLL2）认证调用方，应用自带的官方 node
// 就是可用的父进程；不需要 codex CLI、codex sandbox，也不需要把桌应用运行起来。
function codexAppCandidates() {
  const home = os.homedir();
  return [
    process.env.COMPUTER_USE_CODEX_APP?.trim(),
    "/Applications/ChatGPT.app",
    "/Applications/Codex.app",
    path.join(home, "Applications/ChatGPT.app"),
    path.join(home, "Applications/Codex.app"),
  ].filter(Boolean);
}

async function resolveOfficialNodePath() {
  const override = process.env.COMPUTER_USE_NODE_PATH?.trim();
  if (override) return path.resolve(override);

  const candidates = codexAppCandidates().map((app) => path.join(app, OFFICIAL_NODE_RELATIVE));
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next installed app.
    }
  }
  throw new Error(
    `OpenAI-signed node from the Codex desktop app was not found. Checked: ${candidates.join(", ")}. Set COMPUTER_USE_NODE_PATH to override.`,
  );
}

function withElicitationCapability(message) {
  if (!isObject(message) || message.method !== "initialize") return null;

  const params = isObject(message.params) ? message.params : {};
  const capabilities = isObject(params.capabilities) ? { ...params.capabilities } : {};
  const elicitation = isObject(capabilities.elicitation) ? { ...capabilities.elicitation } : {};
  const protocolVersion = typeof params.protocolVersion === "string" ? params.protocolVersion : "";

  if (protocolVersion >= "2025-11-25") {
    elicitation.form = isObject(elicitation.form) ? elicitation.form : {};
  }
  capabilities.elicitation = elicitation;

  return { ...message, params: { ...params, capabilities } };
}

function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function pumpJsonLines(stream, onLine, onEnd) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) break;
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      if (line) onLine(line);
    }
  });
  stream.on("end", () => {
    const line = buffer.replace(/\r$/, "");
    if (line) onLine(line);
    onEnd?.();
  });
}

function writeJsonLine(stream, value) {
  if (!stream.destroyed && stream.writable) stream.write(`${JSON.stringify(value)}\n`);
}

const OFFICIAL_NODE_RELATIVE = "Contents/Resources/cua_node/bin/node";
const LAUNCHER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "oai-node-launcher.mjs",
);

const upstreamPath = resolveUpstreamPath();
const directLaunch = process.env.COMPUTER_USE_BRIDGE_DIRECT_LAUNCH === "1";

try {
  await access(upstreamPath, fsConstants.X_OK);
} catch {
  process.stderr.write(`Computer Use client is missing or not executable: ${upstreamPath}\n`);
  process.exit(1);
}

let launchCommand = upstreamPath;
let launchArgs = ["mcp"];

if (!directLaunch) {
  try {
    launchCommand = await resolveOfficialNodePath();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  launchArgs = [LAUNCHER_PATH, upstreamPath, "mcp"];
}

debug(`starting ${launchCommand} ${launchArgs.join(" ")}`);
const upstream = spawn(launchCommand, launchArgs, {
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
});
let stopping = false;

upstream.stderr.pipe(process.stderr);
upstream.on("error", (error) => {
  process.stderr.write(`Failed to start the Computer Use MCP client: ${error.message}\n`);
  process.exitCode = 1;
});
upstream.stdin.on("error", (error) => {
  if (error.code !== "EPIPE") process.stderr.write(`Computer Use MCP stdin failed: ${error.message}\n`);
});
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") {
    stopping = true;
    upstream.kill("SIGTERM");
    return;
  }
  throw error;
});

pumpJsonLines(
  process.stdin,
  (line) => {
    const rewritten = withElicitationCapability(parseJson(line));
    if (rewritten !== null) {
      debug("advertised form elicitation support");
      writeJsonLine(upstream.stdin, rewritten);
      return;
    }
    if (!upstream.stdin.destroyed && upstream.stdin.writable) upstream.stdin.write(`${line}\n`);
  },
  () => upstream.stdin.end(),
);

pumpJsonLines(upstream.stdout, (line) => {
  const message = parseJson(line);
  if (
    isObject(message) &&
    message.method === "elicitation/create" &&
    Object.hasOwn(message, "id")
  ) {
    debug(`auto-accepted elicitation: ${typeof message.params?.message === "string" ? message.params.message : "Computer Use request"}`);
    writeJsonLine(upstream.stdin, {
      jsonrpc: "2.0",
      id: message.id,
      result: { action: "accept", content: {} },
    });
    return;
  }
  if (!process.stdout.destroyed && process.stdout.writable) process.stdout.write(`${line}\n`);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    debug(`forwarding ${signal}`);
    upstream.kill(signal);
    // 上游（官方 node → Sky client）可能不响应 SIGTERM：限时后强制击杀并退出，避免泄漏孙进程。
    setTimeout(() => {
      try {
        upstream.kill("SIGKILL");
      } catch {
        // 进程已退出。
      }
      process.exit(1);
    }, 750);
  });
}

// bridge 自身退出（含 stdin EOF 正常收尾）时确保上游不残留。
process.on("exit", () => {
  try {
    upstream.kill("SIGKILL");
  } catch {
    // 进程已退出。
  }
});

upstream.on("close", (code, signal) => {
  debug(`upstream closed (code=${String(code)}, signal=${String(signal)})`);
  process.exitCode = signal ? (signal === "SIGINT" ? 130 : 1) : (code ?? 0);
  process.stdout.end();
});
