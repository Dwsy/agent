// ── /widgets Command ──────────────────────────────────────────────────────

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { join } from "node:path";
import { type WidgetRecord, WIDGETS_DIR, loadActiveWidgetIndex, loadWidgetIndex, loadWidgetHtml } from "./storage.js";
import { openWindow, openInBrowser } from "./html-helpers.js";
import { launchGallery, stopGallery } from "./gallery.js";

const selectListTheme = (theme: any) => ({
  selectedPrefix: (t: string) => theme.fg("accent", t),
  selectedText: (t: string) => theme.fg("accent", theme.bold(t)),
  description: (t: string) => theme.fg("muted", t),
  scrollInfo: (t: string) => theme.fg("dim", t),
  noMatch: (t: string) => theme.fg("warning", t),
});

export function registerWidgetsCommand(pi: ExtensionAPI, activeWindows: any[]) {
  pi.registerCommand("widgets", {
    description: "Search and browse generated widgets",
    getArgumentCompletions: (prefix: string) => {
      return [
        { value: "list", label: "List recent widgets" },
        { value: "server", label: "Start gallery web server" },
        { value: "stop", label: "Stop gallery web server" },
      ].filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args: string, ctx) => {
      const cmd = (args ?? "").trim();

      // ── list ───────────────────────────────────────────────────────────
      if (cmd === "list") {
        const index = await loadActiveWidgetIndex();
        if (index.length === 0) { ctx.ui.notify("No saved widgets found.", "info"); return; }
        const cwd = process.cwd();
        const lines = index.slice(0, 30).map((w, i) => {
          const scope = w.cwd === cwd ? "\u2022" : " ";
          return scope + " " + (i + 1) + ". " + w.title + "  " + w.timestamp + "  " + w.width + "\u00d7" + w.height;
        });
        ctx.ui.notify("Found " + index.length + " widgets:\n" + lines.join("\n"), "info");
        return;
      }

      // ── server ─────────────────────────────────────────────────────────
      if (cmd === "server") {
        const widgets = await loadWidgetIndex();
        if (widgets.length === 0) { ctx.ui.notify("No saved widgets found.", "info"); return; }
        const url = await launchGallery(widgets);
        ctx.ui.notify("Widget Gallery at " + url);
        return;
      }

      if (cmd === "stop") {
        const stopped = await stopGallery();
        ctx.ui.notify(stopped ? "Gallery server stopped." : "No gallery server running.", stopped ? "success" : "info");
        return;
      }

      // ── interactive TUI ────────────────────────────────────────────────
      if (!ctx.hasUI) {
        ctx.ui.notify("TUI required. Use: /widgets list | /widgets server | /widgets stop", "warning");
        return;
      }

      const allWidgets = await loadWidgetIndex();
      const visibleWidgets = allWidgets.filter((w) => !w.archivedAt);
      if (visibleWidgets.length === 0) { ctx.ui.notify("No active widgets found. Use /widgets server to manage archived widgets.", "info"); return; }

      const currentCwd = process.cwd();
      let scope: "project" | "global" = visibleWidgets.some((w) => w.cwd === currentCwd) ? "project" : "global";

      function getFiltered(): WidgetRecord[] {
        return scope === "project"
          ? visibleWidgets.filter((w) => w.cwd === currentCwd)
          : visibleWidgets;
      }

      // Step 1: Select widget (pi-fzf pattern: string[] render, no Container)
      const selectedFile = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        let selectedIndex = 0;
        let cachedLines: string[] | undefined;
        const refresh = () => { cachedLines = undefined; tui.requestRender(); };

        function clamp() {
          const len = getFiltered().length;
          if (len === 0) selectedIndex = 0;
          else selectedIndex = Math.max(0, Math.min(selectedIndex, len - 1));
        }

        return {
          render(width: number) {
            if (cachedLines) return cachedLines;
            clamp();
            const lines: string[] = [];
            const add = (text: string) => lines.push(truncateToWidth(text, width));

            // Header with scope indicator
            const scopeLabel = scope === "project"
              ? theme.fg("success", " \u25cf project ") + theme.fg("dim", " | \u25cb global ")
              : theme.fg("dim", " \u25cb project | ") + theme.fg("accent", " \u25cf global ");
            add(scopeLabel + theme.fg("muted", "  " + getFiltered().length + "/" + visibleWidgets.length));
            add(theme.fg("border", "\u2500".repeat(width)));
            add("");

            const filtered = getFiltered();
            if (filtered.length === 0) {
              add(theme.fg("dim", "  No matching widgets"));
            } else {
              const maxVis = Math.min(filtered.length, 15);
              const scrollOffset = Math.max(0, selectedIndex - maxVis + 2);
              for (let i = scrollOffset; i < Math.min(scrollOffset + maxVis, filtered.length); i++) {
                const w = filtered[i];
                const sel = i === selectedIndex;
                const prefix = sel ? theme.fg("accent", " \u276f ") : "   ";
                const title = sel ? theme.fg("accent", w.title) : theme.fg("text", w.title);
                const meta = theme.fg("dim", "  " + w.width + "\u00d7" + w.height + "  " + w.timestamp);
                add(prefix + title + meta);
              }
            }

            add("");
            add(theme.fg("dim", "  Tab:scope  \u2191\u2193:nav  Enter:open  Shift+Enter:browser  Esc:cancel"));
            cachedLines = lines;
            return lines;
          },
          invalidate() { cachedLines = undefined; },
          handleInput(data: string) {
            const filtered = getFiltered();

            if (matchesKey(data, Key.tab)) {
              scope = scope === "project" ? "global" : "project";
              selectedIndex = 0;
              refresh();
              return;
            }
            if (matchesKey(data, Key.up)) {
              if (selectedIndex > 0) selectedIndex--;
              refresh();
              return;
            }
            if (matchesKey(data, Key.down)) {
              if (selectedIndex < filtered.length - 1) selectedIndex++;
              refresh();
              return;
            }
            if (matchesKey(data, Key.shift("enter"))) {
              const w = filtered[selectedIndex];
              if (w) done("__browser__:" + w.file);
              return;
            }
            if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
              const w = filtered[selectedIndex];
              if (w) done(w.file);
              return;
            }
            if (matchesKey(data, Key.escape)) {
              done(null);
              return;
            }
          },
        };
      });

      if (!selectedFile) return;

      // Handle Shift+Enter browser action
      if (selectedFile.startsWith("__browser__:")) {
        openInBrowser(join(WIDGETS_DIR, selectedFile.slice("__browser__:".length)));
        return;
      }

      const widget = visibleWidgets.find((w) => w.file === selectedFile);
      if (!widget) return;

      // Step 2: Select action
      const action = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        let selectedIndex = 0;
        let cachedLines: string[] | undefined;
        const refresh = () => { cachedLines = undefined; tui.requestRender(); };

        const actions = [
          { value: "window", label: "\u2197 Open in native window" },
          { value: "browser", label: "\ud83c\udf10 Open in browser" },
          { value: "copy", label: "\ud83d\udccb Copy HTML to clipboard" },
        ];

        return {
          render(width: number) {
            if (cachedLines) return cachedLines;
            const lines: string[] = [];
            const add = (text: string) => lines.push(truncateToWidth(text, width));

            add(theme.fg("accent", theme.bold("  " + widget.title)));
            add(theme.fg("dim", "  " + widget.width + "\u00d7" + widget.height + "  " + widget.timestamp));
            add(theme.fg("border", "\u2500".repeat(width)));
            add("");

            for (let i = 0; i < actions.length; i++) {
              const sel = i === selectedIndex;
              const prefix = sel ? theme.fg("accent", " \u276f ") : "   ";
              const label = sel ? theme.fg("accent", actions[i].label) : theme.fg("text", actions[i].label);
              add(prefix + label);
            }
            cachedLines = lines;
            return lines;
          },
          invalidate() { cachedLines = undefined; },
          handleInput(data: string) {
            if (matchesKey(data, Key.up)) {
              if (selectedIndex > 0) selectedIndex--;
              refresh();
              return;
            }
            if (matchesKey(data, Key.down)) {
              if (selectedIndex < actions.length - 1) selectedIndex++;
              refresh();
              return;
            }
            if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
              done(actions[selectedIndex].value);
              return;
            }
            if (matchesKey(data, Key.escape)) {
              done(null);
              return;
            }
          },
        };
      });

      if (!action) return;

      // Execute action
      const html = await loadWidgetHtml(widget.file);
      if (!html) { ctx.ui.notify("Widget file not found", "error"); return; }

      if (action === "window") {
        const win = openWindow(html, {
          width: widget.width, height: widget.height, title: widget.title, noDock: true,
        });
        activeWindows.push(win);
        win.on("closed", () => { activeWindows = activeWindows.filter((w) => w !== win); });
      } else if (action === "browser") {
        openInBrowser(join(WIDGETS_DIR, widget.file));
      } else if (action === "copy") {
        const { execSync } = await import("node:child_process");
        try { execSync("pbcopy", { input: html }); ctx.ui.notify("HTML copied to clipboard", "success"); }
        catch { ctx.ui.notify("Failed to copy", "error"); }
      }
    },
  });
}
