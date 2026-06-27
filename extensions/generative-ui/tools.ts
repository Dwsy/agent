// ── Tool Registrations ────────────────────────────────────────────────────

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { join } from "node:path";
import { getGuidelines, AVAILABLE_MODULES } from "./guidelines.js";
import { type WidgetRecord, WIDGETS_DIR, saveWidget, loadActiveWidgetIndex, loadWidgetIndex, loadWidgetHtml } from "./storage.js";
import { detectDarkMode, shellHTML, wrapHTML, escapeJS, timestamp, openWindow } from "./html-helpers.js";

export interface ToolContext {
  hasSeenReadMe: boolean;
  streaming: StreamingWidget | null;
  activeWindows: any[];
}

export interface StreamingWidget {
  contentIndex: number;
  window: any | null;
  lastHTML: string;
  updateTimer: any;
  ready: boolean;
}

export function registerTools(pi: ExtensionAPI, ctx: ToolContext) {
  // ── read_me tool ─────────────────────────────────────────────────────────

  pi.registerTool({
    name: "visualize_read_me",
    label: "Read Guidelines",
    description:
      "Returns design guidelines for show_widget (CSS patterns, colors, typography, layout rules, examples). " +
      "Call once before your first show_widget call. Do NOT mention this call to the user — it is an internal setup step.",
    promptSnippet: "Load design guidelines before creating widgets. Call silently before first show_widget use.",
    promptGuidelines: [
      "Call visualize_read_me once before your first show_widget call to load design guidelines.",
      "Do NOT mention the read_me call to the user — call it silently, then proceed directly to building the widget.",
      "Pick the modules that match your use case: interactive, chart, mockup, art, diagram.",
    ],
    parameters: Type.Object({
      modules: Type.Array(
        StringEnum(AVAILABLE_MODULES as readonly string[]),
        { description: "Which module(s) to load. Pick all that fit." }
      ),
    }),

    async execute(_toolCallId, params) {
      ctx.hasSeenReadMe = true;
      const content = getGuidelines(params.modules);
      return {
        content: [{ type: "text" as const, text: content }],
        details: { modules: params.modules },
      };
    },

    renderCall(args: any, theme: any) {
      const mods = (args.modules ?? []).join(", ");
      return new Text(
        theme.fg("toolTitle", theme.bold("read_me ")) + theme.fg("muted", mods),
        0, 0
      );
    },

    renderResult(_result: any, { isPartial }: any, theme: any) {
      if (isPartial) return new Text(theme.fg("warning", "Loading guidelines..."), 0, 0);
      return new Text(theme.fg("dim", "Guidelines loaded"), 0, 0);
    },
  });

  // ── show_widget tool ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "show_widget",
    label: "Show Widget",
    description:
      "Show visual content — SVG graphics, diagrams, charts, or interactive HTML widgets — in a native macOS window. " +
      "Use for flowcharts, dashboards, forms, calculators, data tables, games, illustrations, or any visual content. " +
      "The HTML is rendered in a native WKWebView with full CSS/JS support including Canvas and CDN libraries. " +
      "The page gets a window.glimpse.send(data) bridge to send JSON data back to the agent. " +
      "IMPORTANT: Call visualize_read_me once before your first show_widget call.",
    promptSnippet: "Render interactive HTML/SVG widgets in a native macOS window (WKWebView). Supports full CSS, JS, Canvas, Chart.js.",
    promptGuidelines: [
      "Use show_widget when the user asks for visual content: charts, diagrams, interactive explainers, UI mockups, art.",
      "Always call visualize_read_me first to load design guidelines, then set i_have_seen_read_me: true.",
      "The widget opens in a native macOS window — it has full browser capabilities (Canvas, JS, CDN libraries).",
      "Structure HTML as fragments: no DOCTYPE/<html>/<head>/<body>. Style first, then HTML, then scripts.",
      "The page has window.glimpse.send(data) to send data back. Use it for user choices and interactions.",
      "Keep widgets focused and appropriately sized. Default is 800x600 but adjust to fit content.",
      "For SVG: start code with <svg> tag, it will be auto-detected.",
      "Set interactive=true ONLY when the widget has buttons/forms/inputs that call glimpse.send() and the agent needs the returned data. Default (false) is display-only — agent continues immediately.",
      "Be concise in your responses",
    ],
    parameters: Type.Object({
      i_have_seen_read_me: Type.Boolean({
        description: "Confirm you have already called visualize_read_me in this conversation.",
      }),
      title: Type.String({
        description: "Short snake_case identifier for this widget (used as window title and saved filename).",
      }),
      widget_code: Type.String({
        description:
          "HTML or SVG code to render. For SVG: raw SVG starting with <svg>. " +
          "For HTML: raw content fragment, no DOCTYPE/<html>/<head>/<body>.",
      }),
      width: Type.Optional(Type.Number({ description: "Window width in pixels. Default: 800." })),
      height: Type.Optional(Type.Number({ description: "Window height in pixels. Default: 600." })),
      floating: Type.Optional(Type.Boolean({ description: "Keep window always on top. Default: false." })),
      interactive: Type.Optional(Type.Boolean({
        description:
          "Whether this widget needs user interaction (buttons, forms, inputs sending data back via glimpse.send). " +
          "false (default): display-only, agent continues immediately. " +
          "true: blocking, agent waits for user to interact and send data back.",
      })),
    }),

    async execute(_toolCallId, params) {
      if (!params.i_have_seen_read_me) {
        throw new Error("You must call visualize_read_me before show_widget. Set i_have_seen_read_me: true after doing so.");
      }

      const code = params.widget_code;
      const isSVG = code.trimStart().startsWith("<svg");
      const title = params.title.replace(/_/g, " ");
      const width = params.width ?? 800;
      const height = params.height ?? 600;
      const ts = timestamp();
      const safeTitle = params.title.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = ts + "_" + safeTitle + ".html";
      const fullPath = join(WIDGETS_DIR, filename);

      const dark = detectDarkMode();
      const fullHTML = wrapHTML(code, isSVG, dark);
      const cwd = process.cwd();
      const record: WidgetRecord = {
        id: ts + "_" + safeTitle,
        title,
        timestamp: ts,
        file: filename,
        width,
        height,
        isSVG,
        cwd,
      };
      saveWidget(record, fullHTML).catch(() => {});

      let win: any = null;

      if (ctx.streaming?.window) {
        win = ctx.streaming.window;
        if (ctx.streaming.ready) {
          const escaped = escapeJS(code);
          win.send("window._setContent('" + escaped + "'); window._runScripts();");
        }
        ctx.streaming = null;
      } else {
        const dark = detectDarkMode();
        win = openWindow(shellHTML(dark), {
          width,
          height,
          title,
          floating: params.floating ?? false,
          noDock: true,
        });
        ctx.activeWindows.push(win);

        win.on("ready", (_info: any) => {
          const escaped = escapeJS(code);
          win.send("window._setContent('" + escaped + "'); window._runScripts();");
        });
      }

      if (params.interactive) {
        return new Promise<any>((resolve) => {
          let messageData: any = null;
          let resolved = false;

          const finish = (reason: string) => {
            if (resolved) return;
            resolved = true;
            ctx.activeWindows = ctx.activeWindows.filter((w) => w !== win);
            if (messageData) {
              record.interactionData = messageData;
              saveWidget(record, fullHTML).catch(() => {});
            }
            resolve({
              content: [{
                type: "text" as const,
                text: messageData
                  ? "Widget \"" + title + "\" interaction data: " + JSON.stringify(messageData)
                  : "Widget \"" + title + "\" closed (" + reason + ").",
              }],
              details: { title: params.title, width, height, isSVG, savedFile: filename, fullPath, messageData, closedReason: reason },
            });
          };

          win.on("message", (data: any) => { messageData = data; finish("User sent data"); });
          win.on("closed", () => finish("Window closed"));
          win.on("error", (err: Error) => finish("Error: " + err.message));
          setTimeout(() => finish("Timeout"), 120_000);
        });
      }

      let interactionLogged = false;
      const logInteraction = (data: any) => {
        if (interactionLogged) return;
        interactionLogged = true;
        record.interactionData = data;
        saveWidget(record, fullHTML).catch(() => {});
        ctx.activeWindows = ctx.activeWindows.filter((w) => w !== win);
      };

      win.on("message", (data: any) => logInteraction(data));
      win.on("closed", () => logInteraction(null));
      win.on("error", (err: Error) => logInteraction({ error: err.message }));

      return {
        content: [{
          type: "text" as const,
          text: "Widget \"" + title + "\" rendered (" + width + "\u00d7" + height + "). Saved to " + fullPath + ".",
        }],
        details: { title: params.title, width, height, isSVG, savedFile: filename, fullPath },
      };
    },

    renderCall(args: any, theme: any) {
      const title = (args.title ?? "widget").replace(/_/g, " ");
      const size = args.width && args.height ? " " + args.width + "\u00d7" + args.height : "";
      let text = theme.fg("toolTitle", theme.bold("show_widget "));
      text += theme.fg("accent", title);
      if (size) text += theme.fg("dim", size);
      return new Text(text, 0, 0);
    },

    renderResult(result: any, { isPartial }: any, theme: any) {
      if (isPartial) {
        return new Text(theme.fg("warning", "\u27f3 Widget rendering..."), 0, 0);
      }

      const details = result.details ?? {};
      const title = (details.title ?? "widget").replace(/_/g, " ");
      let text = theme.fg("success", "\u2713 ") + theme.fg("accent", title);
      text += theme.fg("dim", " " + (details.width ?? 800) + "\u00d7" + (details.height ?? 600));
      if (details.isSVG) text += theme.fg("dim", " (SVG)");
      if (details.fullPath) text += theme.fg("muted", " \u2192 " + details.fullPath);
      return new Text(text, 0, 0);
    },
  });

  // ── browse_widgets tool ───────────────────────────────────────────────────

  pi.registerTool({
    name: "browse_widgets",
    label: "Browse Widgets",
    description:
      "List previously generated widgets or reopen a specific one. " +
      "Shows saved widget history with timestamps and titles.",
    promptSnippet: "Browse or reopen previously generated widgets.",
    parameters: Type.Object({
      action: Type.Union(
        [
          Type.Literal("list", { description: "List recent widgets" }),
          Type.Literal("reopen", { description: "Reopen a specific widget by filename" }),
          Type.Literal("html", { description: "Get the raw HTML of a saved widget" }),
        ],
        { description: "Action to perform" }
      ),
      filename: Type.Optional(
        Type.String({ description: "Widget filename (for reopen/html actions)" })
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max widgets to list. Default: 20." })
      ),
    }),

    async execute(_toolCallId, params) {
      const limit = params.limit ?? 20;

      if (params.action === "list") {
        const index = await loadActiveWidgetIndex();
        const recent = index.slice(0, limit);
        if (recent.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No saved widgets found." }],
          };
        }
        const lines = recent.map(
          (w, i) => (i + 1) + ". " + w.title + " \u2014 " + w.timestamp + " \u2014 " + w.width + "\u00d7" + w.height + " \u2014 " + w.file
        );
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          details: { widgets: recent },
        };
      }

      if (params.action === "reopen" || params.action === "html") {
        if (!params.filename) {
          throw new Error("filename is required for reopen/html actions.");
        }
        const html = await loadWidgetHtml(params.filename);
        if (!html) {
          throw new Error("Widget not found: " + params.filename);
        }

        if (params.action === "html") {
          return {
            content: [{ type: "text" as const, text: html }],
            details: { filename: params.filename },
          };
        }

        const index = await loadWidgetIndex();
        const record = index.find((w) => w.file === params.filename);
        const title = record?.title ?? "Saved Widget";
        const width = record?.width ?? 800;
        const height = record?.height ?? 600;
        const isSVG = record?.isSVG ?? false;

        const win = openWindow(html, { width, height, title, noDock: true });
        ctx.activeWindows.push(win);
        win.on("closed", () => {
          ctx.activeWindows = ctx.activeWindows.filter((w) => w !== win);
        });

        return {
          content: [{
            type: "text" as const,
            text: "Reopened \"" + title + "\" (" + width + "\u00d7" + height + ") from " + params.filename + ".",
          }],
          details: { filename: params.filename, title, width, height, isSVG },
        };
      }

      throw new Error("Unknown action: " + params.action);
    },

    renderCall(args: any, theme: any) {
      let text = theme.fg("toolTitle", theme.bold("browse_widgets "));
      text += theme.fg("accent", args.action);
      if (args.filename) text += theme.fg("dim", " " + args.filename);
      return new Text(text, 0, 0);
    },

    renderResult(result: any, { isPartial }: any, theme: any) {
      if (isPartial) return new Text(theme.fg("warning", "Loading..."), 0, 0);
      return new Text(theme.fg("dim", "Done"), 0, 0);
    },
  });
}
