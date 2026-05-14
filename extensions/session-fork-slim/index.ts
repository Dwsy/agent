import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { resolve, dirname, basename } from "node:path";
import { writeFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

interface SlimOptions {
  removeThinking: boolean;
  removeReadResults: boolean;
  removeToolCalls: boolean;
  removeToolResults: boolean;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("export-slim", {
    description: "Export session to slimmed JSONL - removes thinking & tool noise",
    handler: async (_args, ctx: ExtensionContext) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("This command requires interactive TUI mode", "error");
        return;
      }

      const entries = ctx.sessionManager.getEntries();
      const sessionPath = ctx.sessionManager.getSessionFile();
      const sessionId = ctx.sessionManager.getSessionId();
      const cwd = ctx.cwd;

      if (entries.length === 0) {
        ctx.ui.notify("No entries to export", "warning");
        return;
      }

      // Count entry types for display
      const typeCounts = new Map<string, number>();
      for (const entry of entries) {
        typeCounts.set(entry.type, (typeCounts.get(entry.type) || 0) + 1);
      }

      // Build summary string
      const summaryLines = [
        `Session: ${sessionId.slice(0, 16)}...`,
        `Total entries: ${entries.length}`,
        "",
        ...Array.from(typeCounts.entries()).map(([type, count]) => `  ${type}: ${count}`),
      ];

      // Step 1: Confirm export
      const proceed = await ctx.ui.confirm(
        "📄 Session Export Slim",
        summaryLines.join("\n") + "\n\nContinue to filter selection?"
      );

      if (!proceed) {
        ctx.ui.notify("Export cancelled", "info");
        return;
      }

      // Step 2: Select filter (simplified - choose preset)
      const preset = await ctx.ui.select("🗑️ Select filter preset:", [
        "default: remove thinking + read results + tool calls",
        "aggressive: remove all tool execution noise",
        "minimal: only remove thinking",
        "custom: choose individually...",
      ]);

      if (!preset) {
        ctx.ui.notify("Export cancelled", "info");
        return;
      }

      let options: SlimOptions;
      
      if (preset.startsWith("default")) {
        options = { removeThinking: true, removeReadResults: true, removeToolCalls: true, removeToolResults: false };
      } else if (preset.startsWith("aggressive")) {
        options = { removeThinking: true, removeReadResults: true, removeToolCalls: true, removeToolResults: true };
      } else if (preset.startsWith("minimal")) {
        options = { removeThinking: true, removeReadResults: false, removeToolCalls: false, removeToolResults: false };
      } else {
        // Custom - ask individually
        options = {
          removeThinking: await ctx.ui.confirm("Remove thinking & model changes?", "") ?? false,
          removeReadResults: await ctx.ui.confirm("Remove read tool results?", "") ?? false,
          removeToolCalls: await ctx.ui.confirm("Remove tool calls?", "") ?? false,
          removeToolResults: await ctx.ui.confirm("Remove other tool results?", "") ?? false,
        };
      }

      // Calculate preview stats
      let willRemove = 0;
      let willKeep = 0;

      for (const entry of entries) {
        let shouldRemove = false;

        if (options.removeThinking && (entry.type === "thinking_level_change" || entry.type === "model_change")) {
          shouldRemove = true;
        }
        if (options.removeToolCalls && entry.type === "tool_call") {
          shouldRemove = true;
        }
        if (entry.type === "tool_result") {
          const toolResult = entry as SessionEntry & { toolName?: string };
          if (options.removeReadResults && toolResult.toolName === "read") {
            shouldRemove = true;
          } else if (options.removeToolResults && toolResult.toolName !== "read") {
            shouldRemove = true;
          }
        }

        if (shouldRemove) {
          willRemove++;
        } else {
          willKeep++;
        }
      }

      // Step 3: Confirm preview
      const confirmed = await ctx.ui.confirm(
        "📊 Export Preview",
        `Original: ${entries.length} entries\nWill remove: ${willRemove}\nWill keep: ${willKeep}\n\nProceed with export?`
      );

      if (!confirmed) {
        ctx.ui.notify("Export cancelled", "info");
        return;
      }

      // Execute slimming
      const stats = {
        total: 0,
        thinking: 0,
        readResults: 0,
        toolCalls: 0,
        toolResults: 0,
      };

      const keptEntries: SessionEntry[] = [];
      let lastKeptId: string | null = null;

      for (const entry of entries) {
        let shouldRemove = false;

        if (options.removeThinking && (entry.type === "thinking_level_change" || entry.type === "model_change")) {
          stats.thinking++;
          shouldRemove = true;
        }
        if (options.removeToolCalls && entry.type === "tool_call") {
          stats.toolCalls++;
          shouldRemove = true;
        }
        if (entry.type === "tool_result") {
          const toolResult = entry as SessionEntry & { toolName?: string };
          if (options.removeReadResults && toolResult.toolName === "read") {
            stats.readResults++;
            shouldRemove = true;
          } else if (options.removeToolResults && toolResult.toolName !== "read") {
            stats.toolResults++;
            shouldRemove = true;
          }
        }

        if (shouldRemove) {
          stats.total++;
          continue;
        }

        // Clean and keep message entries
        if (entry.type === "message") {
          const msgEntry = entry as SessionEntry & {
            message?: {
              role: string;
              content: Array<{
                type: string;
                text?: string;
                thinking?: string;
                thinkingSignature?: string;
                toolCall?: unknown;
              }> | string;
              provider?: string;
              model?: string;
              timestamp?: number;
            };
          };

          if (msgEntry.message) {
            let cleanContent = msgEntry.message.content;
            if (Array.isArray(cleanContent)) {
              cleanContent = cleanContent
                .filter(block => block.type !== "thinking" && block.type !== "toolCall" && block.type !== "tool_result")
                .map(block => {
                  if (block.type === "text") {
                    const { thinking, thinkingSignature, toolCall, ...rest } = block;
                    return rest;
                  }
                  return block;
                });
            }

            const cleanMsg = {
              role: msgEntry.message.role,
              content: cleanContent,
              ...(msgEntry.message.provider && { provider: msgEntry.message.provider }),
              ...(msgEntry.message.model && { model: msgEntry.message.model }),
              ...(msgEntry.message.timestamp && { timestamp: msgEntry.message.timestamp }),
            };

            const slimmed: SessionEntry = {
              type: "message",
              id: entry.id,
              parentId: lastKeptId,
              timestamp: entry.timestamp,
              message: cleanMsg as any,
            };
            keptEntries.push(slimmed);
            lastKeptId = entry.id;
          }
          continue;
        }

        // Keep other entries, update parent chain
        const slimmed: SessionEntry = { ...entry, parentId: lastKeptId };
        keptEntries.push(slimmed);
        lastKeptId = entry.id;
      }

      // Get original header info
      let originalCwd = cwd;
      let originalParentSession: string | undefined;
      
      if (sessionPath) {
        try {
          const firstLine = readFileSync(sessionPath, "utf8").split("\n")[0];
          if (firstLine) {
            const parsed = JSON.parse(firstLine);
            if (parsed.type === "session") {
              originalCwd = parsed.cwd || cwd;
              originalParentSession = parsed.parentSession;
            }
          }
        } catch { /* ignore */ }
      }

      // Create new session header
      const newSessionId = randomUUID();
      const timestamp = new Date().toISOString();
      const newHeader = {
        type: "session" as const,
        version: 3 as const,
        id: newSessionId,
        timestamp,
        cwd: originalCwd,
        ...(originalParentSession && { parentSession: originalParentSession }),
      };

      // Add summary entry
      const summaryEntry: SessionEntry = {
        type: "custom",
        id: randomUUID().slice(0, 8),
        parentId: lastKeptId,
        timestamp: new Date().toISOString(),
        customType: "slim_summary",
        data: {
          originalSession: sessionPath,
          originalId: sessionId,
          totalEntries: entries.length,
          keptEntries: keptEntries.length,
          removed: stats,
          options,
          note: "Session slimmed via /export-slim",
        },
      };
      keptEntries.push(summaryEntry);

      // Generate output path
      const sessionDir = sessionPath ? dirname(sessionPath) : resolve(cwd, ".pi", "sessions");
      const outputName = sessionPath
        ? `${basename(sessionPath, ".jsonl").slice(0, 40)}-slim-${timestamp.replace(/[:.]/g, "-")}.jsonl`
        : `slim-${timestamp.replace(/[:.]/g, "-")}.jsonl`;
      const outputPath = resolve(sessionDir, outputName);

      // Write file
      const lines = [JSON.stringify(newHeader), ...keptEntries.map(e => JSON.stringify(e))];
      writeFileSync(outputPath, lines.join("\n") + "\n", "utf8");

      // Success notification
      const resumeCmd = `pi --session ${outputPath}`;
      ctx.ui.notify(`Slimmed: ${stats.total} removed, ${keptEntries.length} kept`, "success");

      // Show result in editor for easy copy
      const resultText = [
        "✅ Export Complete!",
        "",
        `Removed: ${stats.total} entries`,
        stats.thinking ? `  🧠 thinking/model: ${stats.thinking}` : "",
        stats.readResults ? `  📖 read results: ${stats.readResults}` : "",
        stats.toolCalls ? `  🔧 tool calls: ${stats.toolCalls}` : "",
        stats.toolResults ? `  📋 tool results: ${stats.toolResults}` : "",
        "",
        `Preserved: ${keptEntries.length - 1} entries + summary`,
        "",
        "📋 Resume command:",
        resumeCmd,
      ].filter(Boolean).join("\n");

      // Open editor with resume command for easy copy
      const _editResult = await ctx.ui.editor("Resume Command", resumeCmd);
    },
  });
}
