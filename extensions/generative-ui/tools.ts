// ── Tool Registrations ────────────────────────────────────────────────────

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { join } from "node:path";
import { getGuidelines, AVAILABLE_MODULES } from "./guidelines.js";
import { TEMPLATE_IDS } from "./templates/index.js";
import { appendWidgetEvent, type WidgetRecord, WIDGETS_DIR, saveWidget, loadActiveWidgetIndex, loadWidgetIndex, loadWidgetHtml } from "./storage.js";
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
      "Guidelines include a catalog of ready-made HTML fragments (flow-steps, flow-mermaid, architecture-cards, metric-chart, compare-cards, contact-card). Prefer these over multi-color SVG flow boxes.",
      "Template bodies are on-demand: first call modules only (catalog). When ready to build, re-call with templates: [\"flow-mermaid\"] (or multiple ids / \"all\") to load full HTML skeletons.",
      "Theme: always use host CSS variables (var(--color-text-*), var(--color-background-*), var(--color-border-*)). Never hardcode light-only hex. Chart.js/Mermaid must read computed CSS vars or window._themeVars() so light/dark both work.",
    ],
    parameters: Type.Object({
      modules: Type.Array(
        StringEnum(AVAILABLE_MODULES as readonly string[]),
        { description: "Which module(s) to load. Pick all that fit." }
      ),
      templates: Type.Optional(
        Type.Array(
          Type.String({ description: "Template id (flow-steps, flow-mermaid, …) or \"all\"." }),
          {
            description:
              "Optional fragment bodies to expand. Omit for catalog-only (token-light). " +
              "Pass ids like [\"flow-mermaid\"] or [\"all\"] when you need full HTML skeletons. " +
              "Known ids: " + TEMPLATE_IDS.join(", ") + ".",
          }
        )
      ),
    }),

    async execute(_toolCallId, params) {
      ctx.hasSeenReadMe = true;
      const content = getGuidelines(params.modules, { templates: params.templates });
      return {
        content: [{ type: "text" as const, text: content }],
        details: { modules: params.modules, templates: params.templates ?? [] },
      };
    },

    renderCall(args: any, theme: any) {
      const mods = (args.modules ?? []).join(", ");
      const tpls = (args.templates ?? []).join(", ");
      let text = theme.fg("toolTitle", theme.bold("read_me ")) + theme.fg("muted", mods);
      if (tpls) text += theme.fg("dim", " templates:" + tpls);
      return new Text(text, 0, 0);
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
      "Use CSS variables for all colors so widgets adapt to light/dark. Hardcoded #hex for UI chrome is a bug unless art module.",
      "The page has window.glimpse.send(data) to send data back. Use it for user choices and interactions.",
      "For feedback-addressable UI, give stable elements data-spec-id attributes and call sendAnnotation(targetId, comment, stateId?) to persist structured feedback.",
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
      await saveWidget(record, fullHTML);

      let win: any = null;
      let windowReady = false;

      if (ctx.streaming?.window) {
        win = ctx.streaming.window;
        windowReady = ctx.streaming.ready;
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
      }

      let activated = false;
      const activateWidget = () => {
        if (activated) return;
        activated = true;
        const escaped = escapeJS(code);
        win.send("window._setContent('" + escaped + "'); window._runScripts();");
      };
      const scheduleActivation = () => {
        if (windowReady) activateWidget();
        else win.on("ready", activateWidget);
      };

      if (params.interactive) {
        return new Promise<any>((resolve, reject) => {
          let messageData: unknown;
          let hasMessage = false;
          let settling = false;
          let resolved = false;

          const finish = (reason: string, widgetEvent: unknown = null) => {
            if (resolved) return;
            resolved = true;
            ctx.activeWindows = ctx.activeWindows.filter((w) => w !== win);
            resolve({
              content: [{
                type: "text" as const,
                text: hasMessage
                  ? "Widget \"" + title + "\" interaction data: " + JSON.stringify(messageData)
                  : "Widget \"" + title + "\" closed (" + reason + ").",
              }],
              details: { title: params.title, width, height, isSVG, savedFile: filename, fullPath, messageData, widgetEvent, closedReason: reason },
            });
          };

          win.on("message", (data: unknown) => {
            const settlesTool = !resolved && !settling;
            if (settlesTool) {
              settling = true;
              messageData = data;
              hasMessage = true;
            }
            appendWidgetEvent(filename, data).then((event) => {
              if (settlesTool) finish("User sent data", event);
            }).catch((error) => {
              if (!settlesTool) return;
              resolved = true;
              ctx.activeWindows = ctx.activeWindows.filter((w) => w !== win);
              reject(error);
            });
          });
          win.on("closed", () => { if (!settling) finish("Window closed"); });
          win.on("error", (err: Error) => { if (!settling) finish("Error: " + err.message); });
          setTimeout(() => { if (!settling) finish("Timeout"); }, 120_000);
          scheduleActivation();
        });
      }

      win.on("message", (data: unknown) => {
        void appendWidgetEvent(filename, data).catch(() => {});
      });
      win.on("closed", () => {
        ctx.activeWindows = ctx.activeWindows.filter((w) => w !== win);
      });
      win.on("error", () => {
        ctx.activeWindows = ctx.activeWindows.filter((w) => w !== win);
      });
      scheduleActivation();

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
        win.on("message", (data: unknown) => {
          void appendWidgetEvent(params.filename!, data).catch(() => {});
        });
        win.on("closed", () => {
          ctx.activeWindows = ctx.activeWindows.filter((w) => w !== win);
        });
        win.on("error", () => {
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
