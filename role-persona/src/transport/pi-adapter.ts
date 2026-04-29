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

  // ── Formatted command helpers ──

  function msg(customType: string, content: string) {
    pi.sendMessage({ customType, content, display: true }, { triggerTurn: false });
  }

  pi.registerCommand("role", {
    description: "Role management: /role info | create | map | unmap | list",
    handler: async (args, ctx) => {
      const argv = (args || "").trim().split(/\s+/);
      const cmd = argv[0] || "info";
      const cwd = cwdOf(ctx);

      switch (cmd) {
        case "info": {
          const res = await cli(["role", "info"], { cwd });
          if (!res.ok || !res.data) { notify(ctx, res.error || "No role", "warning"); return; }
          const d = res.data as any;
          const resolution = await cli(["init"], { cwd });
          const rd = resolution.data as any;
          let info = `## 角色状态\n\n`;
          info += `**当前目录**: ${cwd}\n`;
          info += `**生效角色**: ${d.name || "无"}\n`;
          info += `**来源**: ${rd?.source || "unknown"}\n\n`;
          info += `**角色名称**: ${d.name}\n`;
          info += `**显示名称**: ${d.identity?.name || "未设置"}\n`;
          info += `**状态**: ${d.isFirstRun ? "[FIRST RUN] 首次运行" : "[OK] 已配置"}\n`;
          info += `**路径**: ${d.path}\n\n`;
          info += `### 可用命令\n\n`;
          info += `- \`/role create [name]\` - 创建新角色\n`;
          info += `- \`/role map [role]\` - 映射目录到角色\n`;
          info += `- \`/role unmap\` - 取消映射\n`;
          info += `- \`/role list\` - 列出所有角色\n`;
          info += `- \`/memories\` - 查看记忆\n`;
          info += `- \`/memory-log\` - 记忆操作日志\n`;
          info += `- \`/memory-fix\` - 修复记忆结构\n`;
          info += `- \`/memory-tidy\` - 整理记忆\n`;
          info += `- \`/memory-tags\` - 标签云\n`;
          info += `- \`/kb\` - 知识库\n`;
          msg("role-info", info);
          break;
        }
        case "create": {
          let name = argv[1];
          if (!name && isTuiAvailable(ctx)) {
            name = await ctx.ui.input("新角色名称:", "my-assistant") || "";
          }
          if (!name?.trim()) { notify(ctx, "未提供角色名", "warning"); return; }
          const r = await cli(["role", "create", name.trim()], { cwd });
          if (!r.ok) { notify(ctx, r.error || "创建失败", "error"); return; }
          await cli(["role", "map", name.trim()], { cwd });
          notify(ctx, `[OK] 创建角色: ${name.trim()}`, "success");
          break;
        }
        case "map": {
          const name = argv[1];
          if (!name) { notify(ctx, "Usage: /role map <name>", "warning"); return; }
          const r = await cli(["role", "map", name], { cwd });
          if (r.ok) notify(ctx, `已映射: ${cwd} → ${name}`, "success");
          else notify(ctx, r.error || "映射失败", "error");
          break;
        }
        case "unmap": {
          const r = await cli(["role", "unmap"], { cwd });
          notify(ctx, r.ok ? "已取消映射" : (r.error || "失败"), r.ok ? "info" : "error");
          break;
        }
        case "list": {
          const r = await cli(["role", "list"], { cwd });
          if (!r.ok || !Array.isArray(r.data)) { notify(ctx, r.error || "失败", "error"); return; }
          const roles = r.data as any[];
          let info = `## 角色列表 (${roles.length})\n\n`;
          for (const role of roles) {
            const name = typeof role === "string" ? role : role.name;
            const identity = typeof role === "object" ? role.identity : null;
            info += `- **${name}** ${identity?.name ? `(${identity.name})` : ""}\n`;
          }
          msg("role-list", info);
          break;
        }
        default:
          notify(ctx, `未知命令: ${cmd}`, "error");
      }
    },
  });

  pi.registerCommand("memories", {
    description: "View role memory (server by default, use /memories tui for terminal)",
    handler: async (args, ctx) => {
      const mode = (args || "").trim().toLowerCase();

      // /memories tui — terminal viewer
      if (mode === "tui" && isTuiAvailable(ctx)) {
        try {
          const { RoleMemoryViewerComponent } = await import("./tui-renderers.ts");
          await ctx.ui.custom<void>(
            (tui, theme, _kb, done) => new RoleMemoryViewerComponent("", "", tui, theme, done),
            { overlay: true, overlayOptions: { anchor: "center", width: "90%", maxHeight: "95%" } }
          );
        } catch { notify(ctx, "TUI viewer not available", "warning"); }
        return;
      }

      // Default: start HTTP server + open browser
      const role = svc.getActiveRole();
      if (!role) { notify(ctx, "未映射角色", "warning"); return; }
      try {
        const { openMemoryServer } = await import("./memory-server.ts");
        const handle = await openMemoryServer(role.path, role.name);
        notify(ctx, `Memory server: ${handle.url} (port ${handle.port})`, "success");
      } catch (err) {
        notify(ctx, `Server failed: ${err}`, "error");
      }
    },
  });

  pi.registerCommand("memory-log", {
    description: "Session memory log",
    handler: async (_args, ctx) => {
      const r = await cli(["memory", "log"], { cwd: cwdOf(ctx) });
      if (!r.ok) { notify(ctx, r.error || "失败", "error"); return; }
      const log = r.data as any[];
      if (!log || log.length === 0) { notify(ctx, "本次会话暂无记忆操作", "info"); return; }

      const sourceIcon: Record<string, string> = { compaction: "🗜", "auto-extract": "🤖", tool: "🔧", manual: "✏️" };
      const opIcon: Record<string, string> = { learning: "📘", preference: "⚙️", event: "📅", knowledge: "📚", reinforce: "💪", consolidate: "🧹" };

      const stored = log.filter((e: any) => e.stored).length;
      const skipped = log.length - stored;

      let output = `## 🧠 Memory Log — ${log.length} 操作\n\n`;
      output += `| 指标 | 数值 |\n|------|------|\n`;
      output += `| 总操作 | ${log.length} |\n`;
      output += `| ✓ 已存储 | ${stored} |\n`;
      output += `| ✗ 跳过 | ${skipped} |\n\n`;

      const storedEntries = log.filter((e: any) => e.stored);
      if (storedEntries.length > 0) {
        output += `### ✓ 已存储记忆\n\n`;
        for (const e of storedEntries) {
          const op = opIcon[e.op] || "?";
          output += `- ${op} **${e.op}**: ${e.content}\n`;
        }
      }

      const skippedEntries = log.filter((e: any) => !e.stored);
      if (skippedEntries.length > 0) {
        output += `### ✗ 跳过记录\n\n`;
        for (const e of skippedEntries) {
          const op = opIcon[e.op] || "?";
          const reason = e.detail ? ` — ${e.detail}` : "";
          output += `- ${op} **${e.op}**: ${e.content.slice(0, 80)}${reason}\n`;
        }
      }

      msg("memory-log", output);
    },
  });

  pi.registerCommand("memory-fix", {
    description: "Repair consolidated.md",
    handler: async (_args, ctx) => {
      const r = await cli(["memory", "repair", "--force"], { cwd: cwdOf(ctx) });
      if (!r.ok) { notify(ctx, r.error || "失败", "error"); return; }
      const d = r.data as any;
      notify(ctx, d.repaired ? `memory/consolidated.md 已修复 (${d.issues} issues)` : "无需修复", d.repaired ? "success" : "info");
    },
  });

  pi.registerCommand("memory-tidy", {
    description: "Manual memory tidy",
    handler: async (_args, ctx) => {
      const r = await cli(["memory", "consolidate"], { cwd: cwdOf(ctx) });
      if (!r.ok) { notify(ctx, r.error || "失败", "error"); return; }
      const d = r.data as any;
      const msg = [`Memory tidy done`, `- consolidate: L ${d.beforeLearnings}→${d.afterLearnings}, P ${d.beforePreferences}→${d.afterPreferences}`].join("\n");
      notify(ctx, "memory/consolidated.md 已整理", "success");
      pi.sendMessage({ customType: "memory-tidy", content: msg, display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("memory-tidy-llm", {
    description: "LLM memory tidy",
    handler: async (args, ctx) => {
      const argv = args?.trim() ? ["--model", args.trim()] : [];
      notify(ctx, "LLM memory tidy running...", "info");
      const r = await cli(["memory", "tidy", ...argv], { cwd: cwdOf(ctx), timeoutMs: 120000 });
      if (!r.ok) { notify(ctx, `LLM tidy 失败: ${r.error}`, "error"); return; }
      const d = r.data as any;
      const summary = [
        `LLM tidy done`,
        `- model: ${d.model}`,
        `- learnings: ${d.apply.beforeLearnings} → ${d.apply.afterLearnings}`,
        `- preferences: ${d.apply.beforePreferences} → ${d.apply.afterPreferences}`,
      ].join("\n");
      notify(ctx, "LLM 记忆整理完成", "success");
      pi.sendMessage({ customType: "memory-tidy-llm", content: summary, display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("memory-vector", {
    description: "Vector memory: /memory-vector stats | rebuild",
    handler: async (args, ctx) => {
      const sub = (args || "").trim().toLowerCase() || "stats";

      if (sub === "rebuild") {
        notify(ctx, "正在重建向量索引...", "info");
        const r = await cli(["embedding", "rebuild"], { cwd: cwdOf(ctx), timeoutMs: 60000 });
        if (!r.ok) { notify(ctx, r.error || "失败", "error"); return; }
        const d = r.data as any;
        notify(ctx, `向量索引重建完成: ${d.indexed}/${d.total} 条已索引`, "success");
        return;
      }

      const r = await cli(["embedding", "stats"], { cwd: cwdOf(ctx) });
      if (!r.ok) { notify(ctx, r.error || "失败", "error"); return; }
      const d = r.data as any;
      const lines = [
        `向量记忆状态`,
        `- 启用: ${d.enabled}`,
        `- 激活: ${d.active}`,
        `- 模型: ${d.model || "n/a"}`,
        `- 维度: ${d.dim || "n/a"}`,
        `- 已索引: ${d.count} 条`,
        `- 路径: ${d.dbPath || "n/a"}`,
      ];
      pi.sendMessage({ customType: "memory-vector-stats", content: lines.join("\n"), display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("memory-tags", {
    description: "Browse memory tags",
    handler: async (_args, ctx) => {
      const r = await cli(["memory", "list"], { cwd: cwdOf(ctx) });
      if (!r.ok || !r.data) { notify(ctx, r.error || "失败", "error"); return; }
      const d = r.data as any;
      // The list command returns text with tag info embedded
      // For now, show the memory summary
      let output = `# Tag Cloud\n\n`;
      output += `Learnings: ${d.learnings}, Preferences: ${d.preferences}\n\n`;
      if (d.text) output += d.text;
      msg("memory-tags", output);
    },
  });

  pi.registerCommand("memory-conflicts", {
    description: "Detect memory conflicts",
    handler: async (_args, ctx) => {
      const r = await cli(["memory", "conflicts"], { cwd: cwdOf(ctx) });
      if (!r.ok) { notify(ctx, r.error || "失败", "error"); return; }
      const d = r.data as any;
      if (!d.conflicts || d.conflicts.length === 0) {
        notify(ctx, "✅ 未检测到记忆冲突", "success");
      } else {
        let output = `## 记忆冲突 (${d.conflicts.length})\n\n`;
        for (const c of d.conflicts) {
          output += `- [${(c.similarity * 100).toFixed(0)}%] ${c.text1}\n`;
          output += `  ${c.text2}\n\n`;
        }
        msg("memory-conflicts", output);
      }
    },
  });

  pi.registerCommand("memory-export", {
    description: "Export memory to HTML",
    handler: async (args, ctx) => {
      const outputPath = (args || "").trim();
      const r = await cli(["memory", "export", ...(outputPath ? ["--output", outputPath] : [])], { cwd: cwdOf(ctx) });
      if (!r.ok) { notify(ctx, `导出失败: ${r.error}`, "error"); return; }
      notify(ctx, `✅ 记忆已导出`, "success");
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

      switch (cmd) {
        case "list": {
          const r = await cli(["knowledge", "list", ...argv.slice(1)], { cwd: cwdOf(ctx) });
          if (!r.ok || !r.data) { notify(ctx, r.error || "失败", "error"); return; }
          const d = r.data as any;
          let output = `Knowledge Base — ${d.totalEntries} entries\n\n`;
          for (const src of d.sources) {
            const total = src.categories.reduce((s: number, c: any) => s + c.entries.length, 0);
            if (total === 0) continue;
            const ro = src.readonly ? " (readonly)" : "";
            output += `[${src.id}${ro}]\n`;
            for (const cat of src.categories) {
              output += `  ${cat.category}/ — ${cat.entries.length} entries\n`;
              for (const e of cat.entries) {
                output += `    ${e.file}: ${e.title}\n`;
              }
            }
            output += `\n`;
          }
          msg("kb-list", output);
          break;
        }
        case "search": {
          const query = argv.slice(1).join(" ");
          if (!query) { notify(ctx, "Usage: /kb search <query>", "warning"); return; }
          const r = await cli(["knowledge", "search", query], { cwd: cwdOf(ctx) });
          if (!r.ok || !r.data) { notify(ctx, "No matches", "info"); return; }
          const results = r.data as any[];
          const lines = results.map((item: any, i: number) =>
            `${i + 1}. [${item.entry.source}] ${item.entry.meta.title} (${item.relevance.toFixed(2)}) — ${item.entry.relativePath}`
          );
          msg("kb-search", lines.join("\n") || "No matches");
          break;
        }
        case "stats": {
          const r = await cli(["knowledge", "list"], { cwd: cwdOf(ctx) });
          if (!r.ok || !r.data) { notify(ctx, r.error || "失败", "error"); return; }
          const d = r.data as any;
          notify(ctx, `${d.totalEntries} entries | ${Object.keys(d.tagIndex || {}).length} tags`, "info");
          break;
        }
        default:
          notify(ctx, "Usage: /kb [list|search <query>|stats]", "info");
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
