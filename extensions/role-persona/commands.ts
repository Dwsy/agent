/**
 * All registerCommand() calls for role-persona.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "./logger.ts";
import type { RoleContext } from "./role-context.ts";
import {
  consolidateRoleMemory,
  readRoleMemory,
  repairRoleMemory,
  listRoleMemory,
} from "./memory-md.ts";
import { RoleMemoryViewerComponent, buildRoleMemoryViewerMarkdown } from "./memory-viewer.ts";
import { runLlmMemoryTidy } from "./memory-llm.ts";
import { getAllTags, buildTagCloudHTML } from "./memory-tags.ts";
import {
  createRole,
  DEFAULT_ROLE,
  getRoleIdentity,
  getRoles,
  isFirstRun,
  isRoleDisabledForCwd,
  loadRoleConfig,
  resolveRoleForCwd,
  ROLES_DIR,
  saveRoleConfig,
} from "./role-store.ts";
import { selectRoleUI, selectCreateRoleNameUI, activateRole } from "./role-ui.ts";

export function registerCommands(pi: ExtensionAPI, rc: RoleContext): void {

  // ── /memories ──
  pi.registerCommand("memories", {
    description: "View role memory in a scrollable overlay",
    handler: async (_args, ctx) => {
      if (!rc.currentRole || !rc.currentRolePath) { rc.notify(ctx, "当前目录未映射角色", "warning"); return; }

      const content = buildRoleMemoryViewerMarkdown(rc.currentRolePath, rc.currentRole);
      if (!ctx.hasUI) {
        pi.sendMessage({ customType: "role-memories", content, display: true }, { triggerTurn: false });
        return;
      }

      await ctx.ui.custom<void>(
        (tui, theme, _kb, done) => new RoleMemoryViewerComponent(rc.currentRolePath!, rc.currentRole!, tui, theme, done),
        { overlay: true, overlayOptions: { anchor: "center", width: "90%", minWidth: 60, maxHeight: "95%" } },
      );
    },
  });

  // ── /memory-tags ──
  pi.registerCommand("memory-tags", {
    description: "Browse memory by auto-extracted tags with forgetting curve visualization",
    args: {
      query: { type: "string", optional: true, description: "Filter tags by keyword" },
      export: { type: "boolean", optional: true, description: "Export tag cloud to HTML" },
    },
    handler: async (args, ctx) => {
      if (!rc.currentRole || !rc.currentRolePath) { rc.notify(ctx, "当前目录未映射角色", "warning"); return; }

      const memoryData = readRoleMemory(rc.currentRolePath, rc.currentRole);
      const tagRegistry = getAllTags(memoryData);

      if (args.export) {
        const os = await import("node:os");
        const fs = await import("node:fs");
        const path = await import("node:path");
        const tmpFile = path.join(os.tmpdir(), `${rc.currentRole}-tags.html`);
        fs.writeFileSync(tmpFile, buildTagCloudHTML(tagRegistry, memoryData.roleName));
        rc.notify(ctx, `Tag cloud exported: ${tmpFile}`, "success");
        return;
      }

      if (!ctx.hasUI) {
        const lines = [`# Tag Cloud for ${rc.currentRole}`, ""];
        const sortedTags = Object.entries(tagRegistry).sort((a, b) => b[1].weight - a[1].weight).slice(0, 50);
        for (const [tag, meta] of sortedTags) {
          const strength = meta.weight > 5 ? "🔥" : meta.weight > 2 ? "⭐" : "💤";
          lines.push(`- ${strength} **${tag}** (${meta.count} memories, weight: ${meta.weight.toFixed(2)})`);
        }
        pi.sendMessage({ customType: "role-tags", content: lines.join("\n"), display: true }, { triggerTurn: false });
        return;
      }

      const { SelectList, Text, Container } = await import("@mariozechner/pi-tui");

      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        const container = new Container();
        container.addChild(new Text(theme.fg("accent", theme.bold("Tag Cloud - " + rc.currentRole))));
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
              onSelect: (index: number) => {
                const tag = items[index].value;
                const meta = tagRegistry[tag];
                const preview = [
                  "Tag: " + tag, "Count: " + meta.count + " memories",
                  "Weight: " + meta.weight.toFixed(2),
                  "Last Used: " + new Date(meta.lastUsed).toLocaleDateString(),
                  "", "Related memories:",
                  ...meta.memories.slice(0, 5).map((m: any) => "  - " + m.text.slice(0, 80) + "..."),
                ].join("\n");
                rc.notify(ctx, preview, "info");
              },
            }
          );
          container.addChild(tagList);
        }

        return {
          render(width: number) { return container.render(width); },
          invalidate() { container.invalidate(); },
          handleInput(data: string) {
            const children = (container as any)["children"] || [];
            const list = children.find((c: any) => c instanceof SelectList);
            if (list) { list.handleInput(data); tui.requestRender(); }
          },
        };
      }, { overlay: true, overlayOptions: { anchor: "center", width: "80%", minWidth: 50, maxHeight: "80%" } });
    },
  });

  // ── /memory-log ──
  pi.registerCommand("memory-log", {
    description: "Show memory operations log for current session (not persisted)",
    handler: async (_args, _ctx) => {
      if (rc.memoryLog.length === 0) { rc.notify(_ctx, "本次会话暂无记忆操作", "info"); return; }

      const sourceIcon: Record<string, string> = { "compaction": "🗜", "auto-extract": "🤖", "tool": "🔧", "manual": "✏️" };
      const opIcon: Record<string, string> = { "learning": "📘", "preference": "⚙️", "event": "📅", "reinforce": "💪", "consolidate": "🧹" };

      const lines = rc.memoryLog.map((e, i) => {
        const src = sourceIcon[e.source] || "?";
        const op = opIcon[e.op] || "?";
        const status = e.stored ? "✓" : "✗";
        const detail = e.detail ? ` (${e.detail})` : "";
        return `${String(i + 1).padStart(3)}  ${e.time}  ${src} ${e.source.padEnd(12)} ${op} ${e.op.padEnd(11)} ${status}  ${e.content.slice(0, 80)}${e.content.length > 80 ? "…" : ""}${detail}`;
      });

      const stored = rc.memoryLog.filter(e => e.stored).length;
      const header = `Memory Log — ${rc.memoryLog.length} ops (${stored} stored, ${rc.memoryLog.length - stored} skipped)\n${"─".repeat(100)}`;
      pi.sendMessage({ content: `${header}\n${lines.join("\n")}`, display: true }, { triggerTurn: false });
    },
  });

  // ── /memory-fix ──
  pi.registerCommand("memory-fix", {
    description: "Repair current role MEMORY.md into canonical markdown structure",
    handler: async (_args, ctx) => {
      if (!rc.currentRole || !rc.currentRolePath) { rc.notify(ctx, "当前目录未映射角色", "warning"); return; }
      const result = repairRoleMemory(rc.currentRolePath, rc.currentRole, { force: true });
      rc.notify(ctx, result.repaired ? `MEMORY.md 已修复 (${result.issues} issues)` : "MEMORY.md 无需修复", result.repaired ? "success" : "info");
    },
  });

  // ── /memory-tidy ──
  pi.registerCommand("memory-tidy", {
    description: "Manual memory maintenance: repair + consolidate + summary",
    handler: async (_args, ctx) => {
      if (!rc.currentRole || !rc.currentRolePath) { rc.notify(ctx, "当前目录未映射角色", "warning"); return; }

      const repair = repairRoleMemory(rc.currentRolePath, rc.currentRole, { force: true });
      const consolidate = consolidateRoleMemory(rc.currentRolePath, rc.currentRole);
      const summary = listRoleMemory(rc.currentRolePath, rc.currentRole);

      const msg = [
        `Memory tidy done (${rc.currentRole})`,
        `- repair: ${repair.repaired ? "applied" : "clean"}${repair.repaired ? ` (${repair.issues} issues)` : ""}`,
        `- consolidate: learnings ${consolidate.beforeLearnings}->${consolidate.afterLearnings}, preferences ${consolidate.beforePreferences}->${consolidate.afterPreferences}`,
        `- total: ${summary.learnings} learnings, ${summary.preferences} preferences`,
      ].join("\n");

      rc.notify(ctx, "MEMORY.md 已手动整理", "success");
      pi.sendMessage({ customType: "memory-tidy", content: msg, display: true }, { triggerTurn: false });
    },
  });

  // ── /memory-tidy-llm ──
  pi.registerCommand("memory-tidy-llm", {
    description: "Manual LLM memory maintenance (optional model): /memory-tidy-llm [provider/model]",
    handler: async (args, ctx) => {
      if (!rc.currentRole || !rc.currentRolePath) { rc.notify(ctx, "当前目录未映射角色", "warning"); return; }

      const requestedModel = args?.trim() || undefined;
      rc.notify(ctx, `LLM memory tidy running${requestedModel ? ` (${requestedModel})` : ""}...`, "info");

      const llm = await runLlmMemoryTidy(rc.currentRolePath, rc.currentRole, ctx, requestedModel);
      if ("error" in llm) { rc.notify(ctx, `LLM tidy 失败: ${llm.error}`, "error"); return; }

      const summary = [
        `LLM tidy done (${rc.currentRole})`,
        `- model: ${llm.model}`,
        `- learnings: ${llm.apply.beforeLearnings} -> ${llm.apply.afterLearnings}`,
        `- preferences: ${llm.apply.beforePreferences} -> ${llm.apply.afterPreferences}`,
        `- added: ${llm.apply.addedLearnings}L ${llm.apply.addedPreferences}P`,
        `- rewritten: ${llm.apply.rewrittenLearnings}L ${llm.apply.rewrittenPreferences}P`,
      ].join("\n");

      rc.notify(ctx, "LLM 记忆整理完成", "success");
      pi.sendMessage({ customType: "memory-tidy-llm", content: summary, display: true }, { triggerTurn: false });
    },
  });

  // ── /role ──
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

          if (mappedRole && rc.currentRole) {
            const isFirst = isFirstRun(rc.currentRolePath!);
            const identity = getRoleIdentity(rc.currentRolePath!);
            info += `**角色名称**: ${rc.currentRole}\n`;
            info += `**显示名称**: ${identity?.name || "未设置"}\n`;
            info += `**状态**: ${isFirst ? "[FIRST RUN] 首次运行" : "[OK] 已配置"}\n`;
          }

          info += `\n### 可用命令\n\n`;
          info += `- \`/role create [name]\` - 创建新角色\n`;
          info += `- \`/role map [role]\` - 映射目录到角色\n`;
          info += `- \`/role unmap\` - 取消映射并禁用本目录角色\n`;
          info += `- \`/role list\` - 列出所有角色和映射\n`;
          info += `- \`/memories\` - 查看记忆\n`;
          info += `- \`/memory-fix\` - 修复 MEMORY.md\n`;
          info += `- \`/memory-tidy\` - 手动整理记忆\n`;
          info += `- \`/memory-tidy-llm [model]\` - LLM 整理记忆\n`;

          pi.sendMessage({ customType: "role-info", content: info, display: true }, { triggerTurn: false });
          break;
        }

        case "create": {
          let roleName = argv[1];
          if (!roleName) {
            if (!ctx.hasUI) { rc.notify(ctx, "Usage: /role create <name>", "warning"); return; }
            roleName = await selectCreateRoleNameUI(ctx) || "";
            if (!roleName) { rc.notify(ctx, "已取消创建角色", "info"); return; }
          }
          if (!roleName) { rc.notify(ctx, "未提供角色名", "warning"); return; }

          const rolePath = join(ROLES_DIR, roleName);
          if (existsSync(rolePath)) { rc.notify(ctx, `角色 "${roleName}" 已存在`, "warning"); return; }

          createRole(roleName);
          rc.notify(ctx, `[OK] 创建角色: ${roleName}`, "success");

          const shouldMap = ctx.hasUI
            ? await ctx.ui.confirm("映射", `将当前目录映射到 "${roleName}"?`)
            : true;
          if (shouldMap) {
            const cwdKey = rc.normalizePath(cwd);
            config.mappings[cwdKey] = roleName;
            config.disabledPaths = (config.disabledPaths || []).filter((path: string) => rc.normalizePath(path) !== cwdKey);
            saveRoleConfig(config);
            await activateRole(rc, roleName, rolePath, ctx);
            rc.notify(ctx, `已映射: ${cwdKey} → ${roleName}`, "success");
          }
          break;
        }

        case "map": {
          let roleName = argv[1];

          if (!roleName) {
            if (!ctx.hasUI) {
              rc.notify(ctx, `Usage: /role map <name>\nAvailable: ${getRoles().join(", ")}`, "warning");
              return;
            }
            const selected = await selectRoleUI(ctx);
            if (!selected) { rc.notify(ctx, "已取消映射", "info"); return; }

            if (selected === "__create__") {
              const created = await selectCreateRoleNameUI(ctx);
              if (!created) { rc.notify(ctx, "已取消创建角色", "info"); return; }
              const rp = join(ROLES_DIR, created);
              if (!existsSync(rp)) { createRole(created); rc.notify(ctx, `[OK] 创建角色: ${created}`, "success"); }
              roleName = created;
            } else {
              roleName = selected;
            }
          }

          if (!roleName) { rc.notify(ctx, "未选择角色", "warning"); return; }

          const rolePath = join(ROLES_DIR, roleName);
          if (!existsSync(rolePath)) { rc.notify(ctx, `角色 "${roleName}" 不存在`, "error"); return; }

          const cwdKey = rc.normalizePath(cwd);
          config.mappings[cwdKey] = roleName;
          config.disabledPaths = (config.disabledPaths || []).filter((path: string) => rc.normalizePath(path) !== cwdKey);
          saveRoleConfig(config);
          await activateRole(rc, roleName, rolePath, ctx);
          rc.notify(ctx, `已映射: ${cwdKey} → ${roleName}`, "success");
          break;
        }

        case "unmap": {
          const cwdKey = rc.normalizePath(cwd);
          let removedMapping = false;
          for (const [path] of Object.entries(config.mappings)) {
            if (rc.normalizePath(path) === cwdKey) { delete config.mappings[path]; removedMapping = true; }
          }

          const disabled = new Set((config.disabledPaths || []).map((path: string) => rc.normalizePath(path)));
          disabled.add(cwdKey);
          config.disabledPaths = Array.from(disabled);
          saveRoleConfig(config);

          rc.currentRole = null;
          rc.currentRolePath = null;
          if (ctx.hasUI) { ctx.ui.setStatus("role", "off"); ctx.ui.setStatus("memory-checkpoint", undefined); }

          rc.notify(ctx, removedMapping
            ? "已取消当前目录映射，并标记为不使用角色（默认角色也禁用）"
            : "当前目录已标记为不使用角色（默认角色禁用）", "info");
          break;
        }

        case "list": {
          const roles = getRoles();
          let info = `## 角色列表\n\n### 所有角色 (${roles.length})\n\n`;
          for (const role of roles) {
            const identity = getRoleIdentity(join(ROLES_DIR, role));
            info += `- **${role}** ${identity?.name || ""}\n`;
          }
          info += `\n### 默认角色\n\n- **${config.defaultRole || DEFAULT_ROLE}**\n`;
          info += `\n### 目录映射\n\n`;
          const mappings = Object.entries(config.mappings);
          if (mappings.length === 0) { info += "无映射\n"; }
          else { for (const [path, role] of mappings) { info += `- \`${rc.normalizePath(path)}\` → **${role}**\n`; } }
          info += `\n### 禁用角色目录\n\n`;
          const disabledPaths = (config.disabledPaths || []).map((path: string) => rc.normalizePath(path));
          if (disabledPaths.length === 0) { info += "无\n"; }
          else { for (const path of disabledPaths) { info += `- \`${path}\`\n`; } }
          pi.sendMessage({ customType: "role-list", content: info, display: true }, { triggerTurn: false });
          break;
        }

        default:
          rc.notify(ctx, `未知命令: ${cmd}。可用: info, create, map, unmap, list`, "error");
      }
    }
  });
}
