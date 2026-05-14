// ── Widget Gallery Server ─────────────────────────────────────────────────

import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { WidgetRecord } from "./storage.js";
import { loadWidgetHtml, WIDGETS_DIR } from "./storage.js";
import { detectDarkMode, openInBrowser } from "./html-helpers.js";

const LOCK_FILE = join(WIDGETS_DIR, ".gallery-lock");

function buildCard(w: WidgetRecord, i: number): string {
  const meta = w.width + "\u00d7" + w.height + " \u00b7 " + w.timestamp + (w.cwd ? " \u00b7 " + w.cwd.split("/").pop() : "");
  const cwdAttr = w.cwd ? ' data-cwd="' + w.cwd.replace(/"/g, "&quot;") + '"' : "";
  return '<div class="card" data-idx="' + i + '" data-file="' + w.file + '"' + cwdAttr + ' data-w="' + w.width + '" data-h="' + w.height + '">'
    + '<div class="card-preview">'
    + '<iframe data-src="/widget/' + w.file + '" sandbox="allow-scripts" allow="unload"></iframe>'
    + '<div class="skeleton"></div>'
    + '<div class="card-actions">'
    + '<button class="card-action" data-action="open" title="Open in new window"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg></button>'
    + '<button class="card-action" data-action="copy" title="Copy link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>'
    + '</div>'
    + '<div class="preview-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div></div>'
    + '<div class="card-info"><div class="card-title">' + w.title + '</div>'
    + '<div class="card-meta">' + meta + '</div></div></div>';
}

function buildGalleryHTML(widgets: WidgetRecord[], projectCwd?: string): string {
  const dark = detectDarkMode();

  // Sort by timestamp descending (newest first)
  const sorted = [...widgets].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Detect project cwd from most recent widget if not provided
  const effectiveProjectCwd = projectCwd || sorted[0]?.cwd || "";

  const cards = sorted.map((w, i) => buildCard(w, i)).join("\n");

  const css = [
    // ── Reset & Base ──
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":root{--bg:#f8f8f8;--card-bg:#ffffff;--border:#e0e0e0;--text:#1a1a1a;--muted:#666;--accent:#185FA5;--accent-bg:#E6F1FB;--accent-glow:#185FA540;--hover-bg:#f0f0f0;--modal-bg:rgba(255,255,255,0.92);--code-bg:#fafafa;--skeleton-base:#eee;--skeleton-shine:#e0e0e0;--shadow:rgba(0,0,0,.12)}",
    "[data-theme=\"dark\"]{--bg:#0f0f0f;--card-bg:#1a1a1a;--border:#2a2a2a;--text:#e0e0e0;--muted:#888;--accent:#85B7EB;--accent-bg:#0C447C;--accent-glow:#85B7EB40;--hover-bg:#222;--modal-bg:rgba(0,0,0,0.85);--code-bg:#111;--skeleton-base:#1e1e1e;--skeleton-shine:#2a2a2a;--shadow:rgba(0,0,0,.3)}",
    "body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;min-height:100vh;overflow-x:hidden;transition:background .3s,color .3s}",

    // ── Header ──
    ".header{padding:2rem 2rem 1rem;display:flex;align-items:center;gap:1rem}",
    ".header h1{font-size:1.5rem;font-weight:600}",
    ".header .count{background:var(--accent-bg);color:var(--accent);padding:2px 10px;border-radius:12px;font-size:.8rem}",

    // ── Toolbar ──
    ".toolbar{padding:0 2rem 1rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}",
    ".search-wrap{position:relative;display:flex;align-items:center;gap:.5rem;flex:1;max-width:400px}",
    ".search-icon{position:absolute;left:12px;color:var(--muted);pointer-events:none;display:flex;align-items:center}",
    ".search{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:8px 14px 8px 36px;color:var(--text);font-size:.9rem;width:100%;outline:none;transition:border-color .2s,box-shadow .2s}",
    ".search:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-bg)}",
    ".search-hint{color:var(--muted);font-size:.7rem;white-space:nowrap;opacity:.6}",
    ".filter-btn{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:6px 14px;color:var(--muted);cursor:pointer;font-size:.8rem;transition:.15s}",
    ".filter-btn.active{background:var(--accent-bg);color:var(--accent);border-color:var(--accent)}",
    ".filter-btn:hover{border-color:var(--accent)}",

    // ── Sticky Header ──
    ".sticky-header{position:sticky;top:0;z-index:100;background:var(--bg);border-bottom:1px solid var(--border)}",

    // ── Column Controls ──
    ".col-ctrl{display:flex;align-items:center;gap:4px;margin-left:auto}",
    ".col-ctrl-label{color:var(--muted);font-size:.75rem;white-space:nowrap}",
    ".col-btn{width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.9rem;transition:.15s;line-height:1}",
    ".col-btn:hover{border-color:var(--accent);color:var(--accent)}",
    ".col-val{color:var(--text);font-size:.85rem;min-width:20px;text-align:center;font-weight:600}",

    // ── Path Filter ──
    ".path-filter{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text);font-size:.8rem;outline:none;cursor:pointer;max-width:220px}",
    ".path-filter:focus{border-color:var(--accent)}",

    // ── Grid (masonry container) ──
    ".grid{position:relative;padding:0 2rem 2rem}",

    // ── Card (absolutely positioned by JS) ──
    ".card{background:var(--card-bg);border:1px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;position:absolute;transition:left .4s cubic-bezier(.4,0,.2,1),top .4s cubic-bezier(.4,0,.2,1),border-color .3s,box-shadow .3s,transform .3s}",
    ".card:hover{border-color:var(--accent);transform:scale(1.02);box-shadow:0 12px 32px rgba(0,0,0,.2),0 0 0 1px var(--accent-glow);z-index:2}",

    // ── Card Preview (height set by JS via --ph) ──
    ".card-preview{overflow:hidden;position:relative;background:var(--code-bg);height:var(--ph,200px)}",
    ".card-preview iframe{border:none;transform-origin:top left;pointer-events:none;opacity:0;transition:opacity .4s ease}",
    ".card-preview iframe.loaded{opacity:1}",
    ".card-preview iframe.loaded~.preview-placeholder{display:none}",
    ".preview-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);background:var(--code-bg)}",

    // ── Skeleton Loading ──
    ".skeleton{position:absolute;inset:0;background:var(--skeleton-base);opacity:1;transition:opacity .3s;z-index:1}",
    ".card-preview iframe.loaded~.skeleton{opacity:0;pointer-events:none}",
    

    // ── Card Actions ──
    ".card-actions{position:absolute;top:8px;right:8px;display:flex;gap:4px;opacity:0;transform:translateY(-4px);transition:all .2s;z-index:2}",
    ".card:hover .card-actions{opacity:1;transform:translateY(0)}",
    ".card-action{width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;backdrop-filter:blur(8px)}",
    ".card-action:hover{background:var(--accent-bg);color:var(--accent);border-color:var(--accent)}",

    // ── Card Info ──
    ".card-info{padding:12px 16px}",
    ".card-title{font-weight:600;font-size:.95rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".card-meta{color:var(--muted);font-size:.75rem}",

    // ── Modal Overlay ──
    ".modal-overlay{position:fixed;inset:0;background:var(--modal-bg);z-index:1000;backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s ease}",
    ".modal-overlay.open{opacity:1;pointer-events:auto}",

    // ── Modal ──
    ".modal{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;width:90vw;height:85vh;min-width:400px;min-height:300px;max-width:95vw;max-height:95vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.3);position:relative;transform:scale(.92);transition:transform .25s cubic-bezier(.4,0,.2,1)}",
    ".modal-overlay.open .modal{transform:scale(1)}",

    // ── Modal Nav Arrows ──
    ".modal-nav{position:absolute;top:50%;width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--card-bg);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;z-index:10;backdrop-filter:blur(8px)}",
    ".modal-nav:hover{background:var(--accent-bg);color:var(--accent);border-color:var(--accent)}",
    ".modal-nav.prev{left:-48px;transform:translateY(-50%)}",
    ".modal-nav.next{right:-48px;transform:translateY(-50%)}",

    // ── Modal Header ──
    ".modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);cursor:move;user-select:none}",
    ".modal-header h2{font-size:1.1rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;margin-right:12px}",
    ".modal-actions{display:flex;gap:8px;flex-shrink:0}",
    ".modal-actions button{background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:6px 14px;color:var(--text);cursor:pointer;font-size:.8rem;transition:.15s;display:flex;align-items:center;gap:4px}",
    ".modal-actions button:hover{background:var(--accent-bg);color:var(--accent);border-color:var(--accent)}",

    // ── Modal Tabs ──
    ".modal-tabs{display:flex;border-bottom:1px solid var(--border)}",
    ".modal-tab{padding:10px 20px;cursor:pointer;color:var(--muted);font-size:.85rem;border-bottom:2px solid transparent;transition:.15s}",
    ".modal-tab.active{color:var(--accent);border-bottom-color:var(--accent)}",
    ".modal-tab:hover{color:var(--text)}",

    // ── Modal Body ──
    ".modal-body{flex:1;overflow:hidden;position:relative}",
    ".modal-body iframe{width:100%;height:100%;border:none;transform:none!important;opacity:1!important;pointer-events:auto!important;position:relative!important;left:auto!important;top:auto!important}",
    ".modal-body.show-source iframe{display:none}",
    ".modal-body pre{width:100%;height:100%;overflow:auto;padding:16px;margin:0;font-size:.8rem;line-height:1.6;font-family:ui-monospace,monospace;background:var(--code-bg);color:var(--text)}",
    ".modal-body pre code{font-family:inherit}",

    // ── Resize Handle ──
    ".resize-handle{position:absolute;bottom:0;right:0;width:20px;height:20px;cursor:nwse-resize;z-index:10}",
    ".resize-handle::before{content:'';position:absolute;bottom:4px;right:4px;width:10px;height:10px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);opacity:.5}",

    // ── Close Button ──
    ".close-btn{background:none;border:none;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:4px;display:flex;align-items:center;justify-content:center}",
    ".close-btn:hover{background:var(--hover-bg);color:var(--text)}",

    // ── Empty State ──
    ".empty{text-align:center;padding:4rem 2rem;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:1rem}",
    ".empty svg{opacity:.35}",
    ".empty p{font-size:1.05rem;line-height:1.5}",

    // ── Toast ──
    ".toast{position:fixed;bottom:2rem;left:50%;transform:translateX(-50%) translateY(100px);background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:10px 20px;color:var(--text);font-size:.85rem;box-shadow:0 8px 24px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.4,0,.2,1);z-index:2000;pointer-events:none}",
    ".toast.show{transform:translateX(-50%) translateY(0)}",

    // ── Responsive ──
    // ── Theme Toggle ──
    "#theme-toggle{position:relative;color:var(--accent)}",
    "#theme-toggle:hover{color:var(--text)}",
    "#theme-icon-light{display:none}",
    "[data-theme=\"dark\"] #theme-icon-dark{display:none}",
    "[data-theme=\"dark\"] #theme-icon-light{display:block}",
        "@media(max-width:768px){",
    "  .header{padding:1.5rem 1rem .5rem}",
    "  .toolbar{padding:0 1rem;flex-direction:column;align-items:stretch}",
    "  .search-wrap{max-width:none}",
    "  .search-hint{display:none}",
    "  .filter-row{display:flex;gap:.5rem}",
    "  .grid{padding:0 1rem 1rem}",
    "  .modal{width:100vw!important;height:100vh!important;border-radius:0;min-width:0;min-height:0;max-width:100vw;max-height:100vh}",
    "  .modal-nav{display:none}",
    "  .card-actions{opacity:1;transform:none}",
    "}",
    "@media(max-width:480px){",
    "  .grid{padding:0 .5rem}",
    "  .modal-header{padding:12px 16px}",
    "  .modal-actions .btn-label{display:none}",
    "}",
  ].join("\n  ");

  const widgetsJSON = JSON.stringify(sorted);

  const js = ''
    + 'var widgets = ' + widgetsJSON + ';\n'
    + 'var currentFile = "";\n'
    + 'var currentTab = "preview";\n'
    + 'var currentScope = "all";\n'
    + 'var currentPath = "";\n'
    + 'var userCols = 0;\n'  // 0 = auto
    + 'var sourceCache = {};\n'
    + 'var projectCwd = ' + JSON.stringify(effectiveProjectCwd) + ';\n'
    + '\n'
    + '// ── Toast ──\n'
    + 'function showToast(msg) {\n'
    + '  var t = document.getElementById("toast");\n'
    + '  t.textContent = msg;\n'
    + '  t.classList.add("show");\n'
    + '  clearTimeout(t._timer);\n'
    + '  t._timer = setTimeout(function() { t.classList.remove("show"); }, 2000);\n'
    + '}\n'
    + '\n'
    + '// ── Lazy load with concurrency limit ──\n'
    + 'var MAX_CONCURRENT = 8;\n'
    + 'var loadQueue = [];\n'
    + 'var activeLoads = 0;\n'
    + 'function processQueue() {\n'
    + '  while (activeLoads < MAX_CONCURRENT && loadQueue.length) {\n'
    + '    var card = loadQueue.shift();\n'
    + '    var iframe = card.querySelector("iframe[data-src]");\n'
    + '    if (!iframe || iframe.src) continue;\n'
    + '    activeLoads++;\n'
    + '    iframe.onload = function() {\n'
    + '      this.classList.add("loaded");\n'
    + '      activeLoads--;\n'
    + '      processQueue();\n'
    + '    };\n'
    + '    iframe.onerror = function() { activeLoads--; processQueue(); };\n'
    + '    iframe.src = iframe.dataset.src;\n'
    + '  }\n'
    + '}\n'
    + 'var observer = new IntersectionObserver(function(entries) {\n'
    + '  entries.forEach(function(entry) {\n'
    + '    if (!entry.isIntersecting) return;\n'
    + '    var card = entry.target;\n'
    + '    observer.unobserve(card);\n'
    + '    var iframe = card.querySelector("iframe[data-src]");\n'
    + '    if (iframe && !iframe.src) { loadQueue.push(card); processQueue(); }\n'
    + '  });\n'
    + '}, { rootMargin: "100px" });\n'
    + 'document.querySelectorAll(".card").forEach(function(c) { observer.observe(c); });\n'
    + '\n'
    + '// ── Masonry layout engine ──\n'
    + 'var GRID_GAP = 19;\n'
    + 'var MIN_CARD_W = 300;\n'
    + 'function layoutMasonry(instant) {\n'
    + '  var grid = document.getElementById("grid");\n'
    + '  var cs = getComputedStyle(grid);\n'
    + '  var padL = parseFloat(cs.paddingLeft) || 0;\n'
    + '  var padR = parseFloat(cs.paddingRight) || 0;\n'
    + '  var gridW = grid.offsetWidth - padL - padR;\n'
    + '  var cols = userCols > 0 ? userCols : Math.max(1, Math.floor((gridW + GRID_GAP) / (MIN_CARD_W + GRID_GAP)));\n'
    + '  var colW = (gridW - (cols - 1) * GRID_GAP) / cols;\n'
    + '  var colH = [];\n'
    + '  for (var i = 0; i < cols; i++) colH.push(0);\n'
    + '  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));\n'
    + '  cards.forEach(function(card) {\n'
    + '    if (card.style.display === "none") return;\n'
    + '    var w = widgets[+card.dataset.idx];\n'
    + '    if (instant) card.style.transition = "none";\n'
    + '    // Find shortest column\n'
    + '    var minC = 0;\n'
    + '    for (var c = 1; c < cols; c++) { if (colH[c] < colH[minC]) minC = c; }\n'
    + '    // Preview height from aspect ratio\n'
    + '    var ph = Math.round(colW * (w.height / w.width));\n'
    + '    ph = Math.max(80, Math.min(ph, 420));\n'
    + '    card.style.width = colW + "px";\n'
    + '    card.querySelector(".card-preview").style.setProperty("--ph", ph + "px");\n'
    + '    // iframe scale\n'
    + '    var iframe = card.querySelector("iframe");\n'
    + '    if (iframe) {\n'
    + '      var scale = colW / w.width;\n'
    + '      iframe.style.width = w.width + "px";\n'
    + '      iframe.style.height = w.height + "px";\n'
    + '      iframe.style.transform = "scale(" + scale + ")";\n'
    + '    }\n'
    + '    // Position\n'
    + '    card.style.left = minC * (colW + GRID_GAP) + "px";\n'
    + '    card.style.top = colH[minC] + "px";\n'
    + '    colH[minC] += card.offsetHeight + GRID_GAP;\n'
    + '  });\n'
    + '  grid.style.height = Math.max.apply(null, colH.concat([0])) + "px";\n'
    + '  if (instant) {\n'
    + '    grid.offsetHeight;\n'
    + '    cards.forEach(function(card) { card.style.transition = ""; });\n'
    + '  }\n'
    + '}\n'
    + '\n'
    + '// ── ResizeObserver ──\n'
    + 'var resizeTimer;\n'
    + 'var ro = new ResizeObserver(function() {\n'
    + '  clearTimeout(resizeTimer);\n'
    + '  resizeTimer = setTimeout(function() { layoutMasonry(true); }, 100);\n'
    + '});\n'
    + 'ro.observe(document.getElementById("grid"));\n'
    + '\n'
    + '// Initial layout (instant, no transition)\n'
    + 'layoutMasonry(true);\n'
    + '\n'
    + '// ── Search with debounce ──\n'
    + 'var searchTimer;\n'
    + 'document.getElementById("search").addEventListener("input", function() {\n'
    + '  clearTimeout(searchTimer);\n'
    + '  searchTimer = setTimeout(filterCards, 300);\n'
    + '});\n'
    + '\n'
    + '// ── Filter logic ──\n'
    + 'function filterCards() {\n'
    + '  var q = document.getElementById("search").value.toLowerCase();\n'
    + '  var visible = 0;\n'
    + '  document.querySelectorAll(".card").forEach(function(c) {\n'
    + '    var idx = +c.dataset.idx;\n'
    + '    var w = widgets[idx];\n'
    + '    var matchSearch = !q || w.title.toLowerCase().indexOf(q) !== -1 || w.file.toLowerCase().indexOf(q) !== -1;\n'
    + '    var matchScope = currentScope === "all" || (currentScope === "project" && w.cwd && w.cwd === projectCwd);\n'
    + '    var matchPath = !currentPath || (w.cwd && w.cwd === currentPath);\n'
    + '    var show = matchSearch && matchScope && matchPath;\n'
    + '    c.style.display = show ? "" : "none";\n'
    + '    if (show) visible++;\n'
    + '  });\n'
    + '  document.getElementById("empty-msg").style.display = visible === 0 ? "" : "none";\n'
    + '  document.getElementById("grid").style.display = visible === 0 ? "none" : "";\n'
    + '  document.querySelector(".count").textContent = visible + " widget" + (visible !== 1 ? "s" : "");\n'
    + '  layoutMasonry(false);\n'
    + '}\n'
    + '\n'
    + '// ── Filter buttons ──\n'
    + 'document.querySelectorAll(".filter-btn").forEach(function(btn) {\n'
    + '  btn.addEventListener("click", function() {\n'
    + '    document.querySelectorAll(".filter-btn").forEach(function(b) { b.classList.remove("active"); });\n'
    + '    btn.classList.add("active");\n'
    + '    currentScope = btn.dataset.scope;\n'
    + '    filterCards();\n'
    + '  });\n'
    + '});\n'
    + '\n'
    + '// ── Path filter ──\n'
    + 'document.getElementById("path-filter").addEventListener("change", function() {\n'
    + '  currentPath = this.value;\n'
    + '  filterCards();\n'
    + '});\n'
    + '\n'
    + '// ── Column controls ──\n'
    + 'function updateColLabel() {\n'
    + '  document.getElementById("col-val").textContent = userCols > 0 ? userCols : "Auto";\n'
    + '}\n'
    + 'document.getElementById("col-minus").addEventListener("click", function() {\n'
    + '  if (userCols <= 0) {\n'
    + '    // Calculate current auto cols and start from there\n'
    + '    var grid = document.getElementById("grid");\n'
    + '    var cs = getComputedStyle(grid);\n'
    + '    var gridW = grid.offsetWidth - (parseFloat(cs.paddingLeft)||0) - (parseFloat(cs.paddingRight)||0);\n'
    + '    userCols = Math.max(1, Math.floor((gridW + GRID_GAP) / (MIN_CARD_W + GRID_GAP)));\n'
    + '  }\n'
    + '  userCols = Math.max(1, userCols - 1);\n'
    + '  updateColLabel();\n'
    + '  layoutMasonry(false);\n'
    + '});\n'
    + 'document.getElementById("col-plus").addEventListener("click", function() {\n'
    + '  if (userCols <= 0) {\n'
    + '    var grid = document.getElementById("grid");\n'
    + '    var cs = getComputedStyle(grid);\n'
    + '    var gridW = grid.offsetWidth - (parseFloat(cs.paddingLeft)||0) - (parseFloat(cs.paddingRight)||0);\n'
    + '    userCols = Math.max(1, Math.floor((gridW + GRID_GAP) / (MIN_CARD_W + GRID_GAP)));\n'
    + '  }\n'
    + '  userCols = Math.min(8, userCols + 1);\n'
    + '  updateColLabel();\n'
    + '  layoutMasonry(false);\n'
    + '});\n'
    + '\n'
    + '\n'
    + '// ── Theme toggle ──\n'
    + 'var themeBtn = document.getElementById("theme-toggle");\n'
    + 'function setTheme(theme) {\n'
    + '  document.body.setAttribute("data-theme", theme);\n'
    + '  localStorage.setItem("gallery-theme", theme);\n'
    + '  var link = document.getElementById("hljs-theme");\n'
    + '  if (link) link.href = theme === "dark"\n'
    + '    ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"\n'
    + '    : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";\n'
    + '}\n'
    + 'themeBtn.addEventListener("click", function() {\n'
    + '  var current = document.body.getAttribute("data-theme");\n'
    + '  setTheme(current === "dark" ? "light" : "dark");\n'
    + '});\n'
    + 'var savedTheme = localStorage.getItem("gallery-theme");\n'
    + 'if (savedTheme) setTheme(savedTheme);\n'
    + '\n'
    + '// ── Keyboard shortcuts ──\n'
    + 'document.addEventListener("keydown", function(e) {\n'
    + '  // "/" focuses search (when not in input)\n'
    + '  if (e.key === "/" && document.activeElement.tagName !== "INPUT") {\n'
    + '    e.preventDefault();\n'
    + '    document.getElementById("search").focus();\n'
    + '    return;\n'
    + '  }\n'
    + '  // Esc in search clears it\n'
    + '  if (e.key === "Escape" && document.activeElement.id === "search") {\n'
    + '    document.getElementById("search").value = "";\n'
    + '    document.getElementById("search").blur();\n'
    + '    filterCards();\n'
    + '    return;\n'
    + '  }\n'
    + '  // Modal open: Esc closes, Left/Right navigates\n'
    + '  if (document.getElementById("modal-overlay").classList.contains("open")) {\n'
    + '    if (e.key === "Escape") { closeModal(); return; }\n'
    + '    if (e.key === "ArrowLeft") { navigateModal(-1); return; }\n'
    + '    if (e.key === "ArrowRight") { navigateModal(1); return; }\n'
    + '  }\n'
    + '});\n'
    + '\n'
    + '// ── Card click + action buttons ──\n'
    + 'document.getElementById("grid").addEventListener("click", function(e) {\n'
    + '  // Action buttons\n'
    + '  var action = e.target.closest("[data-action]");\n'
    + '  if (action) {\n'
    + '    e.stopPropagation();\n'
    + '    var card = action.closest(".card");\n'
    + '    var file = card.dataset.file;\n'
    + '    if (action.dataset.action === "open") {\n'
    + '      window.open("/widget/" + file, "_blank");\n'
    + '    } else if (action.dataset.action === "copy") {\n'
    + '      var url = window.location.origin + "/widget/" + file;\n'
    + '      navigator.clipboard.writeText(url).then(function() { showToast("Link copied!"); });\n'
    + '    }\n'
    + '    return;\n'
    + '  }\n'
    + '  // Card click -> open modal\n'
    + '  var card = e.target.closest(".card");\n'
    + '  if (!card) return;\n'
    + '  var idx = +card.dataset.idx;\n'
    + '  var w = widgets[idx];\n'
    + '  openModal(w);\n'
    + '});\n'
    + '\n'
    + '// ── Modal open (Teleport: move iframe from card to modal) ──\n'
    + 'var teleportedIframe = null;\n'
    + 'var teleportedFrom = null;\n'
    + 'var teleportedOrigStyle = {};\n'
    + 'function openModal(w) {\n'
    + '  if (teleportedIframe) returnIframe();\n'
    + '  currentFile = w.file;\n'
    + '  document.getElementById("modal-title").textContent = w.title + "  " + w.width + "\\u00d7" + w.height;\n'
    + '  // Find the card and its iframe\n'
    + '  var card = Array.prototype.slice.call(document.querySelectorAll(".card")).filter(function(c) { return c.dataset.file === w.file; })[0];\n'
    + '  var iframe = card ? card.querySelector("iframe") : null;\n'
    + '  if (iframe) {\n'
    + '    teleportedOrigStyle = {\n'
    + '      width: iframe.style.width,\n'
    + '      height: iframe.style.height,\n'
    + '      transform: iframe.style.transform,\n'
    + '      position: iframe.style.position,\n'
    + '      left: iframe.style.left,\n'
    + '      top: iframe.style.top\n'
    + '    };\n'
    + '    teleportedIframe = iframe;\n'
    + '    teleportedFrom = card;\n'
    + '    document.getElementById("modal-body").insertBefore(iframe, document.getElementById("source-code"));\n'
    + '  } else {\n'
    + '    iframe = document.createElement("iframe");\n'
    + '    iframe.setAttribute("sandbox", "allow-scripts");\n'
    + '    iframe.setAttribute("allow", "unload");\n'
    + '    iframe.src = "/widget/" + w.file;\n'
    + '    iframe.style.cssText = "width:100%;height:100%;border:none";\n'
    + '    document.getElementById("modal-body").insertBefore(iframe, document.getElementById("source-code"));\n'
    + '    teleportedIframe = iframe;\n'
    + '    teleportedFrom = null;\n'
    + '  }\n'
    + '  // Size modal to widget dimensions (clamped to viewport)\n'
    + '  var modal = document.getElementById("modal");\n'
    + '  var mw = Math.min(Math.max(w.width + 40, 500), window.innerWidth * 0.95);\n'
    + '  var mh = Math.min(Math.max(w.height + 120, 400), window.innerHeight * 0.95);\n'
    + '  modal.style.width = mw + "px";\n'
    + '  modal.style.height = mh + "px";\n'
    + '  // Fetch source (cached)\n'
    + '  var srcEl = document.getElementById("source-code");\n'
    + '  if (sourceCache[w.file]) {\n'
    + '    srcEl.textContent = sourceCache[w.file];\n'
    + '    if (window.hljs) hljs.highlightElement(srcEl);\n'
    + '  } else {\n'
    + '    fetch("/api/html/" + w.file).then(function(r) { return r.text(); }).then(function(html) {\n'
    + '      sourceCache[w.file] = html;\n'
    + '      srcEl.textContent = html;\n'
    + '      if (window.hljs) hljs.highlightElement(srcEl);\n'
    + '    });\n'
    + '  }\n'
    + '  document.getElementById("modal-overlay").classList.add("open");\n'
    + '  document.body.style.overflow = "hidden";\n'
    + '  setTab("preview");\n'
    + '}\n'
    + 'function returnIframe() {\n'
    + '  if (!teleportedIframe) return;\n'
    + '  if (teleportedFrom) {\n'
    + '    var preview = teleportedFrom.querySelector(".card-preview");\n'
    + '    if (preview) preview.insertBefore(teleportedIframe, preview.firstChild);\n'
    + '    teleportedIframe.style.width = teleportedOrigStyle.width || "";\n'
    + '    teleportedIframe.style.height = teleportedOrigStyle.height || "";\n'
    + '    teleportedIframe.style.transform = teleportedOrigStyle.transform || "";\n'
    + '    teleportedIframe.style.position = teleportedOrigStyle.position || "";\n'
    + '    teleportedIframe.style.left = teleportedOrigStyle.left || "";\n'
    + '    teleportedIframe.style.top = teleportedOrigStyle.top || "";\n'
    + '  } else {\n'
    + '    teleportedIframe.remove();\n'
    + '  }\n'
    + '  teleportedIframe = null;\n'
    + '  teleportedFrom = null;\n'
    + '  teleportedOrigStyle = {};\n'
    + '}\n'
    + '\n'
    + '// ── Modal navigation ──\n'
    + 'function getVisibleCards() {\n'
    + '  return Array.prototype.slice.call(document.querySelectorAll(".card")).filter(function(c) {\n'
    + '    return c.style.display !== "none";\n'
    + '  });\n'
    + '}\n'
    + 'function getCurrentVisibleIndex() {\n'
    + '  var cards = getVisibleCards();\n'
    + '  for (var i = 0; i < cards.length; i++) {\n'
    + '    if (cards[i].dataset.file === currentFile) return i;\n'
    + '  }\n'
    + '  return -1;\n'
    + '}\n'
    + 'document.getElementById("nav-prev").addEventListener("click", function() { navigateModal(-1); });\n'
    + 'document.getElementById("nav-next").addEventListener("click", function() { navigateModal(1); });\n'
    + 'function navigateModal(dir) {\n'
    + '  var cards = getVisibleCards();\n'
    + '  if (cards.length === 0) return;\n'
    + '  var idx = getCurrentVisibleIndex();\n'
    + '  if (idx < 0) idx = dir > 0 ? -1 : cards.length;\n'
    + '  var next = (idx + dir + cards.length) % cards.length;\n'
    + '  var w = widgets[+cards[next].dataset.idx];\n'
    + '  closeModal();\n'
    + '  openModal(w);\n'
    + '}\n'
    + '\n'
    + '// ── Tabs ──\n'
    + 'document.querySelectorAll(".modal-tab").forEach(function(tab) {\n'
    + '  tab.addEventListener("click", function() { setTab(tab.dataset.tab); });\n'
    + '});\n'
    + 'function setTab(name) {\n'
    + '  currentTab = name;\n'
    + '  document.querySelectorAll(".modal-tab").forEach(function(t) {\n'
    + '    t.classList.toggle("active", t.dataset.tab === name);\n'
    + '  });\n'
    + '  document.getElementById("modal-body").classList.toggle("show-source", name === "source");\n'
    + '  document.getElementById("source-code").style.display = name === "source" ? "" : "none";\n'
    + '  if (name === "source" && window.hljs) hljs.highlightElement(document.getElementById("source-code"));\n'
    + '}\n'
    + '\n'
    + '// ── Open in new window ──\n'
    + 'document.getElementById("btn-open").addEventListener("click", function() {\n'
    + '  window.open("/widget/" + currentFile, "_blank");\n'
    + '});\n'
    + '\n'
    + '// ── Copy HTML ──\n'
    + 'document.getElementById("btn-copy").addEventListener("click", function() {\n'
    + '  var raw = sourceCache[currentFile] || document.getElementById("source-code").textContent;\n'
    + '  if (raw) navigator.clipboard.writeText(raw).then(function() { showToast("HTML copied!"); });\n'
    + '});\n'
    + '\n'
    + '// ── Close modal (Teleport: return iframe to card) ──\n'
    + 'function closeModal() {\n'
    + '  returnIframe();\n'
    + '  document.getElementById("modal-overlay").classList.remove("open");\n'
    + '  document.body.style.overflow = "";\n'
    + '  document.getElementById("modal").style.width = "";\n'
    + '  document.getElementById("modal").style.height = "";\n'
    + '  document.getElementById("modal-body").classList.remove("show-source");\n'
    + '}\n'
    + 'document.getElementById("btn-close").addEventListener("click", closeModal);\n'
    + 'document.getElementById("modal-overlay").addEventListener("click", function(e) {\n'
    + '  if (e.target === e.currentTarget) closeModal();\n'
    + '});\n'
    + '\n'
    + '// ── Drag to resize modal ──\n'
    + '(function() {\n'
    + '  var handle = document.getElementById("resize-handle");\n'
    + '  var modal = document.getElementById("modal");\n'
    + '  var startX, startY, startW, startH;\n'
    + '  handle.addEventListener("mousedown", function(e) {\n'
    + '    e.preventDefault();\n'
    + '    startX = e.clientX; startY = e.clientY;\n'
    + '    startW = modal.offsetWidth; startH = modal.offsetHeight;\n'
    + '    document.addEventListener("mousemove", onDrag);\n'
    + '    document.addEventListener("mouseup", onUp);\n'
    + '  });\n'
    + '  function onDrag(e) {\n'
    + '    var w = Math.min(Math.max(startW + e.clientX - startX, 400), window.innerWidth * 0.95);\n'
    + '    var h = Math.min(Math.max(startH + e.clientY - startY, 300), window.innerHeight * 0.95);\n'
    + '    modal.style.width = w + "px";\n'
    + '    modal.style.height = h + "px";\n'
    + '  }\n'
    + '  function onUp() {\n'
    + '    document.removeEventListener("mousemove", onDrag);\n'
    + '    document.removeEventListener("mouseup", onUp);\n'
    + '  }\n'
    + '})();\n';

  const emptyStateSVG = '<svg width="120" height="120" viewBox="0 0 120 120" fill="none">'
    + '<rect x="10" y="10" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>'
    + '<rect x="70" y="10" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>'
    + '<rect x="10" y="70" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>'
    + '<rect x="70" y="70" width="40" height="40" rx="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>'
    + '<circle cx="60" cy="60" r="20" stroke="currentColor" stroke-width="2"/>'
    + '<path d="M74 74L88 88" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
    + '</svg>';

  const searchSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';


  // Generate path filter options
  var _pathSeen: Record<string, boolean> = {};
  var _pathOpts = "";
  sorted.forEach(function(w) {
    if (w.cwd && !_pathSeen[w.cwd]) {
      _pathSeen[w.cwd] = true;
      _pathOpts += '<option value="' + w.cwd + '">' + w.cwd.split("/").pop() + '</option>';
    }
  });
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<title>Widget Gallery</title>\n'
    + '<link id="hljs-theme" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/' + (dark ? "github-dark" : "github") + '.min.css">\n'
    + '<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>\n'
    + '<style>\n  ' + css + '\n</style>\n</head>\n<body data-theme=\"' + (dark ? 'dark' : 'light') + '\">\n'
    + '  <div class="sticky-header">\n'
    + '    <div class="header">\n'
    + '      <h1><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/></svg> Widget Gallery</h1>\n'
    + '      <span class="count">' + sorted.length + ' widget' + (sorted.length !== 1 ? "s" : "") + '</span>\n'
    + '    </div>\n'
    + '    <div class="toolbar">\n'
    + '      <div class="search-wrap">\n'
    + '        <span class="search-icon">' + searchSVG + '</span>\n'
    + '        <input class="search" id="search" placeholder="Search widgets\u2026" autofocus>\n'
    + '        <span class="search-hint">/ to focus</span>\n'
    + '      </div>\n'
    + '      <button class="filter-btn active" data-scope="all">All</button>\n'
    + '      <button class="filter-btn" data-scope="project">Project</button>\n'
    + '      <select class="path-filter" id="path-filter"><option value="">All Paths</option>' + _pathOpts + '</select>\n'
    + '      <div class="col-ctrl">\n'
    + '        <span class="col-ctrl-label">Cols</span>\n'
    + '        <button class="col-btn" id="col-minus">\u2212</button>\n'
    + '        <span class="col-val" id="col-val">Auto</span>\n'
    + '        <button class="col-btn" id="col-plus">+</button>\n'    + '        <button class="col-btn" id="theme-toggle" title="Toggle dark/light mode">\n'
    + '          <svg id="theme-icon-dark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>\n'
    + '          <svg id="theme-icon-light" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>\n'
    + '        </button>\n'

    + '      </div>\n'
    + '    </div>\n'
    + '  </div>\n'
    + '  <div class="grid" id="grid">' + (cards || "") + '</div>\n'
    + '  <div class="empty" id="empty-msg" style="' + (cards ? "display:none" : "") + '">\n'
    + '    ' + emptyStateSVG + '\n'
    + '    <p>No widgets yet.<br>Use <code>show_widget</code> to create one.</p>\n'
    + '  </div>\n\n'
    + '  <div class="modal-overlay" id="modal-overlay">\n'
    + '    <div class="modal" id="modal">\n'
    + '      <div class="modal-header">\n'
    + '        <h2 id="modal-title"></h2>\n'
    + '        <div class="modal-actions">\n'
    + '          <button id="btn-open" title="Open in new window"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg> <span class="btn-label">Open</span></button>\n'
    + '          <button id="btn-copy" title="Copy HTML"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> <span class="btn-label">Copy</span></button>\n'
    + '          <button class="close-btn" id="btn-close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></button>\n'
    + '        </div>\n'
    + '      </div>\n'
    + '      <div class="modal-tabs">\n'
    + '        <div class="modal-tab active" data-tab="preview">Preview</div>\n'
    + '        <div class="modal-tab" data-tab="source">Source</div>\n'
    + '      </div>\n'
    + '      <div class="modal-body" id="modal-body">\n'
    + '        <pre id="source-code" style="display:none"><code class="language-html"></code></pre>\n'
    + '      </div>\n'
    + '      <button class="modal-nav prev" id="nav-prev" title="Previous"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>\n'
    + '      <button class="modal-nav next" id="nav-next" title="Next"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>\n'
    + '      <div class="resize-handle" id="resize-handle"></div>\n'
    + '    </div>\n'
    + '  </div>\n\n'
    + '  <div class="toast" id="toast"></div>\n\n'
    + '<script>\n' + js + '</script>\n</body>\n</html>';
}

function injectSandboxCompat(html: string): string {
  const compat = '<script>(function(){try{Object.defineProperty(Document.prototype,"cookie",{configurable:true,get:function(){return "";},set:function(){return true;}});}catch(e){}})();<\/script>';
  if (html.includes("</head>")) return html.replace("</head>", compat + "</head>");
  return compat + html;
}

function startGalleryServer(widgets: WidgetRecord[]): Server {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");

    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildGalleryHTML(widgets, process.cwd()));
      return;
    }

    if (url.pathname === "/api/widgets") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(widgets));
      return;
    }

    if (url.pathname.startsWith("/widget/")) {
      const file = url.pathname.slice("/widget/".length);
      const html = await loadWidgetHtml(file);
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

    if (url.pathname.startsWith("/api/html/")) {
      const file = url.pathname.slice("/api/html/".length);
      const html = await loadWidgetHtml(file);
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

  // Verify the owning process is still alive
  if (!isPidAlive(lock.pid)) {
    await removeLock();
    return null;
  }

  // Verify the port is actually responding
  const alive = await isPortAlive(lock.port);
  if (!alive) {
    await removeLock();
    return null;
  }

  return "http://127.0.0.1:" + lock.port;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function launchGallery(widgets: WidgetRecord[]): Promise<string> {
  // 1. In-process reuse
  if (galleryServer) {
    const addr = galleryServer.address();
    if (addr && typeof addr === "object") return "http://127.0.0.1:" + addr.port;
  }

  // 2. Cross-process reuse via lock file
  const existing = await findExistingServer();
  if (existing) return existing;

  // 3. Start fresh
  const server = startGalleryServer(widgets);
  galleryServer = server;

  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", async () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        const url = "http://127.0.0.1:" + port;

        await writeLock({ pid: process.pid, port, startedAt: new Date().toISOString() });

        // Cleanup on unexpected exit
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

  // Try stopping via lock file (cross-process)
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
