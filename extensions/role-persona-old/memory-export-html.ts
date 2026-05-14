/**
 * Memory Export HTML - 树形文件夹导航 + 浏览器查看
 * 
 * 一屏展示所有记忆，HTML 导出
 */

import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";

import { readRoleMemory, type RoleMemoryData } from "./memory-md.ts";

const execAsync = promisify(exec);

export interface MemoryItem {
  id: string;
  type: "learning" | "preference" | "event" | "daily";
  priority?: "high" | "normal" | "new";
  count: number;
  category: string;
  subCategory?: string;
  content: string;
  tags: string[];
  date: string;
  timestamp?: string;
  source: string;
}

export interface TreeNode {
  name: string;
  type: "folder" | "file";
  path: string;
  count: number;
  children?: TreeNode[];
  items?: MemoryItem[];
}

function generateId(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

function extractTags(content: string): string[] {
  const tags: string[] = [];
  const matches = content.match(/#(\w+)/g);
  if (matches) {
    matches.forEach((match) => tags.push(match.slice(1)));
  }
  return tags;
}

function dataToItems(data: RoleMemoryData): MemoryItem[] {
  const items: MemoryItem[] = [];
  let indices = { learning: 0, preference: 0, event: 0, daily: 0 };

  // Learnings
  for (const l of data.learnings) {
    items.push({
      id: generateId("learn", indices.learning++),
      type: "learning",
      priority: l.used >= 3 ? "high" : l.used >= 1 ? "normal" : "new",
      count: l.used,
      category: "Learnings",
      content: l.text,
      tags: extractTags(l.text),
      date: "—",
      source: "memory/consolidated.md",
    });
  }

  // Preferences
  for (const p of data.preferences) {
    items.push({
      id: generateId("pref", indices.preference++),
      type: "preference",
      priority: "normal",
      count: 1,
      category: "Preferences",
      subCategory: p.category,
      content: p.text,
      tags: extractTags(p.text),
      date: "—",
      source: "memory/consolidated.md",
    });
  }

  // Events (from consolidated.md)
  for (let i = 0; i < data.events.length; i++) {
    const e = data.events[i];
    const eventMatch = e.match(/^##\s*\[([^\]]+)\]\s*(.+)$/);
    if (eventMatch) {
      items.push({
        id: generateId("event", indices.event++),
        type: "event",
        priority: "normal",
        count: 1,
        category: "Events",
        content: eventMatch[2],
        tags: extractTags(eventMatch[2]),
        date: eventMatch[1],
        source: "memory/consolidated.md",
      });
    }
  }

  // Daily (parse daily files separately)
  const dailyPath = path.join(data.rolePath, "memory", "daily");
  if (fs.existsSync(dailyPath)) {
    const dailyFiles = fs.readdirSync(dailyPath).filter((f) => f.endsWith(".md")).sort().reverse();
    for (const file of dailyFiles) {
      const filePath = path.join(dailyPath, file);
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? dateMatch[1] : "—";
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const entryMatch = line.match(/^##\s*\[([^\]]+)\]\s*(\w+)/);
        if (entryMatch) {
          const timestamp = entryMatch[1];
          const subType = entryMatch[2];

          let entryContent = "";
          let j = i + 1;
          while (j < lines.length && !lines[j].startsWith("##")) {
            if (lines[j].trim()) {
              entryContent += (entryContent ? " " : "") + lines[j].trim();
            }
            j++;
          }

          if (entryContent) {
            items.push({
              id: generateId("daily", indices.daily++),
              type: "daily",
              priority: subType === "LESSON" ? "high" : "normal",
              count: 1,
              category: `Daily ${subType}`,
              content: entryContent.slice(0, 100) + (entryContent.length > 100 ? "..." : ""),
              tags: extractTags(entryContent),
              date,
              timestamp,
              source: file,
            });
          }
        }
      }
    }
  }

  return items;
}

function buildTree(items: MemoryItem[]): TreeNode {
  const root: TreeNode = { name: "Memories", type: "folder", path: "/", count: items.length, children: [] };

  // Learnings by priority
  const learnings = items.filter((i) => i.type === "learning");
  if (learnings.length > 0) {
    const learnNode: TreeNode = { name: "📚 Learnings", type: "folder", path: "/learnings", count: learnings.length, children: [] };
    
    const high = learnings.filter((i) => i.priority === "high");
    const normal = learnings.filter((i) => i.priority === "normal");
    const newItems = learnings.filter((i) => i.priority === "new");

    if (high.length) learnNode.children!.push({ name: "🔴 High", type: "folder", path: "/learnings/high", count: high.length, items: high });
    if (normal.length) learnNode.children!.push({ name: "🟡 Normal", type: "folder", path: "/learnings/normal", count: normal.length, items: normal });
    if (newItems.length) learnNode.children!.push({ name: "🟢 New", type: "folder", path: "/learnings/new", count: newItems.length, items: newItems });
    
    root.children!.push(learnNode);
  }

  // Preferences by subcategory
  const prefs = items.filter((i) => i.type === "preference");
  if (prefs.length > 0) {
    const prefNode: TreeNode = { name: "⚙️ Preferences", type: "folder", path: "/preferences", count: prefs.length, children: [] };
    
    const bySubCat = new Map<string, MemoryItem[]>();
    prefs.forEach((p) => {
      const key = p.subCategory || "General";
      if (!bySubCat.has(key)) bySubCat.set(key, []);
      bySubCat.get(key)!.push(p);
    });

    bySubCat.forEach((items, subCat) => {
      prefNode.children!.push({ name: subCat, type: "folder", path: `/preferences/${subCat.toLowerCase()}`, count: items.length, items });
    });
    
    root.children!.push(prefNode);
  }

  // Events
  const events = items.filter((i) => i.type === "event");
  if (events.length > 0) {
    root.children!.push({ name: "📅 Events", type: "folder", path: "/events", count: events.length, items: events });
  }

  // Daily by date
  const daily = items.filter((i) => i.type === "daily");
  if (daily.length > 0) {
    const dailyNode: TreeNode = { name: "📝 Daily", type: "folder", path: "/daily", count: daily.length, children: [] };
    
    const byDate = new Map<string, MemoryItem[]>();
    daily.forEach((d) => {
      if (!byDate.has(d.date)) byDate.set(d.date, []);
      byDate.get(d.date)!.push(d);
    });

    Array.from(byDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([date, items]) => {
        dailyNode.children!.push({ name: date, type: "folder", path: `/daily/${date}`, count: items.length, items });
      });
    
    root.children!.push(dailyNode);
  }

  return root;
}

function generateHtml(tree: TreeNode, allItems: MemoryItem[], roleName: string): string {
  const flatItems = allItems.map((i) => ({
    ...i,
    path: i.type === "learning" 
      ? `/learnings/${i.priority}` 
      : i.type === "preference" 
      ? `/preferences/${(i.subCategory || "general").toLowerCase()}`
      : i.type === "event"
      ? "/events"
      : `/daily/${i.date}`,
  }));

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memories - ${roleName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --bg: #0d0d0d;
      --bg-panel: #141414;
      --bg-hover: #1a1a1a;
      --bg-active: #242424;
      --border: #2a2a2a;
      --text: #e5e5e5;
      --text-dim: #666;
      --text-muted: #444;
      --accent: #d97706;
      --high: #dc2626;
      --normal: #d97706;
      --new: #059669;
      --folder: #e5a000;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      height: 100vh;
      overflow: hidden;
      font-size: 13px;
    }
    
    .layout {
      display: flex;
      height: 100vh;
    }
    
    .sidebar {
      width: 220px;
      background: var(--bg-panel);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
    }
    
    .sidebar-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
    }
    
    .tree {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    
    .tree-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    
    .tree-item:hover {
      background: var(--bg-hover);
    }
    
    .tree-item.active {
      background: var(--bg-active);
    }
    
    .tree-item .icon {
      width: 16px;
      text-align: center;
      font-size: 12px;
    }
    
    .tree-item .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .tree-item .count {
      color: var(--text-muted);
      font-size: 11px;
    }
    
    .tree-children {
      margin-left: 16px;
      border-left: 1px solid var(--border);
      padding-left: 4px;
    }
    
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border);
    }
    
    .search-box {
      flex: 1;
      max-width: 300px;
      position: relative;
    }
    
    .search-box input {
      width: 100%;
      padding: 6px 12px 6px 32px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text);
      font-size: 12px;
    }
    
    .search-box input:focus {
      outline: none;
      border-color: var(--accent);
    }
    
    .search-box::before {
      content: "🔍";
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 12px;
      opacity: 0.5;
    }
    
    .breadcrumb {
      font-size: 11px;
      color: var(--text-dim);
    }
    
    .breadcrumb span {
      cursor: pointer;
    }
    
    .breadcrumb span:hover {
      color: var(--text);
    }
    
    .content {
      flex: 1;
      overflow: auto;
      padding: 16px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th {
      text-align: left;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-dim);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      background: var(--bg);
    }
    
    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
    }
    
    tr:hover {
      background: var(--bg-hover);
    }
    
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .badge.high { background: var(--high); }
    .badge.normal { background: var(--normal); }
    .badge.new { background: var(--new); }
    .badge.daily { background: var(--accent); }
    
    .tag {
      display: inline-block;
      padding: 1px 4px;
      background: var(--bg-active);
      border-radius: 2px;
      font-size: 10px;
      margin-right: 4px;
      color: var(--text-dim);
    }
    
    .empty {
      text-align: center;
      padding: 40px;
      color: var(--text-dim);
    }
  </style>
</head>
<body>
  <div class="layout">
    <div class="sidebar">
      <div class="sidebar-header">📁 ${roleName}</div>
      <div class="tree" id="tree"></div>
    </div>
    <div class="main">
      <div class="toolbar">
        <div class="search-box">
          <input type="text" id="search" placeholder="Search memories...">
        </div>
        <div class="breadcrumb" id="breadcrumb"></div>
      </div>
      <div class="content">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Content</th>
              <th>Tags</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    const TREE = ${JSON.stringify(tree)};
    const ITEMS = ${JSON.stringify(flatItems)};
    
    let currentPath = "/";
    let searchQuery = "";

    function renderTree(node, container, level = 0) {
      const div = document.createElement("div");
      
      const item = document.createElement("div");
      item.className = "tree-item" + (currentPath === node.path ? " active" : "");
      const icon = node.type === "folder" ? "📁" : "📄";
      const hasChildren = node.children && node.children.length > 0;
      
      item.innerHTML = \`
        <span class="icon">\${icon}</span>
        <span class="name">\${node.name}</span>
        <span class="count">\${node.count}</span>
      \`;
      
      item.onclick = () => {
        currentPath = node.path;
        renderTree(TREE, document.getElementById("tree"));
        updateBreadcrumb(node.path);
        renderTable();
      };
      
      div.appendChild(item);
      
      if (hasChildren) {
        const children = document.createElement("div");
        children.className = "tree-children";
        node.children.forEach(child => renderTree(child, children, level + 1));
        div.appendChild(children);
      }
      
      container.appendChild(div);
    }

    function updateBreadcrumb(path) {
      const parts = path.split("/").filter(p => p);
      const html = ["<span onclick='setPath(\"/\")'>Memories</span>", 
        ...parts.map((p, i) => 
          "<span onclick='setPath(\"/" + parts.slice(0, i + 1).join("/") + "\")'> → " + p + "</span>"
        )
      ].join("");
      document.getElementById("breadcrumb").innerHTML = html;
    }

    function setPath(p) {
      currentPath = p;
      renderTree(TREE, document.getElementById("tree"));
      updateBreadcrumb(p);
      renderTable();
    }

    function renderTable() {
      const tbody = document.getElementById("tableBody");
      tbody.innerHTML = "";
      
      let filtered = ITEMS;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = ITEMS.filter(i => 
          i.content.toLowerCase().includes(q) ||
          i.tags.some(t => t.toLowerCase().includes(q))
        );
      } else if (currentPath !== "/") {
        filtered = ITEMS.filter(i => i.path.startsWith(currentPath));
      }
      
      if (filtered.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' class='empty'>No memories found</td></tr>";
        return;
      }
      
      filtered.forEach(item => {
        const tr = document.createElement("tr");
        
        let content = escapeHtml(item.content);
        if (searchQuery) {
          const regex = new RegExp("(" + escapeRegExp(searchQuery) + ")", "gi");
          content = content.replace(regex, "<mark>$1</mark>");
        }
        
        const badgeClass = item.type === "daily" ? "daily" : (item.priority || "normal");
        
        tr.innerHTML = \`
          <td><span class="badge \${badgeClass}">\${item.type}</span></td>
          <td>\${content}</td>
          <td>\${item.tags.map(t => '<span class="tag">' + t + '</span>').join("")}</td>
          <td>\${item.source}</td>
        \`;
        
        tbody.appendChild(tr);
      });
    }

    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    }

    document.getElementById("search").addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderTable();
    });

    // Init
    renderTree(TREE, document.getElementById("tree"));
    updateBreadcrumb("/");
    renderTable();
  </script>
</body>
</html>`;
}

export function buildMemoryExportHtml(rolePath: string, roleName: string): string {
  const data = readRoleMemory(rolePath, roleName);
  const items = dataToItems(data);
  const tree = buildTree(items);
  return generateHtml(tree, items, roleName);
}

export async function exportMemoryToBrowser(rolePath: string, roleName: string): Promise<string> {
  const html = buildMemoryExportHtml(rolePath, roleName);
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `memories-${roleName}-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html);

  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  await execAsync(`${cmd} "${tmpFile}"`);

  return tmpFile;
}

/** Live server mode - 启动 HTTP 服务器，随机端口 */
export interface LiveServerResult {
  url: string;
  port: number;
  close: () => void;
}

function findAvailablePort(start: number, maxAttempts = 100): number | null {
  for (let i = 0; i < maxAttempts; i++) {
    const port = start + Math.floor(Math.random() * 1000);
    try {
      const server = http.createServer();
      server.listen(port, "127.0.0.1");
      server.close();
      return port;
    } catch {
      // port in use, try next
    }
  }
  return null;
}

export function startMemoryLiveServer(rolePath: string, roleName: string): LiveServerResult {
  const html = buildMemoryExportHtml(rolePath, roleName);
  const port = findAvailablePort(3000) ?? 8080;

  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(html);
  });

  server.listen(port, "127.0.0.1", () => {});

  return {
    url: `http://localhost:${port}`,
    port,
    close: () => server.close(),
  };
}

/** 自动启动 + 打开浏览器 */
export async function openMemoryLiveServer(rolePath: string, roleName: string): Promise<LiveServerResult> {
  const result = startMemoryLiveServer(rolePath, roleName);

  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  await execAsync(`${cmd} "${result.url}"`);

  return result;
}
