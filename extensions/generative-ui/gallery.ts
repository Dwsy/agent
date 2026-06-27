// ── Widget Gallery Server ─────────────────────────────────────────────────

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { WidgetRecord } from "./storage.js";
import {
  deleteWidgets,
  loadWidgetHtml,
  loadWidgetIndex,
  renameWidgetTitle,
  setWidgetsArchived,
  WIDGETS_DIR,
} from "./storage.js";
import { detectDarkMode, openInBrowser } from "./html-helpers.js";

const LOCK_FILE = join(WIDGETS_DIR, ".gallery-lock");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function safeFileSegment(value: string): string | null {
  const decoded = decodeURIComponent(value);
  if (!decoded || decoded.includes("/") || decoded.includes("\\")) return null;
  return decoded;
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function buildCard(w: WidgetRecord, i: number): string {
  const archived = Boolean(w.archivedAt);
  const meta = w.width + "\u00d7" + w.height + " \u00b7 " + w.timestamp + (w.cwd ? " \u00b7 " + w.cwd.split("/").pop() : "");
  const cwdAttr = w.cwd ? ' data-cwd="' + escapeHtml(w.cwd) + '"' : "";
  const archiveAction = archived
    ? '<button class="card-action" data-action="restore" title="Restore"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg></button>'
    : '<button class="card-action" data-action="archive" title="Archive"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg></button>';

  return '<div class="card' + (archived ? ' archived' : '') + '" data-idx="' + i + '" data-file="' + escapeHtml(w.file) + '"' + cwdAttr + ' data-archived="' + (archived ? "1" : "0") + '">'
    + '<label class="select-box" title="Select"><input type="checkbox" data-select-file="' + escapeHtml(w.file) + '"><span></span></label>'
    + '<div class="card-preview" data-src="/widget/' + encodeURIComponent(w.file) + '">'
    + '<div class="skeleton"></div>'
    + '<div class="preview-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div>'
    + '<div class="card-actions">'
    + '<button class="card-action" data-action="open" title="Open in new window"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg></button>'
    + '<button class="card-action" data-action="copy" title="Copy link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>'
    + '<button class="card-action" data-action="rename" title="Rename"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>'
    + archiveAction
    + '</div></div>'
    + '<div class="card-info"><div class="card-title">' + escapeHtml(w.title) + '</div>'
    + '<div class="card-meta">' + escapeHtml(meta) + '</div></div></div>';
}

async function buildGalleryHTML(projectCwd?: string): Promise<string> {
  const dark = detectDarkMode();
  const sorted = (await loadWidgetIndex()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const effectiveProjectCwd = projectCwd || sorted.find((w) => !w.archivedAt)?.cwd || sorted[0]?.cwd || "";
  const cards = sorted.map((w, i) => buildCard(w, i)).join("\n");
  const activeCount = sorted.filter((w) => !w.archivedAt).length;
  const archivedCount = sorted.length - activeCount;

  const pathSeen: Record<string, boolean> = {};
  let pathOptions = "";
  for (const w of sorted) {
    if (w.cwd && !pathSeen[w.cwd]) {
      pathSeen[w.cwd] = true;
      pathOptions += '<option value="' + escapeHtml(w.cwd) + '">' + escapeHtml(w.cwd.split("/").pop() || w.cwd) + '</option>';
    }
  }

  const widgetsJSON = safeJsonForScript(sorted);
  const projectCwdJSON = safeJsonForScript(effectiveProjectCwd);

  const css = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f8f8f8;--card-bg:#fff;--border:#e0e0e0;--text:#1a1a1a;--muted:#666;--accent:#185FA5;--accent-bg:#E6F1FB;--accent-glow:#185FA540;--hover-bg:#f0f0f0;--modal-bg:rgba(255,255,255,.92);--code-bg:#fafafa;--skeleton-base:#eee;--shadow:rgba(0,0,0,.12);--danger:#b42318;--danger-bg:#fee4e2}
[data-theme="dark"]{--bg:#0f0f0f;--card-bg:#1a1a1a;--border:#2a2a2a;--text:#e0e0e0;--muted:#888;--accent:#85B7EB;--accent-bg:#0C447C;--accent-glow:#85B7EB40;--hover-bg:#222;--modal-bg:rgba(0,0,0,.85);--code-bg:#111;--skeleton-base:#1e1e1e;--shadow:rgba(0,0,0,.3);--danger:#ffb4ab;--danger-bg:#4b1513}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;min-height:100vh;overflow-x:hidden;transition:background .3s,color .3s}
button,input,select{font:inherit}
.sticky-header{position:sticky;top:0;z-index:100;background:var(--bg);border-bottom:1px solid var(--border)}
.header{padding:2rem 2rem 1rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.header h1{font-size:1.5rem;font-weight:600}
.count{background:var(--accent-bg);color:var(--accent);padding:2px 10px;border-radius:12px;font-size:.8rem}
.archive-count{color:var(--muted);font-size:.8rem}
.toolbar{padding:0 2rem 1rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap}
.search-wrap{position:relative;display:flex;align-items:center;gap:.5rem;flex:1;min-width:220px;max-width:420px}
.search-icon{position:absolute;left:12px;color:var(--muted);pointer-events:none;display:flex;align-items:center}
.search{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:8px 14px 8px 36px;color:var(--text);font-size:.9rem;width:100%;outline:none;transition:border-color .2s,box-shadow .2s}
.search:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-bg)}
.search-hint{color:var(--muted);font-size:.7rem;white-space:nowrap;opacity:.6}
.filter-btn,.bulk-btn{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:6px 12px;color:var(--muted);cursor:pointer;font-size:.8rem;transition:.15s;display:inline-flex;align-items:center;gap:5px}
.filter-btn.active{background:var(--accent-bg);color:var(--accent);border-color:var(--accent)}
.filter-btn:hover,.bulk-btn:hover{border-color:var(--accent);color:var(--accent)}
.bulk-btn.danger{color:var(--danger)}
.bulk-btn.danger:hover{border-color:var(--danger);background:var(--danger-bg)}
.path-filter{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text);font-size:.8rem;outline:none;cursor:pointer;max-width:220px}
.col-ctrl{display:flex;align-items:center;gap:4px;margin-left:auto}
.col-ctrl-label{color:var(--muted);font-size:.75rem;white-space:nowrap}
.col-btn{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem;transition:.15s;line-height:1}
.col-btn:hover{border-color:var(--accent);color:var(--accent)}
.col-val{color:var(--text);font-size:.85rem;min-width:34px;text-align:center;font-weight:600}
.bulkbar{display:none;align-items:center;gap:.5rem;padding:0 2rem 1rem;color:var(--muted);font-size:.85rem;flex-wrap:wrap}
.bulkbar.active{display:flex}
.grid{position:relative;padding:0 2rem 2rem}
.card{background:var(--card-bg);border:1px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;position:absolute;transition:left .4s cubic-bezier(.4,0,.2,1),top .4s cubic-bezier(.4,0,.2,1),border-color .3s,box-shadow .3s,transform .3s,opacity .2s}
.card.archived{opacity:.72}
.card:hover{border-color:var(--accent);transform:scale(1.02);box-shadow:0 12px 32px rgba(0,0,0,.2),0 0 0 1px var(--accent-glow);z-index:2}
.select-box{position:absolute;top:9px;left:9px;z-index:3;width:26px;height:26px;cursor:pointer}
.select-box input{position:absolute;opacity:0}
.select-box span{display:block;width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);box-shadow:0 2px 8px var(--shadow)}
.select-box input:checked+span{background:var(--accent);border-color:var(--accent)}
.select-box input:checked+span::after{content:"";position:absolute;left:8px;top:5px;width:7px;height:12px;border:solid white;border-width:0 2px 2px 0;transform:rotate(45deg)}
.card-preview{overflow:hidden;position:relative;background:var(--code-bg);height:var(--ph,200px)}
.card-preview iframe{border:none;transform-origin:top left;pointer-events:none;opacity:0;transition:opacity .4s ease}
.card-preview iframe.loaded{opacity:1}
.card-preview iframe.loaded~.preview-placeholder{display:none}
.preview-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);background:var(--code-bg)}
.skeleton{position:absolute;inset:0;background:var(--skeleton-base);opacity:1;transition:opacity .3s;z-index:1}
.card-preview iframe.loaded~.skeleton{opacity:0;pointer-events:none}
.card-actions{position:absolute;top:8px;right:8px;display:flex;gap:4px;opacity:0;transform:translateY(-4px);transition:all .2s;z-index:2}
.card:hover .card-actions{opacity:1;transform:translateY(0)}
.card-action{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;backdrop-filter:blur(8px)}
.card-action:hover{background:var(--accent-bg);color:var(--accent);border-color:var(--accent)}
.card-info{padding:12px 16px}
.card-title{font-weight:600;font-size:.95rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-meta{color:var(--muted);font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.modal-overlay{position:fixed;inset:0;background:var(--modal-bg);z-index:1000;backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s ease}
.modal-overlay.open{opacity:1;pointer-events:auto}
.modal{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;width:90vw;height:85vh;min-width:400px;min-height:300px;max-width:95vw;max-height:95vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.3);position:relative;transform:scale(.92);transition:transform .25s cubic-bezier(.4,0,.2,1)}
.modal-overlay.open .modal{transform:scale(1)}
.modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);user-select:none}
.modal-header h2{font-size:1.1rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;margin-right:12px}
.modal-actions{display:flex;gap:8px;flex-shrink:0}
.modal-actions button{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:6px 12px;color:var(--text);cursor:pointer;font-size:.8rem;transition:.15s;display:flex;align-items:center;gap:4px}
.modal-actions button:hover{background:var(--accent-bg);color:var(--accent);border-color:var(--accent)}
.modal-tabs{display:flex;border-bottom:1px solid var(--border)}
.modal-tab{padding:10px 20px;cursor:pointer;color:var(--muted);font-size:.85rem;border-bottom:2px solid transparent;transition:.15s}
.modal-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.modal-body{flex:1;overflow:hidden;position:relative}
.modal-body iframe{width:100%;height:100%;border:none;transform:none!important;opacity:1!important;pointer-events:auto!important;position:relative!important;left:auto!important;top:auto!important}
.modal-body.show-source iframe{display:none}
.modal-body pre{width:100%;height:100%;overflow:auto;padding:16px;margin:0;font-size:.8rem;line-height:1.6;font-family:ui-monospace,monospace;background:var(--code-bg);color:var(--text)}
.modal-nav{position:absolute;top:50%;width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--card-bg);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;z-index:10;backdrop-filter:blur(8px)}
.modal-nav:hover{background:var(--accent-bg);color:var(--accent);border-color:var(--accent)}
.modal-nav.prev{left:-48px;transform:translateY(-50%)}
.modal-nav.next{right:-48px;transform:translateY(-50%)}
.resize-handle{position:absolute;bottom:0;right:0;width:20px;height:20px;cursor:nwse-resize;z-index:10}
.resize-handle::before{content:"";position:absolute;bottom:4px;right:4px;width:10px;height:10px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);opacity:.5}
.close-btn{background:none!important;border:none!important;color:var(--muted)!important;padding:4px 8px!important}
.close-btn:hover{background:var(--hover-bg)!important;color:var(--text)!important}
.empty{text-align:center;padding:4rem 2rem;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:1rem}
.empty svg{opacity:.35}
.toast{position:fixed;bottom:2rem;left:50%;transform:translateX(-50%) translateY(100px);background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:10px 20px;color:var(--text);font-size:.85rem;box-shadow:0 8px 24px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.4,0,.2,1);z-index:2000;pointer-events:none}
.toast.show{transform:translateX(-50%) translateY(0)}
#theme-toggle{position:relative;color:var(--accent)}
#theme-icon-light{display:none}
[data-theme="dark"] #theme-icon-dark{display:none}
[data-theme="dark"] #theme-icon-light{display:block}
@media(max-width:768px){.header{padding:1.5rem 1rem .5rem}.toolbar,.bulkbar{padding-left:1rem;padding-right:1rem}.toolbar{flex-direction:column;align-items:stretch}.search-wrap{max-width:none}.search-hint{display:none}.grid{padding:0 1rem 1rem}.modal{width:100vw!important;height:100vh!important;border-radius:0;min-width:0;min-height:0;max-width:100vw;max-height:100vh}.modal-nav{display:none}.card-actions{opacity:1;transform:none}.col-ctrl{margin-left:0}}
@media(max-width:480px){.grid{padding:0 .5rem}.modal-header{padding:12px 16px}.modal-actions .btn-label{display:none}}
`;

  const js = `
var widgets = ${widgetsJSON};
var currentFile = "";
var currentScope = "all";
var currentArchiveView = "active";
var currentPath = "";
var userCols = 0;
var selectedFiles = new Set();
var sourceCache = {};
var sourceKeys = [];
var projectCwd = ${projectCwdJSON};
var previewObserver = null;
var loadQueue = [];
var activeLoads = 0;
var MAX_CONCURRENT = 6;
var GRID_GAP = 19;
var MIN_CARD_W = 300;
var teleportedIframe = null;
var teleportedFrom = null;
var teleportedOrigStyle = {};

function showToast(msg) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove("show"); }, 2000);
}

function getWidgetByFile(file) {
  return widgets.filter(function(w) { return w.file === file; })[0] || null;
}

function cacheSource(file, html) {
  if (!sourceCache[file]) sourceKeys.push(file);
  sourceCache[file] = html;
  while (sourceKeys.length > 20) {
    var old = sourceKeys.shift();
    delete sourceCache[old];
  }
}

function createPreviewIframe(card) {
  var preview = card.querySelector(".card-preview");
  if (!preview || preview.querySelector("iframe")) return;
  var w = getWidgetByFile(card.dataset.file);
  if (!w) return;
  var iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("allow", "unload");
  iframe.dataset.src = preview.dataset.src;
  var colW = parseFloat(card.style.width) || preview.clientWidth || w.width;
  var scale = colW / w.width;
  iframe.style.width = w.width + "px";
  iframe.style.height = w.height + "px";
  iframe.style.transform = "scale(" + scale + ")";
  iframe.onload = function() {
    iframe.classList.add("loaded");
    activeLoads--;
    processQueue();
  };
  iframe.onerror = function() {
    activeLoads--;
    processQueue();
  };
  preview.insertBefore(iframe, preview.firstChild);
  activeLoads++;
  iframe.src = iframe.dataset.src;
}

function destroyPreviewIframe(card) {
  if (currentFile && card.dataset.file === currentFile) return;
  var iframe = card.querySelector(".card-preview iframe");
  if (!iframe) return;
  iframe.onload = null;
  iframe.onerror = null;
  iframe.src = "about:blank";
  iframe.remove();
}

function processQueue() {
  while (activeLoads < MAX_CONCURRENT && loadQueue.length) {
    var card = loadQueue.shift();
    if (!card || card.style.display === "none") continue;
    if (card.querySelector(".card-preview iframe")) continue;
    createPreviewIframe(card);
  }
}

function observeCards() {
  if (previewObserver) previewObserver.disconnect();
  loadQueue = [];
  previewObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      var card = entry.target;
      if (entry.isIntersecting) {
        clearTimeout(card._unloadTimer);
        if (!card.querySelector(".card-preview iframe")) {
          loadQueue.push(card);
          processQueue();
        }
      } else {
        clearTimeout(card._unloadTimer);
        card._unloadTimer = setTimeout(function() { destroyPreviewIframe(card); }, 900);
      }
    });
  }, { rootMargin: "900px 0px" });
  document.querySelectorAll(".card").forEach(function(card) { previewObserver.observe(card); });
}

function layoutMasonry(instant) {
  var grid = document.getElementById("grid");
  var cs = getComputedStyle(grid);
  var padL = parseFloat(cs.paddingLeft) || 0;
  var padR = parseFloat(cs.paddingRight) || 0;
  var gridW = grid.offsetWidth - padL - padR;
  var cols = userCols > 0 ? userCols : Math.max(1, Math.floor((gridW + GRID_GAP) / (MIN_CARD_W + GRID_GAP)));
  var colW = (gridW - (cols - 1) * GRID_GAP) / cols;
  var colH = [];
  for (var i = 0; i < cols; i++) colH.push(0);
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  cards.forEach(function(card) {
    if (card.style.display === "none") return;
    var w = getWidgetByFile(card.dataset.file);
    if (!w) return;
    if (instant) card.style.transition = "none";
    var minC = 0;
    for (var c = 1; c < cols; c++) if (colH[c] < colH[minC]) minC = c;
    var ph = Math.round(colW * (w.height / w.width));
    ph = Math.max(80, Math.min(ph, 420));
    card.style.width = colW + "px";
    card.querySelector(".card-preview").style.setProperty("--ph", ph + "px");
    var iframe = card.querySelector("iframe");
    if (iframe) {
      var scale = colW / w.width;
      iframe.style.width = w.width + "px";
      iframe.style.height = w.height + "px";
      iframe.style.transform = "scale(" + scale + ")";
    }
    card.style.left = minC * (colW + GRID_GAP) + "px";
    card.style.top = colH[minC] + "px";
    colH[minC] += card.offsetHeight + GRID_GAP;
  });
  grid.style.height = Math.max.apply(null, colH.concat([0])) + "px";
  if (instant) {
    grid.offsetHeight;
    cards.forEach(function(card) { card.style.transition = ""; });
  }
}

function updateBulkbar() {
  var bar = document.getElementById("bulkbar");
  var count = selectedFiles.size;
  bar.classList.toggle("active", count > 0);
  document.getElementById("selected-count").textContent = count + " selected";
}

function clearSelection() {
  selectedFiles.clear();
  document.querySelectorAll("[data-select-file]").forEach(function(cb) { cb.checked = false; });
  updateBulkbar();
}

function filterCards() {
  var q = document.getElementById("search").value.toLowerCase();
  var visible = 0;
  document.querySelectorAll(".card").forEach(function(c) {
    var w = getWidgetByFile(c.dataset.file);
    if (!w) return;
    var archived = Boolean(w.archivedAt);
    var matchArchive = currentArchiveView === "all" || (currentArchiveView === "active" && !archived) || (currentArchiveView === "archived" && archived);
    var matchSearch = !q || w.title.toLowerCase().indexOf(q) !== -1 || w.file.toLowerCase().indexOf(q) !== -1;
    var matchScope = currentScope === "all" || (currentScope === "project" && w.cwd && w.cwd === projectCwd);
    var matchPath = !currentPath || (w.cwd && w.cwd === currentPath);
    var show = matchArchive && matchSearch && matchScope && matchPath;
    c.style.display = show ? "" : "none";
    if (!show) destroyPreviewIframe(c);
    if (show) visible++;
  });
  document.getElementById("empty-msg").style.display = visible === 0 ? "" : "none";
  document.getElementById("grid").style.display = visible === 0 ? "none" : "";
  document.querySelector(".count").textContent = visible + " widget" + (visible !== 1 ? "s" : "");
  layoutMasonry(false);
  if (previewObserver) observeCards();
}

async function api(path, body) {
  var res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  var data = await res.json().catch(function() { return {}; });
  if (!res.ok || data.ok === false) throw new Error(data.error || "Request failed");
  return data;
}

async function renameFile(file) {
  var w = getWidgetByFile(file);
  if (!w) return;
  var title = prompt("Rename widget", w.title);
  if (title === null) return;
  title = title.trim();
  if (!title) { showToast("Title cannot be empty"); return; }
  await fetch("/api/widgets/" + encodeURIComponent(file), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title })
  }).then(async function(res) {
    var data = await res.json().catch(function() { return {}; });
    if (!res.ok || data.ok === false) throw new Error(data.error || "Rename failed");
  });
  location.reload();
}

async function archiveFiles(files, archived) {
  if (!files.length) return;
  await api("/api/widgets/archive", { files: files, archived: archived });
  location.reload();
}

async function deleteFiles(files) {
  if (!files.length) return;
  if (!confirm("Delete " + files.length + " widget" + (files.length !== 1 ? "s" : "") + "? This removes the saved HTML files.")) return;
  await api("/api/widgets/delete", { files: files });
  location.reload();
}

function openModal(w) {
  if (teleportedIframe) returnIframe();
  currentFile = w.file;
  document.getElementById("modal-title").textContent = w.title + "  " + w.width + "\\u00d7" + w.height;
  var archiveBtn = document.getElementById("btn-archive");
  archiveBtn.textContent = w.archivedAt ? "Restore" : "Archive";
  archiveBtn.dataset.archived = w.archivedAt ? "1" : "0";
  var card = Array.prototype.slice.call(document.querySelectorAll(".card")).filter(function(c) { return c.dataset.file === w.file; })[0];
  var iframe = card ? card.querySelector("iframe") : null;
  if (iframe) {
    teleportedOrigStyle = {
      width: iframe.style.width,
      height: iframe.style.height,
      transform: iframe.style.transform,
      position: iframe.style.position,
      left: iframe.style.left,
      top: iframe.style.top
    };
    teleportedIframe = iframe;
    teleportedFrom = card;
    document.getElementById("modal-body").insertBefore(iframe, document.getElementById("source-code"));
  } else {
    iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("allow", "unload");
    iframe.src = "/widget/" + encodeURIComponent(w.file);
    iframe.style.cssText = "width:100%;height:100%;border:none";
    document.getElementById("modal-body").insertBefore(iframe, document.getElementById("source-code"));
    teleportedIframe = iframe;
    teleportedFrom = null;
  }
  var modal = document.getElementById("modal");
  modal.style.width = Math.min(Math.max(w.width + 40, 500), window.innerWidth * .95) + "px";
  modal.style.height = Math.min(Math.max(w.height + 120, 400), window.innerHeight * .95) + "px";
  var srcEl = document.getElementById("source-code");
  if (sourceCache[w.file]) {
    srcEl.textContent = sourceCache[w.file];
    if (window.hljs) hljs.highlightElement(srcEl);
  } else {
    fetch("/api/html/" + encodeURIComponent(w.file)).then(function(r) { return r.text(); }).then(function(html) {
      cacheSource(w.file, html);
      srcEl.textContent = html;
      if (window.hljs) hljs.highlightElement(srcEl);
    });
  }
  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
  setTab("preview");
}

function returnIframe() {
  if (!teleportedIframe) return;
  if (teleportedFrom && teleportedFrom.style.display !== "none") {
    var preview = teleportedFrom.querySelector(".card-preview");
    if (preview) preview.insertBefore(teleportedIframe, preview.firstChild);
    teleportedIframe.style.width = teleportedOrigStyle.width || "";
    teleportedIframe.style.height = teleportedOrigStyle.height || "";
    teleportedIframe.style.transform = teleportedOrigStyle.transform || "";
    teleportedIframe.style.position = teleportedOrigStyle.position || "";
    teleportedIframe.style.left = teleportedOrigStyle.left || "";
    teleportedIframe.style.top = teleportedOrigStyle.top || "";
  } else {
    teleportedIframe.onload = null;
    teleportedIframe.onerror = null;
    teleportedIframe.src = "about:blank";
    teleportedIframe.remove();
  }
  teleportedIframe = null;
  teleportedFrom = null;
  teleportedOrigStyle = {};
}

function closeModal() {
  returnIframe();
  currentFile = "";
  document.getElementById("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
  document.getElementById("modal").style.width = "";
  document.getElementById("modal").style.height = "";
  document.getElementById("modal-body").classList.remove("show-source");
}

function getVisibleCards() {
  return Array.prototype.slice.call(document.querySelectorAll(".card")).filter(function(c) { return c.style.display !== "none"; });
}

function navigateModal(dir) {
  var cards = getVisibleCards();
  if (!cards.length) return;
  var idx = cards.findIndex(function(c) { return c.dataset.file === currentFile; });
  if (idx < 0) idx = dir > 0 ? -1 : cards.length;
  var next = (idx + dir + cards.length) % cards.length;
  var w = getWidgetByFile(cards[next].dataset.file);
  closeModal();
  if (w) openModal(w);
}

function setTab(name) {
  document.querySelectorAll(".modal-tab").forEach(function(t) { t.classList.toggle("active", t.dataset.tab === name); });
  document.getElementById("modal-body").classList.toggle("show-source", name === "source");
  document.getElementById("source-code").style.display = name === "source" ? "" : "none";
  if (name === "source" && window.hljs) hljs.highlightElement(document.getElementById("source-code"));
}

document.getElementById("search").addEventListener("input", function() { setTimeout(filterCards, 0); });
document.querySelectorAll("[data-scope]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll("[data-scope]").forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    currentScope = btn.dataset.scope;
    filterCards();
  });
});
document.querySelectorAll("[data-archive-view]").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll("[data-archive-view]").forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    currentArchiveView = btn.dataset.archiveView;
    clearSelection();
    filterCards();
  });
});
document.getElementById("path-filter").addEventListener("change", function() { currentPath = this.value; filterCards(); });
document.getElementById("col-minus").addEventListener("click", function() {
  if (userCols <= 0) userCols = Math.max(1, Math.floor((document.getElementById("grid").clientWidth + GRID_GAP) / (MIN_CARD_W + GRID_GAP)));
  userCols = Math.max(1, userCols - 1);
  document.getElementById("col-val").textContent = userCols;
  layoutMasonry(false);
});
document.getElementById("col-plus").addEventListener("click", function() {
  if (userCols <= 0) userCols = Math.max(1, Math.floor((document.getElementById("grid").clientWidth + GRID_GAP) / (MIN_CARD_W + GRID_GAP)));
  userCols = Math.min(8, userCols + 1);
  document.getElementById("col-val").textContent = userCols;
  layoutMasonry(false);
});
document.getElementById("theme-toggle").addEventListener("click", function() {
  var next = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  localStorage.setItem("gallery-theme", next);
  var link = document.getElementById("hljs-theme");
  if (link) link.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/" + (next === "dark" ? "github-dark" : "github") + ".min.css";
});
var savedTheme = localStorage.getItem("gallery-theme");
if (savedTheme) document.body.setAttribute("data-theme", savedTheme);

document.getElementById("grid").addEventListener("change", function(e) {
  var cb = e.target.closest("[data-select-file]");
  if (!cb) return;
  if (cb.checked) selectedFiles.add(cb.dataset.selectFile);
  else selectedFiles.delete(cb.dataset.selectFile);
  updateBulkbar();
});
document.getElementById("grid").addEventListener("click", function(e) {
  var action = e.target.closest("[data-action]");
  if (action) {
    e.stopPropagation();
    var card = action.closest(".card");
    var file = card.dataset.file;
    if (action.dataset.action === "open") window.open("/widget/" + encodeURIComponent(file), "_blank");
    else if (action.dataset.action === "copy") navigator.clipboard.writeText(window.location.origin + "/widget/" + encodeURIComponent(file)).then(function() { showToast("Link copied"); });
    else if (action.dataset.action === "rename") renameFile(file).catch(function(err) { showToast(err.message); });
    else if (action.dataset.action === "archive") archiveFiles([file], true).catch(function(err) { showToast(err.message); });
    else if (action.dataset.action === "restore") archiveFiles([file], false).catch(function(err) { showToast(err.message); });
    return;
  }
  if (e.target.closest(".select-box")) return;
  var card = e.target.closest(".card");
  if (!card) return;
  var w = getWidgetByFile(card.dataset.file);
  if (w) openModal(w);
});

document.getElementById("bulk-clear").addEventListener("click", clearSelection);
document.getElementById("bulk-select-visible").addEventListener("click", function() {
  document.querySelectorAll(".card").forEach(function(card) {
    if (card.style.display === "none") return;
    selectedFiles.add(card.dataset.file);
    var cb = card.querySelector("[data-select-file]");
    if (cb) cb.checked = true;
  });
  updateBulkbar();
});
document.getElementById("bulk-archive").addEventListener("click", function() { archiveFiles(Array.from(selectedFiles), true).catch(function(err) { showToast(err.message); }); });
document.getElementById("bulk-restore").addEventListener("click", function() { archiveFiles(Array.from(selectedFiles), false).catch(function(err) { showToast(err.message); }); });
document.getElementById("bulk-delete").addEventListener("click", function() { deleteFiles(Array.from(selectedFiles)).catch(function(err) { showToast(err.message); }); });

document.getElementById("btn-open").addEventListener("click", function() { if (currentFile) window.open("/widget/" + encodeURIComponent(currentFile), "_blank"); });
document.getElementById("btn-copy").addEventListener("click", function() {
  var raw = sourceCache[currentFile] || document.getElementById("source-code").textContent;
  if (raw) navigator.clipboard.writeText(raw).then(function() { showToast("HTML copied"); });
});
document.getElementById("btn-rename").addEventListener("click", function() { if (currentFile) renameFile(currentFile).catch(function(err) { showToast(err.message); }); });
document.getElementById("btn-archive").addEventListener("click", function() {
  if (!currentFile) return;
  archiveFiles([currentFile], this.dataset.archived !== "1").catch(function(err) { showToast(err.message); });
});
document.getElementById("btn-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", function(e) { if (e.target === e.currentTarget) closeModal(); });
document.getElementById("nav-prev").addEventListener("click", function() { navigateModal(-1); });
document.getElementById("nav-next").addEventListener("click", function() { navigateModal(1); });
document.querySelectorAll(".modal-tab").forEach(function(tab) { tab.addEventListener("click", function() { setTab(tab.dataset.tab); }); });

document.addEventListener("keydown", function(e) {
  if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
    e.preventDefault();
    document.getElementById("search").focus();
    return;
  }
  if (e.key === "Escape" && document.getElementById("modal-overlay").classList.contains("open")) closeModal();
  if (e.key === "ArrowLeft" && document.getElementById("modal-overlay").classList.contains("open")) navigateModal(-1);
  if (e.key === "ArrowRight" && document.getElementById("modal-overlay").classList.contains("open")) navigateModal(1);
});

(function() {
  var handle = document.getElementById("resize-handle");
  var modal = document.getElementById("modal");
  var startX, startY, startW, startH;
  handle.addEventListener("mousedown", function(e) {
    e.preventDefault();
    startX = e.clientX; startY = e.clientY;
    startW = modal.offsetWidth; startH = modal.offsetHeight;
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", onUp);
  });
  function onDrag(e) {
    modal.style.width = Math.min(Math.max(startW + e.clientX - startX, 400), window.innerWidth * .95) + "px";
    modal.style.height = Math.min(Math.max(startH + e.clientY - startY, 300), window.innerHeight * .95) + "px";
  }
  function onUp() {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", onUp);
  }
})();

var resizeTimer;
new ResizeObserver(function() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function() { layoutMasonry(true); }, 100);
}).observe(document.getElementById("grid"));

layoutMasonry(true);
filterCards();
observeCards();
`;

  const emptyStateSVG = '<svg width="120" height="120" viewBox="0 0 120 120" fill="none"><rect x="10" y="10" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/><rect x="70" y="10" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/><rect x="10" y="70" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/><rect x="70" y="70" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/><circle cx="60" cy="60" r="20" stroke="currentColor" stroke-width="2"/><path d="M74 74L88 88" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  const searchSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<title>Widget Gallery</title>\n'
    + '<link id="hljs-theme" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/' + (dark ? "github-dark" : "github") + '.min.css">\n'
    + '<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>\n'
    + '<style>\n' + css + '\n</style>\n</head>\n<body data-theme="' + (dark ? "dark" : "light") + '">\n'
    + '<div class="sticky-header"><div class="header"><h1><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/></svg> Widget Gallery</h1><span class="count">' + activeCount + ' widget' + (activeCount !== 1 ? "s" : "") + '</span><span class="archive-count">' + archivedCount + ' archived</span></div>\n'
    + '<div class="toolbar"><div class="search-wrap"><span class="search-icon">' + searchSVG + '</span><input class="search" id="search" placeholder="Search widgets..." autofocus><span class="search-hint">/ to focus</span></div>\n'
    + '<button class="filter-btn active" data-archive-view="active">Active</button><button class="filter-btn" data-archive-view="archived">Archived</button><button class="filter-btn" data-archive-view="all">All</button>\n'
    + '<button class="filter-btn active" data-scope="all">All paths</button><button class="filter-btn" data-scope="project">Project</button><select class="path-filter" id="path-filter"><option value="">All Paths</option>' + pathOptions + '</select>\n'
    + '<div class="col-ctrl"><span class="col-ctrl-label">Cols</span><button class="col-btn" id="col-minus">-</button><span class="col-val" id="col-val">Auto</span><button class="col-btn" id="col-plus">+</button><button class="col-btn" id="theme-toggle" title="Toggle dark/light mode"><svg id="theme-icon-dark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><svg id="theme-icon-light" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button></div></div>\n'
    + '<div class="bulkbar" id="bulkbar"><strong id="selected-count">0 selected</strong><button class="bulk-btn" id="bulk-select-visible">Select visible</button><button class="bulk-btn" id="bulk-clear">Clear</button><button class="bulk-btn" id="bulk-archive">Archive</button><button class="bulk-btn" id="bulk-restore">Restore</button><button class="bulk-btn danger" id="bulk-delete">Delete</button></div></div>\n'
    + '<div class="grid" id="grid">' + cards + '</div><div class="empty" id="empty-msg" style="' + (activeCount ? "display:none" : "") + '">' + emptyStateSVG + '<p>No widgets in this view.</p></div>\n'
    + '<div class="modal-overlay" id="modal-overlay"><div class="modal" id="modal"><div class="modal-header"><h2 id="modal-title"></h2><div class="modal-actions"><button id="btn-open"><span class="btn-label">Open</span></button><button id="btn-copy"><span class="btn-label">Copy</span></button><button id="btn-rename"><span class="btn-label">Rename</span></button><button id="btn-archive"><span class="btn-label">Archive</span></button><button class="close-btn" id="btn-close">x</button></div></div><div class="modal-tabs"><div class="modal-tab active" data-tab="preview">Preview</div><div class="modal-tab" data-tab="source">Source</div></div><div class="modal-body" id="modal-body"><pre id="source-code" style="display:none"><code class="language-html"></code></pre></div><button class="modal-nav prev" id="nav-prev" title="Previous">‹</button><button class="modal-nav next" id="nav-next" title="Next">›</button><div class="resize-handle" id="resize-handle"></div></div></div>\n'
    + '<div class="toast" id="toast"></div>\n<script>\n' + js + '\n</script>\n</body>\n</html>';
}

function injectSandboxCompat(html: string): string {
  const compat = '<script>(function(){try{Object.defineProperty(Document.prototype,"cookie",{configurable:true,get:function(){return "";},set:function(){return true;}});}catch(e){}})();<\/script>';
  if (html.includes("</head>")) return html.replace("</head>", compat + "</head>");
  return compat + html;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/widgets") {
    const includeArchived = url.searchParams.get("includeArchived") === "1";
    const widgets = await loadWidgetIndex();
    sendJson(res, 200, includeArchived ? widgets : widgets.filter((w) => !w.archivedAt));
    return true;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/widgets/")) {
    const file = safeFileSegment(url.pathname.slice("/api/widgets/".length));
    if (!file) {
      sendJson(res, 400, { ok: false, error: "Invalid widget file." });
      return true;
    }
    const body = await readJsonBody(req);
    const title = typeof body.title === "string" ? body.title : "";
    const updated = await renameWidgetTitle(file, title);
    if (!updated) sendJson(res, 404, { ok: false, error: "Widget not found." });
    else sendJson(res, 200, { ok: true, widget: updated });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/widgets/archive") {
    const body = await readJsonBody(req);
    const files = Array.isArray(body.files) ? body.files.filter((v: unknown) => typeof v === "string") : [];
    const changed = await setWidgetsArchived(files, Boolean(body.archived));
    sendJson(res, 200, { ok: true, changed });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/widgets/delete") {
    const body = await readJsonBody(req);
    const files = Array.isArray(body.files) ? body.files.filter((v: unknown) => typeof v === "string") : [];
    const deleted = await deleteWidgets(files);
    sendJson(res, 200, { ok: true, deleted });
    return true;
  }

  return false;
}

function startGalleryServer(): Server {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");

      if (await handleApi(req, res, url)) return;

      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(await buildGalleryHTML(process.cwd()));
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/widget/")) {
        const file = safeFileSegment(url.pathname.slice("/widget/".length));
        const html = file ? await loadWidgetHtml(file) : null;
        if (html) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Permissions-Policy": "unload=(self)",
          });
          res.end(injectSandboxCompat(html));
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/api/html/")) {
        const file = safeFileSegment(url.pathname.slice("/api/html/".length));
        const html = file ? await loadWidgetHtml(file) : null;
        if (html) {
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(html);
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  return server;
}

let galleryServer: Server | null = null;

// ── Lock file helpers (cross-platform) ──────────────────────────────────

interface LockInfo {
  pid: number;
  port: number;
  startedAt: string;
}

async function readLock(): Promise<LockInfo | null> {
  try {
    const raw = await readFile(LOCK_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeLock(info: LockInfo): Promise<void> {
  await mkdir(WIDGETS_DIR, { recursive: true });
  await writeFile(LOCK_FILE, JSON.stringify(info), "utf-8");
}

async function removeLock(): Promise<void> {
  try { await unlink(LOCK_FILE); } catch {}
}

/** Check if a process is still alive (cross-platform). */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Try TCP connect to verify the port is actually serving. */
function isPortAlive(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect(port, host, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.setTimeout(1500, () => { sock.destroy(); resolve(false); });
  });
}

/** Find an existing live gallery server (lock file + process + port check). */
async function findExistingServer(): Promise<string | null> {
  const lock = await readLock();
  if (!lock) return null;

  if (!isPidAlive(lock.pid)) {
    await removeLock();
    return null;
  }

  const alive = await isPortAlive(lock.port);
  if (!alive) {
    await removeLock();
    return null;
  }

  return "http://127.0.0.1:" + lock.port;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function launchGallery(_widgets?: WidgetRecord[]): Promise<string> {
  if (galleryServer) {
    const addr = galleryServer.address();
    if (addr && typeof addr === "object") return "http://127.0.0.1:" + addr.port;
  }

  const existing = await findExistingServer();
  if (existing) return existing;

  const server = startGalleryServer();
  galleryServer = server;

  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", async () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        const url = "http://127.0.0.1:" + port;

        await writeLock({ pid: process.pid, port, startedAt: new Date().toISOString() });

        const cleanup = () => { try { require("fs").unlinkSync(LOCK_FILE); } catch {} };
        process.on("exit", cleanup);
        process.on("SIGINT", () => { cleanup(); process.exit(0); });
        process.on("SIGTERM", () => { cleanup(); process.exit(0); });

        openInBrowser(url);
        resolve(url);
      }
    });
  });
}

export async function stopGallery(): Promise<boolean> {
  if (galleryServer) {
    galleryServer.close();
    galleryServer = null;
    await removeLock();
    return true;
  }

  const lock = await readLock();
  if (lock && isPidAlive(lock.pid)) {
    try {
      process.kill(lock.pid, "SIGTERM");
      await removeLock();
      return true;
    } catch {}
  }

  await removeLock();
  return false;
}
