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
import { compact as piCompact } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { log } from "./logger.ts";
import { SelectList, Text, Container } from "@mariozechner/pi-tui";
import { config, reloadConfig } from "./config.ts";

import {
  addRoleLearning,
  addRolePreference,
  appendDailyRoleMemory,
  buildMemoryEditInstruction,
  consolidateRoleMemory,
  ensureRoleMemoryFiles,
  listRoleMemory,
  loadHighPriorityMemories,
  loadMemoryOnDemand,
  readMemoryPromptBlocks,
  readRoleMemory,
  reinforceRoleLearning,
  repairRoleMemory,
  searchRoleMemory,
} from "./memory-md.ts";
import { RoleMemoryViewerComponent, buildRoleMemoryViewerMarkdown } from "./memory-viewer.ts";
import { runAutoMemoryExtraction, runLlmMemoryTidy } from "./memory-llm.ts";
import { getAllTags, buildTagCloudHTML } from "./memory-tags.ts";
import {
  createRole,
  DEFAULT_ROLE,
  ensureRolesDir,
  getRoleIdentity,
  getRoles,
  isFirstRun,
  isRoleDisabledForCwd,
  loadRoleConfig,
  loadRolePrompts,
  resolveRoleForCwd,
  ROLES_DIR,
  saveRoleConfig,
} from "./role-store.ts";

// 配置从 config.ts 加载，环境变量可覆盖
const AUTO_MEMORY_ENABLED = config.autoMemory.enabled;
const AUTO_MEMORY_MODEL = config.autoMemory.model;
const AUTO_MEMORY_MAX_ITEMS = config.autoMemory.maxItems;
const AUTO_MEMORY_MAX_TEXT = config.autoMemory.maxText;
const AUTO_MEMORY_RESERVE_TOKENS = config.autoMemory.reserveTokens;
const AUTO_MEMORY_BATCH_TURNS = config.autoMemory.batchTurns;
const AUTO_MEMORY_MIN_TURNS = config.autoMemory.minTurns;
const AUTO_MEMORY_INTERVAL_MS = config.autoMemory.intervalMs;
const AUTO_MEMORY_FORCE_KEYWORDS = new RegExp(config.advanced.forceKeywords, "i");
const AUTO_MEMORY_CONTEXT_OVERLAP = config.autoMemory.contextOverlap;
const SHUTDOWN_FLUSH_TIMEOUT = config.advanced.shutdownFlushTimeoutMs;
const EVOLUTION_REMINDER_TURNS = config.advanced.evolutionReminderTurns;
const SPINNER_INTERVAL = config.ui.spinnerIntervalMs;
const SPINNER_FRAMES = config.ui.spinnerFrames;
const ON_DEMAND_SEARCH_ENABLED = config.memory.onDemandSearch.enabled;
const ON_DEMAND_SEARCH_MAX_RESULTS = config.memory.onDemandSearch.maxResults;
const ON_DEMAND_SEARCH_MIN_SCORE = config.memory.onDemandSearch.minScore;
const ON_DEMAND_LOAD_HIGH_PRIORITY = config.memory.onDemandSearch.alwaysLoadHighPriority;

// Default prompt templates moved to role-template.ts

// ============================================================================
// MAIN EXTENSION
// ============================================================================

export default function rolePersonaExtension(pi: ExtensionAPI) {
  let currentRole: string | null = null;
  let currentRolePath: string | null = null;
  let autoMemoryInFlight = false;
  let autoMemoryBgScheduled = false;
  let autoMemoryPendingTurns = 0;
  let autoMemoryLastAt = 0;
  let autoMemoryLastMessages: unknown[] | null = null;
  let autoMemoryLastFlushLen = 0;  // 上次 flush 时的消息数组长度
  let memoryCheckpointSpinner: ReturnType<typeof setInterval> | null = null;
  let memoryCheckpointFrame = 0;
  let isFirstUserMessage = true;  // 标记是否是第一条用户消息

  const normalizePath = (path: string) => path.replace(/\/$/, "");

  /** Notify user — falls back to sendMessage in headless (RPC) mode */
  /** Notify user — falls back to sendMessage in headless (RPC) mode */
  function notify(ctx: ExtensionContext, message: string, level?: string): void {
    if (ctx.hasUI) {
      ctx.ui.notify(message, (level as any) ?? "info");
    } else {
      pi.sendMessage({ customType: "role-notify", content: message, display: true }, { triggerTurn: false });
    }
  }

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

  function stopMemoryCheckpointSpinner(): void {
    if (memoryCheckpointSpinner) {
      clearInterval(memoryCheckpointSpinner);
      memoryCheckpointSpinner = null;
    }
  }

  function startMemoryCheckpointSpinner(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    stopMemoryCheckpointSpinner();

    memoryCheckpointFrame = 0;
    ctx.ui.setStatus("memory-checkpoint", SPINNER_FRAMES[memoryCheckpointFrame]);

    memoryCheckpointSpinner = setInterval(() => {
      memoryCheckpointFrame = (memoryCheckpointFrame + 1) % SPINNER_FRAMES.length;
      ctx.ui.setStatus("memory-checkpoint", SPINNER_FRAMES[memoryCheckpointFrame]);
    }, SPINNER_INTERVAL);
  }

  function setMemoryCheckpointResult(ctx: ExtensionContext, reason: string, learnings: number, prefs: number): void {
    if (!ctx.hasUI) return;

    const badge = reason === "keyword"
      ? "✳"
      : reason === "batch-5-turns"
        ? "✶"
        : reason === "interval-30m"
          ? "✦"
          : "✧";

    const reasonLabel = reason === "keyword"
      ? "关键词"
      : reason === "batch-5-turns"
        ? "5轮"
        : reason === "interval-30m"
          ? "30m"
          : reason === "session-shutdown"
            ? "退出"
            : "check";

    ctx.ui.setStatus("memory-checkpoint", `${badge} ${reasonLabel} ${learnings}L ${prefs}P`);
  }

  async function flushAutoMemory(messages: unknown[], ctx: ExtensionContext, reason: string): Promise<void> {
    if (!AUTO_MEMORY_ENABLED || autoMemoryInFlight) return;
    if (!currentRole || !currentRolePath) return;

    autoMemoryInFlight = true;
    startMemoryCheckpointSpinner(ctx);

    const sliceStart = Math.max(0, autoMemoryLastFlushLen - AUTO_MEMORY_CONTEXT_OVERLAP);
    const recentMessages = messages.slice(sliceStart);

    log("checkpoint", `flush reason=${reason} totalMessages=${messages.length} sliceStart=${sliceStart} newMessages=${recentMessages.length} pendingTurns=${autoMemoryPendingTurns}`);

    try {
      const extracted = await runAutoMemoryExtraction(currentRole, currentRolePath, ctx, recentMessages, {
        enabled: AUTO_MEMORY_ENABLED,
        model: AUTO_MEMORY_MODEL,
        maxItems: AUTO_MEMORY_MAX_ITEMS,
        maxText: AUTO_MEMORY_MAX_TEXT,
        reserveTokens: AUTO_MEMORY_RESERVE_TOKENS,
      });

      autoMemoryLastFlushLen = messages.length;
      autoMemoryLastAt = Date.now();
      autoMemoryPendingTurns = 0;

      if (extracted) {
        log("checkpoint", `result: ${extracted.storedLearnings}L ${extracted.storedPrefs}P`);
        setMemoryCheckpointResult(ctx, reason, extracted.storedLearnings, extracted.storedPrefs);
      } else {
        log("checkpoint", "result: null (no extraction)");
      }
    } finally {
      stopMemoryCheckpointSpinner();
      autoMemoryInFlight = false;
    }
  }

  function scheduleAutoMemoryFlush(messages: unknown[], ctx: ExtensionContext, reason: string): void {
    if (!AUTO_MEMORY_ENABLED) return;
    autoMemoryLastMessages = messages;

    if (autoMemoryInFlight || autoMemoryBgScheduled) return;
    autoMemoryBgScheduled = true;

    setTimeout(() => {
      autoMemoryBgScheduled = false;
      const latest = autoMemoryLastMessages || messages;
      void flushAutoMemory(latest, ctx, reason);
    }, 0);
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
        notify(ctx, "取消创建，使用默认角色", "warning");
        return setupRole(DEFAULT_ROLE, ctx);
      }

      const trimmedName = newName.trim();
      const newPath = createRole(trimmedName);
      notify(ctx, `[OK] 创建角色: ${trimmedName}`, "success");
      notify(ctx, "BOOTSTRAP.md 将引导初始化过程", "info");

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
    autoMemoryInFlight = false;
    autoMemoryBgScheduled = false;
    autoMemoryPendingTurns = 0;
    autoMemoryLastFlushLen = 0;
    autoMemoryLastMessages = null;
    stopMemoryCheckpointSpinner();

    ensureRoleMemoryFiles(rolePath, roleName);
    const repair = repairRoleMemory(rolePath, roleName);

    if (ctx.hasUI) {
      const identity = getRoleIdentity(rolePath);
      const displayName = identity?.name || roleName;

      ctx.ui.setStatus("role", displayName);
      ctx.ui.setStatus("memory-checkpoint", undefined);

      if (repair.repaired) {
        notify(ctx, `MEMORY.md 已规范化修复 (${repair.issues} issues)`, "info");
      }

      if (isFirstRun(rolePath)) {
        notify(ctx, `${displayName} - [FIRST RUN]`, "info");
        notify(ctx, '发送 "hello" 开始人格设定对话', "info");
      }
    }
  }

  // ============ EVENT HANDLERS ============

  // 1. Session start - auto-load role based on cwd mapping
  pi.on("session_start", async (_event, ctx) => {
    ensureRolesDir();
    
    // Reset first message flag for on-demand memory search
    isFirstUserMessage = true;

    const config = loadRoleConfig();
    const cwd = ctx.cwd;
    const resolution = resolveRoleForCwd(cwd, config);
    const roleName = resolution.role;

    if (roleName) {
      const rolePath = join(ROLES_DIR, roleName);

      // 默认角色缺失时自动创建，保证 fallback 可用
      if (!existsSync(rolePath) && resolution.source === "default") {
        createRole(roleName);
      }

      if (existsSync(rolePath)) {
        await activateRole(roleName, rolePath, ctx);
      } else {
        notify(ctx, `[WARN] 角色 "${roleName}" 不存在（source: ${resolution.source}）`, "warning");
        ctx.ui?.setStatus("role", "none");
      }
    } else {
      if (ctx.hasUI) {
        ctx.ui.setStatus("role", resolution.source === "disabled" ? "off" : "none");
      }
    }
  });

  // 2. Inject prompts into system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    if (!currentRolePath || !currentRole) return;

    const repair = repairRoleMemory(currentRolePath, currentRole);
    if (repair.repaired && ctx.hasUI) {
      notify(ctx, `Memory auto-repair applied (${repair.issues} issues)`, "info");
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

## 📝 MEMORY

Memory is auto-managed in the background. Only use the \`memory\` tool when the user explicitly asks to remember something.
Do NOT proactively save memories or do reflections unless asked.

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

    // Memory loading strategy: on-demand search for first message, full load otherwise
    let memoryPrompt = "";
    
    if (ON_DEMAND_SEARCH_ENABLED && isFirstUserMessage) {
      // First message: use on-demand search based on user query + recent daily memories
      // Extract query from the last user message in the conversation
      const messages = (event as any).messages || [];
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user");
      const userQuery = lastUserMessage?.content?.[0]?.text || "";
      
      const memoryBlocks: string[] = [];
      
      // 1. Load on-demand searched memories
      if (userQuery) {
        const onDemand = loadMemoryOnDemand(currentRolePath, currentRole, userQuery, {
          maxResults: ON_DEMAND_SEARCH_MAX_RESULTS,
          minScore: ON_DEMAND_SEARCH_MIN_SCORE,
          includeHighPriority: ON_DEMAND_LOAD_HIGH_PRIORITY,
        });
        
        if (onDemand.content) {
          memoryBlocks.push(onDemand.content);
          log("memory-on-demand", `First message: loaded ${onDemand.matchCount} relevant memories + high priority`);
        }
      } else {
        // Fallback: load high priority only
        const highPriority = loadHighPriorityMemories(currentRolePath, currentRole);
        if (highPriority) {
          memoryBlocks.push(highPriority);
        }
      }
      
      // 2. Always load recent daily memories (default behavior)
      const dailyMemories = await loadMemoryFiles(currentRolePath);
      if (dailyMemories.length > 0) {
        memoryBlocks.push(...dailyMemories);
      }
      
      if (memoryBlocks.length > 0) {
        memoryPrompt = `\n\n## Your Memory\n\n${memoryBlocks.join("\n\n---\n\n")}`;
      }
      
      isFirstUserMessage = false; // Mark as processed
    } else {
      // Subsequent messages or on-demand disabled: load recent daily memories only
      const memories = await loadMemoryFiles(currentRolePath);
      if (memories.length > 0) {
        memoryPrompt = `\n\n## Your Memory\n\n${memories.join("\n\n---\n\n")}`;
      }
    }

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

    // Non-blocking checkpoint: run in background, don't hold the turn.
    scheduleAutoMemoryFlush(event.messages, ctx, decision.reason);
  });

  // 3.5 Intercept compaction to extract memories before context is lost.
  // Piggybacks on the default compaction LLM call by injecting a <memory> extraction
  // instruction into customInstructions. Parses the JSON output and writes to MEMORY.md
  // + daily memory, then strips the <memory> block from the summary.
  pi.on("session_before_compact", async (event, ctx) => {
    if (!AUTO_MEMORY_ENABLED || !currentRole || !currentRolePath) return;

    const { preparation, signal } = event;
    const rolePath = currentRolePath;
    const roleName = currentRole;
    const model = ctx.model;
    if (!model) return;

    const apiKey = await ctx.modelRegistry.getApiKey(model);
    if (!apiKey) {
      log("compact-memory", "no apiKey available, skipping memory extraction");
      return;
    }

    log("compact-memory", `intercepting compaction: ${preparation.messagesToSummarize.length} messages to summarize`);

    const memoryInstruction = `

IMPORTANT: In addition to the summary above, extract key memories from this conversation that should be preserved long-term.
Output them in a <memory> block at the END of your response, after the summary.
Format:

<memory>
[
  {"type": "learning", "content": "concise factual insight or pattern"},
  {"type": "preference", "content": "user preference or habit", "category": "Communication|Code|Tools|Workflow|General"},
  {"type": "event", "content": "significant event or milestone", "date": "YYYY-MM-DD"}
]
</memory>

Rules for memory extraction:
- Only extract DURABLE, REUSABLE insights (not one-off task details)
- Keep each item under 120 chars
- Max 5 items total
- Skip the <memory> block entirely if nothing worth remembering
- The <memory> block must contain valid JSON inside the tags`;

    try {
      const result = await piCompact(
        preparation,
        model,
        apiKey,
        memoryInstruction,
        signal,
      );

      // Parse and strip <memory> block from summary
      const memoryMatch = result.summary.match(/<memory>\s*([\s\S]*?)\s*<\/memory>/);
      if (memoryMatch) {
        result.summary = result.summary.replace(/<memory>[\s\S]*?<\/memory>/, "").trimEnd();

        try {
          const items = JSON.parse(memoryMatch[1]) as Array<{
            type: string;
            content: string;
            category?: string;
            date?: string;
          }>;

          let storedL = 0, storedP = 0;
          for (const item of items) {
            if (!item.content?.trim()) continue;

            if (item.type === "learning") {
              const r = addRoleLearning(rolePath, roleName, item.content, {
                source: "compaction",
                appendDaily: true,
              });
              if (r.stored) storedL++;
            } else if (item.type === "preference") {
              const r = addRolePreference(rolePath, roleName, item.category || "General", item.content, {
                appendDaily: true,
              });
              if (r.stored) storedP++;
            } else if (item.type === "event") {
              appendDailyRoleMemory(rolePath, "event", item.content);
            }
          }

          log("compact-memory", `extracted ${storedL}L ${storedP}P from compaction`);
          setMemoryCheckpointResult(ctx, "compaction", storedL, storedP);
        } catch (parseErr) {
          log("compact-memory", `failed to parse <memory> JSON: ${parseErr}`);
        }
      } else {
        log("compact-memory", "no <memory> block in compaction output");
      }

      return {
        compaction: {
          summary: result.summary,
          firstKeptEntryId: result.firstKeptEntryId,
          tokensBefore: result.tokensBefore,
          details: result.details,
        },
      };
    } catch (err) {
      log("compact-memory", `compaction failed, falling back to default: ${err}`);
      // Return nothing — pi will run its own default compaction
      return;
    }
  });

  // 4. Flush on session shutdown if there are pending turns (best-effort, bounded wait)
  pi.on("session_shutdown", async (_event, ctx) => {
    if (AUTO_MEMORY_ENABLED && autoMemoryPendingTurns > 0 && autoMemoryLastMessages) {
      await Promise.race([
        flushAutoMemory(autoMemoryLastMessages, ctx, "session-shutdown"),
        new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_FLUSH_TIMEOUT)),
      ]);
    }

    stopMemoryCheckpointSpinner();

    if (ctx.hasUI) {
      ctx.ui.setStatus("role", undefined);
      ctx.ui.setStatus("memory-checkpoint", undefined);
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
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!currentRole || !currentRolePath) {
        return { content: [{ type: "text", text: "No active role mapped in current directory." }], details: { error: true } };
      }

      log("memory-tool", `action=${params.action} role=${currentRole}`, {
        content: params.content?.slice(0, 80),
        category: params.category,
        query: params.query,
        id: params.id,
      });

      switch (params.action) {
        case "add_learning": {
          if (!params.content) {
            return { content: [{ type: "text", text: "Error: content is required" }], details: { error: true } };
          }
          // Use async version with LLM tag extraction
          const { addRoleLearningWithTags } = await import("./memory-md.ts");
          const result = await addRoleLearningWithTags(ctx, currentRolePath, currentRole, params.content, { appendDaily: true });
          log("memory-tool", `add_learning: ${result.stored ? "stored" : result.reason} id=${result.id || "-"} tags=${result.tags?.join(",") || "-"}`, params.content);
          if (!result.stored) {
            return {
              content: [{ type: "text", text: result.duplicate ? "Already stored" : "Not stored" }],
              details: result,
            };
          }
          return {
            content: [{ type: "text", text: `Stored learning: ${params.content}${result.tags?.length ? ` [tags: ${result.tags.join(", ")}]` : ""}` }],
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
          log("memory-tool", `add_preference: ${result.stored ? "stored" : result.reason} [${result.category}] id=${result.id || "-"}`, params.content);
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
          log("memory-tool", `reinforce: ${result.updated ? `ok [${result.id}] ${result.used}x` : "not found"}`, needle);
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
          log("memory-tool", `search: "${query}" -> ${matches.length} matches`);
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
          log("memory-tool", `list: ${result.learnings}L ${result.preferences}P ${result.issues} issues`);
          return {
            content: [{ type: "text", text: result.text }],
            details: { learnings: result.learnings, preferences: result.preferences, issues: result.issues },
          };
        }

        case "consolidate": {
          const result = consolidateRoleMemory(currentRolePath, currentRole);
          log("memory-tool", `consolidate: L ${result.beforeLearnings}->${result.afterLearnings} P ${result.beforePreferences}->${result.afterPreferences}`);
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
          log("memory-tool", `repair: ${result.repaired ? `repaired (${result.issues} issues)` : "healthy"}`);
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
          log("memory-tool", `llm_tidy start model=${params.model || "(session)"}`);
          const llm = await runLlmMemoryTidy(currentRolePath, currentRole, ctx, params.model);
          if ("error" in llm) {
            log("memory-tool", `llm_tidy failed: ${llm.error}`);
            return { content: [{ type: "text", text: `LLM tidy failed: ${llm.error}` }], details: { error: true } };
          }
          log("memory-tool", `llm_tidy done via ${llm.model}: L ${llm.apply.beforeLearnings}->${llm.apply.afterLearnings} P ${llm.apply.beforePreferences}->${llm.apply.afterPreferences}`);
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
        notify(ctx, "当前目录未映射角色", "warning");
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

  pi.registerCommand("memory-tags", {
    description: "Browse memory by auto-extracted tags with forgetting curve visualization",
    args: {
      query: { type: "string", optional: true, description: "Filter tags by keyword" },
      export: { type: "boolean", optional: true, description: "Export tag cloud to HTML" },
    },
    handler: async (args, ctx) => {
      if (!currentRole || !currentRolePath) {
        notify(ctx, "当前目录未映射角色", "warning");
        return;
      }

      const memoryData = readRoleMemory(currentRolePath, currentRole);
      const tagRegistry = getAllTags(memoryData);

      if (args.export) {
        const html = buildTagCloudHTML(tagRegistry, memoryData.roleName);
        const os = await import("node:os");
        const fs = await import("node:fs");
        const path = await import("node:path");
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `${currentRole}-tags.html`);
        fs.writeFileSync(tmpFile, html);
        notify(ctx, `Tag cloud exported: ${tmpFile}`, "success");
        return;
      }

      if (!ctx.hasUI) {
        const lines = [`# Tag Cloud for ${currentRole}`, ""];
        const sortedTags = Object.entries(tagRegistry)
          .sort((a, b) => b[1].weight - a[1].weight)
          .slice(0, 50);

        for (const [tag, meta] of sortedTags) {
          const strength = meta.weight > 5 ? "🔥" : meta.weight > 2 ? "⭐" : "💤";
          lines.push(`- ${strength} **${tag}** (${meta.count} memories, weight: ${meta.weight.toFixed(2)})`);
        }

        pi.sendMessage({ customType: "role-tags", content: lines.join("\n"), display: true }, { triggerTurn: false });
        return;
      }

      // Build TUI tag browser
      const { SelectList, Text, Container } = await import("@mariozechner/pi-tui");

      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        const container = new Container();

        container.addChild(new Text(theme.fg("accent", theme.bold("Tag Cloud - " + currentRole))));
        container.addChild(new Text(""));

        const sortedTags = Object.entries(tagRegistry)
          .sort((a, b) => b[1].weight - a[1].weight)
          .filter(([tag]) => !args.query || tag.toLowerCase().includes(args.query.toLowerCase()));

        const items = sortedTags.map(([tag, meta]) => ({
          label: tag.padEnd(20) + " " + meta.count + "x w:" + meta.weight.toFixed(1) + (meta.forgotten ? " [fading]" : ""),
          value: tag,
        }));

        if (items.length === 0) {
          container.addChild(new Text("No tags found"));
        } else {
          const tagList = new SelectList(
            items.map(i => i.label),
            Math.min(items.length, 15),
            {
              onSelect: (index) => {
                const tag = items[index].value;
                const meta = tagRegistry[tag];
                const preview = [
                  "Tag: " + tag,
                  "Count: " + meta.count + " memories",
                  "Weight: " + meta.weight.toFixed(2),
                  "Last Used: " + new Date(meta.lastUsed).toLocaleDateString(),
                  "",
                  "Related memories:",
                  ...meta.memories.slice(0, 5).map((m) => "  - " + m.text.slice(0, 80) + "..."),
                ].join("\n");
                notify(ctx, preview, "info");
              },
            }
          );
          container.addChild(tagList);
        }

        return {
          render(width: number) {
            return container.render(width);
          },
          invalidate() {
            container.invalidate();
          },
          handleInput(data: string) {
            const children = container["children"] || [];
            const list = children.find((c: any) => c instanceof SelectList);
            if (list) {
              list.handleInput(data);
              tui.requestRender();
            }
          },
        };
      }, {
        overlay: true,
        overlayOptions: {
          anchor: "center",
          width: "80%",
          minWidth: 50,
          maxHeight: "80%",
        },
      });
    },
  });

  pi.registerCommand("memory-fix", {
    description: "Repair current role MEMORY.md into canonical markdown structure",
    handler: async (_args, ctx) => {
      if (!currentRole || !currentRolePath) {
        notify(ctx, "当前目录未映射角色", "warning");
        return;
      }
      const result = repairRoleMemory(currentRolePath, currentRole, { force: true });
      if (result.repaired) {
        notify(ctx, `MEMORY.md 已修复 (${result.issues} issues)`, "success");
      } else {
        notify(ctx, "MEMORY.md 无需修复", "info");
      }
    },
  });

  pi.registerCommand("memory-tidy", {
    description: "Manual memory maintenance: repair + consolidate + summary",
    handler: async (_args, ctx) => {
      if (!currentRole || !currentRolePath) {
        notify(ctx, "当前目录未映射角色", "warning");
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

      notify(ctx, "MEMORY.md 已手动整理", "success");
      pi.sendMessage({ customType: "memory-tidy", content: msg, display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("memory-tidy-llm", {
    description: "Manual LLM memory maintenance (optional model): /memory-tidy-llm [provider/model]",
    handler: async (args, ctx) => {
      if (!currentRole || !currentRolePath) {
        notify(ctx, "当前目录未映射角色", "warning");
        return;
      }

      const requestedModel = args?.trim() || undefined;
      notify(ctx, `LLM memory tidy running${requestedModel ? ` (${requestedModel})` : ""}...`, "info");

      const llm = await runLlmMemoryTidy(currentRolePath, currentRole, ctx, requestedModel);
      if ("error" in llm) {
        notify(ctx, `LLM tidy 失败: ${llm.error}`, "error");
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

      notify(ctx, "LLM 记忆整理完成", "success");
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
          const resolution = resolveRoleForCwd(cwd, config);
          const mappedRole = resolution.role;

          let info = `## 角色状态\n\n`;
          info += `**当前目录**: ${cwd}\n`;
          info += `**生效角色**: ${mappedRole || "无"}\n`;
          info += `**来源**: ${resolution.source}${resolution.matchedPath ? ` (${resolution.matchedPath})` : ""}\n`;
          info += `**默认角色**: ${config.defaultRole || DEFAULT_ROLE}\n`;
          info += `**本目录禁用角色**: ${isRoleDisabledForCwd(cwd, config) ? "是" : "否"}\n\n`;

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
          info += `- \`/role unmap\` - 取消映射并禁用本目录角色（含默认角色）\n`;
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
            if (!ctx.hasUI) {
              notify(ctx, "Usage: /role create <name>", "warning");
              return;
            }
            roleName = await selectCreateRoleNameUI(ctx) || "";
            if (!roleName) {
              notify(ctx, "已取消创建角色", "info");
              return;
            }
          }

          if (!roleName) {
            notify(ctx, "未提供角色名", "warning");
            return;
          }

          const rolePath = join(ROLES_DIR, roleName);
          if (existsSync(rolePath)) {
            notify(ctx, `角色 "${roleName}" 已存在`, "warning");
            return;
          }

          createRole(roleName);
          notify(ctx, `[OK] 创建角色: ${roleName}`, "success");

          // In headless mode, auto-map to current cwd
          const shouldMap = ctx.hasUI
            ? await ctx.ui.confirm("映射", `将当前目录映射到 "${roleName}"?`)
            : true;
          if (shouldMap) {
            const cwdKey = normalizePath(cwd);
            config.mappings[cwdKey] = roleName;
            config.disabledPaths = (config.disabledPaths || []).filter((path) => normalizePath(path) !== cwdKey);

            saveRoleConfig(config);
            await activateRole(roleName, rolePath, ctx);
            notify(ctx, `已映射: ${cwdKey} → ${roleName}`, "success");
          }
          break;
        }

        case "map": {
          let roleName = argv[1];

          if (!roleName) {
            if (!ctx.hasUI) {
              const roles = getRoles();
              notify(ctx, `Usage: /role map <name>\nAvailable: ${roles.join(", ")}`, "warning");
              return;
            }
            const selected = await selectRoleUI(ctx);
            if (!selected) {
              notify(ctx, "已取消映射", "info");
              return;
            }

            if (selected === "__create__") {
              const created = await selectCreateRoleNameUI(ctx);
              if (!created) {
                notify(ctx, "已取消创建角色", "info");
                return;
              }

              const rolePath = join(ROLES_DIR, created);
              if (!existsSync(rolePath)) {
                createRole(created);
                notify(ctx, `[OK] 创建角色: ${created}`, "success");
              }
              roleName = created;
            } else {
              roleName = selected;
            }
          }

          if (!roleName) {
            notify(ctx, "未选择角色", "warning");
            return;
          }

          const rolePath = join(ROLES_DIR, roleName);
          if (!existsSync(rolePath)) {
            notify(ctx, `角色 "${roleName}" 不存在`, "error");
            return;
          }

          const cwdKey = normalizePath(cwd);
          config.mappings[cwdKey] = roleName;
          config.disabledPaths = (config.disabledPaths || []).filter((path) => normalizePath(path) !== cwdKey);

          saveRoleConfig(config);
          await activateRole(roleName, rolePath, ctx);
          notify(ctx, `已映射: ${cwdKey} → ${roleName}`, "success");
          break;
        }

        case "unmap": {
          const cwdKey = normalizePath(cwd);

          // 仅移除当前目录的显式映射，不误伤父目录映射
          let removedMapping = false;
          for (const [path] of Object.entries(config.mappings)) {
            if (normalizePath(path) === cwdKey) {
              delete config.mappings[path];
              removedMapping = true;
            }
          }

          // 标记当前目录禁用角色（包含默认角色）
          const disabled = new Set((config.disabledPaths || []).map((path) => normalizePath(path)));
          disabled.add(cwdKey);
          config.disabledPaths = Array.from(disabled);

          saveRoleConfig(config);

          currentRole = null;
          currentRolePath = null;
          if (ctx.hasUI) {
            ctx.ui.setStatus("role", "off");
            ctx.ui.setStatus("memory-checkpoint", undefined);
          }

          notify(ctx, 
            removedMapping
              ? "已取消当前目录映射，并标记为不使用角色（默认角色也禁用）"
              : "当前目录已标记为不使用角色（默认角色禁用）",
            "info"
          );
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
          
          info += `\n### 默认角色\n\n`;
          info += `- **${config.defaultRole || DEFAULT_ROLE}**\n`;

          info += `\n### 目录映射\n\n`;
          const mappings = Object.entries(config.mappings);
          if (mappings.length === 0) {
            info += "无映射\n";
          } else {
            for (const [path, role] of mappings) {
              info += `- \`${normalizePath(path)}\` → **${role}**\n`;
            }
          }

          info += `\n### 禁用角色目录（unmap 结果）\n\n`;
          const disabledPaths = (config.disabledPaths || []).map((path) => normalizePath(path));
          if (disabledPaths.length === 0) {
            info += "无\n";
          } else {
            for (const path of disabledPaths) {
              info += `- \`${path}\`\n`;
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
          notify(ctx, `未知命令: ${cmd}。可用: info, create, map, unmap, list`, "error");
        }
      }
    }
  });

  // ============ HEARTBEAT & EVOLUTION ============

  // Evolution reminder: periodic gentle nudge for daily reflection.
  // Counts USER input turns only, with 60-min cooldown to avoid spam.
  let userTurnCount = 0;
  let lastEvolutionAt = 0;
  let lastEvolutionDate = "";

  pi.on("turn_end", async (event, ctx) => {
    if (!currentRolePath || !ctx.hasUI) return;

    // Only count turns that started from a user message
    const messages = (event as any).messages || [];
    const lastUserIdx = messages.findLastIndex((m: any) => m.role === "user");
    const lastAssistantIdx = messages.findLastIndex((m: any) => m.role === "assistant");
    // If the latest user message is newer than the latest assistant, this turn was user-initiated
    if (lastUserIdx < 0 || (lastAssistantIdx >= 0 && lastAssistantIdx > lastUserIdx)) return;

    userTurnCount++;

    const today = new Date().toISOString().split("T")[0];
    const now = Date.now();
    const cooldownMs = 60 * 60 * 1000; // 60 minutes

    // Trigger: every 10 user turns, max once per 60 min, once per day
    if (
      userTurnCount >= EVOLUTION_REMINDER_TURNS &&
      lastEvolutionDate !== today &&
      now - lastEvolutionAt >= cooldownMs
    ) {
      lastEvolutionDate = today;
      lastEvolutionAt = now;
      userTurnCount = 0;

      // Low-priority note — must NOT override user intent
      pi.sendMessage({
        customType: "evolution-reminder",
        content: `[Low-priority note] When you have a natural pause, consider a brief daily reflection:
- Skim ${currentRolePath}/memory/ for today's notes
- Optionally update MEMORY.md with durable insights
This is background housekeeping — always prioritize the user's current question first.`,
        display: false
      }, {
        triggerTurn: false,
        deliverAs: "nextTurn"
      });
    }
  });
}
