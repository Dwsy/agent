// ── Generative UI Extension ───────────────────────────────────────────────
// Composed from: storage.ts, html-helpers.ts, gallery.ts, tools.ts, commands.ts
// GAPP: gapp/ (storage, open, tools, commands, prompt)

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { shellHTML, escapeJS, detectDarkMode, openWindow, preloadGlimpseui } from "./html-helpers.js";
import { getGlimpseuiSource } from "./resolve-glimpseui.js";
import { registerTools, type ToolContext } from "./tools.js";
import { registerWidgetsCommand } from "./commands.js";
import { registerGapp } from "./gapp/index.js";

export default async function (pi: ExtensionAPI) {
  // Prefer local/global glimpseui (Dock + control socket fork) over nested registry copy.
  try {
    await preloadGlimpseui();
    const src = getGlimpseuiSource();
    if (src) {
      // Quiet by default; set GLIMPSEUI_DEBUG=1 to surface path
      if (process.env.GLIMPSEUI_DEBUG === "1") {
        console.error(`[generative-ui] using glimpseui: ${src}`);
      }
    }
  } catch (err) {
    console.error(
      `[generative-ui] failed to load glimpseui (${err instanceof Error ? err.message : err}). ` +
        `Install with: npm i -g ~/Dev/AI/glimpse   or set GLIMPSEUI_PATH`,
    );
    throw err;
  }

  // ── Shared state ──────────────────────────────────────────────────────

  const toolCtx: ToolContext = {
    hasSeenReadMe: false,
    streaming: null,
    activeWindows: [],
  };

  // ── Streaming: intercept show_widget tool calls mid-generation ─────────

  pi.on("message_update", async (event) => {
    const raw: any = event.assistantMessageEvent;
    if (!raw) return;

    if (raw.type === "toolcall_start") {
      const partial: any = raw.partial;
      const block = partial?.content?.[raw.contentIndex];
      if (block?.type === "toolCall" && block?.name === "show_widget") {
        toolCtx.streaming = {
          contentIndex: raw.contentIndex,
          window: null,
          lastHTML: "",
          updateTimer: null,
          ready: false,
        };
      }
      return;
    }

    if (raw.type === "toolcall_delta" && toolCtx.streaming && raw.contentIndex === toolCtx.streaming.contentIndex) {
      const partial: any = raw.partial;
      const block = partial?.content?.[raw.contentIndex];
      const html = block?.arguments?.widget_code;
      if (!html || html.length < 20 || html === toolCtx.streaming.lastHTML) return;

      toolCtx.streaming.lastHTML = html;

      if (toolCtx.streaming.updateTimer) return;
      toolCtx.streaming.updateTimer = setTimeout(async () => {
        if (!toolCtx.streaming) return;
        toolCtx.streaming.updateTimer = null;

        try {
          if (!toolCtx.streaming.window) {
            const args = block?.arguments ?? {};
            const title = (args.title ?? "Widget").replace(/_/g, " ");
            const width = args.width ?? 800;
            const height = args.height ?? 600;

            const dark = detectDarkMode();
            toolCtx.streaming.window = openWindow(shellHTML(dark), {
              width, height, title, noDock: true,
            });
            toolCtx.activeWindows.push(toolCtx.streaming.window);

            toolCtx.streaming.window.on("ready", (_info: any) => {
              if (!toolCtx.streaming) return;
              toolCtx.streaming.ready = true;
              const escaped = escapeJS(toolCtx.streaming.lastHTML);
              toolCtx.streaming.window.send("window._setContent('" + escaped + "')");
            });
          } else if (toolCtx.streaming.ready) {
            const escaped = escapeJS(toolCtx.streaming.lastHTML);
            toolCtx.streaming.window.send("window._setContent('" + escaped + "')");
          }
        } catch {}
      }, 150);
      return;
    }

    if (raw.type === "toolcall_end" && toolCtx.streaming && raw.contentIndex === toolCtx.streaming.contentIndex) {
      if (toolCtx.streaming.updateTimer) {
        clearTimeout(toolCtx.streaming.updateTimer);
        toolCtx.streaming.updateTimer = null;
      }

      const toolCall = raw.toolCall;
      if (toolCall?.arguments?.widget_code && toolCtx.streaming.window && toolCtx.streaming.ready) {
        const escaped = escapeJS(toolCall.arguments.widget_code);
        toolCtx.streaming.window.send("window._setContent('" + escaped + "');");
      }
      return;
    }
  });

  // ── Register tools & commands ─────────────────────────────────────────

  registerTools(pi, toolCtx);
  registerWidgetsCommand(pi, toolCtx.activeWindows);
  registerGapp(pi, toolCtx);

  // ── Cleanup on shutdown ───────────────────────────────────────────────

  pi.on("session_shutdown", async () => {
    if (toolCtx.streaming?.updateTimer) clearTimeout(toolCtx.streaming.updateTimer);
    toolCtx.streaming = null;
    for (const win of toolCtx.activeWindows) {
      try { win.close(); } catch {}
    }
    toolCtx.activeWindows = [];
  });
}
