import * as http from "node:http";
import { exec } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join as pathJoin, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execAsync = promisify(exec);

import { listRoleMemory, readRoleMemory, readDailyMemories, getPendingMemories } from "../core/memory-md.ts";

export interface MemoryServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

function findPort(start: number): number {
  for (let i = 0; i < 100; i++) {
    const port = start + Math.floor(Math.random() * 1000);
    try {
      const s = http.createServer();
      s.listen(port, "127.0.0.1");
      s.close();
      return port;
    } catch { /* try next */ }
  }
  return 8080;
}

// ─── JSONL Log Parsing ───────────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  level: string;
  tag: string;
  message: string;
  role?: string;
  duration_ms?: number;
}

function readRoleLogs(logDir: string, limit = 500): LogEntry[] {
  try {
    const files = readdirSync(logDir)
      .filter(f => f.endsWith(".jsonl"))
      .sort()
      .reverse()
      .slice(0, 7);
    const entries: LogEntry[] = [];
    for (const file of files) {
      const lines = readFileSync(pathJoin(logDir, file), "utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          entries.push({
            timestamp: obj.timestamp, level: obj.level || "info",
            tag: obj.tag || "", message: obj.message || "",
            role: obj.context?.role, duration_ms: obj.timing?.duration_ms,
          });
        } catch { /* skip */ }
      }
    }
    return entries.slice(-limit);
  } catch { return []; }
}

function aggregateLogs(entries: LogEntry[]) {
  const tagCounts = new Map<string, number>();
  for (const e of entries) tagCounts.set(e.tag, (tagCounts.get(e.tag) || 0) + 1);
  const now = Date.now();
  const hourly = new Map<string, number>();
  for (const e of entries) {
    if (now - new Date(e.timestamp).getTime() > 48 * 3600_000) continue;
    const h = e.timestamp.slice(0, 13);
    hourly.set(h, (hourly.get(h) || 0) + 1);
  }
  const roleCounts = new Map<string, number>();
  for (const e of entries) if (e.role) roleCounts.set(e.role, (roleCounts.get(e.role) || 0) + 1);
  return {
    total: entries.length,
    errors: entries.filter(e => e.level === "error").length,
    warns: entries.filter(e => e.level === "warn").length,
    tags: Object.fromEntries(tagCounts),
    hourly: Object.fromEntries(hourly),
    roles: Object.fromEntries(roleCounts),
  };
}

// ─── Export Data Builder ─────────────────────────────────────────────────────

function buildExportData(rolePath: string, roleName: string) {
  const data = readRoleMemory(rolePath, roleName);
  const dailyMemories = readDailyMemories(rolePath);
  const pendingData = getPendingMemories(rolePath);
  const pendingMemories = pendingData.filter(p => !p.discarded).map(p => ({
    id: p.id, text: p.text, source: p.source, category: p.category,
    createdAt: p.createdAt, promoted: p.promoted,
  }));
  const tagCounts = new Map<string, number>();
  for (const l of data.learnings) for (const t of l.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  for (const p of data.preferences) for (const t of p.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const tags = Array.from(tagCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const byCategory: Record<string, number> = {};
  for (const p of data.preferences) byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  return {
    title: `Memory - ${roleName}`, roleName,
    updatedAt: data.metadata?.updated || new Date().toISOString().split("T")[0],
    generatedAt: new Date().toLocaleString("zh-CN"),
    learnings: data.learnings.map(l => ({ id: l.id, text: l.text, used: l.used, source: l.source, tags: l.tags, date: l.lastAccessed })),
    preferences: data.preferences.map(p => ({ id: p.id, text: p.text, category: p.category, tags: p.tags })),
    events: data.events.map(e => ({ text: e })),
    daily: dailyMemories, pending: pendingMemories, tags,
    stats: {
      total: data.learnings.length + data.preferences.length + data.events.length + dailyMemories.length,
      highPriority: data.learnings.filter(l => l.used >= 3).length,
      pending: pendingMemories.filter(p => !p.promoted).length, byCategory,
    },
  };
}

// ─── Theme CSS ───────────────────────────────────────────────────────────────

const THEME_CSS = `
:root { color-scheme: light dark; }
:root, [data-theme="dark"] {
  --bg:#0d0d0d;--bg-panel:#141414;--bg-hover:#1a1a1a;--bg-active:#242424;
  --border:#2a2a2a;--text:#e5e5e5;--text-dim:#666;--text-muted:#444;
  --accent:#d97706;--high:#dc2626;--normal:#d97706;--new:#059669;
  --pending:#6366f1;--folder:#e5a000;
}
[data-theme="light"] {
  --bg:#faf9f5;--bg-panel:#f5f0e8;--bg-hover:#efe9de;--bg-active:#e8e0d2;
  --border:#e6dfd8;--text:#141413;--text-dim:#6c6a64;--text-muted:#8e8b82;
  --accent:#cc785c;--high:#c64545;--normal:#cc785c;--new:#5db872;
  --pending:#6366f1;--folder:#cc785c;
}
@media(prefers-color-scheme:light){:root:not([data-theme="dark"]){
  --bg:#faf9f5;--bg-panel:#f5f0e8;--bg-hover:#efe9de;--bg-active:#e8e0d2;
  --border:#e6dfd8;--text:#141413;--text-dim:#6c6a64;--text-muted:#8e8b82;
  --accent:#cc785c;--high:#c64545;--normal:#cc785c;--new:#5db872;
  --pending:#6366f1;--folder:#cc785c;
}}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#0d0d0d;--bg-panel:#141414;--bg-hover:#1a1a1a;--bg-active:#242424;
  --border:#2a2a2a;--text:#e5e5e5;--text-dim:#666;--text-muted:#444;
  --accent:#d97706;--high:#dc2626;--normal:#d97706;--new:#059669;
  --pending:#6366f1;--folder:#e5a000;
}}
.theme-toggle{position:fixed;top:12px;right:12px;z-index:999;width:36px;height:36px;border-radius:50%;background:var(--bg-panel);border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:.2s;color:var(--text-dim)}
.theme-toggle:hover{background:var(--bg-hover);border-color:var(--accent);color:var(--accent)}
body{background:var(--bg)!important;color:var(--text)!important}
.sidebar{background:var(--bg-panel)!important;border-right-color:var(--border)!important}
.sidebar-header{border-bottom-color:var(--border)!important;color:var(--text-dim)!important}
.tree-item:hover{background:var(--bg-hover)!important}
.tree-item.active{background:var(--bg-active)!important}
.tree-item .count{color:var(--text-muted)!important}
.tree-children{border-left-color:var(--border)!important}
.toolbar{background:var(--bg-panel)!important;border-bottom-color:var(--border)!important}
.search-box input{background:var(--bg)!important;border-color:var(--border)!important;color:var(--text)!important}
.search-box input:focus{border-color:var(--accent)!important}
.breadcrumb span{color:var(--text)!important}
thead th{color:var(--text-dim)!important;border-bottom-color:var(--border)!important;background:var(--bg)!important}
td{border-bottom-color:var(--border)!important}
tr:hover td{background:var(--bg-hover)!important}
.badge.high{background:var(--high)!important}.badge.normal{background:var(--normal)!important}.badge.new{background:var(--new)!important}.badge.pending{background:var(--pending)!important}
.tag{background:var(--bg-active)!important;color:var(--text-dim)!important}
.footer-bar{background:var(--bg-panel)!important;border-top-color:var(--border)!important;color:var(--text-dim)!important}
mark{background:var(--accent)!important}
`;

// ─── Inject Script (Theme Toggle + Logs) ─────────────────────────────────────

const INJECT_SCRIPT = `
(function(){
  // Theme toggle
  var tog=document.createElement('button');tog.className='theme-toggle';tog.title='Toggle theme';
  function updIco(){var d=!document.documentElement.dataset.theme?window.matchMedia('(prefers-color-scheme:dark)').matches:document.documentElement.dataset.theme==='dark';tog.textContent=d?'☀️':'🌙';}updIco();
  tog.onclick=function(){var c=document.documentElement.dataset.theme,s=window.matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.dataset.theme=!c?(s?'light':'dark'):c==='dark'?'light':'dark';updIco();};
  document.body.appendChild(tog);

  // Logs tree node
  TREE.children.unshift({name:"📊 Logs",path:"/logs",count:0,children:[],type:"folder"});
  var tc=document.querySelector('.tree');if(tc){tc.innerHTML='';renderTree(TREE,tc);}

  var _origRT=renderTable;
  renderTable=function(){
    if(currentPath==='/logs'||currentPath.startsWith('/logs/')){renderLogsView();return;}
    var th=document.querySelector('thead tr');if(th&&th.dataset.logs==='1'){th.innerHTML='<th class="col-badge"></th><th class="col-content">Content</th><th class="col-category">Category</th><th class="col-tags">Tags</th><th class="col-date">Date</th><th class="col-meta">Meta</th>';delete th.dataset.logs;}
    _origRT();
  };

  var logsCache=null;
  async function renderLogsView(){
    var tb=document.getElementById('tableBody'),th=document.querySelector('thead tr');
    if(th){th.innerHTML='<th>Time</th><th>Level</th><th>Tag</th><th>Message</th><th>Role</th><th>ms</th>';th.dataset.logs='1';}
    if(!logsCache){try{var r=await fetch('/api/logs');logsCache=await r.json();}catch{logsCache={entries:[],agg:{total:0,errors:0,warns:0,tags:{},hourly:{},roles:{}}};}}
    var D=logsCache,E=D.entries,A=D.agg;
    var tg=Object.entries(A.tags||{}).sort(function(a,b){return b[1]-a[1];});
    var hr=Object.entries(A.hourly||{}).sort(function(a,b){return a[0].localeCompare(b[0]);});
    var mh=hr.length?Math.max.apply(null,hr.map(function(h){return h[1];})):1;
    var rl=Object.entries(A.roles||{}).sort(function(a,b){return b[1]-a[1];});
    var h='<tr><td colspan="6" style="padding:16px">';
    h+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">';
    h+=sc(A.total,'Total Events','var(--accent)');h+=sc(A.errors,'Errors','var(--high)');
    h+=sc(A.warns,'Warnings','#ca8a04');h+=sc(rl.length,'Active Roles','var(--new)');
    h+='</div>';
    if(hr.length){
      h+='<div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">';
      h+='<div style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">📈 Activity (48h)</div>';
      h+='<div style="display:flex;gap:2px;align-items:end;height:64px">';
      hr.forEach(function(x){var p=Math.round(x[1]/mh*100);h+='<div class="log-bar" style="flex:1;height:'+Math.max(3,p)+'%;background:var(--accent);border-radius:2px 2px 0 0;position:relative;cursor:pointer"><div class="log-tip" style="display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:var(--bg-active);border:1px solid var(--border);padding:4px 8px;border-radius:6px;font-size:10px;white-space:nowrap;z-index:10;color:var(--text)">'+x[0].slice(11)+':00 · '+x[1]+' events</div></div>';});
      h+='</div>';
      if(hr.length>1)h+='<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--text-muted)"><span>'+hr[0][0].slice(5,16)+'</span><span>'+hr[hr.length-1][0].slice(5,16)+'</span></div>';
      h+='</div>';
    }
    if(tg.length){
      h+='<div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">';
      h+='<div style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">🏷️ Tags</div>';
      var mt=tg[0][1];
      tg.forEach(function(x){var p=Math.round(x[1]/mt*100);h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="width:130px;text-align:right;font-size:12px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+x[0]+'</span><div style="flex:1;height:20px;background:var(--bg);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+p+'%;background:var(--accent);border-radius:4px;display:flex;align-items:center;padding-left:8px;font-size:10px;color:#fff;font-weight:600;min-width:24px">'+x[1]+'</div></div></div>';});
      h+='</div>';
    }
    if(rl.length){
      h+='<div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">';
      h+='<div style="font-size:11px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">👥 Roles</div>';
      var mr=rl[0][1];
      rl.forEach(function(x){var p=Math.round(x[1]/mr*100);h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="width:130px;text-align:right;font-size:12px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+x[0]+'</span><div style="flex:1;height:20px;background:var(--bg);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+p+'%;background:var(--new);border-radius:4px;display:flex;align-items:center;padding-left:8px;font-size:10px;color:#fff;font-weight:600;min-width:24px">'+x[1]+'</div></div></div>';});
      h+='</div>';
    }
    h+='</td></tr>';
    var show=E.slice(-200).reverse();
    show.forEach(function(e){
      var ts=(e.timestamp||'').slice(11,19),dur=e.duration_ms!=null?Math.round(e.duration_ms):'';
      var lc=e.level==='error'?'high':e.level==='warn'?'normal':'new';
      var msg=esc(e.message||'').slice(0,160);
      h+='<tr><td style="font-family:monospace;font-size:11px;color:var(--text-muted)">'+ts+'</td><td><span class="badge '+lc+'">'+e.level+'</span></td><td><span class="tag">'+e.tag+'</span></td><td>'+msg+'</td><td style="color:var(--text-dim)">'+(e.role||'')+'</td><td style="color:var(--text-muted);font-family:monospace;font-size:11px">'+dur+'</td></tr>';
    });
    tb.innerHTML=h;
    tb.querySelectorAll('.log-bar').forEach(function(b){var t=b.querySelector('.log-tip');if(!t)return;b.onmouseenter=function(){t.style.display='block';b.style.opacity='0.8';};b.onmouseleave=function(){t.style.display='none';b.style.opacity='1';};});
  }
  function sc(v,l,c){return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;text-align:center"><div style="font-size:28px;font-weight:700;color:'+c+';line-height:1">'+v+'</div><div style="font-size:11px;color:var(--text-dim);margin-top:6px">'+l+'</div></div>';}
  function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
})();
`;

// ─── Server ──────────────────────────────────────────────────────────────────

export function startMemoryServer(rolePath: string, roleName: string): MemoryServerHandle {
  const extDir = dirname(fileURLToPath(import.meta.url));
  const templatePath = pathJoin(extDir, "..", "..", "templates", "memory-export.html");
  const template = readFileSync(templatePath, "utf-8");
  const exportData = buildExportData(rolePath, roleName);
  const logDir = pathJoin(rolePath, "..", ".log");
  const port = findPort(3000);

  const html = template
    .replace(/\{\{title\}\}/g, exportData.title)
    .replace(/\{\{roleName\}\}/g, roleName)
    .replace(/\{\{updatedAt\}\}/g, exportData.updatedAt)
    .replace(/\{\{generatedAt\}\}/g, exportData.generatedAt)
    .replace("{{data}}", JSON.stringify(exportData))
    .replace("</style>", THEME_CSS + "\n</style>")
    .replace("</script>", INJECT_SCRIPT + "\n</script>");

  const server = http.createServer((req, res) => {
    const url = req.url?.split("?")[0] || "/";
    if (url === "/api/logs") {
      const entries = readRoleLogs(logDir, 1000);
      const agg = aggregateLogs(entries);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
      res.end(JSON.stringify({ entries, agg }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(html);
  });
  server.listen(port, "127.0.0.1");
  return { url: `http://localhost:${port}`, port, close: () => new Promise<void>(r => server.close(() => r())) };
}

export async function openMemoryServer(rolePath: string, roleName: string): Promise<MemoryServerHandle> {
  const handle = startMemoryServer(rolePath, roleName);
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  await execAsync(`${cmd} "${handle.url}"`);
  return handle;
}
