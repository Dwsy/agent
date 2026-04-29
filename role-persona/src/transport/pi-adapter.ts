/**
 * Pi Extension Adapter — pure CLI wrapper.
 *
 * ZERO imports from service/core layers.
 * All operations go through cli-runner → CLI subprocess.
 * Only Pi API imports (@mariozechner/pi-coding-agent, pi-tui, pi-ai) are direct.
 *
 * Original: 2496 lines with all logic inlined.
 * Now: ~400 lines, pure delegation to CLI.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { cli, cliOrThrow, cliSafe, type CliResult } from "./cli-runner.ts";
import {
  knowledgeToolRenderers,
  memoryToolRenderers,
  registerRoleMessageRenderers,
  roleInfoToolRenderers,
} from "./tui-renderers.ts";

// PI_DEPENDENCY: This is the ONLY file that imports from pi packages.

// ── Helpers ──

function isTuiAvailable(ctx: ExtensionContext): boolean {
  return ctx.hasUI && typeof ctx.ui.custom === "function";
}

function notify(ctx: ExtensionContext, message: string, level?: string): void {
  if (isTuiAvailable(ctx)) {
    ctx.ui.notify(message, (level as any) ?? "info");
  }
}

function cwdOf(ctx: ExtensionContext): string {
  return ctx.cwd || process.cwd();
}

/** Convert CLI result to Pi tool result format */
function toToolResult(result: CliResult): { content: Array<{ type: "text"; text: string }>; details?: any; isError?: boolean } {
  if (!result.ok) {
    return { content: [{ type: "text", text: result.error || "Command failed" }], isError: true };
  }
  const text = result.message || (typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2));
  return { content: [{ type: "text", text }], details: result.data };
}

// ── Extension ──

export default function rolePersonaExtension(pi: ExtensionAPI) {
  registerRoleMessageRenderers(pi);

  let isFirstUserMessage = true;
  let autoMemoryPendingTurns = 0;
  let autoMemoryLastAt = 0;
  let autoMemoryLastMessages: unknown[] | null = null;
  let autoMemoryLastFlushLen = 0;
  let autoMemoryInFlight = false;
  let autoMemoryBgScheduled = false;

  // Config values read from CLI (lazy-loaded)
  let _config: any = null;
  async function getConfig() {
    if (!_config) {
      try {
        // Config is embedded in CLI, we read it from the service via a special call
        // For now, use sensible defaults that match the CLI's config
        _config = {
          autoMemory: { enabled: true, batchTurns: 5, minTurns: 2, intervalMs: 30 * 60 * 1000, contextOverlap: 5 },
          advanced: { forceKeywords: "记住这个|remember this|save this|记下来", shutdownFlushTimeoutMs: 10000, evolutionReminderTurns: 10 },
        };
      } catch { _config = { autoMemory: { enabled: false } }; }
    }
    return _config;
  }

  // ── Auto-memory decision (lightweight, no CLI call needed) ──

  function shouldFlushAutoMemory(messages: unknown[]): { should: boolean; reason: string } {
    const text = (messages as any[]).flatMap((m: any) =>
      (Array.isArray(m?.content) ? m.content : []).filter((c: any) => c?.type === "text").map((c: any) => c.text || "")
    ).join("\n");
    const now = Date.now();
    const cfg = _config?.autoMemory || {};

    if (cfg.forceKeywords && new RegExp(cfg.forceKeywords, "i").test(text)) return { should: true, reason: "keyword" };
    if (autoMemoryPendingTurns >= (cfg.batchTurns || 5)) return { should: true, reason: "batch" };
    if (now - autoMemoryLastAt >= (cfg.intervalMs || 1800000) && autoMemoryPendingTurns >= (cfg.minTurns || 2))
      return { should: true, reason: "interval" };
    return { should: false, reason: "defer" };
  }

  async function flushAutoMemory(messages: unknown[], ctx: ExtensionContext, reason: string): Promise<void> {
    if (autoMemoryInFlight) return;
    autoMemoryInFlight = true;

    try {
      const overlap = _config?.autoMemory?.contextOverlap || 5;
      const sliceStart = Math.max(0, autoMemoryLastFlushLen - overlap);
      const recentMessages = messages.slice(sliceStart);

      // Delegate to CLI: memory extract-memory --stdin <messages>
      const result = await cli(["memory", "extract-memory"], {
        cwd: cwdOf(ctx),
        stdin: JSON.stringify(recentMessages),
        timeoutMs: 60000,
      });

      autoMemoryLastFlushLen = messages.length;
      autoMemoryLastAt = Date.now();
      autoMemoryPendingTurns = 0;

      if (result.ok && result.data && isTuiAvailable(ctx)) {
        const d = result.data as any;
        ctx.ui.setStatus("memory-checkpoint", `✧ ${d.storedLearnings || 0}L ${d.storedPrefs || 0}P`);
      }
    } finally {
      autoMemoryInFlight = false;
    }
  }

  // ── 1. session_start ──

  pi.on("session_start", async (_event, ctx) => {
    const sessionId = ctx.sessionManager?.getSessionId?.();

    isFirstUserMessage = true;

    // Init role via CLI
    const result = await cli(["init"], { cwd: cwdOf(ctx) });

    if (result.ok && result.data) {
      const d = result.data as any;
      if (d.role && isTuiAvailable(ctx)) {
        ctx.ui.setStatus("role", d.role);
      } else if (!d.role && isTuiAvailable(ctx)) {
        ctx.ui.setStatus("role", d.source === "disabled" ? "off" : "none");
      }
    }

    await getConfig();
  });

  // ── 2. resources_discover ──

  pi.on("resources_discover", async () => {
    try {
      const extDir = new URL(".", import.meta.url).pathname;
      const skillsDir = join(extDir, "..", "skills");
      if (existsSync(skillsDir)) return { skillPaths: [skillsDir] };
    } catch {}
    return;
  });

  // ── 3. before_agent_start ──

  pi.on("before_agent_start", async (event, ctx) => {
    const messages = (event as any).messages || [];

    // Delegate prompt building to CLI via stdin
    const result = await cli(
      ["memory", "build-prompt", "--base", event.systemPrompt],
      { cwd: cwdOf(ctx), stdin: JSON.stringify(messages), timeoutMs: 30000 }
    );

    if (result.ok && result.data) {
      return { systemPrompt: (result.data as any).prompt };
    }
    return;
  });

  // ── 3. agent_end ──

  pi.on("agent_end", async (event, ctx) => {
    if (!_config?.autoMemory?.enabled) return;

    autoMemoryPendingTurns += 1;
    autoMemoryLastMessages = event.messages;

    const decision = shouldFlushAutoMemory(event.messages);
    if (!decision.should) return;

    if (autoMemoryInFlight || autoMemoryBgScheduled) return;
    autoMemoryBgScheduled = true;
    setTimeout(() => {
      autoMemoryBgScheduled = false;
      void flushAutoMemory(autoMemoryLastMessages || event.messages, ctx, decision.reason);
    }, 0);
  });

  // ── 4. session_before_compact ──
  // Intercept compaction to extract memories before context is lost.
  pi.on("session_before_compact", async (event, ctx) => {
    if (!_config?.autoMemory?.enabled) return;

    const messages = event.preparation?.messagesToSummarize || [];
    if (messages.length === 0) return;

    // Delegate memory extraction to CLI
    const result = await cli(["memory", "extract-memory"], {
      cwd: cwdOf(ctx),
      stdin: JSON.stringify(messages),
      timeoutMs: 60000,
    }).catch(() => null);

    if (result?.ok && result.data) {
      const d = result.data as any;
      if (isTuiAvailable(ctx)) {
        ctx.ui.setStatus("memory-checkpoint", `✧ COMPACT ${d.storedLearnings || 0}L ${d.storedPrefs || 0}P`);
      }
    }

    // Return nothing — let pi run its default compaction
    return;
  });

  // ── 5. session_shutdown ──

  pi.on("session_shutdown", async (_event, ctx) => {
    if (_config?.autoMemory?.enabled && autoMemoryPendingTurns > 0 && autoMemoryLastMessages) {
      await Promise.race([
        flushAutoMemory(autoMemoryLastMessages, ctx, "shutdown"),
        new Promise<void>((r) => setTimeout(r, _config?.advanced?.shutdownFlushTimeoutMs || 10000)),
      ]);
    }

    // Flush via CLI
    await cli(["memory", "flush"], { cwd: cwdOf(ctx), timeoutMs: 5000 }).catch(() => {});

    if (isTuiAvailable(ctx)) {
      ctx.ui.setStatus("role", undefined);
      ctx.ui.setStatus("memory-checkpoint", undefined);
    }
  });

  // ── Tool: memory ──

  pi.registerTool({
    name: "memory",
    label: "Role Memory",
    description: "Manage role memory. Actions: add_learning, add_preference, update_learning, update_preference, delete_learning, delete_preference, reinforce, search, list, consolidate, repair, llm_tidy, vector_rebuild, vector_stats.",
    parameters: Type.Object({
      action: StringEnum(["add_learning", "add_preference", "update_learning", "update_preference", "delete_learning", "delete_preference", "reinforce", "search", "list", "consolidate", "repair", "llm_tidy", "vector_rebuild", "vector_stats"] as const),
      content: Type.Optional(Type.String()),
      category: Type.Optional(Type.String()),
      query: Type.Optional(Type.String()),
      id: Type.Optional(Type.String()),
      model: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId: string, params: Record<string, any>, _signal?: any, _onUpdate?: any, ctx?: any) {
      const cwd = ctx?.cwd || process.cwd();
      const action = params.action;
      const args: string[] = [];
      let stdin: string | undefined;

      switch (action) {
        case "add_learning":
          args.push("memory", "add-learning", params.content);
          break;
        case "add_preference":
          args.push("memory", "add-preference", params.content);
          if (params.category) args.push("--category", params.category);
          break;
        case "update_learning":
          args.push("memory", "update-learning", params.id || params.query, params.content);
          break;
        case "update_preference":
          args.push("memory", "update-preference", params.id || params.query, params.content);
          if (params.category) args.push("--category", params.category);
          break;
        case "delete_learning":
          args.push("memory", "delete-learning", params.id || params.query || params.content);
          break;
        case "delete_preference":
          args.push("memory", "delete-preference", params.id || params.query || params.content);
          break;
        case "reinforce":
          args.push("memory", "reinforce", params.id || params.query || params.content);
          break;
        case "search":
          args.push("memory", "search", params.query || params.content);
          break;
        case "list":
          args.push("memory", "list");
          break;
        case "consolidate":
          args.push("memory", "consolidate");
          break;
        case "repair":
          args.push("memory", "repair", "--force");
          break;
        case "llm_tidy":
          args.push("memory", "tidy");
          if (params.model) args.push("--model", params.model);
          break;
        case "vector_rebuild":
          args.push("embedding", "rebuild");
          break;
        case "vector_stats":
          args.push("embedding", "stats");
          break;
        default:
          return { content: [{ type: "text", text: "Unknown action" }], isError: true };
      }

      const result = await cli(args, { cwd, timeoutMs: action === "llm_tidy" ? 120000 : 30000 });
      return toToolResult(result);
    },
    ...memoryToolRenderers,
  });

  // ── Tool: knowledge ──

  pi.registerTool({
    name: "knowledge",
    label: "Knowledge Base",
    description: "Searchable knowledge base. Actions: list, search, read, write.",
    parameters: Type.Object({
      action: StringEnum(["list", "search", "read", "write"] as const),
      query: Type.Optional(Type.String()),
      tags: Type.Optional(Type.Array(Type.String())),
      category: Type.Optional(Type.String()),
      scope: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number()),
      path: Type.Optional(Type.String()),
      title: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      content: Type.Optional(Type.String()),
      global: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId: string, params: Record<string, any>, _signal?: any, _onUpdate?: any, ctx?: any) {
      const cwd = ctx?.cwd || process.cwd();
      const args: string[] = ["knowledge"];

      switch (params.action) {
        case "list":
          args.push("list");
          if (params.category) args.push(params.category);
          break;
        case "search":
          args.push("search", params.query);
          if (params.tags) args.push("--tags", params.tags.join(","));
          break;
        case "read":
          args.push("read", params.path);
          break;
        case "write":
          args.push("write");
          if (params.title) args.push("--title", params.title);
          if (params.content) args.push("--content", params.content);
          if (params.category) args.push("--category", params.category);
          if (params.tags) args.push("--tags", params.tags.join(","));
          if (params.scope) args.push("--scope", params.scope);
          break;
        default:
          return { content: [{ type: "text", text: "Unknown action" }], isError: true };
      }

      const result = await cli(args, { cwd, timeoutMs: 10000 });
      return toToolResult(result);
    },
    ...knowledgeToolRenderers,
  });

  // ── Tool: role_info ──

  pi.registerTool({
    name: "role_info",
    label: "Role Info",
    description: "Get the active role directory structure.",
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
      recursive: Type.Optional(Type.Boolean()),
      maxEntries: Type.Optional(Type.Number()),
    }),
    async execute(_toolCallId: string, params: Record<string, any>, _signal?: any, _onUpdate?: any, ctx?: any) {
      const result = await cliSafe(["role", "info"], { cwd: ctx?.cwd || process.cwd() });
      return toToolResult(result);
    },
    ...roleInfoToolRenderers,
  });

  // ── Commands (delegated to CLI) ──

  /** Generic command helper: run CLI, send result as pi message */
  async function runCmd(name: string, args: string[], ctx: ExtensionContext, opts?: { timeoutMs?: number }) {
    const result = await cli(args, { cwd: cwdOf(ctx), timeoutMs: opts?.timeoutMs || 10000 });
    const text = result.ok
      ? (result.message || JSON.stringify(result.data, null, 2))
      : `Error: ${result.error}`;
    pi.sendMessage({ customType: name, content: text, display: true }, { triggerTurn: false });
  }

  pi.registerCommand("role", {
    description: "Role management: /role info | create | map | unmap | list",
    handler: async (args, ctx) => {
      const argv = (args || "").trim().split(/\s+/);
      const cmd = argv[0] || "info";
      await runCmd("role", ["role", cmd, ...argv.slice(1)], ctx);
    },
  });

  pi.registerCommand("memories", {
    description: "View role memory",
    handler: async (_args, ctx) => {
      await runCmd("memories", ["memory", "list"], ctx);
    },
  });

  pi.registerCommand("memory-log", {
    description: "Session memory log",
    handler: async (_args, ctx) => {
      await runCmd("memory-log", ["memory", "log"], ctx);
    },
  });

  pi.registerCommand("memory-fix", {
    description: "Repair consolidated.md",
    handler: async (_args, ctx) => {
      await runCmd("memory-fix", ["memory", "repair", "--force"], ctx);
    },
  });

  pi.registerCommand("memory-tidy", {
    description: "Manual memory tidy",
    handler: async (_args, ctx) => {
      await runCmd("memory-tidy", ["memory", "consolidate"], ctx);
    },
  });

  pi.registerCommand("memory-tidy-llm", {
    description: "LLM memory tidy",
    handler: async (args, ctx) => {
      const argv = args?.trim() ? ["--model", args.trim()] : [];
      await runCmd("memory-tidy-llm", ["memory", "tidy", ...argv], ctx, { timeoutMs: 120000 });
    },
  });

  pi.registerCommand("memory-vector", {
    description: "Vector memory: /memory-vector stats | rebuild",
    handler: async (args, ctx) => {
      const sub = (args || "").trim().toLowerCase() || "stats";
      await runCmd("memory-vector", ["embedding", sub], ctx);
    },
  });

  pi.registerCommand("memory-tags", {
    description: "Browse memory tags",
    handler: async (_args, ctx) => {
      await runCmd("memory-tags", ["memory", "list"], ctx);
    },
  });

  pi.registerCommand("memory-conflicts", {
    description: "Detect memory conflicts",
    handler: async (_args, ctx) => {
      await runCmd("memory-conflicts", ["memory", "conflicts"], ctx);
    },
  });

  pi.registerCommand("memory-export", {
    description: "Export memory to HTML",
    handler: async (args, ctx) => {
      const argv = args?.trim() ? ["--output", args.trim()] : [];
      await runCmd("memory-export", ["memory", "export", ...argv], ctx);
    },
  });

  pi.registerCommand("memory-distill", {
    description: "Enable memory→knowledge distillation",
    handler: async (_args, ctx) => {
      notify(ctx, "memory-distill is not yet supported in CLI mode", "warning");
    },
  });

  pi.registerCommand("memory-distill-stop", {
    description: "Disable distillation",
    handler: async (_args, ctx) => {
      notify(ctx, "memory-distill stopped", "info");
    },
  });

  pi.registerCommand("kb", {
    description: "Knowledge base: /kb [list|search <query>|stats]",
    handler: async (args, ctx) => {
      const argv = (args || "").trim().split(/\s+/);
      const cmd = argv[0] || "list";
      if (cmd === "search" && argv[1]) {
        await runCmd("kb", ["knowledge", "search", argv.slice(1).join(" ")], ctx);
      } else if (cmd === "stats") {
        await runCmd("kb", ["knowledge", "list"], ctx);
      } else {
        await runCmd("kb", ["knowledge", "list", ...argv.slice(1)], ctx);
      }
    },
  });

  // ── Evolution reminder (lightweight, no CLI) ──

  let userTurnCount = 0;
  let lastEvolutionAt = 0;
  let lastEvolutionDate = "";

  pi.on("turn_end", async (event, ctx) => {
    if (!ctx.hasUI) return;
    const messages = (event as any).messages || [];
    const lastUserIdx = messages.findLastIndex((m: any) => m.role === "user");
    const lastAssistantIdx = messages.findLastIndex((m: any) => m.role === "assistant");
    if (lastUserIdx < 0 || (lastAssistantIdx >= 0 && lastAssistantIdx > lastUserIdx)) return;

    userTurnCount++;
    const today = new Date().toISOString().split("T")[0];
    const now = Date.now();
    const cooldown = 60 * 60 * 1000;
    const reminderTurns = _config?.advanced?.evolutionReminderTurns || 10;

    if (userTurnCount >= reminderTurns && lastEvolutionDate !== today && now - lastEvolutionAt >= cooldown) {
      lastEvolutionDate = today;
      lastEvolutionAt = now;
      userTurnCount = 0;
      pi.sendMessage({
        customType: "evolution-reminder",
        content: `[Low-priority] Consider daily reflection when convenient.`,
        display: false,
      }, { triggerTurn: false, deliverAs: "nextTurn" });
    }
  });
}
