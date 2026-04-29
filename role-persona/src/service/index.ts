/**
 * RolePersonaService — unified facade for all operations.
 *
 * This is the single entry point that CLI, MCP, HTTP Daemon, and Pi Adapter
 * all consume. Zero Pi API dependency.
 *
 * Usage:
 *   const service = createService({ rolesDir, config })
 *   await service.init(cwd)
 *   service.memory.addLearning("...")
 *   service.knowledge.search("design patterns")
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  ActiveRole,
  InitResult,
  RolePersonaConfig,
  Message,
  ToolCallResult,
  LlmCaller,
  EmbeddingProvider,
} from "../core/types.ts";
import { loadConfig } from "../core/config.ts";
import { ensureRolesDir, ROLES_DIR, resolveRoleForCwd, loadRoleConfig, createRole } from "../core/role-store.ts";
import { ensureRoleMemoryFiles } from "../core/memory-md.ts";
import { log } from "../core/logger.ts";
import { ServiceContext } from "./context.ts";
import { createRoleService, type RoleService } from "./role-service.ts";
import { createMemoryService, type MemoryService } from "./memory-service.ts";
import { createKnowledgeService, type KnowledgeService } from "./knowledge-service.ts";
import { createEmbeddingService, type EmbeddingService } from "./embedding-service.ts";

export interface RolePersonaService {
  // ── Lifecycle ──
  init(cwd: string): Promise<InitResult>;
  dispose(): Promise<void>;

  // ── Sub-services ──
  role: RoleService;
  memory: MemoryService;
  knowledge: KnowledgeService;
  embedding: EmbeddingService;

  // ── Context access ──
  getActiveRole(): ActiveRole | null;
  getConfig(): RolePersonaConfig;
  getRolesDir(): string;

  // ── System Prompt building ──
  buildSystemPrompt(basePrompt: string, messages?: Message[]): Promise<string>;
}

export interface ServiceOptions {
  /** Roles directory. Default: ~/.pi/roles */
  rolesDir?: string;
  /** Config override. Default: loaded from disk */
  config?: RolePersonaConfig;
  /** LLM caller for auto-extraction / tidy */
  llm?: LlmCaller;
  /** Embedding provider */
  embeddingProvider?: EmbeddingProvider;
}

export function createService(options: ServiceOptions = {}): RolePersonaService {
  const rolesDir = options.rolesDir || ROLES_DIR;
  const config = options.config || loadConfig();

  const ctx: ServiceContext = {
    activeRole: null,
    config,
    rolesDir,
    llm: options.llm,
    embeddingProvider: options.embeddingProvider,
    embeddingActive: false,
    memoryLog: [],
  };

  const roleService = createRoleService(ctx);
  const memoryService = createMemoryService(ctx);
  const knowledgeService = createKnowledgeService(ctx);
  const embeddingService = createEmbeddingService(ctx);

  return {
    role: roleService,
    memory: memoryService,
    knowledge: knowledgeService,
    embedding: embeddingService,

    getActiveRole() {
      return ctx.activeRole;
    },

    getConfig() {
      return ctx.config;
    },

    getRolesDir() {
      return ctx.rolesDir;
    },

    async init(cwd: string): Promise<InitResult> {
      ensureRolesDir();

      const migration = roleService.migrateAll();
      const roleConfig = roleService.loadConfig();
      const resolution = resolveRoleForCwd(cwd, roleConfig);
      const roleName = resolution.role;

      let activeRole: ActiveRole | null = null;

      if (roleName) {
        const rolePath = join(ctx.rolesDir, roleName);

        if (!existsSync(rolePath) && resolution.source === "default") {
          createRole(roleName);
        }

        if (existsSync(rolePath)) {
          ensureRoleMemoryFiles(rolePath, roleName);
          activeRole = roleService.activate(roleName);
          ctx.embeddingActive = await embeddingService.init(rolePath);
        }
      }

      ctx.activeRole = activeRole;
      return { role: activeRole, resolution, migration };
    },

    async dispose() {
      await embeddingService.flush();
      embeddingService.dispose();
    },

    async buildSystemPrompt(basePrompt: string, messages?: Message[]): Promise<string> {
      if (!ctx.activeRole) return basePrompt;

      const { path: rolePath, name: roleName } = ctx.activeRole;
      const rolePrompt = roleService.getPrompts(rolePath);

      // Memory blocks
      const memoryBlocks: string[] = [];
      const promptBlocks = memoryService.readPromptBlocks();
      if (promptBlocks.length > 0) {
        memoryBlocks.push(promptBlocks.join("\n\n---\n\n"));
      }

      // File location instruction
      const today = new Date().toISOString().split("T")[0];
      const fileLocation = [
        `## 📁 FILE LOCATIONS`,
        `All persona files are stored in: **${rolePath}**`,
        `- identity → ${rolePath}/core/identity.md`,
        `- user → ${rolePath}/core/user.md`,
        `- soul → ${rolePath}/core/soul.md`,
        `- memory → ${rolePath}/memory/consolidated.md`,
        `- daily → ${rolePath}/memory/daily/${today}.md`,
      ].join("\n");

      // Memory edit instruction
      const editInstruction = memoryService.buildEditInstruction();

      // Vector recall (if active)
      let vectorRecall = "";
      if (messages && messages.length > 0 && ctx.embeddingActive && ctx.config.vectorMemory?.autoRecall) {
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const queryText = lastUser?.content?.map((c) => c.text || "").join(" ") || "";
        if (queryText.length > 10) {
          const recalled = await memoryService.autoRecall(queryText);
          if (recalled) {
            vectorRecall = `\n\n${recalled}`;
          }
        }
      }

      const parts = [basePrompt, fileLocation, rolePrompt];
      if (memoryBlocks.length > 0) {
        parts.push(`\n\n## Your Memory\n\n${memoryBlocks.join("\n\n---\n\n")}`);
      }
      parts.push(editInstruction);
      if (vectorRecall) parts.push(vectorRecall);

      return parts.join("\n\n");
    },
  };
}
