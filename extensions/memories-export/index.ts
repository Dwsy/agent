/**
 * Memories Export - 文件夹模式
 * 
 * 一屏展示所有记忆，树形文件夹导航
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface MemoryItem {
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

interface TreeNode {
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

function parseMemoryMd(filePath: string): MemoryItem[] {
  const memories: MemoryItem[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  let currentCategory = "";
  let currentSubCategory = "";
  let indices = { learning: 0, preference: 0, event: 0 };

  for (const line of lines) {
    const categoryMatch = line.match(/^#\s*(Learnings|Preferences|Events)\s*(?:\(([^)]+)\))?/);
    if (categoryMatch) {
      currentCategory = categoryMatch[0].replace("# ", "");
      currentSubCategory = "";
      continue;
    }

    const subCategoryMatch = line.match(/^#\s*Preferences:\s*(\w+)/);
    if (subCategoryMatch) {
      currentSubCategory = subCategoryMatch[1];
      continue;
    }

    const learningMatch = line.match(/^-\s*\[(\d+)x\]\s*(.+)$/);
    if (learningMatch && currentCategory.includes("Learnings")) {
      const count = parseInt(learningMatch[1], 10);
      const contentText = learningMatch[2].trim();
      const priority = currentCategory.toLowerCase().includes("high")
        ? "high"
        : currentCategory.toLowerCase().includes("normal")
        ? "normal"
        : "new";

      memories.push({
        id: generateId("learn", indices.learning++),
        type: "learning",
        priority,
        count,
        category: currentCategory,
        content: contentText,
        tags: extractTags(contentText),
        date: "—",
        source: "MEMORY.md",
      });
      continue;
    }

    const prefMatch = line.match(/^-\s*(.+)$/);
    if (prefMatch && currentCategory.includes("Preferences") && !line.startsWith("#")) {
      const contentText = prefMatch[1].trim();
      if (contentText && !contentText.startsWith("[")) {
        memories.push({
          id: generateId("pref", indices.preference++),
          type: "preference",
          priority: "normal",
          count: 1,
          category: currentCategory,
          subCategory: currentSubCategory,
          content: contentText,
          tags: extractTags(contentText),
          date: "—",
          source: "MEMORY.md",
        });
      }
      continue;
    }

    const eventMatch = line.match(/^##\s*\[([^\]]+)\]\s*(.+)$/);
    if (eventMatch && currentCategory.includes("Events")) {
      const date = eventMatch[1];
      const title = eventMatch[2];

      memories.push({
        id: generateId("event", indices.event++),
        type: "event",
        priority: "normal",
        count: 1,
        category: "Events",
        content: title,
        tags: extractTags(title),
        date,
        source: "MEMORY.md",
      });
    }
  }

  return memories;
}

function parseDailyMd(filePath: string): MemoryItem[] {
  const memories: MemoryItem[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const dateMatch = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : "—";

  let index = 0;

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
        memories.push({
          id: generateId("daily", index++),
          type: "daily",
          priority: subType === "LESSON" ? "high" : "normal",
          count: 1,
          category: `Daily ${subType}`,
          content: entryContent.slice(0, 100) + (entryContent.length > 100 ? "..." : ""),
          tags: extractTags(entryContent),
          date,
          timestamp,
          source: path.basename(filePath),
        });
      }
    }
  }

  return memories;
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

function generateHtml(tree: TreeNode, allItems: MemoryItem[]): string {
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
  <title>Memories</title>
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
    
    /* Sidebar */
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
    
    /* Main */
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
      padding: 5px 10px 5px 28px;
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
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 10px;
      opacity: 0.5;
    }
    
    .breadcrumb {
      color: var(--text-dim);
      font-size: 12px;
    }
    
    .breadcrumb span {
      color: var(--text);
    }
    
    /* Table */
    .table-container {
      flex: 1;
      overflow: auto;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    
    thead {
      position: sticky;
      top: 0;
      background: var(--bg-panel);
      z-index: 10;
    }
    
    th {
      text-align: left;
      padding: 8px 12px;
      font-weight: 500;
      color: var(--text-dim);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    
    td {
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    
    tr:hover td {
      background: var(--bg-hover);
    }
    
    .col-count { width: 40px; text-align: center; }
    .col-content { min-width: 300px; }
    .col-category { width: 140px; }
    .col-date { width: 80px; }
    .col-tags { width: 120px; }
    
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      padding: 1px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
    }
    
    .badge.high { background: var(--high); color: white; }
    .badge.normal { background: var(--normal); color: white; }
    .badge.new { background: var(--new); color: white; }
    .badge.daily { background: var(--accent); color: white; }
    
    .content-cell {
      line-height: 1.5;
      max-width: 600px;
    }
    
    .content-cell .match {
      background: rgba(217, 119, 6, 0.3);
      padding: 0 2px;
      border-radius: 2px;
    }
    
    .tag {
      display: inline-block;
      padding: 1px 5px;
      background: var(--bg-active);
      border-radius: 3px;
      font-size: 10px;
      color: var(--text-dim);
      margin-right: 4px;
    }
    
    .dim { color: var(--text-dim); }
    .muted { color: var(--text-muted); font-size: 11px; }
    
    .empty {
      text-align: center;
      padding: 60px;
      color: var(--text-dim);
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-header">Explorer</div>
      <div class="tree" id="tree"></div>
    </aside>
    
    <main class="main">
      <div class="toolbar">
        <div class="breadcrumb" id="breadcrumb">Memories / <span>All</span></div>
        <div class="search-box">
          <input type="text" id="searchInput" placeholder="Filter..." />
        </div>
      </div>
      
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th class="col-count"></th>
              <th class="col-content">Content</th>
              <th class="col-category">Category</th>
              <th class="col-tags">Tags</th>
              <th class="col-date">Date</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </main>
  </div>

  <script>
    const TREE = JSON.parse('${JSON.stringify(tree).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');
    const ITEMS = JSON.parse('${JSON.stringify(flatItems).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');
    
    let currentPath = "/";
    let searchQuery = "";
    
    function renderTree(node, container, level = 0) {
      const div = document.createElement("div");
      
      const item = document.createElement("div");
      item.className = "tree-item";
      item.style.paddingLeft = (8 + level * 12) + "px";
      item.dataset.path = node.path;
      
      const icon = node.type === "folder" ? "📁" : "📄";
      const hasChildren = node.children && node.children.length > 0;
      
      item.innerHTML = \`
        <span class="icon">\${icon}</span>
        <span class="name">\${node.name}</span>
        <span class="count">\${node.count}</span>
      \`;
      
      item.onclick = () => {
        currentPath = node.path;
        document.querySelectorAll(".tree-item").forEach(el => el.classList.remove("active"));
        item.classList.add("active");
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
      const html = ["Memories", ...parts.map((p, i) => 
        i === parts.length - 1 ? \`<span>\${p}</span>\` : p
      )].join(" / ");
      document.getElementById("breadcrumb").innerHTML = html;
    }
    
    function renderTable() {
      const tbody = document.getElementById("tableBody");
      tbody.innerHTML = "";
      
      let filtered = ITEMS;
      
      // Filter by path
      if (currentPath !== "/") {
        filtered = filtered.filter(i => i.path === currentPath || i.path.startsWith(currentPath + "/"));
      }
      
      // Filter by search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(i => 
          i.content.toLowerCase().includes(q) ||
          i.tags.some(t => t.toLowerCase().includes(q))
        );
      }
      
      if (filtered.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="5" class="empty">No items</td></tr>\`;
        return;
      }
      
      filtered.forEach(item => {
        const tr = document.createElement("tr");
        
        let content = escapeHtml(item.content);
        if (searchQuery) {
          const regex = new RegExp("(" + escapeRegExp(searchQuery) + ")", "gi");
          content = content.replace(regex, '<span class="match">$1</span>');
        }
        
        const badgeClass = item.type === "daily" ? "daily" : (item.priority || "normal");
        
        tr.innerHTML = \`
          <td class="col-count"><span class="badge \${badgeClass}">\${item.count}x</span></td>
          <td class="col-content"><div class="content-cell">\${content}</div></td>
          <td class="col-category dim">\${item.category}\${item.subCategory ? "/" + item.subCategory : ""}</td>
          <td class="col-tags">\${item.tags.map(t => \`<span class="tag">#\${t}</span>\`).join("")}</td>
          <td class="col-date muted">\${item.date}</td>
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
      return string.replace(/[.*+?^\${}()|[\]\\\\]/g, "\\\\$&");
    }
    
    // Init
    renderTree(TREE, document.getElementById("tree"));
    renderTable();
    
    // Search
    document.getElementById("searchInput").addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderTable();
    });
    
    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("searchInput").focus();
      }
      if (e.key === "Escape") {
        document.getElementById("searchInput").blur();
      }
    });
  </script>
</body>
</html>`;
}

export default function (pi: ExtensionAPI) {
  if (process.argv.includes("--mode") && process.argv.includes("rpc")) return;
  pi.registerCommand("memory-export", {
    description: "导出记忆为文件夹视图 HTML",
    
    handler: async (args, ctx) => {
      const shouldOpen = args.includes("--open");
      
      try {
        ctx.ui.setWorkingMessage("导出记忆...");
        
        // 从 role-persona 配置中读取当前角色
        const roleConfigPath = path.join(os.homedir(), ".pi/agent/roles/.config.json");
        let currentRole = "zero";
        if (fs.existsSync(roleConfigPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(roleConfigPath, "utf-8"));
            // 尝试获取当前工作目录对应的角色映射
            const cwd = process.cwd();
            if (config.mappings) {
              for (const [mappedPath, role] of Object.entries(config.mappings)) {
                if (cwd.startsWith(mappedPath)) {
                  currentRole = role as string;
                  break;
                }
              }
            }
            // 如果没有映射，使用默认角色
            if (currentRole === "zero" && config.defaultRole) {
              currentRole = config.defaultRole;
            }
          } catch {
            // 解析失败时使用默认 zero
          }
        }
        
        const rolePath = path.join(os.homedir(), ".pi/agent/roles", currentRole);
        const items: MemoryItem[] = [];
        
        if (fs.existsSync(path.join(rolePath, "MEMORY.md"))) {
          items.push(...parseMemoryMd(path.join(rolePath, "MEMORY.md")));
        }
        
        const dailyPath = path.join(rolePath, "memory");
        if (fs.existsSync(dailyPath)) {
          fs.readdirSync(dailyPath)
            .filter(f => f.endsWith(".md") && !f.includes("backup"))
            .forEach(f => {
              items.push(...parseDailyMd(path.join(dailyPath, f)));
            });
        }
        
        const tree = buildTree(items);
        const html = generateHtml(tree, items);
        
        const outputPath = path.join(os.tmpdir(), `memories-${currentRole}-${Date.now()}.html`);
        fs.writeFileSync(outputPath, html);
        
        ctx.ui.notify(`✓ 导出角色 [${currentRole}] 的 ${items.length} 条记忆`, "success");
        
        if (shouldOpen || await ctx.ui.confirm("打开文件?", outputPath)) {
          const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
          await execAsync(`${cmd} "${outputPath}"`).catch(() => {});
        }
      } catch (err) {
        ctx.ui.notify(String(err), "error");
      } finally {
        ctx.ui.setWorkingMessage(undefined);
      }
    },
  });
}
