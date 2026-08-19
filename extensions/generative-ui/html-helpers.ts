// ── HTML Helpers ──────────────────────────────────────────────────────────

import { execSync, spawn } from "node:child_process";
import { getGlimpseui, loadGlimpseui, preloadGlimpseui } from "./resolve-glimpseui.js";
import { SVG_STYLES, cssVariables } from "./svg-styles.js";
import { WIDGET_CSP, WIDGET_UI_KIT_CSS, WIDGET_UI_KIT_RESOURCES } from "./widget-ui-kit.js";
import { MORPHDOM_UMD_JS } from "./vendor-morphdom.js";

export { preloadGlimpseui, loadGlimpseui, getGlimpseui };

// ── Detect system appearance (cached) ─────────────────────────────────────
// Used by the gallery browser page for its initial theme; widget palettes
// follow CSS prefers-color-scheme instead.

let _cachedDarkMode: boolean | null = null;
export function detectDarkMode(): boolean {
  if (_cachedDarkMode !== null) return _cachedDarkMode;
  try {
    const theme = execSync("defaults read -g AppleInterfaceStyle 2>/dev/null", {
      encoding: "utf-8",
      timeout: 500,
    }).trim();
    _cachedDarkMode = theme === "Dark";
  } catch {
    _cachedDarkMode = false;
  }
  return _cachedDarkMode;
}

/** Injected into every widget page so Chart.js/Mermaid can read resolved theme tokens. */
export const THEME_VARS_SCRIPT = `window._themeVars = function() {
  var s = getComputedStyle(document.documentElement);
  var g = function(name) { return s.getPropertyValue(name).trim(); };
  return {
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    text: g('--color-text-primary'),
    textSecondary: g('--color-text-secondary'),
    textTertiary: g('--color-text-tertiary'),
    textInfo: g('--color-text-info'),
    textSuccess: g('--color-text-success'),
    textWarning: g('--color-text-warning'),
    textDanger: g('--color-text-danger'),
    bg: g('--color-background-primary'),
    bgSecondary: g('--color-background-secondary'),
    bgTertiary: g('--color-background-tertiary'),
    border: g('--color-border-tertiary'),
    borderSecondary: g('--color-border-secondary'),
    chartTick: g('--chart-tick'),
    chartGrid: g('--chart-grid'),
    fontSans: g('--font-sans')
  };
};`;

/** Typed feedback bridge shared by native windows and gallery iframes. */
export const WIDGET_EVENTS_SCRIPT = `(function() {
  var nativeSend = window.glimpse && typeof window.glimpse.send === 'function'
    ? window.glimpse.send.bind(window.glimpse)
    : null;
  var send = function(event) {
    if (!event || typeof event !== 'object') throw new Error('Widget event must be an object.');
    if (nativeSend) return nativeSend(event);
    if (window.parent !== window) {
      window.parent.postMessage({ __generativeUIWidgetEvent: true, event: event }, '*');
      return true;
    }
    return false;
  };
  if (!window.glimpse) window.glimpse = { send: send };
  window.sendWidgetEvent = send;
  window.sendPrompt = function(prompt) {
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Follow-up prompt is required.');
    return send({ type: 'follow_up', prompt: prompt.trim() });
  };
  window.sendAnnotation = function(targetId, comment, stateId) {
    if (typeof targetId !== 'string' || !targetId.trim()) throw new Error('Annotation targetId is required.');
    if (typeof comment !== 'string' || !comment.trim()) throw new Error('Annotation comment is required.');
    if (stateId !== undefined && (typeof stateId !== 'string' || !stateId.trim())) {
      throw new Error('Annotation stateId must be a non-empty string when provided.');
    }
    var event = { type: 'annotation', targetId: targetId.trim(), comment: comment.trim() };
    if (stateId !== undefined) event.stateId = stateId.trim();
    return send(event);
  };
})();`;

export function shellHTML(): string {
  const vars = cssVariables();
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">
<style>
${vars}
*{box-sizing:border-box}
body{margin:0;padding:1rem;font-family:var(--font-sans);background:var(--color-background-primary);color:var(--color-text-primary);}
@keyframes _fadeIn{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
${SVG_STYLES}
${WIDGET_UI_KIT_CSS}
</style>
</head><body><div id="root"></div>
${WIDGET_UI_KIT_RESOURCES}
<script>${MORPHDOM_UMD_JS}</script>
<script>
  ${THEME_VARS_SCRIPT}
  ${WIDGET_EVENTS_SCRIPT}
  window._setContent = function(html) {
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
    // Preserve type/module/onload/async/etc. Dropping type=module breaks Mermaid ESM;
    // dropping onload breaks Chart.js-style CDN init.
    document.querySelectorAll('#root script').forEach(function(old) {
      var s = document.createElement('script');
      for (var i = 0; i < old.attributes.length; i++) {
        var a = old.attributes[i];
        s.setAttribute(a.name, a.value);
      }
      if (!old.src) s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  };
</script>
</body></html>`;
}

export function wrapHTML(code: string, isSVG = false): string {
  const vars = cssVariables();
  const themeMeta = `<meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">`;
  const themeScript = `<script>${THEME_VARS_SCRIPT}\n${WIDGET_EVENTS_SCRIPT}</script>`;
  if (isSVG) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${themeMeta}<style>${vars}${SVG_STYLES}${WIDGET_UI_KIT_CSS}</style></head>
<body style="margin:0;padding:1rem;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;min-height:100vh;background:var(--color-background-primary);color:var(--color-text-primary);">
${themeScript}${WIDGET_UI_KIT_RESOURCES}${code}</body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
${themeMeta}
<style>${vars}*{box-sizing:border-box}body{margin:0;padding:1rem;font-family:var(--font-sans);background:var(--color-background-primary);color:var(--color-text-primary);}${SVG_STYLES}${WIDGET_UI_KIT_CSS}</style>
</head><body>${themeScript}${WIDGET_UI_KIT_RESOURCES}${code}</body></html>`;
}

export function escapeJS(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/<\/script>/gi, "<\\/script>");
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export function openInBrowser(filePath: string): void {
  try {
    spawn("open", [filePath], { detached: true, stdio: "ignore" }).unref();
  } catch {}
}

// Suppress macOS IMKCFRunLoop os_log noise when WKWebView windows close.
// Uses prefer-local/global glimpseui (see resolve-glimpseui.ts). Must be
// preloaded via preloadGlimpseui() at extension start.
export function openWindow(html: string, options: any): any {
  const prev = process.env.OS_ACTIVITY_MODE;
  process.env.OS_ACTIVITY_MODE = "disable";
  try {
    const { open } = getGlimpseui();
    return open(html, options);
  } finally {
    if (prev === undefined) delete process.env.OS_ACTIVITY_MODE;
    else process.env.OS_ACTIVITY_MODE = prev;
  }
}
