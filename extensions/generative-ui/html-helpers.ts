// ── HTML Helpers ──────────────────────────────────────────────────────────

import { execSync, spawn } from "node:child_process";
import { open } from "glimpseui";
import { SVG_STYLES, cssVariables } from "./svg-styles.js";

// ── Detect system appearance (cached) ─────────────────────────────────────

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

export function shellHTML(darkMode = true): string {
  const vars = cssVariables(darkMode);
  const bg = darkMode ? '#1a1a1a' : '#ffffff';
  const fg = darkMode ? '#e0e0e0' : '#1a1a1a';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
${vars}
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

export function wrapHTML(code: string, isSVG = false, darkMode = true): string {
  const vars = cssVariables(darkMode);
  const bg = darkMode ? '#1a1a1a' : '#ffffff';
  const fg = darkMode ? '#e0e0e0' : '#1a1a1a';
  if (isSVG) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${vars}${SVG_STYLES}</style></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${bg};color:${fg};">
${code}</body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>${vars}*{box-sizing:border-box}body{margin:0;padding:1rem;font-family:system-ui,-apple-system,sans-serif;background:${bg};color:${fg};${SVG_STYLES}</style>
</head><body>${code}</body></html>`;
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

// Suppress macOS IMKCFRunLoop os_log noise when WKWebView windows close
export function openWindow(html: string, options: any): any {
  const prev = process.env.OS_ACTIVITY_MODE;
  process.env.OS_ACTIVITY_MODE = "disable";
  try {
    return open(html, options);
  } finally {
    if (prev === undefined) delete process.env.OS_ACTIVITY_MODE;
    else process.env.OS_ACTIVITY_MODE = prev;
  }
}
