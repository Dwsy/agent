/**
 * Memory slash commands: /memory-distill(-stop), /memories, /memory-tags,
 * /memory-log, /memory-fix, /memory-tidy, /memory-tidy-llm, /memory-vector,
 * /memory-conflicts, /memory-export.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readMemoryLog } from "../logger.ts";
import { log } from "../logger.ts";
import { runLlmMemoryTidy } from "../memory-llm.ts";
import {
  consolidateRoleMemory,
  detectMemoryConflicts,
  getConflictReport,
  listRoleMemory,
  readRoleMemory,
  repairRoleMemory,
} from "../memory-md.ts";
import { buildTagCloudHTML, getAllTags } from "../memory-tags.ts";
import { getVectorStats, isVectorActive, rebuildVectorIndex } from "../memory-vector.ts";
import { openMemoryServer, RoleMemoryViewerComponent } from "../memory-viewer.ts";
import type { Runtime } from "./context.ts";
import { isTuiAvailable, notify } from "./ui.ts";

export function registerMemoryCommands(rt: Runtime): void {
  const { pi } = rt;

  pi.registerCommand("memory-distill", {
    description: "Enable interactive LLM-guided memory→knowledge distillation for the current role",
    handler: async (args, ctx) => {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        notify(rt, ctx, "当前目录未映射角色", "warning");
        return;
      }

      const requestedModel = (args || "").trim() || undefined;
      rt.state.memoryDistillMode = { active: true, requestedModel };

      const intro = [
        `# Memory Distill Mode — ${currentRole}`,
        "",
        "已进入基于 LLM 的交互式蒸馏模式。",
        "",
        "下一轮开始，模型会：",
        "- 读取当前角色的 memory / knowledge 状态",
        "- 必要时先向你提几个高价值问题",
        "- 再给出 memory→knowledge 晋升提案",
        "",
        "建议你下一条直接说：",
        "- ‘开始蒸馏’",
        "- 或补充你关心的范围，例如‘只看 zero 的 memory→knowledge 边界’",
        "",
        `模型提示偏好: ${requestedModel || "(当前会话模型)"}`,
        "",
        "退出方式：/memory-distill-stop",
      ].join("\n");

      pi.sendMessage({ customType: "memory-distill", content: intro, display: true }, { triggerTurn: false });
      notify(rt, ctx, `已启用 ${currentRole} 的交互式 memory-distill 模式`, "success");
    },
  });

  pi.registerCommand("memory-distill-stop", {
    description: "Disable interactive memory→knowledge distillation mode",
    handler: async (_args, ctx) => {
      rt.state.memoryDistillMode = null;
      notify(rt, ctx, "已关闭 memory-distill 模式", "success");
    },
  });

  pi.registerCommand("memories", {
    description: "View role memory (server by default, use /memories tui for terminal)",
    handler: async (args, ctx) => {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        notify(rt, ctx, "当前目录未映射角色", "warning");
        return;
      }

      const mode = (args || "").trim().toLowerCase();

      // /memories tui — terminal viewer
      if (mode === "tui" && isTuiAvailable(ctx)) {
        await ctx.ui.custom(
          (tui, theme, _kb, done) =>
            new RoleMemoryViewerComponent(currentRolePath, currentRole, tui, theme, () => done(undefined)),
          {
            overlay: true,
            overlayOptions: { anchor: "center", width: "90%", minWidth: 60, maxHeight: "95%" },
          },
        );
        return;
      }

      // Default: start HTTP server + open browser
      try {
        const handle = await openMemoryServer(currentRolePath, currentRole);
        notify(rt, ctx, `Memory server: ${handle.url} (port ${handle.port})`, "success");
      } catch (err) {
        notify(rt, ctx, `Server failed: ${err}`, "error");
      }
    },
  });

  pi.registerCommand("memory-tags", {
    description: "Browse memory by auto-extracted tags: /memory-tags [--export] [keyword]",
    handler: async (args, ctx) => {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        notify(rt, ctx, "当前目录未映射角色", "warning");
        return;
      }

      // pi command handlers receive raw arg strings; parse flags/query manually.
      const tokens = (args || "").trim().split(/\s+/).filter(Boolean);
      const exportHtml = tokens.includes("--export");
      const query = tokens.filter((t) => t !== "--export").join(" ");

      const memoryData = readRoleMemory(currentRolePath, currentRole);
      const tagRegistry = getAllTags(memoryData);

      if (exportHtml) {
        const html = buildTagCloudHTML(tagRegistry, memoryData.roleName);
        const os = await import("node:os");
        const fs = await import("node:fs");
        const path = await import("node:path");
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `${currentRole}-tags.html`);
        fs.writeFileSync(tmpFile, html);
        notify(rt, ctx, `Tag cloud exported: ${tmpFile}`, "success");
        return;
      }

      if (!isTuiAvailable(ctx)) {
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
      const { SelectList, Text, Container } = await import("@earendil-works/pi-tui");

      await ctx.ui.custom((tui, theme, _kb, done) => {
        const container = new Container();

        container.addChild(new Text(theme.fg("accent", theme.bold("Tag Cloud - " + currentRole))));
        container.addChild(new Text(""));

        const sortedTags = Object.entries(tagRegistry)
          .sort((a, b) => b[1].weight - a[1].weight)
          .filter(([tag]) => !query || tag.toLowerCase().includes(query.toLowerCase()));

        const items = sortedTags.map(([tag, meta]) => ({
          value: tag,
          label: tag.padEnd(20) + " " + meta.count + "x w:" + meta.weight.toFixed(1) + (meta.forgotten ? " [fading]" : ""),
        }));

        let tagList: InstanceType<typeof SelectList> | null = null;
        if (items.length === 0) {
          container.addChild(new Text("No tags found"));
        } else {
          tagList = new SelectList(items, Math.min(items.length, 15), {
            selectedPrefix: (text) => theme.fg("accent", text),
            selectedText: (text) => theme.fg("accent", theme.bold(text)),
            description: (text) => theme.fg("dim", text),
            scrollInfo: (text) => theme.fg("dim", text),
            noMatch: (text) => theme.fg("dim", text),
          });
          tagList.onSelect = (item) => {
            const tag = item.value;
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
            notify(rt, ctx, preview, "info");
          };
          tagList.onCancel = () => done(undefined);
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
            if (tagList) {
              tagList.handleInput(data);
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

  pi.registerCommand("memory-log", {
    description: "Show recent persisted and current-session memory operations",
    handler: async (_args, ctx) => {
      const persistedLog = readMemoryLog(rt.state.currentRole || undefined, 100);
      const logEntries = persistedLog.length > 0 ? persistedLog : rt.state.memoryLog;
      if (logEntries.length === 0) {
        notify(rt, ctx, "本次会话暂无记忆操作", "info");
        return;
      }

      const sourceIcon: Record<string, string> = {
        "compaction": "🗜",
        "auto-extract": "🤖",
        "tool": "🔧",
        "manual": "✏️",
      };
      const opIcon: Record<string, string> = {
        "learning": "📘",
        "preference": "⚙️",
        "event": "📅",
        "knowledge": "📚",
        "reinforce": "💪",
        "consolidate": "🧹",
        "update_learning": "✏️",
        "update_preference": "✏️",
        "delete_learning": "🗑",
        "delete_preference": "🗑",
      };

      const stored = logEntries.filter(e => e.stored).length;
      const skipped = logEntries.length - stored;

      // 按来源统计
      const sourceStats: Record<string, { total: number; stored: number }> = {};
      for (const e of logEntries) {
        if (!sourceStats[e.source]) sourceStats[e.source] = { total: 0, stored: 0 };
        sourceStats[e.source].total++;
        if (e.stored) sourceStats[e.source].stored++;
      }

      // 按操作类型统计
      const opStats: Record<string, { total: number; stored: number }> = {};
      for (const e of logEntries) {
        if (!opStats[e.op]) opStats[e.op] = { total: 0, stored: 0 };
        opStats[e.op].total++;
        if (e.stored) opStats[e.op].stored++;
      }

      // 构建输出
      const output: string[] = [];

      // 标题
      output.push(`## 🧠 Memory Log — ${logEntries.length} 操作`);
      output.push(``);

      // 汇总卡片
      output.push(`| 指标 | 数值 |`);
      output.push(`|------|------|`);
      output.push(`| 总操作 | ${logEntries.length} |`);
      output.push(`| ✓ 已存储 | ${stored} |`);
      output.push(`| ✗ 跳过 | ${skipped} |`);
      output.push(`| 成功率 | ${logEntries.length > 0 ? Math.round(stored / logEntries.length * 100) : 0}% |`);
      output.push(``);

      // 来源分布
      output.push(`### 来源分布`);
      output.push(``);
      output.push(`| 来源 | 图标 | 操作 | 存储 |`);
      output.push(`|------|------|------|------|`);
      for (const [src, stats] of Object.entries(sourceStats)) {
        const icon = sourceIcon[src] || "?";
        output.push(`| ${src} | ${icon} | ${stats.total} | ${stats.stored} |`);
      }
      output.push(``);

      // 操作类型分布
      output.push(`### 操作类型分布`);
      output.push(``);
      output.push(`| 类型 | 图标 | 操作 | 存储 |`);
      output.push(`|------|------|------|------|`);
      for (const [op, stats] of Object.entries(opStats)) {
        const icon = opIcon[op] || "?";
        output.push(`| ${op} | ${icon} | ${stats.total} | ${stats.stored} |`);
      }
      output.push(``);

      // 已存储记忆详情
      const storedEntries = logEntries.filter(e => e.stored);
      if (storedEntries.length > 0) {
        output.push(`### ✓ 已存储记忆`);
        output.push(``);
        for (const e of storedEntries) {
          const op = opIcon[e.op] || "?";
          const tag = e.detail && !e.detail.startsWith("reason=") ? ` (${e.detail})` : "";
          const id = e.oldId ? ` [${e.oldId} → ${e.id || "?"}]` : e.id ? ` [${e.id}]` : "";
          const category = e.category ? ` [${e.category}]` : "";
          const content = e.previous ? `"${e.previous}" → "${e.content}"` : e.content;
          output.push(`- ${op} **${e.op}**${id}${category}${tag}: ${content}`);
        }
        output.push(``);
      }

      // 跳过记录
      const skippedEntries = logEntries.filter(e => !e.stored);
      if (skippedEntries.length > 0) {
        output.push(`### ✗ 跳过记录`);
        output.push(``);
        for (const e of skippedEntries) {
          const op = opIcon[e.op] || "?";
          const id = e.id ? ` [${e.id}]` : "";
          const reason = e.detail ? ` — ${e.detail}` : "";
          output.push(`- ${op} **${e.op}**${id}: ${e.content.slice(0, 80)}${e.content.length > 80 ? "…" : ""}${reason}`);
        }
        output.push(``);
      }

      // 时间线日志
      output.push(`### 📋 时间线`);
      output.push(``);
      output.push("```" );
      output.push(` #    时间      来源           操作          状态  内容`);
      output.push(` ${"─".repeat(95)}`);

      const lines = logEntries.map((e, i) => {
        const src = sourceIcon[e.source] || "?";
        const op = opIcon[e.op] || "?";
        const status = e.stored ? "✓" : "✗";
        const contentLen = 100;
        return `${String(i + 1).padStart(3)}  ${e.time}  ${src} ${e.source.padEnd(12)} ${op} ${e.op.padEnd(11)} ${status}  ${e.content.slice(0, contentLen)}${e.content.length > contentLen ? "…" : ""}`;
      });

      output.push(...lines);
      output.push("```" );

      pi.sendMessage({ customType: "memory-log", content: output.join("\n"), display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("memory-fix", {
    description: "Repair current role memory/consolidated.md into canonical markdown structure",
    handler: async (_args, ctx) => {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        notify(rt, ctx, "当前目录未映射角色", "warning");
        return;
      }
      const result = repairRoleMemory(currentRolePath, currentRole);
      if (result.repaired) {
        notify(rt, ctx, `memory/consolidated.md 已修复 (${result.issues} issues)`, "success");
      } else {
        notify(rt, ctx, "memory/consolidated.md 无需修复", "info");
      }
    },
  });

  pi.registerCommand("memory-tidy", {
    description: "Manual memory maintenance: repair + consolidate + summary",
    handler: async (_args, ctx) => {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        notify(rt, ctx, "当前目录未映射角色", "warning");
        return;
      }

      const repair = repairRoleMemory(currentRolePath, currentRole);
      const consolidate = consolidateRoleMemory(currentRolePath, currentRole);
      const summary = listRoleMemory(currentRolePath, currentRole);

      const msg = [
        `Memory tidy done (${currentRole})`,
        `- repair: ${repair.repaired ? "applied" : "clean"}${repair.repaired ? ` (${repair.issues} issues)` : ""}`,
        `- consolidate: learnings ${consolidate.beforeLearnings}->${consolidate.afterLearnings}, preferences ${consolidate.beforePreferences}->${consolidate.afterPreferences}`,
        `- total: ${summary.learnings} learnings, ${summary.preferences} preferences`,
      ].join("\n");

      notify(rt, ctx, "memory/consolidated.md 已手动整理", "success");
      pi.sendMessage({ customType: "memory-tidy", content: msg, display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("memory-tidy-llm", {
    description: "Manual LLM memory maintenance (optional model): /memory-tidy-llm [provider/model]",
    handler: async (args, ctx) => {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        notify(rt, ctx, "当前目录未映射角色", "warning");
        return;
      }

      const requestedModel = args?.trim() || undefined;
      notify(rt, ctx, `LLM memory tidy running${requestedModel ? ` (${requestedModel})` : ""}...`, "info");

      const llm = await runLlmMemoryTidy(currentRolePath, currentRole, ctx, requestedModel);
      if ("error" in llm) {
        notify(rt, ctx, `LLM tidy 失败: ${llm.error}`, "error");
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

      notify(rt, ctx, "LLM 记忆整理完成", "success");
      pi.sendMessage({ customType: "memory-tidy-llm", content: summary, display: true }, { triggerTurn: false });
    },
  });

  pi.registerCommand("memory-vector", {
    description: "Vector memory management: /memory-vector rebuild | /memory-vector stats",
    handler: async (args, ctx) => {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        notify(rt, ctx, "当前目录未映射角色", "warning");
        return;
      }

      const subcommand = (args || "").trim().toLowerCase();

      if (subcommand === "rebuild") {
        if (!isVectorActive()) {
          notify(rt, ctx, "向量记忆未激活。请在 pi-role-persona.jsonc 中启用 vectorMemory.enabled 并确保 OpenAI API key 可用。", "warning");
          return;
        }
        notify(rt, ctx, "正在重建向量索引...", "info");
        const result = await rebuildVectorIndex(currentRolePath, currentRole, (indexed, total) => {
          if (indexed % 10 === 0) {
            log("vector-rebuild", `progress: ${indexed}/${total}`);
          }
        });
        const msg = `向量索引重建完成: ${result.indexed}/${result.total} 条已索引${result.errors > 0 ? `，${result.errors} 个错误` : ""}`;
        notify(rt, ctx, msg, result.errors > 0 ? "warning" : "success");
        return;
      }

      if (subcommand === "stats" || !subcommand) {
        const stats = await getVectorStats();
        if (!stats) {
          notify(rt, ctx, "向量记忆未初始化", "warning");
          return;
        }
        const lines = [
          `向量记忆状态 (${currentRole})`,
          `- 启用: ${stats.enabled}`,
          `- 激活: ${stats.active}`,
          `- 模型: ${stats.model || "n/a"}`,
          `- 维度: ${stats.dim || "n/a"}`,
          `- 已索引: ${stats.count} 条`,
          `- 路径: ${stats.dbPath || "n/a"}`,
        ];
        pi.sendMessage({ customType: "memory-vector-stats", content: lines.join("\n"), display: true }, { triggerTurn: false });
        return;
      }

      notify(rt, ctx, "用法: /memory-vector rebuild | /memory-vector stats", "info");
    },
  });

  pi.registerCommand("memory-conflicts", {
    description: "检测记忆冲突：/memory-conflicts",
    handler: async (_args, ctx) => {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        notify(rt, ctx, "当前目录未映射角色", "warning");
        return;
      }

      const conflicts = detectMemoryConflicts(currentRolePath);
      const report = getConflictReport(currentRolePath);

      if (conflicts.length === 0) {
        notify(rt, ctx, "✅ 未检测到记忆冲突", "success");
      } else {
        pi.sendMessage({
          customType: "memory-conflicts",
          content: report,
          display: true
        }, { triggerTurn: false });
      }
    },
  });

  pi.registerCommand("memory-export", {
    description: "导出记忆为 HTML 可视化: /memory-export [path]",
    handler: async (args, ctx) => {
      const { currentRole, currentRolePath } = rt.state;
      if (!currentRole || !currentRolePath) {
        notify(rt, ctx, "当前目录未映射角色", "warning");
        return;
      }

      const exportPath = (args || "").trim() || join(currentRolePath, "memory-export.html");
      const { exportMemoryToHtml } = await import("../memory-md.ts");

      notify(rt, ctx, "正在生成 HTML 导出...", "info");

      try {
        const html = exportMemoryToHtml(currentRolePath, currentRole);
        writeFileSync(exportPath, html, "utf-8");
        notify(rt, ctx, `✅ 记忆已导出到: ${exportPath}`, "success");
      } catch (err) {
        notify(rt, ctx, `❌ 导出失败: ${err}`, "error");
      }
    },
  });
}
