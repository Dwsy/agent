// ── Generative UI Extension ───────────────────────────────────────────────
// Composed from: storage.ts, html-helpers.ts, gallery.ts, tools.ts, commands.ts
// GAPP: gapp/ (storage, open, tools, commands, prompt)

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { shellHTML, escapeJS, openWindow, preloadGlimpseui } from "./html-helpers.js";
import { canvasShellHTML, transpileCanvas } from "./canvas.js";
import { getGlimpseuiSource } from "./resolve-glimpseui.js";
import { registerTools, type ToolContext } from "./tools.js";
import { registerWidgetsCommand } from "./commands.js";
import { registerGapp } from "./gapp/index.js";

export default async function (pi: ExtensionAPI) {
  // Headless generate subagents must not re-register this extension:
  // no windows, no gapp host, no streaming hooks inside worker processes.
  if (process.env.GAPP_SUBAGENT === "1") return;

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
    streaming: null,
    activeWindows: [],
    lastVisualPlan: null,
  };

  // ── Streaming: intercept show_widget / show_canvas calls mid-generation ──

  // Widgets morph raw HTML every frame; canvases only get a frame when the
  // partial TSX happens to compile, so their throttle is wider.
  const STREAM_THROTTLE_MS = { widget: 150, canvas: 300 } as const;
  let canvasCompileBusy = false;

  const pushStreamFrame = async () => {
    const streaming = toolCtx.streaming;
    if (!streaming?.window || !streaming.ready || !streaming.lastHTML) return;
    if (streaming.kind === "widget") {
      const escaped = escapeJS(streaming.lastHTML);
      streaming.window.send("window._setContent('" + escaped + "')");
      return;
    }
    if (canvasCompileBusy) return;
    canvasCompileBusy = true;
    try {
      const compiled = await transpileCanvas(streaming.lastHTML);
      // Recheck: the tool call may have finished while esbuild ran.
      if (toolCtx.streaming === streaming && streaming.window) {
        streaming.window.send(compiled);
      }
    } catch {
      // Partial TSX rarely compiles — keep the previous frame.
    } finally {
      canvasCompileBusy = false;
    }
  };

  pi.on("message_update", async (event) => {
    const raw: any = event.assistantMessageEvent;
    if (!raw) return;

    if (raw.type === "toolcall_start") {
      const partial: any = raw.partial;
      const block = partial?.content?.[raw.contentIndex];
      if (block?.type === "toolCall" && (block?.name === "show_widget" || block?.name === "show_canvas")) {
        toolCtx.streaming = {
          contentIndex: raw.contentIndex,
          kind: block.name === "show_canvas" ? "canvas" : "widget",
          window: null,
          lastHTML: "",
          updateTimer: null,
          ready: false,
        };
      }
      return;
    }

    if (raw.type === "toolcall_delta" && toolCtx.streaming && raw.contentIndex === toolCtx.streaming.contentIndex) {
      const streaming = toolCtx.streaming;
      const partial: any = raw.partial;
      const block = partial?.content?.[raw.contentIndex];
      const code = streaming.kind === "canvas" ? block?.arguments?.canvas_code : block?.arguments?.widget_code;
      if (!code || code.length < 20 || code === streaming.lastHTML) return;

      streaming.lastHTML = code;

      if (streaming.updateTimer) return;
      streaming.updateTimer = setTimeout(async () => {
        if (toolCtx.streaming !== streaming) return;
        streaming.updateTimer = null;

        try {
          if (!streaming.window) {
            const args = block?.arguments ?? {};
            const title = (args.title ?? (streaming.kind === "canvas" ? "Canvas" : "Widget")).replace(/_/g, " ");
            const width = args.width ?? (streaming.kind === "canvas" ? 900 : 800);
            const height = args.height ?? (streaming.kind === "canvas" ? 640 : 600);

            const shell = streaming.kind === "canvas" ? canvasShellHTML() : shellHTML();
            streaming.window = openWindow(shell, { width, height, title, noDock: true });
            toolCtx.activeWindows.push(streaming.window);

            streaming.window.on("ready", (_info: any) => {
              if (toolCtx.streaming !== streaming) return;
              streaming.ready = true;
              void pushStreamFrame();
            });
          } else {
            void pushStreamFrame();
          }
        } catch {}
      }, STREAM_THROTTLE_MS[streaming.kind]);
      return;
    }

    if (raw.type === "toolcall_end" && toolCtx.streaming && raw.contentIndex === toolCtx.streaming.contentIndex) {
      const streaming = toolCtx.streaming;
      if (streaming.updateTimer) {
        clearTimeout(streaming.updateTimer);
        streaming.updateTimer = null;
      }

      // Widgets can show the final HTML immediately; canvases are compiled
      // and activated by show_canvas.execute, which adopts this window.
      const toolCall = raw.toolCall;
      if (streaming.kind === "widget" && toolCall?.arguments?.widget_code && streaming.window && streaming.ready) {
        const escaped = escapeJS(toolCall.arguments.widget_code);
        streaming.window.send("window._setContent('" + escaped + "');");
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
