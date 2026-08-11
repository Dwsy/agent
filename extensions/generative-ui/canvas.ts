// ── Canvas: React component widgets ───────────────────────────────────────
// TSX source (single file, default-export component) is bundled host-side
// with esbuild into an IIFE and rendered in a React shell window. Imports are
// restricted to react, react-dom/client and the @gen-ui/canvas SDK.

import { build } from "esbuild";
import { cssVariables } from "./svg-styles.js";
import { WIDGET_CSP, WIDGET_UI_KIT_CSS, WIDGET_UI_KIT_RESOURCES } from "./widget-ui-kit.js";
import { THEME_VARS_SCRIPT, WIDGET_EVENTS_SCRIPT } from "./html-helpers.js";
import { REACT_UMD_JS, REACT_DOM_UMD_JS } from "./vendor-react.js";

export const CANVAS_ALLOWED_IMPORTS = ["react", "react-dom", "react-dom/client", "@gen-ui/canvas"];

// CJS shims: esbuild interop exposes module.exports as both default and named exports.
const REACT_SHIM = "module.exports = window.React;";
const REACT_DOM_SHIM = "module.exports = window.ReactDOM;";

const SDK_SOURCE = `
import React, { useEffect, useState } from "react";

/** Resolved host theme tokens; re-resolves when the system scheme flips. */
export function useHostTheme() {
  const [theme, setTheme] = useState(() => window._themeVars());
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(window._themeVars());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return theme;
}

/** Send structured data back to the agent (settles interactive canvases). */
export function sendToAgent(data) { return window.sendWidgetEvent(data); }
export function sendPrompt(prompt) { return window.sendPrompt(prompt); }
export function sendAnnotation(targetId, comment, stateId) { return window.sendAnnotation(targetId, comment, stateId); }

const h = React.createElement;

/** Flat rounded container with an optional small title. */
export function Card({ title, children }) {
  return h("div", {
    style: {
      border: "1px solid var(--color-border-tertiary)",
      borderRadius: 8,
      padding: 16,
    },
  },
    title != null && h("div", {
      style: { fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 },
    }, title),
    children,
  );
}

/** Metric block: small label, prominent value, optional hint below. */
export function Stat({ label, value, hint }) {
  return h("div", null,
    h("div", { style: { fontSize: 12, color: "var(--color-text-secondary)" } }, label),
    h("div", { style: { fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)" } }, value),
    hint != null && h("div", { style: { fontSize: 12, color: "var(--color-text-tertiary)" } }, hint),
  );
}

/** Minimal table: columns = [{ key, label, align?, render? }], rows = objects. */
export function DataTable({ columns, rows }) {
  const cellStyle = (col, header) => ({
    padding: "6px 8px",
    textAlign: col.align === "right" ? "right" : "left",
    ...(col.align === "right" && !header ? { fontVariantNumeric: "tabular-nums" } : {}),
  });
  return h("table", { style: { borderCollapse: "collapse", width: "100%" } },
    h("thead", null, h("tr", null,
      columns.map((col) => h("th", {
        key: col.key,
        style: {
          ...cellStyle(col, true),
          color: "var(--color-text-secondary)",
          fontWeight: 500,
          borderBottom: "1px solid var(--color-border-tertiary)",
        },
      }, col.label)),
    )),
    h("tbody", null,
      rows.map((row, i) => h("tr", { key: i },
        columns.map((col) => h("td", {
          key: col.key,
          style: {
            ...cellStyle(col, false),
            borderBottom: "1px solid var(--color-border-tertiary)",
          },
        }, col.render ? col.render(row) : row[col.key])),
      )),
    ),
  );
}
`;

const ENTRY_SOURCE = `
import React from "react";
import ReactDOMClient from "react-dom/client";
import Component from "__canvas__";

class CanvasErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    try { window.sendWidgetEvent({ type: "canvas_error", message: String((error && error.message) || error) }); } catch (e) {}
  }
  render() {
    if (this.state.error) {
      return React.createElement("pre", {
        style: { color: "var(--color-text-danger)", padding: "1rem", whiteSpace: "pre-wrap", fontSize: "12px" },
      }, String(this.state.error.stack || this.state.error));
    }
    return this.props.children;
  }
}

(function mount() {
  const container = document.getElementById("canvas-root");
  if (!window.React || !window.ReactDOM) {
    container.textContent = "React runtime failed to load (offline?).";
    return;
  }
  if (window.__canvasRoot) { try { window.__canvasRoot.unmount(); } catch (e) {} }
  window.__canvasRoot = ReactDOMClient.createRoot(container);
  window.__canvasRoot.render(
    React.createElement(CanvasErrorBoundary, null, React.createElement(Component)),
  );
})();
`;

function canvasPlugin(tsx: string) {
  return {
    name: "canvas-virtual",
    setup(b: any) {
      b.onResolve({ filter: /.*/ }, (args: any) => {
        const known =
          args.path === "__entry__" ||
          args.path === "__canvas__" ||
          CANVAS_ALLOWED_IMPORTS.includes(args.path);
        if (known) return { path: args.path, namespace: "canvas" };
        return {
          errors: [{
            text: `Import "${args.path}" is not allowed in canvas code. Allowed imports: ${CANVAS_ALLOWED_IMPORTS.join(", ")}. Embed data inline instead of importing it.`,
          }],
        };
      });
      b.onLoad({ filter: /.*/, namespace: "canvas" }, (args: any) => {
        if (args.path === "__entry__") return { contents: ENTRY_SOURCE, loader: "js" };
        if (args.path === "__canvas__") return { contents: tsx, loader: "tsx" };
        if (args.path === "react") return { contents: REACT_SHIM, loader: "js" };
        if (args.path === "@gen-ui/canvas") return { contents: SDK_SOURCE, loader: "js" };
        return { contents: REACT_DOM_SHIM, loader: "js" };
      });
    },
  };
}

/** Bundle canvas TSX into a self-contained IIFE. Throws readable diagnostics. */
export async function transpileCanvas(tsx: string): Promise<string> {
  try {
    const result = await build({
      entryPoints: ["__entry__"],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "es2020",
      jsx: "transform",
      logLevel: "silent",
      plugins: [canvasPlugin(tsx)],
    });
    return result.outputFiles[0].text;
  } catch (err: any) {
    const diags = Array.isArray(err?.errors) && err.errors.length
      ? err.errors.map((e: any) => {
          const loc = e.location && e.location.file === "canvas:__canvas__"
            ? ` (canvas_code line ${e.location.line}:${e.location.column})`
            : "";
          return `${e.text}${loc}`;
        })
      : [err instanceof Error ? err.message : String(err)];
    throw new Error("Canvas compile failed:\n" + diags.join("\n"));
  }
}

const MAX_CANVAS_CODE_BYTES = 2 * 1024 * 1024;
const ALLOWED_RESOURCE_HOSTS = new Set([
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "esm.sh",
  "fonts.bunny.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "unpkg.com",
]);

export function validateCanvasCode(code: string, interactive = false): void {
  if (Buffer.byteLength(code, "utf8") > MAX_CANVAS_CODE_BYTES) {
    throw new Error("canvas_code must be smaller than 2 MB. Aggregate or downsample inline data.");
  }
  if (!/export\s+default/.test(code)) {
    throw new Error("canvas_code must default-export the top-level React component.");
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*(?:\(|=|new\b)/i.test(code)) {
    throw new Error("canvas_code cannot use fetch, XMLHttpRequest, or WebSocket. Keep data inline.");
  }
  for (const match of code.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const source = match[1];
    if (source.startsWith("data:") || source.startsWith("blob:") || !/^https?:\/\//i.test(source)) continue;
    let host: string;
    try {
      host = new URL(source).hostname;
    } catch {
      throw new Error("canvas_code contains an invalid external resource URL.");
    }
    if (!ALLOWED_RESOURCE_HOSTS.has(host)) {
      throw new Error("External canvas resources must use an approved CDN host.");
    }
  }
  if (interactive && !/(?:sendToAgent|sendWidgetEvent|sendPrompt|sendAnnotation|window\.glimpse\.send)\s*\(/.test(code)) {
    throw new Error("interactive canvases must send a result to the agent via sendToAgent / sendPrompt from @gen-ui/canvas.");
  }
}

// Vendored React 18 UMD builds inlined so canvases work offline. The UMD
// sources contain no "</script>" today, but escape defensively anyway.
const escapeScript = (js: string) => js.replace(/<\/script>/gi, "<\\/script>");
const CANVAS_REACT_SCRIPTS = `<script>${escapeScript(REACT_UMD_JS)}</script>
<script>${escapeScript(REACT_DOM_UMD_JS)}</script>`;

function shellDocument(bodyScript: string): string {
  const vars = cssVariables();
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">
<style>
${vars}
*{box-sizing:border-box}
body{margin:0;padding:1rem;font-family:var(--font-sans);background:var(--color-background-primary);color:var(--color-text-primary);}
${WIDGET_UI_KIT_CSS}
</style>
</head><body><div id="canvas-root"></div>
${CANVAS_REACT_SCRIPTS}
<script>
${THEME_VARS_SCRIPT}
${WIDGET_EVENTS_SCRIPT}
</script>
${WIDGET_UI_KIT_RESOURCES}
${bodyScript}
</body></html>`;
}

/** Empty live shell; compiled bundles are pushed via win.send(). */
export function canvasShellHTML(): string {
  return shellDocument("");
}

/** Self-contained saved document with the compiled bundle inline. */
export function canvasDocumentHTML(compiledJs: string): string {
  return shellDocument(`<script>${compiledJs.replace(/<\/script>/gi, "<\\/script>")}</script>`);
}
