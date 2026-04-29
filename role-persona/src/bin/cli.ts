#!/usr/bin/env bun

/**
 * role-persona CLI — agent-friendly JSON, daemon-aware.
 *
 * Default: tries daemon HTTP first, falls back to direct execution.
 * Use --direct to force direct (no daemon).
 *
 * Commands:
 *   role-persona daemon start [--background] [--port N]
 *   role-persona daemon stop
 *   role-persona daemon status
 *   role-persona <command> [args]       # proxied through daemon if running
 */

import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { createService, type RolePersonaService } from "../service/index.ts";
import type { Message } from "../core/types.ts";
import { isDaemonRunning, readPort, startDaemonBackground } from "../transport/daemon.ts";
import { daemonRequest, isDaemonAvailable } from "../transport/http-client.ts";

// ── Output ──

let HUMAN = false;

function ok(data: unknown, message?: string) {
  if (HUMAN) {
    if (typeof data === "string") { process.stdout.write(data + "\n"); return; }
    if (message) process.stdout.write(message + "\n");
    return;
  }
  process.stdout.write(JSON.stringify({ ok: true, data, ...(message ? { message } : {}) }) + "\n");
}

function fail(msg: string): never {
  if (HUMAN) { process.stderr.write(`ERROR: ${msg}\n`); process.exit(1); }
  process.stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  process.exit(1);
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

// ── Stdin reader ──

async function readStdinJson<T>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return [] as unknown as T;
  try { return JSON.parse(raw) as T; } catch { fail(`Invalid JSON on stdin`); }
}

// ── Daemon commands ──

async function cmdDaemon(sub: string, args: string[]) {
  switch (sub) {
    case "start": {
      const port = parseInt(parseFlag(args, "--port") || "3939", 10);
      const bg = hasFlag(args, "--background");
      if (isDaemonRunning()) {
        ok({ pid: readPort(), status: "already running" }, "Daemon already running");
        return;
      }
      if (bg) {
        const r = await startDaemonBackground(port);
        ok(r, r.ok ? `Daemon started (pid ${r.pid})` : `Failed: ${r.error}`);
      } else {
        // Foreground — import and start directly
        const { startDaemon } = await import("../transport/daemon.ts");
        startDaemon({ port });
      }
      break;
    }
    case "stop": {
      if (!isDaemonRunning()) { ok({ status: "not running" }, "Daemon not running"); return; }
      const r = await daemonRequest("/api/shutdown");
      ok(r, "Daemon stopped");
      break;
    }
    case "status": {
      const running = isDaemonRunning();
      if (running) {
        const r = await daemonRequest("/api/health");
        ok({ running: true, ...r.data }, `Daemon running (pid ${r.data?.pid})`);
      } else {
        ok({ running: false }, "Daemon not running");
      }
      break;
    }
    default:
      fail(`Unknown daemon subcommand: ${sub}. Use: start, stop, status`);
  }
}

// ── HTTP proxy ──

/** Map CLI args to daemon HTTP endpoint */
async function proxyToDaemon(cmd: string, sub: string, args: string[]): Promise<boolean> {
  const direct = hasFlag(process.argv, "--direct");
  if (direct) return false;

  const available = await isDaemonAvailable();
  if (!available) return false;

  try {
    let path = "";
    let body: Record<string, any> = {};

    switch (cmd) {
      case "init":
        path = "/api/init";
        body = { cwd: process.cwd() };
        break;
      case "role":
        path = `/api/role/${sub}`;
        if (sub === "create" || sub === "map") body = { name: args[0], cwd: process.cwd() };
        else if (sub === "unmap") body = { cwd: process.cwd() };
        break;
      case "memory":
        switch (sub) {
          case "add-learning": path = "/api/memory/add-learning"; body = { content: args[0] }; break;
          case "add-preference": path = "/api/memory/add-preference"; body = { content: args[0], category: parseFlag(args.slice(1), "--category") }; break;
          case "update-learning": path = "/api/memory/update-learning"; body = { needle: args[0], text: args[1] }; break;
          case "update-preference": path = "/api/memory/update-preference"; body = { needle: args[0], text: args[1], category: parseFlag(args.slice(2), "--category") }; break;
          case "delete-learning": path = "/api/memory/delete-learning"; body = { needle: args[0] }; break;
          case "delete-preference": path = "/api/memory/delete-preference"; body = { needle: args[0] }; break;
          case "reinforce": path = "/api/memory/reinforce"; body = { needle: args[0] }; break;
          case "search": path = "/api/memory/search"; body = { query: args[0] }; break;
          case "list": path = "/api/memory/list"; break;
          case "consolidate": path = "/api/memory/consolidate"; break;
          case "repair": path = "/api/memory/repair"; break;
          case "conflicts": path = "/api/memory/conflicts"; break;
          case "log": path = "/api/memory/log"; break;
          case "export": path = "/api/memory/export"; body = { path: parseFlag(args, "--output") }; break;
          case "tidy": path = "/api/memory/tidy"; body = { model: parseFlag(args, "--model") }; break;
          case "extract-memory": {
            const messages = await readStdinJson<Message[]>();
            path = "/api/memory/extract"; body = { messages }; break;
          }
          case "build-prompt": {
            const messages = await readStdinJson<Message[]>();
            path = "/api/prompt"; body = { base: parseFlag(args, "--base"), messages }; break;
          }
          case "flush": ok({ flushed: true }); return true;
        }
        break;
      case "knowledge":
        switch (sub) {
          case "list": path = "/api/knowledge/list"; body = { category: args[0] }; break;
          case "search": path = "/api/knowledge/search"; body = { query: args[0], tags: parseFlag(args.slice(1), "--tags")?.split(",") }; break;
          case "read": path = "/api/knowledge/read"; body = { path: args[0] }; break;
          case "write": path = "/api/knowledge/write"; body = { title: parseFlag(args, "--title"), content: parseFlag(args, "--content"), category: parseFlag(args, "--category"), tags: parseFlag(args, "--tags")?.split(",") }; break;
        }
        break;
      case "embedding":
        path = sub === "rebuild" ? "/api/embedding/rebuild" : "/api/embedding/stats";
        break;
      case "prompt":
        path = "/api/prompt"; body = { base: parseFlag(args, "--base") };
        break;
    }

    if (!path) return false;

    const r = await daemonRequest(path, body);
    if (!r.ok) fail(r.error || "Daemon request failed");
    ok(r.data, r.message);
    return true;
  } catch (err: any) {
    // Fallback to direct
    return false;
  }
}

// ── Direct execution (same as before) ──

async function cmdRoleDirect(svc: RolePersonaService, sub: string, args: string[]) {
  switch (sub) {
    case "list": { const roles = svc.role.list(); ok(roles.map((r) => ({ name: r, identity: svc.role.getIdentity(resolve(svc.getRolesDir(), r)) })), `${roles.length} role(s)`); break; }
    case "create": { const name = args[0]; if (!name) fail("Usage: role create <name>"); const r = svc.role.create(name); if (!r.ok) fail(`Role "${name}" exists`); ok(r); break; }
    case "info": { const role = svc.getActiveRole(); if (!role) fail("No active role"); ok({ name: role.name, path: role.path, identity: svc.role.getIdentity(role.path), isFirstRun: role.isFirstRun }); break; }
    case "map": { const name = args[0]; if (!name) fail("Usage: role map <role>"); ok(svc.role.map(process.cwd(), name)); break; }
    case "unmap": { ok(svc.role.unmap(process.cwd())); break; }
    default: fail(`Unknown role sub: ${sub}`);
  }
}

async function cmdMemoryDirect(svc: RolePersonaService, sub: string, args: string[]) {
  svc.getActiveRole() || fail("No active role");
  switch (sub) {
    case "add-learning": { const c = args[0]; if (!c) fail("content required"); ok(await svc.memory.addLearning(c)); break; }
    case "add-preference": { const c = args[0]; if (!c) fail("content required"); ok(svc.memory.addPreference(c, parseFlag(args.slice(1), "--category") || "General")); break; }
    case "update-learning": { ok(svc.memory.updateLearning(args[0], args[1])); break; }
    case "update-preference": { ok(svc.memory.updatePreference(args[0], args[1], parseFlag(args.slice(2), "--category"))); break; }
    case "delete-learning": { ok(svc.memory.deleteLearning(args[0])); break; }
    case "delete-preference": { ok(svc.memory.deletePreference(args[0])); break; }
    case "reinforce": { ok(svc.memory.reinforce(args[0])); break; }
    case "search": { ok(await svc.memory.search(args[0])); break; }
    case "list": { ok(svc.memory.list()); break; }
    case "consolidate": { ok(svc.memory.consolidate()); break; }
    case "repair": { ok(svc.memory.repair(true)); break; }
    case "tidy": { const r = await svc.memory.tidyLlm(parseFlag(args, "--model")); if ("error" in r) fail(r.error); ok(r); break; }
    case "export": { const role = svc.getActiveRole()!; const p = parseFlag(args, "--output") || resolve(role.path, "memory-export.html"); const html = svc.memory.exportHtml(p); writeFileSync(p, html); ok({ path: p, bytes: html.length }); break; }
    case "conflicts": { ok(svc.memory.detectConflicts()); break; }
    case "log": { ok(svc.memory.getLog()); break; }
    case "build-prompt": { const msgs = await readStdinJson<Message[]>(); ok({ prompt: await svc.buildSystemPrompt(parseFlag(args, "--base") || "You are an AI assistant.", msgs) }); break; }
    case "extract-memory": { const msgs = await readStdinJson<Message[]>(); ok(await svc.memory.autoExtract(msgs) ?? { storedLearnings: 0, storedPrefs: 0 }); break; }
    case "flush": { await svc.dispose(); ok({ flushed: true }); break; }
    default: fail(`Unknown memory sub: ${sub}`);
  }
}

async function cmdKnowledgeDirect(svc: RolePersonaService, sub: string, args: string[]) {
  svc.getActiveRole() || fail("No active role");
  switch (sub) {
    case "list": { ok(svc.knowledge.list(args[0])); break; }
    case "search": { ok(svc.knowledge.search(args[0], { tags: parseFlag(args.slice(1), "--tags")?.split(",") })); break; }
    case "read": { const r = svc.knowledge.read(args[0]); if (!r) fail("Not found"); ok(r); break; }
    case "write": { ok(svc.knowledge.write({ title: parseFlag(args, "--title")!, content: parseFlag(args, "--content")!, category: parseFlag(args, "--category"), tags: parseFlag(args, "--tags")?.split(",") })); break; }
    default: fail(`Unknown knowledge sub: ${sub}`);
  }
}

async function cmdEmbeddingDirect(svc: RolePersonaService, sub: string) {
  svc.getActiveRole() || fail("No active role");
  switch (sub) {
    case "stats": { ok(await svc.embedding.stats() ?? { active: false }); break; }
    case "rebuild": { ok(await svc.embedding.rebuild()); break; }
    default: fail(`Unknown embedding sub: ${sub}`);
  }
}

// ── Main ──

async function main() {
  const rawArgs = process.argv.slice(2);

  if (hasFlag(rawArgs, "--human")) HUMAN = true;
  const cwdFlag = parseFlag(rawArgs, "--cwd");
  if (cwdFlag) process.chdir(cwdFlag);

  const args = rawArgs.filter((a) => a !== "--human" && a !== "--json" && a !== "--cwd" && a !== cwdFlag && a !== "--direct");

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    ok({
      usage: "role-persona <command> [args] [--flags]",
      commands: {
        "daemon start|stop|status": "Daemon lifecycle",
        init: "Initialize roles directory",
        "role list|create|info|map|unmap": "Role management",
        "memory add-learning|search|list|consolidate|repair|tidy|export|conflicts|log|build-prompt|extract-memory|flush": "Memory management",
        "knowledge list|search|read|write": "Knowledge base",
        "embedding stats|rebuild": "Vector memory",
        prompt: "Output system prompt",
      },
      flags: { "--json": "JSON output (default)", "--human": "Human-readable", "--cwd": "Override CWD", "--direct": "Skip daemon, run directly" },
    });
    return;
  }

  const [cmd, sub, ...rest] = args;

  // Daemon commands — no service needed
  if (cmd === "daemon") {
    await cmdDaemon(sub, rest);
    return;
  }

  // Try daemon HTTP first
  const proxied = await proxyToDaemon(cmd, sub, rest);
  if (proxied) return;

  // Fallback: direct execution
  const svc = createService();
  try {
    if (cmd === "init") { await svc.init(process.cwd()); ok({ role: svc.getActiveRole()?.name ?? null }); return; }
    await svc.init(process.cwd());
    switch (cmd) {
      case "role":       await cmdRoleDirect(svc, sub, rest); break;
      case "memory":     await cmdMemoryDirect(svc, sub, rest); break;
      case "knowledge":  await cmdKnowledgeDirect(svc, sub, rest); break;
      case "embedding":  await cmdEmbeddingDirect(svc, sub); break;
      case "prompt":     svc.getActiveRole() || fail("No active role"); ok({ prompt: await svc.buildSystemPrompt(parseFlag(rest, "--base") || "You are an AI assistant.") }); break;
      default:           fail(`Unknown command: ${cmd}`);
    }
  } finally {
    await svc.dispose();
  }
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: err.message ?? String(err) }) + "\n");
  process.exit(1);
});
