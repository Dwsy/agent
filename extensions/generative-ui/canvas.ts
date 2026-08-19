// ── Canvas: React component widgets ───────────────────────────────────────
// TSX source (single file, default-export component) is bundled host-side
// with esbuild into an IIFE and rendered in a React shell window. Imports are
// restricted to react, react-dom/client and the @gen-ui/canvas SDK.

import { build } from "esbuild";
import { cssVariables } from "./svg-styles.js";
import { WIDGET_CSP, WIDGET_UI_KIT_CSS, WIDGET_UI_KIT_RESOURCES } from "./widget-ui-kit.js";
import { THEME_VARS_SCRIPT, WIDGET_EVENTS_SCRIPT } from "./html-helpers.js";
import { REACT_UMD_JS, REACT_DOM_UMD_JS } from "./vendor-react.js";
import { CANVAS_SDK_SOURCE } from "./canvas-sdk-source.js";

export const CANVAS_ALLOWED_IMPORTS = ["react", "react-dom", "react-dom/client", "@gen-ui/canvas"];

// CJS shims: esbuild interop exposes module.exports as both default and named exports.
const REACT_SHIM = "module.exports = window.React;";
const REACT_DOM_SHIM = "module.exports = window.ReactDOM;";

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
        if (args.path === "@gen-ui/canvas") return { contents: CANVAS_SDK_SOURCE, loader: "js" };
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

// Safe bridge for sandboxed gallery iframes. The child never receives same-origin
// access; the gallery only proxies Canvas state and its current light/dark theme.
const CANVAS_HOST_BRIDGE_SCRIPT = `(function() {
  var FLAG = '__generativeUICanvasHost';
  var pending = Object.create(null);
  var seq = 0;
  var inHost = window.parent !== window;

  function post(message) {
    if (!inHost) return false;
    try {
      message[FLAG] = true;
      window.parent.postMessage(message, '*');
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyTheme(dark) {
    dark = !!dark;
    window.__hostDarkMode = dark;
    var vars = dark ? {
      '--color-text-primary': '#e0e0e0', '--color-text-secondary': '#a0a0a0', '--color-text-tertiary': '#707070',
      '--color-text-info': '#85B7EB', '--color-text-danger': '#F09595', '--color-text-success': '#97C459', '--color-text-warning': '#EF9F27',
      '--color-background-primary': '#1a1a1a', '--color-background-secondary': '#2a2a2a', '--color-background-tertiary': '#111111',
      '--color-background-info': '#0C447C', '--color-background-danger': '#791F1F', '--color-background-success': '#27500A', '--color-background-warning': '#633806',
      '--color-border-primary': 'rgba(255,255,255,0.4)', '--color-border-secondary': 'rgba(255,255,255,0.3)', '--color-border-tertiary': 'rgba(255,255,255,0.15)',
      '--color-border-info': '#85B7EB', '--color-border-success': '#97C459', '--color-border-danger': '#F09595', '--chart-tick': '#A0A0A0', '--chart-grid': 'rgba(255,255,255,0.08)'
    } : {
      '--color-text-primary': '#1a1a1a', '--color-text-secondary': '#5f5e5a', '--color-text-tertiary': '#888780',
      '--color-text-info': '#185FA5', '--color-text-danger': '#A32D2D', '--color-text-success': '#3B6D11', '--color-text-warning': '#854F0B',
      '--color-background-primary': '#ffffff', '--color-background-secondary': '#f1efe8', '--color-background-tertiary': '#e8e6de',
      '--color-background-info': '#E6F1FB', '--color-background-danger': '#FCEBEB', '--color-background-success': '#EAF3DE', '--color-background-warning': '#FAEEDA',
      '--color-border-primary': 'rgba(0,0,0,0.4)', '--color-border-secondary': 'rgba(0,0,0,0.3)', '--color-border-tertiary': 'rgba(0,0,0,0.15)',
      '--color-border-info': '#185FA5', '--color-border-success': '#3B6D11', '--color-border-danger': '#A32D2D', '--chart-tick': '#636366', '--chart-grid': 'rgba(0,0,0,0.06)'
    };
    var root = document.documentElement;
    root.style.colorScheme = dark ? 'dark' : 'light';
    Object.keys(vars).forEach(function(name) { root.style.setProperty(name, vars[name]); });
    if (document.body) {
      document.body.style.background = vars['--color-background-primary'];
      document.body.style.color = vars['--color-text-primary'];
    }
    try { window.dispatchEvent(new Event('gen-ui-canvas-theme-change')); } catch (_) {}
  }

  window.__canvasHostBridge = {
    isAvailable: function() { return inHost; },
    requestState: function(key) {
      if (!inHost) return Promise.resolve({ found: false });
      return new Promise(function(resolve) {
        var requestId = 'state-' + (++seq) + '-' + Date.now().toString(36);
        pending[requestId] = resolve;
        if (!post({ type: 'state-get', requestId: requestId, key: String(key) })) {
          delete pending[requestId];
          resolve({ found: false });
          return;
        }
        setTimeout(function() {
          if (!pending[requestId]) return;
          delete pending[requestId];
          resolve({ found: false });
        }, 1500);
      });
    },
    setState: function(key, value) {
      return post({ type: 'state-set', key: String(key), value: value });
    }
  };

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data[FLAG] !== true) return;
    if (data.type === 'theme' && typeof data.dark === 'boolean') {
      applyTheme(data.dark);
      return;
    }
    if (data.type === 'state-value' && typeof data.requestId === 'string') {
      var resolve = pending[data.requestId];
      if (!resolve) return;
      delete pending[data.requestId];
      resolve({ found: data.found === true, value: data.value });
    }
  });

  if (inHost) post({ type: 'ready' });
})();`;

function shellDocument(bodyScript: string, canvasId?: string, groundingFooter = ""): string {
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
</head><body><div id="canvas-root"></div><div id="genui-grounding">${groundingFooter}</div>
${CANVAS_REACT_SCRIPTS}
<script>
${THEME_VARS_SCRIPT}
${WIDGET_EVENTS_SCRIPT}
${canvasId ? `window.__canvasId = ${JSON.stringify(canvasId)};` : ""}
${CANVAS_HOST_BRIDGE_SCRIPT}
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
export function canvasDocumentHTML(compiledJs: string, canvasId?: string, groundingFooter = ""): string {
  return shellDocument(`<script>${compiledJs.replace(/<\/script>/gi, "<\\/script>")}</script>`, canvasId, groundingFooter);
}
