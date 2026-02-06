/**
 * Role Persona Extension - OpenClaw-style persona system for pi
 *
 * Features:
 * - Role selection on startup (not switchable within session)
 * - TUI status display of current role
 * - Full OpenClaw prompt file structure (AGENTS, BOOTSTRAP, IDENTITY, USER, SOUL, etc.)
 * - Automatic memory loading (daily + long-term)
 * - First-run bootstrap guidance
 *
 * Directory structure:
 * ~/.pi/roles/
 *   ├── default/
 *   │   ├── AGENTS.md      # Workspace rules
 *   │   ├── BOOTSTRAP.md   # First-run guidance (deleted after init)
 *   │   ├── IDENTITY.md    # AI identity (name, creature, vibe, emoji)
 *   │   ├── USER.md        # User profile
 *   │   ├── SOUL.md        # Core truths and personality
 *   │   ├── HEARTBEAT.md   # Proactive check tasks
 *   │   ├── TOOLS.md       # Tool preferences
 *   │   ├── MEMORY.md      # Long-term curated memory
 *   │   └── memory/        # Daily memory files
 *   │       └── YYYY-MM-DD.md
 *   └── other-role/
 *       └── ...
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { SelectList, Text, Container } from "@mariozechner/pi-tui";

import {
  addRoleLearning,
  addRolePreference,
  buildMemoryEditInstruction,
  consolidateRoleMemory,
  ensureRoleMemoryFiles,
  listRoleMemory,
  readMemoryPromptBlocks,
  reinforceRoleLearning,
  repairRoleMemory,
  searchRoleMemory,
} from "./memory-md.ts";
import { RoleMemoryViewerComponent, buildRoleMemoryViewerMarkdown } from "./memory-viewer.ts";
import { runAutoMemoryExtraction, runLlmMemoryTidy } from "./memory-llm.ts";
import {
  createRole,
  DEFAULT_ROLE,
  ensureRolesDir,
  getRoleForCwd,
  getRoleIdentity,
  getRoles,
  isFirstRun,
  loadRoleConfig,
  loadRolePrompts,
  ROLES_DIR,
  saveRoleConfig,
} from "./role-store.ts";

const AUTO_MEMORY_ENABLED = process.env.ROLE_AUTO_MEMORY !== "0" && process.env.RHO_SUBAGENT !== "1";
const AUTO_MEMORY_MAX_ITEMS = 3;
const AUTO_MEMORY_MAX_TEXT = 200;
const AUTO_MEMORY_BATCH_TURNS = 5;
const AUTO_MEMORY_MIN_TURNS = 2;
const AUTO_MEMORY_INTERVAL_MS = 30 * 60 * 1000;
const AUTO_MEMORY_FORCE_KEYWORDS = /结束|总结|退出|收尾|结束会话|final|summary|wrap\s?up|quit|exit/i;

// Default prompt templates moved to role-template.ts

// ============================================================================
// MAIN EXTENSION
// ============================================================================

export default function rolePersonaExtension(pi: ExtensionAPI) {
  let currentRole: string | null = null;
  let currentRolePath: string | null = null;
  let autoMemoryInFlight = false;
  let autoMemoryPendingTurns = 0;
  let autoMemoryLastAt = 0;
  let autoMemoryLastMessages: unknown[] | null = null;

  function messageText(messages: unknown[]): string {
    const parts: string[] = [];
    for (const msg of messages as Array<any>) {
      const content = Array.isArray(msg?.content) ? msg.content : [];
      for (const item of content) {
        if (item?.type === "text" && typeof item.text === "string") {
          parts.push(item.text);
        }
      }
    }
    return parts.join("\n");
  }

  function shouldFlushAutoMemory(messages: unknown[]): { should: boolean; reason: string } {
    const text = messageText(messages);
    const now = Date.now();

    if (AUTO_MEMORY_FORCE_KEYWORDS.test(text)) {
      return { should: true, reason: "keyword" };
    }

    if (autoMemoryPendingTurns >= AUTO_MEMORY_BATCH_TURNS) {
      return { should: true, reason: "batch-5-turns" };
    }

    const intervalReached = now - autoMemoryLastAt >= AUTO_MEMORY_INTERVAL_MS;
    if (intervalReached && autoMemoryPendingTurns >= AUTO_MEMORY_MIN_TURNS) {
      return { should: true, reason: "interval-30m" };
    }

    return { should: false, reason: "defer" };
  }

  async function flushAutoMemory(messages: unknown[], ctx: ExtensionContext, reason: string): Promise<void> {
    if (!AUTO_MEMORY_ENABLED || autoMemoryInFlight) return;
    if (!currentRole || !currentRolePath) return;

    autoMemoryInFlight = true;
    try {
      const extracted = await runAutoMemoryExtraction(currentRole, currentRolePath, ctx, messages, {
        enabled: AUTO_MEMORY_ENABLED,
        maxItems: AUTO_MEMORY_MAX_ITEMS,
        maxText: AUTO_MEMORY_MAX_TEXT,
      });

      autoMemoryLastAt = Date.now();
      autoMemoryPendingTurns = 0;

      if (ctx.hasUI && extracted && (extracted.storedLearnings > 0 || extracted.storedPrefs > 0)) {
        ctx.ui.notify(
          `Auto-memory checkpoint [${reason}]: ${extracted.storedLearnings}L ${extracted.storedPrefs}P`,
          "info"
        );
      }
    } finally {
      autoMemoryInFlight = false;
    }
  }

  // ============ ROLE LOADING ============

  async function loadMemoryFiles(rolePath: string): Promise<string[]> {
    return readMemoryPromptBlocks(rolePath);
  }

  // ============ TUI ROLE SELECTOR ============

  async function selectRoleUI(ctx: ExtensionContext): Promise<string | null> {
    const roles = getRoles();

    const items = roles.map(name => {
      const path = join(ROLES_DIR, name);
      const identity = getRoleIdentity(path);
      const firstRun = isFirstRun(path);

      return {
        value: name,
        label: identity?.name ? `${name} (${identity.name})` : name,
        description: firstRun ? "[FIRST RUN] 首次运行 - 需要初始化" : "已配置"
      };
    });

    items.push({
      value: "__create__",
      label: "+ 创建新角色",
      description: "创建自定义角色"
    });

    return await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();

      container.addChild(new Text(theme.fg("accent", theme.bold("选择角色"))));
      container.addChild(new Text(theme.fg("muted", "每个角色有独立的记忆和个性")));
      container.addChild(new Text(""));

      const selectList = new SelectList(items, Math.min(items.length, 10), {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", theme.bold(text)),
        description: (text) => theme.fg("dim", text),
      });

      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);

      container.addChild(selectList);
      container.addChild(new Text(""));
      container.addChild(new Text(theme.fg("dim", "↑↓ 选择 • Enter 确认 • Esc 取消")));

      return {
        render(width: number) {
          return container.render(width);
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    });
  }

  async function selectCreateRoleNameUI(ctx: ExtensionContext): Promise<string | null> {
    const preset = ["architect", "backend", "frontend", "reviewer", "mentor", "assistant"];
    const items = [
      { value: "__custom__", label: "+ 自定义名称", description: "输入任意角色名" },
      ...preset.map((name) => ({ value: name, label: name, description: "预设建议" })),
    ];

    const selected = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new Text(theme.fg("accent", theme.bold("创建角色"))));
      container.addChild(new Text(theme.fg("muted", "先上下选择，再回车确认")));
      container.addChild(new Text(""));

      const selectList = new SelectList(items, Math.min(items.length, 10), {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", theme.bold(text)),
        description: (text) => theme.fg("dim", text),
      });

      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);

      container.addChild(selectList);
      container.addChild(new Text(""));
      container.addChild(new Text(theme.fg("dim", "↑↓ 选择 • Enter 确认 • Esc 取消")));

      return {
        render(width: number) {
          return container.render(width);
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    });

    if (!selected) return null;
    if (selected !== "__custom__") return selected;

    const typed = await ctx.ui.input("新角色名称:", "my-assistant");
    if (!typed || !typed.trim()) return null;
    return typed.trim();
  }

  // ============ ROLE SETUP ============

  async function setupRole(roleName: string, ctx: ExtensionContext): Promise<void> {
    // Handle create new
    if (roleName === "__create__") {
      const newName = await ctx.ui.input("新角色名称:", "my-assistant");
      if (!newName || newName.trim() === "") {
        ctx.ui.notify("取消创建，使用默认角色", "warning");
        return setupRole(DEFAULT_ROLE, ctx);
      }

      const trimmedName = newName.trim();
      const newPath = createRole(trimmedName);
      ctx.ui.notify(`[OK] 创建角色: ${trimmedName}`, "success");
      ctx.ui.notify("BOOTSTRAP.md 将引导初始化过程", "info");

      return activateRole(trimmedName, newPath, ctx);
    }

    // Ensure role exists
    const rolePath = join(ROLES_DIR, roleName);
    if (!existsSync(rolePath)) {
      createRole(roleName);
    }

    return activateRole(roleName, rolePath, ctx);
  }

  async function activateRole(roleName: string, rolePath: string, ctx: ExtensionContext): Promise<void> {
    currentRole = roleName;
    currentRolePath = rolePath;
    autoMemoryPendingTurns = 0;
    autoMemoryLastMessages = null;

    ensureRoleMemoryFiles(rolePath, roleName);
    const repair = repairRoleMemory(rolePath, roleName);

    if (!ctx.hasUI) return;

    // Update TUI status
    const identity = getRoleIdentity(rolePath);
    const displayName = identity?.name || roleName;

    ctx.ui.setStatus("role", displayName);

    if (repair.repaired) {
      ctx.ui.notify(`MEMORY.md 已规范化修复 (${repair.issues} issues)`, "info");
    }

    // Notify user
    if (isFirstRun(rolePath)) {
      ctx.ui.notify(`${displayName} - [FIRST RUN]`, "info");
      ctx.ui.notify('发送 "hello" 开始人格设定对话', "info");
    }
  }

  // ============ EVENT HANDLERS ============

  // 1. Session start - auto-load role based on cwd mapping
  pi.on("session_start", async (_event, ctx) => {
    ensureRolesDir();

    const config = loadRoleConfig();
    const cwd = ctx.cwd;
    
    // 查找当前目录对应的角色
    const mappedRole = getRoleForCwd(cwd);
    
    if (mappedRole) {
      const rolePath = join(ROLES_DIR, mappedRole);
      if (existsSync(rolePath)) {
        await activateRole(mappedRole, rolePath, ctx);
      } else {
        ctx.ui?.notify(`[WARN] 映射的角色 "${mappedRole}" 不存在`, "warning");
        ctx.ui?.setStatus("role", "none");
      }
    } else {
      // 无角色映射
      if (ctx.hasUI) {
        ctx.ui.setStatus("role", "none");
      }
    }
  });

  // 2. Inject prompts into system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    if (!currentRolePath || !currentRole) return;

    const repair = repairRoleMemory(currentRolePath, currentRole);
    if (repair.repaired && ctx.hasUI) {
      ctx.ui.notify(`Memory auto-repair applied (${repair.issues} issues)`, "info");
    }

    // Build file location instruction
    const today = new Date().toISOString().split("T")[0];
    const fileLocationInstruction = `## 📁 FILE LOCATIONS

IMPORTANT: All persona files are stored in the role directory:
**${currentRolePath}**

When creating or editing these files, ALWAYS use the full path:
- IDENTITY.md → ${currentRolePath}/IDENTITY.md
- USER.md → ${currentRolePath}/USER.md
- SOUL.md → ${currentRolePath}/SOUL.md
- MEMORY.md → ${currentRolePath}/MEMORY.md
- Daily memories → ${currentRolePath}/memory/YYYY-MM-DD.md

## 📝 HOW TO SAVE MEMORIES

When user says "remember this" or you learn something important:

1. Read the daily memory file: ${currentRolePath}/memory/${today}.md
2. If it doesn't exist, create it with header: # Memory: ${today}
3. Append new memory with timestamp:
   ## [HH:MM] CATEGORY
   
   Content here...
4. Categories: event, lesson, preference, context, decision

Example:
## [14:32] PREFERENCE

User prefers concise code without excessive comments.

${buildMemoryEditInstruction(currentRolePath)}`;

    // First run: inject BOOTSTRAP guidance
    if (isFirstRun(currentRolePath)) {
      const bootstrapPath = join(currentRolePath, "BOOTSTRAP.md");
      const bootstrap = readFileSync(bootstrapPath, "utf-8");

      return {
        systemPrompt: `${event.systemPrompt}\n\n${fileLocationInstruction}\n\n## [FIRST RUN] FIRST RUN - BOOTSTRAP\n\n${bootstrap}\n\n---\n\nFollow the BOOTSTRAP.md guidance above. After initialization is complete, delete BOOTSTRAP.md.`
      };
    }

    // Normal operation: inject role prompts
    const rolePrompt = await loadRolePrompts(currentRolePath);

    // Load memories
    const memories = await loadMemoryFiles(currentRolePath);
    const memoryPrompt = memories.length > 0
      ? `\n\n## Your Memory\n\n${memories.join("\n\n---\n\n")}`
      : "";

    return {
      systemPrompt: `${event.systemPrompt}\n\n${fileLocationInstruction}\n\n${rolePrompt}${memoryPrompt}`
    };
  });

  // 3. Smart auto-memory checkpoints (not every turn)
  pi.on("agent_end", async (event, ctx) => {
    if (!AUTO_MEMORY_ENABLED) return;
    if (!currentRole || !currentRolePath) return;

    autoMemoryPendingTurns += 1;
    autoMemoryLastMessages = event.messages;

    const decision = shouldFlushAutoMemory(event.messages);
    if (!decision.should) return;

    await flushAutoMemory(event.messages, ctx, decision.reason);
  });

  // 4. Flush on session shutdown if there are pending turns
  pi.on("session_shutdown", async (_event, ctx) => {
    if (AUTO_MEMORY_ENABLED && autoMemoryPendingTurns > 0 && autoMemoryLastMessages) {
      await flushAutoMemory(autoMemoryLastMessages, ctx, "session-shutdown");
    }

    if (ctx.hasUI) {
      ctx.ui.setStatus("role", undefined);
    }
  });

  // ============ MEMORY TOOLING ============

  pi.registerTool({
    name: "memory",
    label: "Role Memory",
    description:
      "Manage role memory in MEMORY.md (markdown sections). Actions: add_learning, add_preference, reinforce, search, list, consolidate, repair, llm_tidy.",
    parameters: Type.Object({
      action: StringEnum(["add_learning", "add_preference", "reinforce", "search", "list", "consolidate", "repair", "llm_tidy"] as const),
      content: Type.Optional(Type.String({ description: "Memory text" })),
      category: Type.Optional(Type.String({ description: "Preference category" })),
      query: Type.Optional(Type.String({ description: "Search query" })),
      id: Type.Optional(Type.String({ description: "Memory id" })),
      model: Type.Optional(Type.String({ description: "Optional model override, e.g. openai/gpt-4.1-mini" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!currentRole || !currentRolePath) {
        return { content: [{ type: "text", text: "No active role mapped in current directory." }], details: { error: true } };
      }

      switch (params.action) {
        case "add_learning": {
          if (!params.content) {
            return { content: [{ type: "text", text: "Error: content is required" }], details: { error: true } };
          }
          const result = addRoleLearning(currentRolePath, currentRole, params.content, { appendDaily: true });
          if (!result.stored) {
            return {
              content: [{ type: "text", text: result.duplicate ? "Already stored" : "Not stored" }],
              details: result,
            };
          }
          return {
            content: [{ type: "text", text: `Stored learning: ${params.content}` }],
            details: result,
          };
        }

        case "add_preference": {
          if (!params.content) {
            return { content: [{ type: "text", text: "Error: content is required" }], details: { error: true } };
          }
          const result = addRolePreference(
            currentRolePath,
            currentRole,
            params.category || "General",
            params.content,
            { appendDaily: true }
          );
          if (!result.stored) {
            return {
              content: [{ type: "text", text: result.duplicate ? "Already stored" : "Not stored" }],
              details: result,
            };
          }
          return {
            content: [{ type: "text", text: `Stored preference [${result.category}]: ${params.content}` }],
            details: result,
          };
        }

        case "reinforce": {
          const needle = params.id || params.query || params.content;
          if (!needle) {
            return { content: [{ type: "text", text: "Error: id/query/content required" }], details: { error: true } };
          }
          const result = reinforceRoleLearning(currentRolePath, currentRole, needle);
          if (!result.updated) {
            return { content: [{ type: "text", text: "Learning not found" }], details: { error: true } };
          }
          return {
            content: [{ type: "text", text: `Reinforced [${result.id}] -> ${result.used}x` }],
            details: result,
          };
        }

        case "search": {
          const query = params.query || params.content || "";
          if (!query.trim()) {
            return { content: [{ type: "text", text: "Error: query required" }], details: { error: true } };
          }
          const matches = searchRoleMemory(currentRolePath, currentRole, query);
          const text = matches.length
            ? matches
                .map((m) => {
                  if (m.kind === "learning") return `[${m.id}] [${m.used}x] ${m.text}`;
                  if (m.kind === "preference") return `[${m.id}] [${m.category}] ${m.text}`;
                  return `[event] ${m.text}`;
                })
                .join("\n")
            : "No matches";
          return { content: [{ type: "text", text }], details: { count: matches.length } };
        }

        case "list": {
          const result = listRoleMemory(currentRolePath, currentRole);
          return {
            content: [{ type: "text", text: result.text }],
            details: { learnings: result.learnings, preferences: result.preferences, issues: result.issues },
          };
        }

        case "consolidate": {
          const result = consolidateRoleMemory(currentRolePath, currentRole);
          return {
            content: [
              {
                type: "text",
                text: `Consolidated learnings ${result.beforeLearnings}->${result.afterLearnings}, preferences ${result.beforePreferences}->${result.afterPreferences}`,
              },
            ],
            details: result,
          };
        }

        case "repair": {
          const result = repairRoleMemory(currentRolePath, currentRole, { force: true });
          return {
            content: [
              {
                type: "text",
                text: result.repaired
                  ? `MEMORY.md repaired (${result.issues} issues).`
                  : "MEMORY.md is healthy.",
              },
            ],
            details: result,
          };
        }

        case "llm_tidy": {
          const llm = await runLlmMemoryTidy(currentRolePath, currentRole, _ctx, params.model);
          if ("error" in llm) {
            return { content: [{ type: "text", text: `LLM tidy failed: ${llm.error}` }], details: { error: true } };
          }
          return {
            content: [
              {
                type: "text",
                text:
                  `LLM tidy applied via ${llm.model}: ` +
                  `L ${llm.apply.beforeLearnings}->${llm.apply.afterLearnings}, ` +
                  `P ${llm.apply.beforePreferences}->${llm.apply.afterPreferences}`,
              },
            ],
            details: llm,
          };
        }

        default:
          return { content: [{ type: "text", text: "Unknown action" }], details: { error: true } };
      }
    },
  });

  pi.registerCommand("memories", {
    description: "View role memory in a scrollable overlay",
    handler: async (_args, ctx) => {
      if (!currentRole || !currentRolePath) {
        ctx.ui.notify("当前目录未映射角色", "warning");
        return;
      }

      const content = buildRoleMemoryViewerMarkdown(currentRolePath, currentRole);

      if (!ctx.hasUI) {
        pi.sendMessage({ customType: "role-memories", content, display: true }, { triggerTurn: false });
        return;
      }

      await ctx.ui.custom<void>(
        (tui, theme, _kb, done) => new RoleMemoryViewerComponent(currentRolePath, currentRole, tui, theme, done),
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: "90%",
            minWidth: 60,
            maxHeight: "95%",
          },
        },
      );
    },
  });

  pi.registerCommand("memory-fix", {
    description: "Repair current role MEMORY.md into canonical markdown structure",
    handler: async (_args, ctx) => {
      if (!currentRole || !currentRolePath) {
        ctx.ui.notify("当前目录未映射角色", "warning");
        return;
      }
      const result = repairRoleMemory(currentRolePath, currentRole, { force: true });
      if (result.repaired) {
        ctx.ui.notify(`MEMORY.md 已修复 (${result.issues} issues)`, "success");
      } else {
        ctx.ui.notify("MEMORY.md 无需修复", "info");
      }
    },
  });

  pi.registerCommand("memory-tidy", {
    description: "Manual memory maintenance: repair + consolidate + summary",
    handler: async (_args, ctx) => {
      if (!currentRole || !currentRolePath) {
        ctx.ui.notify("当前目录未映射角色", "warning");
        return;
      }

      const repair = repairRoleMemory(currentRolePath, currentRole, { force: true });
      const consolidate = consolidateRoleMemory(currentRolePath, currentRole);
      const summary = listRoleMemory(currentRolePath, currentRole);

      const msg = [
        `Memory tidy done (${currentRole})`,
        `- repair: ${repair.repaired ? "applied" : "clean"}${repair.repaired ? ` (${repair.issues} issues)` : ""}`,
        `- consolidate: learnings ${consolidate.beforeLearnings}->${consolidate.afterLearnings}, preferences ${consolidate.beforePreferences}->${consolidate.afterPreferences}`,
        `- total: ${summary.learnings} learnings, ${summary.preferences} preferences`,
      ].join("\n");

      ctx.ui.notify("MEMORY.md 已手动整理", "success");
      pi.sendMessage({ customType: "memory-tidy", content: msg, display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("memory-tidy-llm", {
    description: "Manual LLM memory maintenance (optional model): /memory-tidy-llm [provider/model]",
    handler: async (args, ctx) => {
      if (!currentRole || !currentRolePath) {
        ctx.ui.notify("当前目录未映射角色", "warning");
        return;
      }

      const requestedModel = args?.trim() || undefined;
      ctx.ui.notify(`LLM memory tidy running${requestedModel ? ` (${requestedModel})` : ""}...`, "info");

      const llm = await runLlmMemoryTidy(currentRolePath, currentRole, ctx, requestedModel);
      if ("error" in llm) {
        ctx.ui.notify(`LLM tidy 失败: ${llm.error}`, "error");
        return;
      }

      const summary = [
        `LLM tidy done (${currentRole})`,
        `- model: ${llm.model}`,
        `- learnings: ${llm.apply.beforeLearnings} -> ${llm.apply.afterLearnings}`,
        `- preferences: ${llm.apply.beforePreferences} -> ${llm.apply.afterPreferences}`,
        `- added: ${llm.apply.addedLearnings}L ${llm.apply.addedPreferences}P`,
        `- rewritten: ${llm.apply.rewrittenLearnings}L ${llm.apply.rewrittenPreferences}P`,
      ].join("\n");

      ctx.ui.notify("LLM 记忆整理完成", "success");
      pi.sendMessage({ customType: "memory-tidy-llm", content: summary, display: true }, { triggerTurn: false });
    },
  });

  // ============ COMMANDS ============

  pi.registerCommand("role", {
    description: "角色管理: /role info | /role create [name] | /role map [role] | /role unmap | /role list", 
    handler: async (args, ctx) => {
      const config = loadRoleConfig();
      const cwd = ctx.cwd;
      const argv = args?.trim().split(/\s+/) || [];
      const cmd = argv[0] || "info";

      switch (cmd) {
        case "info": {
          // 显示当前目录的角色映射状态
          const mappedRole = getRoleForCwd(cwd);
          
          let info = `## 角色状态\n\n`;
          info += `**当前目录**: ${cwd}\n`;
          info += `**映射角色**: ${mappedRole || "无"}\n\n`;
          
          if (mappedRole && currentRole) {
            const isFirst = isFirstRun(currentRolePath!);
            const identity = getRoleIdentity(currentRolePath!);
            info += `**角色名称**: ${currentRole}\n`;
            info += `**显示名称**: ${identity?.name || "未设置"}\n`;
            info += `**状态**: ${isFirst ? "[FIRST RUN] 首次运行" : "[OK] 已配置"}\n`;
          }
          
          info += `\n### 可用命令\n\n`;
          info += `- \`/role create [name]\` - 创建新角色（不填则上下选择）\n`;
          info += `- \`/role map [role]\` - 映射目录到角色（不填则上下选择）\n`;
          info += `- \`/role unmap\` - 取消当前目录映射\n`;
          info += `- \`/role list\` - 列出所有角色和映射\n`;
          info += `- \`/memories\` - 查看 MEMORY.md 与最近 daily memory\n`;
          info += `- \`/memory-fix\` - 强制修复 MEMORY.md 结构\n`;
          info += `- \`/memory-tidy\` - 手动整理记忆（修复+去重+汇总）\n`;
          info += `- \`/memory-tidy-llm [provider/model]\` - LLM整理记忆（可指定模型）\n`;

          pi.sendMessage({
            customType: "role-info",
            content: info,
            display: true
          }, { triggerTurn: false });
          break;
        }

        case "create": {
          let roleName = argv[1];
          if (!roleName) {
            roleName = await selectCreateRoleNameUI(ctx) || "";
            if (!roleName) {
              ctx.ui.notify("已取消创建角色", "info");
              return;
            }
          }

          if (!roleName) {
            ctx.ui.notify("未提供角色名", "warning");
            return;
          }

          const rolePath = join(ROLES_DIR, roleName);
          if (existsSync(rolePath)) {
            ctx.ui.notify(`角色 "${roleName}" 已存在`, "warning");
            return;
          }

          createRole(roleName);
          ctx.ui.notify(`[OK] 创建角色: ${roleName}`, "success");

          const shouldMap = await ctx.ui.confirm("映射", `将当前目录映射到 "${roleName}"?`);
          if (shouldMap) {
            config.mappings[cwd] = roleName;
            saveRoleConfig(config);
            await activateRole(roleName, rolePath, ctx);
            ctx.ui.notify(`已映射: ${cwd} → ${roleName}`, "success");
          }
          break;
        }

        case "map": {
          let roleName = argv[1];

          if (!roleName) {
            const selected = await selectRoleUI(ctx);
            if (!selected) {
              ctx.ui.notify("已取消映射", "info");
              return;
            }

            if (selected === "__create__") {
              const created = await selectCreateRoleNameUI(ctx);
              if (!created) {
                ctx.ui.notify("已取消创建角色", "info");
                return;
              }

              const rolePath = join(ROLES_DIR, created);
              if (!existsSync(rolePath)) {
                createRole(created);
                ctx.ui.notify(`[OK] 创建角色: ${created}`, "success");
              }
              roleName = created;
            } else {
              roleName = selected;
            }
          }

          if (!roleName) {
            ctx.ui.notify("未选择角色", "warning");
            return;
          }

          const rolePath = join(ROLES_DIR, roleName);
          if (!existsSync(rolePath)) {
            ctx.ui.notify(`角色 "${roleName}" 不存在`, "error");
            return;
          }

          config.mappings[cwd] = roleName;
          saveRoleConfig(config);
          await activateRole(roleName, rolePath, ctx);
          ctx.ui.notify(`已映射: ${cwd} → ${roleName}`, "success");
          break;
        }

        case "unmap": {
          // 查找并删除当前目录的映射
          let found = false;
          for (const [path] of Object.entries(config.mappings)) {
            if (path === cwd || cwd.startsWith(path + "/")) {
              delete config.mappings[path];
              found = true;
            }
          }
          
          if (found) {
            saveRoleConfig(config);
            currentRole = null;
            currentRolePath = null;
            ctx.ui.setStatus("role", "none");
            ctx.ui.notify("已取消当前目录的角色映射", "info");
          } else {
            ctx.ui.notify("当前目录没有角色映射", "info");
          }
          break;
        }

        case "list": {
          const roles = getRoles();
          
          let info = `## 角色列表\n\n`;
          
          info += `### 所有角色 (${roles.length})\n\n`;
          for (const role of roles) {
            const identity = getRoleIdentity(join(ROLES_DIR, role));
            info += `- **${role}** ${identity?.name || ""}\n`;
          }
          
          info += `\n### 目录映射\n\n`;
          const mappings = Object.entries(config.mappings);
          if (mappings.length === 0) {
            info += "无映射\n";
          } else {
            for (const [path, role] of mappings) {
              info += `- \`${path}\` → **${role}**\n`;
            }
          }
          
          pi.sendMessage({
            customType: "role-list",
            content: info,
            display: true
          }, { triggerTurn: false });
          break;
        }

        default: {
          ctx.ui.notify(`未知命令: ${cmd}。可用: info, create, map, unmap, list`, "error");
        }
      }
    }
  });

  // ============ HEARTBEAT & EVOLUTION ============

  // Evolution trigger based on conversation count
  let turnCount = 0;
  let lastEvolutionDate = "";

  pi.on("turn_end", async (event, ctx) => {
    if (!currentRolePath || !ctx.hasUI) return;

    turnCount++;
    const today = new Date().toISOString().split("T")[0];

    // Daily check (once per day, after 5+ turns)
    if (lastEvolutionDate !== today && turnCount >= 5) {
      lastEvolutionDate = today;
      turnCount = 0;

      // Inject evolution reminder to AI
      pi.sendMessage({
        customType: "evolution-reminder",
        content: `[Daily Reflection] Consider maintaining your memory and soul:

1. Review recent memories: read ${currentRolePath}/memory/*.md
2. Summarize key insights to ${currentRolePath}/MEMORY.md
3. Reflect on your SOUL.md - does it still reflect who you're becoming?
4. Update as needed.

This is optional but helps you evolve.`,
        display: false
      }, {
        triggerTurn: false,
        deliverAs: "nextTurn"
      });
    }
  });
}
