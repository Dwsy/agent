#!/usr/bin/env bun
/**
 * BG-004: Profile plugin loading — per-builtin timing with proper mock ctx.
 */

import { loadConfig } from "../src/core/config.ts";
import { createPluginRegistry, type PluginRegistryState } from "../src/plugins/loader.ts";
import type { PluginManifest, GatewayPluginApi } from "../src/plugins/types.ts";
import { createPluginApi } from "../src/plugins/plugin-api-factory.ts";
import type { GatewayContext } from "../src/gateway/types.ts";
import { join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";

const t = (label: string) => {
  const start = performance.now();
  return () => {
    const ms = (performance.now() - start).toFixed(2);
    console.log(`  ${label.padEnd(45)} ${ms.padStart(8)}ms`);
    return parseFloat(ms);
  };
};

console.log("=== BG-004: Startup Phase Profile ===\n");

// 1. Config
let endPhase = t("loadConfig()");
const config = loadConfig();
endPhase();

// 2. Per-builtin import + register timing (isolated, no caching)
console.log("\n--- Per-builtin load breakdown ---\n");

const builtinDir = join(import.meta.dir, "../src/plugins/builtin");
const builtins = ["telegram", "discord", "webchat", "feishu"];

for (const name of builtins) {
  let path = join(builtinDir, `${name}.ts`);
  const dirIndex = join(builtinDir, name, "index.ts");
  if (!existsSync(path) && existsSync(dirIndex)) path = dirIndex;
  if (!existsSync(path)) {
    console.log(`  ${name.padEnd(20)} (not found)`);
    continue;
  }

  // Fresh registry per plugin to isolate
  const registry = createPluginRegistry();
  const mockCtx = {
    config,
    registry,
    log: { debug() {}, info() {}, warn() {}, error() {} },
    wsClients: new Map(),
    pool: { getForSession: () => null, acquire: async () => ({}) },
    sessions: { get: () => null, set() {}, has: () => false, delete() {}, size: 0, toArray: () => [] },
    transcripts: { logMeta() {} },
    metrics: { incProcessSpawn() {}, incMessageProcessed() {} },
    systemEvents: { consume: () => [], inject() {} },
    queue: { enqueue() {}, clearCollectBuffer() {} },
    channelApis: new Map(),
    broadcastToWs() {},
    buildSessionProfile: () => ({}),
    dispatch: async () => {},
    compactSessionWithHooks: async () => {},
    listAvailableRoles: () => [],
    setSessionRole: async () => false,
    sessionMessageModeOverrides: new Map(),
    resolveTelegramMessageMode: () => "block",
    noGui: true,
    dedup: { isDuplicate: () => false, record() {} },
    cron: null,
    heartbeat: null,
    delegateExecutor: null,
    execGuard: null,
    extensionUI: { forward() {} },
  } as unknown as GatewayContext;

  const api = createPluginApi(name, { id: name, name, main: "index.ts" }, mockCtx);

  const endImport = t(`${name}: import()`);
  let mod: any;
  try {
    mod = await import(path + `?t=${Date.now()}_${name}`);
  } catch (e: any) {
    endImport();
    console.log(`     → import error: ${e.message?.slice(0, 100)}`);
    continue;
  }
  endImport();

  const factory = mod.default ?? mod;
  const endRegister = t(`${name}: register()`);
  try {
    if (typeof factory === "function") {
      await factory(api);
    } else if (factory && "register" in factory) {
      await factory.register(api);
    }
  } catch (e: any) {
    console.log(`     → register error: ${e.message?.slice(0, 100)}`);
  }
  endRegister();

  // Count registrations
  const channels = registry.channels.size;
  const tools = Array.from(registry.tools.values()).reduce((n, t) => n + t.length, 0);
  const commands = registry.commands.size;
  const httpRoutes = registry.httpRoutes.length;
  const wsCount = registry.gatewayMethods.size;
  const hooks = 0; // HookRegistry internals are private
  console.log(`     → channel:${channels} tools:${tools} cmds:${commands} http:${httpRoutes} ws:${wsCount}`);
}

// 3. File sizes
console.log("\n--- Builtin sizes ---\n");
for (const name of builtins) {
  const dir = join(builtinDir, name);
  if (!existsSync(dir)) {
    // Check single file
    const single = join(builtinDir, `${name}.ts`);
    if (existsSync(single)) {
      const s = statSync(single);
      console.log(`  ${name.padEnd(20)} 1 file, ${(s.size / 1024).toFixed(1)}KB`);
    } else {
      console.log(`  ${name.padEnd(20)} (not found)`);
    }
    continue;
  }
  let totalBytes = 0;
  let fileCount = 0;
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (f.endsWith(".ts") && !f.includes(".test.")) { totalBytes += s.size; fileCount++; }
    }
  };
  walk(dir);
  console.log(`  ${name.padEnd(20)} ${fileCount} files, ${(totalBytes / 1024).toFixed(1)}KB`);
}

console.log("\n=== Profile complete ===");
