#!/usr/bin/env bun
/**
 * GAPP CLI — the agent-facing bun script surface for Glimpse-APPs.
 *
 * Replaces the former registered `gapp_*` tools: instead of nine tool schemas
 * bloating every session's system prompt, the agent runs this script via bash
 * and learns the whole calling system from the `gapp` skill.
 *
 * Backend policy: daemon-first for anything that touches live windows or
 * cross-process caches (open / call / tools / reload / set-state push); local
 * disk fallback when no daemon answers. `--local` skips the daemon entirely.
 *
 * Output contract: one JSON document on stdout (`{ ok: true, ... }`), errors as
 * `{ ok: false, error: { message } }` on stderr with exit code 1.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GappValidationError,
  gappDir,
  listGapps,
  loadGappState,
  resolveGappRef,
  setGappState,
  setGappStatus,
  upsertGapp,
  loadGappToolsFromDir,
  type GappScope,
} from "./storage.js";
import { invokeGappTool } from "./service.js";
import { normalizeToolArguments, decodeJsonArgument, recordGappRun } from "./tools.js";
import {
  hostCallTool,
  hostOpenApp,
  hostReloadApp,
  hostSetState,
  hostToolCatalog,
} from "./host-client.js";

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

const VALUE_FLAGS = new Set([
  "cwd", "scope", "id", "name", "description", "html", "html-file",
  "state", "state-file", "args", "args-file", "width", "height",
  "instances", "version",
]);

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (VALUE_FLAGS.has(name)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`--${name} requires a value`);
      flags[name] = value;
    } else {
      flags[name] = true;
    }
  }
  return { positional, flags };
}

function flagBool(flags: Record<string, string | boolean>, name: string): boolean | undefined {
  if (flags[`no-${name}`] === true) return false;
  if (flags[name] === true) return true;
  return undefined;
}

function scopeOf(flags: Record<string, string | boolean>): GappScope | undefined {
  const v = flags.scope;
  return v === "global" ? "global" : v === "project" ? "project" : undefined;
}

/** Accept inline JSON (`--state '{"a":1}'`) or a file path (`--state-file f.json`). */
function jsonPayload(
  flags: Record<string, string | boolean>,
  inlineKey: string,
  fileKey: string,
  label: string,
): unknown {
  const inline = flags[inlineKey];
  const file = flags[fileKey];
  if (inline !== undefined && file !== undefined) {
    throw new Error(`use either --${inlineKey} or --${fileKey}, not both`);
  }
  if (file !== undefined) return readJsonFileSync(String(file), label);
  if (inline !== undefined) return decodeJsonArgument(inline, label);
  return undefined;
}

function readJsonFileSync(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    throw new Error(`${label}: cannot read JSON from ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function readTextFileSync(path: string, label: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(`${label}: cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function ok(payload: Record<string, unknown>): CliResult {
  return { code: 0, stdout: JSON.stringify({ ok: true, ...payload }, null, 2), stderr: "" };
}

function fail(message: string): CliResult {
  return {
    code: 1,
    stdout: "",
    stderr: JSON.stringify({ ok: false, error: { message } }, null, 2),
  };
}

function usage(): string {
  return [
    "gapp-cli — Glimpse-APP operations (skill: gapp)",
    "",
    "Usage: bun gapp-cli.ts <command> [args] [flags]",
    "",
    "  list [--online|--all]                       list apps (index refs valid elsewhere)",
    "  open <id> [--scope p|g] [--version <id>]    open a window (daemon-owned)",
    "  reload <id> [--window]                      drop cached tools.mjs; --window rebuilds UI",
    "  tools [id]                                  domain tool catalog (one app or all)",
    "  call <id> <tool> [--args '<json>'|--args-file f] [--no-open]",
    "  get-state <id>                              read state.json (SSOT)",
    "  set-state <id> [--state '<json>'|--state-file f] [--merge]   # --merge: top-level key merge (not increment)",
    "  upsert --name <n> [--id <i>] [--description <d>] [--scope p|g]",
    "         [--html-file <f>|--html <s>] [--state '<json>'|--state-file <f>]",
    "         [--width n] [--height n] [--instances single|multi] [--no-open]",
    "  set-status <id> [--enable|--disable] [--archive|--unarchive]",
    "",
    "Global: --cwd <path> (default: process cwd) · --local (skip daemon, disk only)",
  ].join("\n");
}

interface Ctx {
  cwd: string;
  local: boolean;
}

async function cmdList(flags: Record<string, string | boolean>, ctx: Ctx): Promise<CliResult> {
  const apps = await listGapps({
    cwd: ctx.cwd,
    includeArchived: flags.all === true,
    includeDisabled: true,
  });
  const rows = apps
    .filter((m) => (flags.online === true ? m.enabled && !m.archived : true))
    .map((m, i) => ({
      index: i + 1,
      id: m.id,
      name: m.name,
      description: m.description || "",
      scope: m.scope,
      // Bundle location: the single answer to "where does this app live?".
      // Without it models go `fd`-scanning the whole home directory.
      dir: gappDir(m.scope, m.id, m.cwd || ctx.cwd),
      cwd: m.scope === "project" ? m.cwd || ctx.cwd : undefined,
      enabled: m.enabled,
      archived: m.archived === true,
      instances: m.instances === "multi" ? "multi" : "single",
    }));
  return ok({ apps: rows });
}

async function resolveOrFail(ref: string, ctx: Ctx): Promise<
  { bundle: Awaited<ReturnType<typeof resolveGappRef>> } | CliResult
> {
  const bundle = await resolveGappRef(ref, { cwd: ctx.cwd });
  if (!bundle) {
    return fail(
      `GAPP not found: ${ref}. Run \`bun gapp-cli.ts list\` for valid ids (index refs match list order).`,
    );
  }
  return { bundle };
}

async function cmdOpen(positional: string[], flags: Record<string, string | boolean>, ctx: Ctx): Promise<CliResult> {
  const ref = positional[0];
  if (!ref) return fail("usage: open <id>");
  const resolved = await resolveOrFail(ref, ctx);
  if ("code" in resolved) return resolved;
  const { bundle } = resolved;
  if (bundle.meta.archived) return fail(`GAPP archived: ${bundle.meta.id}. Unarchive first.`);

  // Windows must be daemon-owned: a short-lived CLI process would take the
  // window down with it (stdin EOF kills the WebView).
  const data = await hostOpenApp(bundle.meta.id, {
    cwd: bundle.meta.cwd || ctx.cwd,
    scope: bundle.meta.scope,
    versionId: typeof flags.version === "string" ? flags.version : undefined,
    source: "cli",
  });
  if (!data?.ok) {
    return fail(data?.error?.message || "open failed (is the gapp daemon running?)");
  }
  void recordGappRun(bundle.meta.id, {
    scope: bundle.meta.scope,
    cwd: ctx.cwd,
    source: "cli-gapp_open",
  });
  return ok({ id: bundle.meta.id, scope: bundle.meta.scope, ...data });
}

async function cmdReload(positional: string[], flags: Record<string, string | boolean>, ctx: Ctx): Promise<CliResult> {
  const ref = positional[0];
  if (!ref) return fail("usage: reload <id>");
  const resolved = await resolveOrFail(ref, ctx);
  if ("code" in resolved) return resolved;
  const { bundle } = resolved;
  const data = await hostReloadApp(bundle.meta.id, {
    cwd: bundle.meta.cwd || ctx.cwd,
    window: flags.window === true,
  });
  if (!data?.ok) return fail(data?.error || "reload failed (is the gapp daemon running?)");
  return ok({ id: bundle.meta.id, ...data });
}

async function cmdTools(positional: string[], flags: Record<string, string | boolean>, ctx: Ctx): Promise<CliResult> {
  const ref = positional[0];
  if (ref) {
    const resolved = await resolveOrFail(ref, ctx);
    if ("code" in resolved) return resolved;
    const { bundle } = resolved;
    const dir = bundle.dir;
    const hasToolsJson = existsSync(join(dir, "tools.json"));

    // Daemon merges live (window-registered) tools over the disk catalog.
    if (!ctx.local) {
      const remote = await hostToolCatalog(bundle.meta.id, bundle.meta.cwd || ctx.cwd).catch(() => null);
      if (remote) {
        return ok({
          id: bundle.meta.id,
          dir,
          hasToolsJson,
          live: remote.live,
          tools: remote.tools,
          ...(remote.tools.length === 0 && !hasToolsJson
            ? { note: "no tools.json in bundle — renderer-only app; use get-state/set-state fallback (NOT a cwd error)" }
            : {}),
        });
      }
    }
    const tools = await loadGappToolsFromDir(dir);
    return ok({
      id: bundle.meta.id,
      dir,
      hasToolsJson,
      live: false,
      tools: tools.map((t) => ({ ...t, source: "disk" })),
      ...(tools.length === 0 && !hasToolsJson
        ? { note: "no tools.json in bundle — renderer-only app; use get-state/set-state fallback (NOT a cwd error)" }
        : hasToolsJson && tools.length === 0
          ? { note: "tools.json exists but no valid tool entries (name/description/inputSchema required)" }
          : {}),
    });
  }

  const apps = await listGapps({ cwd: ctx.cwd, includeDisabled: true });
  const out: Array<Record<string, unknown>> = [];
  for (const m of apps) {
    const dir = gappDir(m.scope, m.id, m.cwd || ctx.cwd);
    const tools = await loadGappToolsFromDir(dir).catch(() => []);
    if (tools.length > 0) out.push({ id: m.id, dir, live: false, tools });
  }
  return ok({
    apps: out,
    note: "apps without tools.json are renderer-only (omitted); use get-state/set-state for them",
  });
}

async function cmdCall(positional: string[], flags: Record<string, string | boolean>, ctx: Ctx): Promise<CliResult> {
  const [ref, tool] = positional;
  if (!ref || !tool) return fail("usage: call <id> <tool> [--args '<json>']");
  const args = normalizeToolArguments(jsonPayload(flags, "args", "args-file", "call arguments") ?? {});
  const resolved = await resolveOrFail(ref, ctx);
  if ("code" in resolved) return resolved;
  const { bundle } = resolved;

  // Daemon-first: it can dispatch to a live window handler. Fall back to local
  // tools.mjs / stateOps execution when the daemon is down or rejects the cwd.
  if (!ctx.local) {
    try {
      const data = await hostCallTool(bundle.meta.id, tool, args, bundle.meta.cwd || ctx.cwd);
      if (data?.ok) return ok({ id: bundle.meta.id, dir: bundle.dir, tool, via: data.via ?? "host", result: data.result });
      // Daemon present but unable to run this call — fall back to local
      // tools.mjs execution (same code path, state.json stays SSOT).
      const code = data?.error?.code;
      if (code !== "cwd_forbidden" && code !== "host_unavailable" && code !== "unauthorized") {
        return fail(data?.error?.message || `call failed: ${tool}`);
      }
    } catch {
      // daemon unreachable — fall through to local execution
    }
  }

  const out = await invokeGappTool(
    {
      ref: bundle.meta.id,
      tool,
      arguments: args,
      openIfNeeded: flagBool(flags, "open") !== false,
    },
    { cwd: ctx.cwd },
  );
  return ok({ id: out.appId, dir: bundle.dir, tool: out.tool, via: out.via, result: out.result });
}

async function cmdGetState(positional: string[], flags: Record<string, string | boolean>, ctx: Ctx): Promise<CliResult> {
  const ref = positional[0];
  if (!ref) return fail("usage: get-state <id>");
  const scope = scopeOf(flags);
  if (scope) {
    const state = await loadGappState(scope, ref, ctx.cwd);
    return ok({ id: ref, scope, state });
  }
  const resolved = await resolveOrFail(ref, ctx);
  if ("code" in resolved) return resolved;
  const { bundle } = resolved;
  return ok({ id: bundle.meta.id, scope: bundle.meta.scope, dir: bundle.dir, state: bundle.state });
}

async function cmdSetState(positional: string[], flags: Record<string, string | boolean>, ctx: Ctx): Promise<CliResult> {
  const ref = positional[0];
  if (!ref) return fail("usage: set-state <id> --state '<json>' [--merge]");
  const state = jsonPayload(flags, "state", "state-file", "set-state");
  if (state === undefined) return fail("provide --state '<json>' or --state-file <f>");
  const resolved = await resolveOrFail(ref, ctx);
  if ("code" in resolved) return resolved;
  const { bundle } = resolved;
  const merge = flags.merge === true;
  const cwd = bundle.meta.cwd || ctx.cwd;

  // Daemon-first so a live window gets the state push; disk fallback below.
  if (!ctx.local) {
    try {
      const data = await hostSetState(bundle.meta.id, state, { cwd, merge });
      if (data?.ok) return ok({ id: bundle.meta.id, scope: bundle.meta.scope, dir: bundle.dir, state: data.state });
    } catch {
      // daemon unreachable — write disk directly
    }
  }

  try {
    const result = await setGappState(bundle.meta.id, state, {
      scope: scopeOf(flags) ?? bundle.meta.scope,
      cwd,
      merge,
    });
    return ok({ id: result.meta.id, scope: result.meta.scope, dir: bundle.dir, state: result.state });
  } catch (e) {
    return fail(e instanceof GappValidationError ? e.message : String(e));
  }
}

async function cmdUpsert(flags: Record<string, string | boolean>, ctx: Ctx): Promise<CliResult> {
  const name = flags.name;
  if (typeof name !== "string" || !name.trim()) return fail("usage: upsert --name <n> [--html-file <f>]");

  let html = typeof flags.html === "string" ? flags.html : undefined;
  if (html === undefined && flags["html-file"] !== undefined) {
    html = readTextFileSync(String(flags["html-file"]), "upsert html");
  }
  if (html === undefined) return fail("provide --html-file <f> or --html <s>");

  const state = jsonPayload(flags, "state", "state-file", "upsert state");
  const width = flags.width !== undefined ? Number(flags.width) : undefined;
  const height = flags.height !== undefined ? Number(flags.height) : undefined;
  const instances = flags.instances === "multi" ? "multi" : flags.instances === "single" ? "single" : undefined;

  try {
    const bundle = await upsertGapp({
      id: typeof flags.id === "string" ? flags.id : undefined,
      name,
      description: typeof flags.description === "string" ? flags.description : undefined,
      scope: scopeOf(flags),
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined,
      instances,
      state,
      html,
      cwd: ctx.cwd,
    });

    const shouldOpen = flagBool(flags, "open") !== false && !ctx.local;
    let opened = false;
    if (shouldOpen) {
      const data = await hostOpenApp(bundle.meta.id, {
        cwd: bundle.meta.cwd || ctx.cwd,
        scope: bundle.meta.scope,
        source: "cli-gapp_upsert",
      }).catch(() => null);
      opened = data?.ok === true;
      if (opened) {
        void recordGappRun(bundle.meta.id, {
          scope: bundle.meta.scope,
          cwd: ctx.cwd,
          source: "cli-gapp_upsert",
        });
      }
    }

    return ok({
      id: bundle.meta.id,
      scope: bundle.meta.scope,
      dir: bundle.dir,
      instances: bundle.meta.instances || "single",
      opened,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function cmdSetStatus(positional: string[], flags: Record<string, string | boolean>, ctx: Ctx): Promise<CliResult> {
  const ref = positional[0];
  if (!ref) return fail("usage: set-status <id> [--enable|--disable] [--archive|--unarchive]");
  const enabled = flagBool(flags, "enable");
  const archived = flagBool(flags, "archive");
  if (enabled === undefined && archived === undefined) {
    return fail("provide --enable/--disable and/or --archive/--unarchive");
  }
  const resolved = await resolveOrFail(ref, ctx);
  if ("code" in resolved) return resolved;
  const meta = await setGappStatus(
    resolved.bundle.meta.id,
    { enabled, archived: archived === true ? true : archived === false ? false : undefined },
    { scope: scopeOf(flags) ?? resolved.bundle.meta.scope, cwd: ctx.cwd },
  );
  return ok({ id: meta.id, enabled: meta.enabled, archived: meta.archived });
}

/** CLI entry: parse argv, dispatch, never throw (all errors become JSON on stderr). */
export async function runGappCli(argv: string[]): Promise<CliResult> {
  try {
    const { positional, flags } = parseArgs(argv);
    const command = positional.shift();
    if (!command || command === "help" || flags.help === true) {
      return { code: command ? 0 : 1, stdout: usage(), stderr: "" };
    }
    const ctx: Ctx = {
      cwd: typeof flags.cwd === "string" ? flags.cwd : process.cwd(),
      local: flags.local === true,
    };
    switch (command) {
      case "list":
        return cmdList(flags, ctx);
      case "open":
        return cmdOpen(positional, flags, ctx);
      case "reload":
        return cmdReload(positional, flags, ctx);
      case "tools":
        return cmdTools(positional, flags, ctx);
      case "call":
        return cmdCall(positional, flags, ctx);
      case "get-state":
        return cmdGetState(positional, flags, ctx);
      case "set-state":
        return cmdSetState(positional, flags, ctx);
      case "upsert":
        return cmdUpsert(flags, ctx);
      case "set-status":
        return cmdSetStatus(positional, flags, ctx);
      default:
        return fail(`unknown command: ${command}\n\n${usage()}`);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

if (import.meta.main) {
  runGappCli(process.argv.slice(2)).then((result) => {
    if (result.stdout) process.stdout.write(result.stdout + "\n");
    if (result.stderr) process.stderr.write(result.stderr + "\n");
    process.exitCode = result.code;
  });
}
