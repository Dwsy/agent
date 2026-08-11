// ── Tool Registrations ────────────────────────────────────────────────────

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { join } from "node:path";
import { getGuidelines, AVAILABLE_MODULES } from "./guidelines.js";
import { TEMPLATE_IDS } from "./templates/index.js";
import { appendWidgetEvent, type WidgetRecord, widgetsDir, saveWidget, loadActiveWidgetIndex, loadWidgetIndex, loadWidgetHtml } from "./storage.js";
import { shellHTML, wrapHTML, escapeJS, timestamp, openWindow } from "./html-helpers.js";
import { transpileCanvas, validateCanvasCode, canvasShellHTML, canvasDocumentHTML, CANVAS_ALLOWED_IMPORTS } from "./canvas.js";

const MAX_WIDGET_CODE_BYTES = 2 * 1024 * 1024;
const ALLOWED_RESOURCE_HOSTS = new Set([
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "esm.sh",
  "fonts.bunny.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "unpkg.com",
]);

function validateWidgetCode(code: string, interactive = false): void {
  if (Buffer.byteLength(code, "utf8") > MAX_WIDGET_CODE_BYTES) {
    throw new Error("widget_code must be smaller than 2 MB. Aggregate or downsample inline data.");
  }
  if (/<!doctype|<\/?(?:html|head|body)\b/i.test(code)) {
    throw new Error("widget_code must be an HTML fragment without DOCTYPE, html, head, or body tags.");
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*(?:\(|=|new\b)/i.test(code)) {
    throw new Error("widget_code cannot use fetch, XMLHttpRequest, or WebSocket. Keep widget data inline.");
  }
  for (const match of code.matchAll(/<(?:script|link|img|audio|video|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const source = match[1];
    if (source.startsWith("data:") || source.startsWith("blob:") || !/^https?:\/\//i.test(source)) continue;
    let host: string;
    try {
      host = new URL(source).hostname;
    } catch {
      throw new Error("widget_code contains an invalid external resource URL.");
    }
    if (!ALLOWED_RESOURCE_HOSTS.has(host)) {
      throw new Error("External widget resources must use an approved CDN host.");
    }
  }
  if (interactive && !/(?:window\.glimpse\.send|sendWidgetEvent|sendPrompt|sendAnnotation)\s*\(/.test(code)) {
    throw new Error("interactive widgets must send a choice or follow-up request through the widget event bridge.");
  }
}

export interface ToolContext {
  hasSeenReadMe: boolean;
  streaming: StreamingWidget | null;
  activeWindows: any[];
}

export interface StreamingWidget {
  contentIndex: number;
  kind: "widget" | "canvas";
  window: any | null;
  lastHTML: string;
  updateTimer: any;
  ready: boolean;
}

interface PresentWindowOptions {
  ctx: ToolContext;
  interactive: boolean;
  noun: "Widget" | "Canvas";
  title: string;
  filename: string;
  fullPath: string;
  width: number;
  height: number;
  floating: boolean;
  /** Shell document used when no streaming preview window exists yet. */
  shell: string;
  streamingKind: "widget" | "canvas";
  /** JS evaluated in the window once it is ready. */
  activationCode: string;
  details: Record<string, unknown>;
}

/** Open (or adopt the streaming preview) window, activate content, and wire
 * the interactive/message/cleanup lifecycle shared by widgets and canvases. */
function presentWindow(opts: PresentWindowOptions): Promise<any> | any {
  const { ctx, title, filename, fullPath, noun } = opts;
  let win: any = null;
  let windowReady = false;

  if (ctx.streaming?.window && ctx.streaming.kind === opts.streamingKind) {
    win = ctx.streaming.window;
    windowReady = ctx.streaming.ready;
    ctx.streaming = null;
  } else {
    win = openWindow(opts.shell, {
      width: opts.width,
      height: opts.height,
      title,
      floating: opts.floating,
      noDock: true,
    });
    ctx.activeWindows.push(win);
  }

  let activated = false;
  const activate = () => {
    if (activated) return;
    activated = true;
    win.send(opts.activationCode);
  };
  const scheduleActivation = () => {
    if (windowReady) activate();
    else win.on("ready", activate);
  };

  // Window stays tracked until it actually closes so session_shutdown can
  // clean up widgets that outlive their tool call (interactive included).
  const untrack = () => {
    ctx.activeWindows = ctx.activeWindows.filter((w) => w !== win);
  };
  win.on("closed", untrack);
  win.on("error", untrack);

  if (opts.interactive) {
    return new Promise<any>((resolve, reject) => {
      let messageData: unknown;
      let hasMessage = false;
      let settling = false;
      let resolved = false;

      const timeout = setTimeout(() => { if (!settling) finish("Timeout"); }, 120_000);

      const finish = (reason: string, widgetEvent: unknown = null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        resolve({
          content: [{
            type: "text" as const,
            text: hasMessage
              ? noun + " \"" + title + "\" interaction data: " + JSON.stringify(messageData)
              : noun + " \"" + title + "\" closed (" + reason + ").",
          }],
          details: { ...opts.details, messageData, widgetEvent, closedReason: reason },
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
          clearTimeout(timeout);
          reject(error);
        });
      });
      win.on("closed", () => { if (!settling) finish("Window closed"); });
      win.on("error", (err: Error) => { if (!settling) finish("Error: " + err.message); });
      scheduleActivation();
    });
  }

  win.on("message", (data: unknown) => {
    void appendWidgetEvent(filename, data).catch(() => {});
  });
  scheduleActivation();

  return {
    content: [{
      type: "text" as const,
      text: noun + " \"" + title + "\" rendered (" + opts.width + "\u00d7" + opts.height + "). Saved to " + fullPath + ".",
    }],
    details: opts.details,
  };
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
      "Pick the modules that match your use case: interactive, chart, mockup, art, diagram, runtime, canvas (React components via show_canvas).",
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
      "Create a widget only when it materially improves understanding or a decision; keep the visual to one dominant view.",
      "Always call visualize_read_me first to load design guidelines, then set i_have_seen_read_me: true.",
      "For static labeled-node diagrams, prefer the Mermaid template over hand-positioned SVG; use HTML/SVG for spatial, dynamic, or adjustable visuals.",
      "The widget opens in a native macOS window — it has full browser capabilities (Canvas, JS, CDN libraries).",
      "Structure HTML as fragments: no DOCTYPE/<html>/<head>/<body>. Style first, then HTML, then scripts.",
      "Use CSS variables for all colors so widgets adapt to light/dark. Hardcoded #hex for UI chrome is a bug unless art module.",
      "Keep controls and selections local in JavaScript. Add only controls the user requested; never invent filter, search, reset, dashboard, or KPI panels.",
      "Use semantic HTML and native controls with labels. At 320px wide, content must wrap without clipping, horizontal scrolling, fixed positioning, or internal scrolling.",
      "Give charts, SVGs, canvases, and custom widgets an accessible name or concise screen-reader description; pair color encodings with text, shape, or line style.",
      "The page has window.glimpse.send(data) to return a choice or follow-up request to the agent. Use it only when the agent needs that result.",
      "The host already provides data-tooltip support backed by Floating UI and global Lucide icons; use data-tooltip/data-lucide instead of loading either library yourself.",
      "Keep data inline and widgets below 2 MB. Do not use fetch, XMLHttpRequest, WebSocket, or unapproved external resources.",
      "For feedback-addressable UI, give stable elements data-spec-id attributes and call sendAnnotation(targetId, comment, stateId?) to persist structured feedback.",
      "Keep widgets focused and appropriately sized. Default is 800x600 but adjust to fit content.",
      "For SVG: start code with <svg> tag, it will be auto-detected.",
      "Set interactive=true ONLY when the widget sends data that the agent needs to continue. Default false keeps display-only and local interactions non-blocking.",
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
          "Whether this widget must return a choice or follow-up request to the agent via glimpse.send. " +
          "false (default): display-only and presentation-only interactions stay local; the agent continues immediately. " +
          "true: blocking, the agent waits for the returned result.",
      })),
    }),

    async execute(_toolCallId, params) {
      // Enforced against actual tool usage, not the model's self-report.
      if (!ctx.hasSeenReadMe) {
        throw new Error("You must call visualize_read_me before show_widget. Call it now, then retry.");
      }
      if (!params.i_have_seen_read_me) {
        throw new Error("Set i_have_seen_read_me: true after calling visualize_read_me.");
      }

      const code = params.widget_code;
      validateWidgetCode(code, params.interactive ?? false);
      const isSVG = code.trimStart().startsWith("<svg");
      const title = params.title.replace(/_/g, " ");
      const width = params.width ?? 800;
      const height = params.height ?? 600;
      const ts = timestamp();
      const safeTitle = params.title.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = ts + "_" + safeTitle + ".html";
      const fullPath = join(widgetsDir(), filename);

      const fullHTML = wrapHTML(code, isSVG);
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

      return presentWindow({
        ctx,
        interactive: params.interactive ?? false,
        noun: "Widget",
        title,
        filename,
        fullPath,
        width,
        height,
        floating: params.floating ?? false,
        shell: shellHTML(),
        streamingKind: "widget",
        activationCode: "window._setContent('" + escapeJS(code) + "'); window._runScripts();",
        details: { title: params.title, width, height, isSVG, savedFile: filename, fullPath },
      });
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

  // ── show_canvas tool ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "show_canvas",
    label: "Show Canvas",
    description:
      "Render a React component in a native macOS window. Write a single TSX file that default-exports the " +
      "top-level component; it is compiled host-side and rendered with React 18. " +
      "Use for analytical artifacts: metrics breakdowns, audits and reviews with categorized findings, " +
      "data tables, timelines, interactive explorations — anything with component state or rich composition. " +
      "For single static SVG/HTML visuals prefer show_widget. " +
      "IMPORTANT: Call visualize_read_me (module \"canvas\") once before your first show_canvas call.",
    promptSnippet: "Render a React component (TSX, compiled host-side) in a native macOS window.",
    promptGuidelines: [
      "Use show_canvas when the output is a standalone analytical artifact (analyses, audits, structured findings, data-heavy tables, interactive explorations). Use show_widget for single static SVG/HTML visuals.",
      "Call visualize_read_me with the \"canvas\" module first, then set i_have_seen_read_me: true.",
      "canvas_code is one TSX file that default-exports the top-level component. Allowed imports: " + CANVAS_ALLOWED_IMPORTS.join(", ") + ". Everything else must be inline.",
      "Embed all data inline. No fetch, XMLHttpRequest, or WebSocket.",
      "Take all colors from useHostTheme() (@gen-ui/canvas) or host CSS variables so light/dark both work. Never hardcode light-only hex.",
      "No slop: no gradients, no emojis as icons, no box-shadows, no rainbow coloring, no walls of identical cards, no empty placeholder sections.",
      "Every chart/table must be self-describing: specific title, axis labels with units, legend for multiple series, source caption.",
      "Set interactive=true ONLY when the component must return data the agent needs to continue; call sendToAgent(data) from @gen-ui/canvas to settle it.",
      "Compile errors are returned verbatim — fix the TSX and retry.",
    ],
    parameters: Type.Object({
      i_have_seen_read_me: Type.Boolean({
        description: "Confirm you have already called visualize_read_me in this conversation.",
      }),
      title: Type.String({
        description: "Short snake_case identifier for this canvas (used as window title and saved filename).",
      }),
      canvas_code: Type.String({
        description:
          "TSX source for a single-file React component. Must default-export the top-level component. " +
          "Allowed imports: " + CANVAS_ALLOWED_IMPORTS.join(", ") + ".",
      }),
      width: Type.Optional(Type.Number({ description: "Window width in pixels. Default: 900." })),
      height: Type.Optional(Type.Number({ description: "Window height in pixels. Default: 640." })),
      floating: Type.Optional(Type.Boolean({ description: "Keep window always on top. Default: false." })),
      interactive: Type.Optional(Type.Boolean({
        description:
          "Whether this canvas must return data to the agent via sendToAgent. " +
          "false (default): display-only, agent continues immediately. true: blocking until the canvas responds.",
      })),
    }),

    async execute(_toolCallId, params) {
      if (!ctx.hasSeenReadMe) {
        throw new Error("You must call visualize_read_me before show_canvas. Call it now (include the \"canvas\" module), then retry.");
      }

      const code = params.canvas_code;
      validateCanvasCode(code, params.interactive ?? false);
      const compiled = await transpileCanvas(code);

      const title = params.title.replace(/_/g, " ");
      const width = params.width ?? 900;
      const height = params.height ?? 640;
      const ts = timestamp();
      const safeTitle = params.title.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = ts + "_" + safeTitle + ".html";
      const sourceFile = ts + "_" + safeTitle + ".tsx";
      const fullPath = join(widgetsDir(), filename);

      const record: WidgetRecord = {
        id: ts + "_" + safeTitle,
        title,
        timestamp: ts,
        file: filename,
        width,
        height,
        isSVG: false,
        kind: "canvas",
        sourceFile,
        cwd: process.cwd(),
      };
      await saveWidget(record, canvasDocumentHTML(compiled), code);

      return presentWindow({
        ctx,
        interactive: params.interactive ?? false,
        noun: "Canvas",
        title,
        filename,
        fullPath,
        width,
        height,
        floating: params.floating ?? false,
        shell: canvasShellHTML(),
        streamingKind: "canvas",
        activationCode: compiled,
        details: { title: params.title, width, height, kind: "canvas", savedFile: filename, sourceFile, fullPath },
      });
    },

    renderCall(args: any, theme: any) {
      const title = (args.title ?? "canvas").replace(/_/g, " ");
      const size = args.width && args.height ? " " + args.width + "\u00d7" + args.height : "";
      let text = theme.fg("toolTitle", theme.bold("show_canvas "));
      text += theme.fg("accent", title);
      if (size) text += theme.fg("dim", size);
      return new Text(text, 0, 0);
    },

    renderResult(result: any, { isPartial }: any, theme: any) {
      if (isPartial) {
        return new Text(theme.fg("warning", "\u27f3 Canvas compiling..."), 0, 0);
      }
      const details = result.details ?? {};
      const title = (details.title ?? "canvas").replace(/_/g, " ");
      let text = theme.fg("success", "\u2713 ") + theme.fg("accent", title);
      text += theme.fg("dim", " " + (details.width ?? 900) + "\u00d7" + (details.height ?? 640) + " (React)");
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
          (w, i) => (i + 1) + ". " + w.title + (w.kind === "canvas" ? " [canvas]" : "") + " \u2014 " + w.timestamp + " \u2014 " + w.width + "\u00d7" + w.height + " \u2014 " + w.file
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

        const index = await loadWidgetIndex();
        const record = index.find((w) => w.file === params.filename);

        if (params.action === "html") {
          // Canvases return their TSX source — that is what gets edited and re-shown.
          if (record?.kind === "canvas" && record.sourceFile) {
            const source = await loadWidgetHtml(record.sourceFile);
            if (source) {
              return {
                content: [{ type: "text" as const, text: source }],
                details: { filename: params.filename, sourceFile: record.sourceFile, kind: "canvas" },
              };
            }
          }
          return {
            content: [{ type: "text" as const, text: html }],
            details: { filename: params.filename },
          };
        }
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
