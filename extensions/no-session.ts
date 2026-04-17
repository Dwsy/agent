import { unlinkSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * no-session plugin: Control session persistence.
 * 
 * Commands:
 * - /no-session            - Pause writes and delete session file
 * - /no-session-undo      - Resume writes (continue from current memory state)
 * - /no-session-restore   - Recreate session file from memory entries
 */
export default function (pi: ExtensionAPI) {

  // /no-session: Pause writes and delete session file
  pi.registerCommand("no-session", {
    description: "Pause session writes and delete file",
    handler: async (_args, ctx) => {
      const sm = ctx.sessionManager as any;
      const file = sm.sessionFile;

      if (!file || !existsSync(file)) {
        ctx.ui.notify("No session file found", "info");
        sm.persist = false;
        return;
      }

      const confirmed = await ctx.ui.select(
        "Pause Session Writes?",
        ["Cancel", "Pause & Delete"],
      );

      if (confirmed !== 1) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      unlinkSync(file);
      ctx.ui.notify(`Deleted: ${file.split("/").pop()}`, "info");

      sm.persist = false;
      if (sm.persist !== false) {
        Object.defineProperty(sm, 'persist', { value: false, writable: true, configurable: true });
      }
    },
  });

  // /no-session-undo: Resume writes
  pi.registerCommand("no-session-undo", {
    description: "Resume session writes from memory",
    handler: async (_args, ctx) => {
      const sm = ctx.sessionManager as any;
      sm.persist = true;
      if (sm.persist !== true) {
        Object.defineProperty(sm, 'persist', { value: true, writable: true, configurable: true });
      }
      const file = sm.sessionFile;
      ctx.ui.notify(file ? `Resumed: ${file.split("/").pop()}` : "Resumed", "info");
    },
  });

  // /no-session-restore: Recreate session file from memory entries
  pi.registerCommand("no-session-restore", {
    description: "Restore session file from memory",
    handler: async (_args, ctx) => {
      const sm = ctx.sessionManager as any;
      const entries = sm.fileEntries;

      if (!entries || entries.length === 0) {
        ctx.ui.notify("No session data in memory", "error");
        return;
      }

      const confirmed = await ctx.ui.select(
        `Restore ${entries.length} entries?`,
        ["Cancel", "Restore"],
      );

      if (confirmed !== 1) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      const sessionDir = sm.getSessionDir?.() ?? join(process.cwd(), ".pi/sessions");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const sessionId = sm.getSessionId?.() ?? "unknown";
      const newFile = join(sessionDir, `${timestamp}_${sessionId}.jsonl`);

      try {
        const content = entries.map((e: any) => JSON.stringify(e)).join("\n") + "\n";
        writeFileSync(newFile, content);
        sm.persist = true;
        sm.sessionFile = newFile;
        sm.flushed = true;
        ctx.ui.notify(`Restored: ${newFile.split("/").pop()}`, "info");
      } catch (e) {
        ctx.ui.notify(`Failed: ${e}`, "error");
      }
    },
  });
}
