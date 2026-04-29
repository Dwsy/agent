import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { open } from "glimpseui";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getGuidelines, AVAILABLE_MODULES } from "./guidelines.js";
import { SVG_STYLES } from "./svg-styles.js";

// ── Widget Storage ────────────────────────────────────────────────────────

const WIDGETS_DIR = join(process.env.HOME || "~", ".pi/widgets");
const WIDGETS_INDEX = join(WIDGETS_DIR, "index.json");

interface WidgetRecord {
  id: string;
  title: string;
  timestamp: string;
  file: string;
  width: number;
  height: number;
  isSVG: boolean;
  interactionData?: any;
}

async function ensureWidgetsDir() {
  await mkdir(WIDGETS_DIR, { recursive: true });
}

async function saveWidget(record: WidgetRecord, html: string) {
  await ensureWidgetsDir();
  await writeFile(join(WIDGETS_DIR, record.file), html, "utf-8");

  let index: WidgetRecord[] = [];
  try {
    const raw = await readFile(WIDGETS_INDEX, "utf-8");
    index = JSON.parse(raw);
  } catch {}
  index.unshift(record);
  // Keep last 200 widgets
  if (index.length > 200) index = index.slice(0, 200);
  await writeFile(WIDGETS_INDEX, JSON.stringify(index, null, 2), "utf-8");
}

async function loadWidgetIndex(): Promise<WidgetRecord[]> {
  try {
    const raw = await readFile(WIDGETS_INDEX, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function loadWidgetHtml(filename: string): Promise<string | null> {
  try {
    return await readFile(join(WIDGETS_DIR, filename), "utf-8");
  } catch {
    return null;
  }
}

// ── Shell HTML ────────────────────────────────────────────────────────────

function shellHTML(darkMode = true): string {
  const bg = darkMode ? '#1a1a1a' : '#ffffff';
  const fg = darkMode ? '#e0e0e0' : '#1a1a1a';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*{box-sizing:border-box}
body{margin:0;padding:1rem;font-family:system-ui,-apple-system,sans-serif;background:${bg};color:${fg};}
@keyframes _fadeIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
${SVG_STYLES}
</style>
</head><body><div id="root"></div>
<script>
  window._morphReady = false;
  window._pending = null;
  window._darkMode = ${darkMode};
  window._setContent = function(html) {
    if (!window._morphReady) { window._pending = html; return; }
    var root = document.getElementById('root');
    var target = document.createElement('div');
    target.id = 'root';
    target.innerHTML = html;
    morphdom(root, target, {
      onBeforeElUpdated: function(from, to) {
        if (from.isEqualNode(to)) return false;
        return true;
      },
      onNodeAdded: function(node) {
        if (node.nodeType === 1 && node.tagName !== 'STYLE' && node.tagName !== 'SCRIPT') {
          node.style.animation = '_fadeIn 0.3s ease both';
        }
        return node;
      }
    });
  };
  window._runScripts = function() {
    document.querySelectorAll('#root script').forEach(function(old) {
      var s = document.createElement('script');
      if (old.src) { s.src = old.src; } else { s.textContent = old.textContent; }
      old.parentNode.replaceChild(s, old);
    });
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/morphdom@2.7.4/dist/morphdom-umd.min.js"
  onload="window._morphReady=true;if(window._pending){window._setContent(window._pending);window._pending=null;}"></script>
</body></html>`;
}

function wrapHTML(code: string, isSVG = false, darkMode = true): string {
  const bg = darkMode ? '#1a1a1a' : '#ffffff';
  const fg = darkMode ? '#e0e0e0' : '#1a1a1a';
  if (isSVG) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${SVG_STYLES}</style></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${bg};color:${fg};">
${code}</body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>*{box-sizing:border-box}body{margin:0;padding:1rem;font-family:system-ui,-apple-system,sans-serif;background:${bg};color:${fg};${SVG_STYLES}</style>
</head><body>${code}</body></html>`;
}

function escapeJS(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/<\/script>/gi, "<\\/script>");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ── Extension ─────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let hasSeenReadMe = false;
  let activeWindows: any[] = [];

  // ── Streaming state ─────────────────────────────────────────────────────

  interface StreamingWidget {
    contentIndex: number;
    window: any | null;
    lastHTML: string;
    updateTimer: any;
    ready: boolean;
  }

  let streaming: StreamingWidget | null = null;

  // ── message_update: intercept streaming tool calls ───────────────────────

  pi.on("message_update", async (event) => {
    const raw: any = event.assistantMessageEvent;
    if (!raw) return;

    // Tool call starts streaming
    if (raw.type === "toolcall_start") {
      const partial: any = raw.partial;
      const block = partial?.content?.[raw.contentIndex];
      if (block?.type === "toolCall" && block?.name === "show_widget") {
        streaming = {
          contentIndex: raw.contentIndex,
          window: null,
          lastHTML: "",
          updateTimer: null,
          ready: false,
        };
      }
      return;
    }

    // Tool call input JSON delta — arguments already parsed by pi-ai
    if (raw.type === "toolcall_delta" && streaming && raw.contentIndex === streaming.contentIndex) {
      const partial: any = raw.partial;
      const block = partial?.content?.[raw.contentIndex];
      const html = block?.arguments?.widget_code;
      if (!html || html.length < 20 || html === streaming.lastHTML) return;

      streaming.lastHTML = html;

      // Debounce updates to ~150ms for smooth rendering
      if (streaming.updateTimer) return;
      streaming.updateTimer = setTimeout(async () => {
        if (!streaming) return;
        streaming.updateTimer = null;

        try {
          if (!streaming.window) {
            const args = block?.arguments ?? {};
            const title = (args.title ?? "Widget").replace(/_/g, " ");
            const width = args.width ?? 800;
            const height = args.height ?? 600;

            streaming.window = open(shellHTML(), {
              width,
              height,
              title,
              noDock: true,
            });
            activeWindows.push(streaming.window);

            // Detect system appearance on ready, adapt shell if light mode
            streaming.window.on("ready", (info: any) => {
              if (!streaming) return;
              streaming.ready = true;
              const dark = info?.appearance?.darkMode !== false;
              if (!dark) {
                // Re-theme shell for light mode
                streaming.window.send(`document.body.style.background='#ffffff'; document.body.style.color='#1a1a1a';`);
              }
              const escaped = escapeJS(streaming.lastHTML);
              streaming.window.send(`window._setContent('${escaped}')`);
            });
          } else if (streaming.ready) {
            const escaped = escapeJS(streaming.lastHTML);
            streaming.window.send(`window._setContent('${escaped}')`);
          }
        } catch {}
      }, 150);
      return;
    }

    // Tool call complete — final update with complete HTML + execute scripts
    if (raw.type === "toolcall_end" && streaming && raw.contentIndex === streaming.contentIndex) {
      if (streaming.updateTimer) {
        clearTimeout(streaming.updateTimer);
        streaming.updateTimer = null;
      }

      const toolCall = raw.toolCall;
      if (toolCall?.arguments?.widget_code && streaming.window && streaming.ready) {
        const escaped = escapeJS(toolCall.arguments.widget_code);
        streaming.window.send(`window._setContent('${escaped}'); window._runScripts();`);
      }
      // Don't clear streaming — execute() will pick up the window
      return;
    }
  });

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
      hasSeenReadMe = true;
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
      const filename = `${ts}_${safeTitle}.html`;

      // Save widget HTML to disk
      const fullHTML = wrapHTML(code, isSVG);
      const record: WidgetRecord = {
        id: `${ts}_${safeTitle}`,
        title,
        timestamp: ts,
        file: filename,
        width,
        height,
        isSVG,
      };
      saveWidget(record, fullHTML).catch(() => {});

      // Check if we already have a streaming window from message_update
      let win: any = null;

      if (streaming?.window) {
        win = streaming.window;
        if (streaming.ready) {
          const escaped = escapeJS(code);
          win.send(`window._setContent('${escaped}'); window._runScripts();`);
        }
        streaming = null;
      } else {
        // No streaming window — open fresh with shell, detect theme, then inject
        win = open(shellHTML(), {
          width,
          height,
          title,
          floating: params.floating ?? false,
          noDock: true,
        });
        activeWindows.push(win);

        win.on("ready", (info: any) => {
          const dark = info?.appearance?.darkMode !== false;
          const escaped = escapeJS(code);
          if (!dark) {
            win.send(`document.body.style.background='#ffffff'; document.body.style.color='#1a1a1a';`);
          }
          win.send(`window._setContent('${escaped}'); window._runScripts();`);
        });
      }

      // ── Interactive (blocking): wait for user interaction ───────────────
      if (params.interactive) {
        return new Promise<any>((resolve) => {
          let messageData: any = null;
          let resolved = false;

          const finish = (reason: string) => {
            if (resolved) return;
            resolved = true;
            activeWindows = activeWindows.filter((w) => w !== win);
            if (messageData) {
              record.interactionData = messageData;
              saveWidget(record, fullHTML).catch(() => {});
            }
            resolve({
              content: [{
                type: "text" as const,
                text: messageData
                  ? `Widget "${title}" interaction data: ${JSON.stringify(messageData)}`
                  : `Widget "${title}" closed (${reason}).`,
              }],
              details: { title: params.title, width, height, isSVG, savedFile: filename, messageData, closedReason: reason },
            });
          };

          win.on("message", (data: any) => { messageData = data; finish("User sent data"); });
          win.on("closed", () => finish("Window closed"));
          win.on("error", (err: Error) => finish(`Error: ${err.message}`));

          // Auto-resolve after 120s
          setTimeout(() => finish("Timeout"), 120_000);
        });
      }

      // ── Display-only (non-blocking): return immediately ─────────────────
      let interactionLogged = false;
      const logInteraction = (data: any) => {
        if (interactionLogged) return;
        interactionLogged = true;
        record.interactionData = data;
        saveWidget(record, fullHTML).catch(() => {});
        activeWindows = activeWindows.filter((w) => w !== win);
      };

      win.on("message", (data: any) => logInteraction(data));
      win.on("closed", () => logInteraction(null));
      win.on("error", (err: Error) => logInteraction({ error: err.message }));

      return {
        content: [{
          type: "text" as const,
          text: `Widget "${title}" rendered (${width}×${height}). Saved to widgets/${filename}.`,
        }],
        details: { title: params.title, width, height, isSVG, savedFile: filename },
      };
    },

    renderCall(args: any, theme: any) {
      const title = (args.title ?? "widget").replace(/_/g, " ");
      const size = args.width && args.height ? ` ${args.width}×${args.height}` : "";
      let text = theme.fg("toolTitle", theme.bold("show_widget "));
      text += theme.fg("accent", title);
      if (size) text += theme.fg("dim", size);
      return new Text(text, 0, 0);
    },

    renderResult(result: any, { isPartial }: any, theme: any) {
      if (isPartial) {
        return new Text(theme.fg("warning", "⟳ Widget rendering..."), 0, 0);
      }

      const details = result.details ?? {};
      const title = (details.title ?? "widget").replace(/_/g, " ");
      let text = theme.fg("success", "✓ ") + theme.fg("accent", title);
      text += theme.fg("dim", ` ${details.width ?? 800}×${details.height ?? 600}`);
      if (details.isSVG) text += theme.fg("dim", " (SVG)");
      if (details.savedFile) text += theme.fg("muted", ` → ${details.savedFile}`);

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
        const index = await loadWidgetIndex();
        const recent = index.slice(0, limit);
        if (recent.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No saved widgets found." }],
          };
        }
        const lines = recent.map(
          (w, i) => `${i + 1}. ${w.title} — ${w.timestamp} — ${w.width}×${w.height} — ${w.file}`
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
          throw new Error(`Widget not found: ${params.filename}`);
        }

        if (params.action === "html") {
          return {
            content: [{ type: "text" as const, text: html }],
            details: { filename: params.filename },
          };
        }

        // Reopen in a new window
        const index = await loadWidgetIndex();
        const record = index.find((w) => w.file === params.filename);
        const title = record?.title ?? "Saved Widget";
        const width = record?.width ?? 800;
        const height = record?.height ?? 600;
        const isSVG = record?.isSVG ?? false;

        const win = open(html, {
          width,
          height,
          title,
          noDock: true,
        });
        activeWindows.push(win);

        win.on("closed", () => {
          activeWindows = activeWindows.filter((w) => w !== win);
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Reopened "${title}" (${width}×${height}) from ${params.filename}.`,
            },
          ],
          details: { filename: params.filename, title, width, height, isSVG },
        };
      }

      throw new Error(`Unknown action: ${params.action}`);
    },

    renderCall(args: any, theme: any) {
      let text = theme.fg("toolTitle", theme.bold("browse_widgets "));
      text += theme.fg("accent", args.action);
      if (args.filename) text += theme.fg("dim", ` ${args.filename}`);
      return new Text(text, 0, 0);
    },

    renderResult(result: any, { isPartial }: any, theme: any) {
      if (isPartial) return new Text(theme.fg("warning", "Loading..."), 0, 0);
      return new Text(theme.fg("dim", "Done"), 0, 0);
    },
  });

  // ── cleanup on shutdown ───────────────────────────────────────────────────

  pi.on("session_shutdown", async () => {
    if (streaming?.updateTimer) clearTimeout(streaming.updateTimer);
    streaming = null;
    for (const win of activeWindows) {
      try { win.close(); } catch {}
    }
    activeWindows = [];
  });
}
