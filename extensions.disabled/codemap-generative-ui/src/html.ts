import type { CodeMapDocument } from "./types.ts";

function escapeScriptJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function toGuideItems(traceGuide?: string) {
  if (!traceGuide) {
    return [] as string[];
  }
  return traceGuide
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").replace(/^\d+[.)]\s*/, ""));
}

function buildViewModel(codeMap: CodeMapDocument) {
  return {
    title: codeMap.title,
    description: codeMap.description ?? "",
    mermaidDiagram: codeMap.mermaidDiagram ?? "",
    traces: (codeMap.traces ?? []).map((trace) => ({
      id: trace.id,
      label: trace.title,
      title: trace.title,
      description: trace.description ?? "",
      mermaid: "",
      textDiagram: trace.traceTextDiagram ?? "",
      guide: toGuideItems(trace.traceGuide),
      locations: (trace.locations ?? []).map((location) => ({
        id: location.id ?? "",
        title: location.title ?? location.path,
        path: location.path + (location.lineNumber ? `:${location.lineNumber}` : ""),
        line: location.lineContent ?? "",
        description: location.description ?? "",
        traceId: trace.id,
        traceTitle: trace.title,
      })),
    })),
  };
}

export function buildCodeMapHtml(codeMap: CodeMapDocument, sourcePath: string) {
  const viewModel = buildViewModel(codeMap);
  const payload = escapeScriptJson(viewModel);
  const sourceLabel = escapeScriptJson(sourcePath);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${codeMap.title}</title>
  <style>
    :root {
      --bg: #0f141a;
      --panel: #161d24;
      --panel-2: #1e2731;
      --text: #e5edf5;
      --muted: #95a4b6;
      --border: #2a3642;
      --accent: #6ea8fe;
      --purple: #a78bfa;
      --green: #34d399;
      --amber: #fbbf24;
      --red: #f87171;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .page {
      max-width: 1440px;
      margin: 0 auto;
      padding: 20px;
    }
    .hero, .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
    }
    .hero {
      padding: 20px 22px;
      margin-bottom: 14px;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.2;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
      line-height: 1.75;
      font-size: 14px;
    }
    .meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 14px;
    }
    .meta span {
      font-size: 12px;
      color: var(--muted);
      border: 1px solid var(--border);
      background: var(--panel-2);
      padding: 6px 10px;
      border-radius: 999px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .stat {
      background: var(--panel-2);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px;
    }
    .stat-label { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
    .stat-value { font-size: 22px; font-weight: 600; }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 14px 0;
    }
    .tab {
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      border-radius: 999px;
      padding: 9px 14px;
      cursor: pointer;
      font-size: 13px;
      transition: .2s ease;
    }
    .tab:hover { border-color: #3b4b5b; }
    .tab.active {
      background: var(--accent);
      color: #08101a;
      border-color: var(--accent);
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(360px, 440px);
      gap: 14px;
      align-items: start;
    }
    .card {
      padding: 18px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 20px;
    }
    h3 {
      margin: 16px 0 8px;
      font-size: 15px;
    }
    .desc {
      margin: 0;
      color: var(--muted);
      line-height: 1.75;
      font-size: 14px;
    }
    .legend {
      display: grid;
      gap: 8px;
      margin-top: 16px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex: 0 0 auto;
    }
    .dot.blue { background: var(--accent); }
    .dot.purple { background: var(--purple); }
    .dot.green { background: var(--green); }
    .dot.amber { background: var(--amber); }
    .dot.red { background: var(--red); }
    #diagram svg { max-width: 100%; height: auto; }
    pre {
      margin: 0;
      padding: 14px;
      background: #0b1118;
      border: 1px solid var(--border);
      border-radius: 14px;
      color: #d9e4f0;
      font-size: 12px;
      line-height: 1.7;
      overflow: auto;
    }
    ol {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
      line-height: 1.75;
      font-size: 14px;
    }
    .locations {
      display: grid;
      gap: 10px;
    }
    .location {
      border: 1px solid var(--border);
      background: var(--panel-2);
      border-radius: 14px;
      padding: 12px 14px;
      cursor: pointer;
      transition: .2s ease;
    }
    .location:hover { border-color: var(--accent); }
    .location-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
      align-items: baseline;
    }
    .location-title { font-size: 14px; font-weight: 600; }
    .location-id { color: var(--muted); font-size: 12px; }
    .location-path {
      color: #8fc5ff;
      font-size: 12px;
      line-height: 1.65;
      word-break: break-all;
    }
    .location-line {
      margin-top: 6px;
      padding: 8px 10px;
      border-radius: 10px;
      background: #101922;
      color: #dbeafe;
      font-size: 12px;
      line-height: 1.65;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .location-desc {
      margin-top: 6px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }
    .overview {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .overview-item {
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel-2);
      padding: 12px 14px;
    }
    .overview-item h4 {
      margin: 0 0 6px;
      font-size: 14px;
    }
    .overview-item p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }
    .footer-note {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 13px;
      line-height: 1.75;
    }
    code {
      background: #0b1118;
      border-radius: 6px;
      padding: 2px 6px;
      font-size: 12px;
      color: #dbeafe;
    }
    @media (max-width: 1180px) {
      .layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      .stats, .overview { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <h1 id="heroTitle"></h1>
      <p id="heroDesc"></p>
      <div class="meta">
        <span>CodeMap generative UI</span>
        <span id="metaSource"></span>
        <span id="metaTrace"></span>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-label">Trace 数量</div><div class="stat-value" id="traceCount"></div></div>
        <div class="stat"><div class="stat-label">关键定位点</div><div class="stat-value" id="locationCount"></div></div>
        <div class="stat"><div class="stat-label">主标题</div><div class="stat-value" id="mainTitle"></div></div>
        <div class="stat"><div class="stat-label">模式</div><div class="stat-value">CodeMap</div></div>
      </div>
    </section>

    <div class="tabs" id="tabs"></div>

    <section class="layout">
      <div class="card">
        <h2 id="diagramTitle"></h2>
        <p class="desc" id="diagramDesc"></p>
        <div id="diagram" style="margin-top:14px"></div>
        <div class="overview" id="overview"></div>
        <div class="footer-note" id="footer"></div>
      </div>
      <aside class="card">
        <h2 id="sideTitle"></h2>
        <p class="desc" id="sideDesc"></p>
        <div class="legend">
          <div class="legend-item"><span class="dot blue"></span><span>入口 / 接入层</span></div>
          <div class="legend-item"><span class="dot purple"></span><span>业务编排 / trace 主体</span></div>
          <div class="legend-item"><span class="dot amber"></span><span>支付核心 / Provider / Mermaid 逻辑块</span></div>
          <div class="legend-item"><span class="dot green"></span><span>状态同步 / 业务收口</span></div>
          <div class="legend-item"><span class="dot red"></span><span>风险 / 补偿 / 特殊支路</span></div>
        </div>
        <h3>文本调用图</h3>
        <pre id="textDiagram"></pre>
        <h3>阅读要点</h3>
        <ol id="guide"></ol>
        <h3>关键定位点</h3>
        <div class="locations" id="locations"></div>
      </aside>
    </section>
  </div>

  <script>
    const codeMap = ${payload};
    const sourcePathLabel = ${sourceLabel};
    const overviewCards = [
      ["先看总览", "先看 overview，把入口、业务编排、支付内核、状态同步这几层关系站稳。"],
      ["再下钻 trace", "按 trace 看每条链路的入口、门面、收口点，不要一开始就扎进局部文件。"],
      ["最后对照定位点", "定位点列表适合做真正代码跳转，页面负责看结构，不负责代替 IDE。"],
      ["适合做 handoff", "这个页面很适合交接和审查，尤其是复杂支付链、回调链、补偿链。"]
    ];

    const tabs = document.getElementById("tabs");
    const heroTitle = document.getElementById("heroTitle");
    const heroDesc = document.getElementById("heroDesc");
    const metaSource = document.getElementById("metaSource");
    const metaTrace = document.getElementById("metaTrace");
    const traceCount = document.getElementById("traceCount");
    const locationCount = document.getElementById("locationCount");
    const mainTitle = document.getElementById("mainTitle");
    const diagramTitle = document.getElementById("diagramTitle");
    const diagramDesc = document.getElementById("diagramDesc");
    const diagram = document.getElementById("diagram");
    const overview = document.getElementById("overview");
    const footer = document.getElementById("footer");
    const sideTitle = document.getElementById("sideTitle");
    const sideDesc = document.getElementById("sideDesc");
    const textDiagram = document.getElementById("textDiagram");
    const guide = document.getElementById("guide");
    const locations = document.getElementById("locations");

    const views = [{ id: "overview", label: "总览", overview: true }, ...(codeMap.traces || []).map(trace => ({ ...trace, overview: false }))];

    heroTitle.textContent = codeMap.title || "CodeMap";
    heroDesc.textContent = codeMap.description || "";
    metaSource.textContent = sourcePathLabel;
    metaTrace.textContent = "traces: " + String((codeMap.traces || []).length);
    traceCount.textContent = String((codeMap.traces || []).length);
    locationCount.textContent = String((codeMap.traces || []).reduce((sum, trace) => sum + (trace.locations || []).length, 0));
    mainTitle.textContent = (codeMap.title || "CodeMap").slice(0, 12);

    function escapeHtml(text) {
      return String(text || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    }

    function setTabs() {
      tabs.innerHTML = views.map(view => '<button class="tab" data-id="' + escapeHtml(view.id) + '">' + escapeHtml(view.label) + '</button>').join("");
      tabs.addEventListener("click", (event) => {
        const button = event.target.closest(".tab");
        if (!button) return;
        renderView(button.dataset.id);
      });
    }

    async function renderMermaid(sourceCode) {
      if (!sourceCode) {
        diagram.innerHTML = '<div class="desc">当前视图没有 Mermaid 图。</div>';
        return;
      }
      const id = 'mermaid_' + Math.random().toString(36).slice(2);
      const { svg } = await mermaid.render(id, sourceCode);
      diagram.innerHTML = svg;
    }

    function renderGuide(items) {
      guide.innerHTML = (items || []).map(item => '<li>' + escapeHtml(item) + '</li>').join("");
      if (!guide.innerHTML) {
        guide.innerHTML = '<li>当前 trace 没写 guide，可直接看文本调用图和定位点。</li>';
      }
    }

    function emitLocationClick(location) {
      const payload = { type: 'codemap-location-click', location: location };
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
      if (window.glimpse && typeof window.glimpse.send === 'function') {
        try {
          window.glimpse.send(payload);
        } catch {
        }
      }
    }

    function bindLocationClicks(items) {
      document.querySelectorAll('.location[data-location-index]').forEach((node) => {
        node.addEventListener('click', () => {
          const index = Number(node.getAttribute('data-location-index'));
          const location = (items || [])[index];
          if (!location) {
            return;
          }
          emitLocationClick(location);
        });
      });
    }

    function renderLocations(items) {
      const list = items || [];
      locations.innerHTML = list.map((item, index) => [
        '<div class="location" data-location-index="' + String(index) + '">',
        '  <div class="location-head">',
        '    <div class="location-title">' + escapeHtml(item.title || item.path) + '</div>',
        '    <div class="location-id">' + escapeHtml(item.id || '') + '</div>',
        '  </div>',
        '  <div class="location-path">' + escapeHtml(item.path || '') + '</div>',
        '  <div class="location-line">' + escapeHtml(item.line || '') + '</div>',
        '  <div class="location-desc">' + escapeHtml(item.description || '') + '</div>',
        '</div>'
      ].join('')).join("");
      if (!locations.innerHTML) {
        locations.innerHTML = '<div class="location"><div class="location-desc">当前 trace 没有定位点。</div></div>';
        return;
      }
      bindLocationClicks(list);
    }

    function renderOverview() {
      overview.innerHTML = overviewCards.map(([title, text]) => [
        '<div class="overview-item">',
        '  <h4>' + escapeHtml(title) + '</h4>',
        '  <p>' + escapeHtml(text) + '</p>',
        '</div>'
      ].join('')).join("");
      footer.innerHTML = '这份页面来自 <code>CodeMap JSON</code>，适合做链路梳理、handoff、复杂系统复盘。正如《EVA》里那句：<strong>“所谓奇迹，是努力的另一个名字。”</strong> 对复杂后端来说，清晰结构图本身就是努力的一部分。';
    }

    async function renderView(id) {
      document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.id === id));
      const view = views.find(item => item.id === id) || views[0];
      if (view.overview) {
        diagramTitle.textContent = codeMap.title || "CodeMap 总览";
        diagramDesc.textContent = codeMap.description || "";
        sideTitle.textContent = "总览阅读顺序";
        sideDesc.textContent = "建议顺序：先看 overview，再看具体 trace，最后回到定位点做代码跳转。";
        textDiagram.textContent = [
          codeMap.title || "CodeMap",
          "├── 总览结构",
          "├── trace 切换",
          "├── 文本调用图",
          "└── 关键定位点"
        ].join("\n");
        renderGuide([
          "先把全局层次看清，再切到具体 trace。",
          "trace 视图负责链路细节，overview 负责体系感。",
          "定位点列表最适合拿去对照 IDE 或代码搜索。"
        ]);
        renderLocations((codeMap.traces || []).flatMap(trace => (trace.locations || []).slice(0, 1).map(location => ({
          id: trace.id,
          title: trace.title,
          path: location.path + (location.lineNumber ? ':' + String(location.lineNumber) : ""),
          line: location.lineContent || "",
          description: location.description || trace.description || "",
        }))));
        renderOverview();
        await renderMermaid(codeMap.mermaidDiagram || "");
        return;
      }

      diagramTitle.textContent = view.title || "Trace";
      diagramDesc.textContent = view.description || "";
      sideTitle.textContent = view.title || "Trace";
      sideDesc.textContent = view.description || "";
      textDiagram.textContent = view.textDiagram || "";
      renderGuide(view.guide || []);
      renderLocations(view.locations || []);
      overview.innerHTML = "";
      footer.innerHTML = '当前视图是 trace <code>' + escapeHtml(view.id || '') + '</code>。如果要继续深化，建议下一步补“状态机对照图”或“调用时序图”。';
      await renderMermaid(view.mermaid || codeMap.mermaidDiagram || "");
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      flowchart: { curve: "basis", htmlLabels: true },
      themeVariables: {
        primaryTextColor: "#e5edf5",
        lineColor: "#95a4b6",
        fontSize: "14px",
        background: "#161d24",
        mainBkg: "#1e2731",
        clusterBkg: "#161d24",
        clusterBorder: "#2a3642"
      }
    });
    setTabs();
    renderView("overview");
  </script>
</body>
</html>`;
}

export function buildCodeMapWidgetCode(codeMap: CodeMapDocument, sourcePath: string) {
  const viewModel = buildViewModel(codeMap);
  const payload = escapeScriptJson(viewModel);
  const sourceLabel = escapeScriptJson(sourcePath);
  return `<style>
  .cmg-root{max-width:1440px;margin:0 auto;padding:20px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--color-text-primary)}
  .cmg-hero,.cmg-card{background:var(--color-background-secondary);border:0.5px solid var(--color-border-tertiary);border-radius:12px}
  .cmg-hero{padding:20px 22px;margin-bottom:14px}.cmg-hero h1{margin:0 0 8px;font-size:28px;line-height:1.2}.cmg-hero p,.cmg-desc,.cmg-meta span,.cmg-legend-item,.cmg-overview-item p,.cmg-location-desc,.cmg-note,.cmg-location-id{color:var(--color-text-secondary)}
  .cmg-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.cmg-meta span,.cmg-tab,.cmg-stat,.cmg-location,.cmg-overview-item{background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px}
  .cmg-meta span{font-size:12px;padding:6px 10px;border-radius:999px}.cmg-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px}.cmg-stat{padding:12px 14px}.cmg-stat-label{color:var(--color-text-tertiary);font-size:12px;margin-bottom:6px}.cmg-stat-value{font-size:22px;font-weight:500}
  .cmg-tabs{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.cmg-tab{padding:9px 14px;cursor:pointer;font-size:13px;transition:.2s ease}.cmg-tab.active{background:var(--color-background-info);border-color:var(--color-border-info);color:var(--color-text-info)}
  .cmg-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(360px,440px);gap:14px;align-items:start}.cmg-card{padding:18px}.cmg-root h2{margin:0 0 8px;font-size:20px}.cmg-root h3{margin:16px 0 8px;font-size:15px}
  .cmg-legend{display:grid;gap:8px;margin-top:16px}.cmg-legend-item{display:flex;align-items:center;gap:10px;font-size:13px}.cmg-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}.cmg-dot.blue{background:#6ea8fe}.cmg-dot.purple{background:#a78bfa}.cmg-dot.green{background:#34d399}.cmg-dot.amber{background:#fbbf24}.cmg-dot.red{background:#f87171}
  .cmg-pre{margin:0;padding:14px;background:var(--color-background-tertiary);border:0.5px solid var(--color-border-tertiary);border-radius:14px;color:var(--color-text-primary);font-size:12px;line-height:1.7;overflow:auto;font-family:var(--font-mono)}
  .cmg-guide{margin:0;padding-left:18px;color:var(--color-text-secondary);line-height:1.75;font-size:14px}.cmg-locations{display:grid;gap:10px}.cmg-location{padding:12px 14px;cursor:pointer;transition:.2s ease}.cmg-location:hover{border-color:var(--color-border-info)}
  .cmg-location-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:6px;align-items:baseline}.cmg-location-title{font-size:14px;font-weight:500;color:var(--color-text-primary)}.cmg-location-path{color:var(--color-text-info);font-size:12px;line-height:1.65;word-break:break-all}
  .cmg-location-line{margin-top:6px;padding:8px 10px;border-radius:10px;background:var(--color-background-info);color:var(--color-text-primary);font-size:12px;line-height:1.65;word-break:break-word;font-family:var(--font-mono)}
  .cmg-overview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.cmg-overview-item{padding:12px 14px}.cmg-overview-item h4{margin:0 0 6px;font-size:14px}.cmg-note{margin-top:14px;padding-top:12px;border-top:0.5px solid var(--color-border-tertiary);font-size:13px;line-height:1.75}
  @media (max-width:1180px){.cmg-layout{grid-template-columns:1fr}} @media (max-width:720px){.cmg-stats,.cmg-overview{grid-template-columns:1fr 1fr}}
  </style>
  <div class="cmg-root">
    <section class="cmg-hero">
      <h1 id="cmgHeroTitle"></h1>
      <p id="cmgHeroDesc"></p>
      <div class="cmg-meta">
        <span>CodeMap generative UI</span>
        <span id="cmgMetaSource"></span>
        <span id="cmgMetaTrace"></span>
      </div>
      <div class="cmg-stats">
        <div class="cmg-stat"><div class="cmg-stat-label">Trace 数量</div><div class="cmg-stat-value" id="cmgTraceCount"></div></div>
        <div class="cmg-stat"><div class="cmg-stat-label">关键定位点</div><div class="cmg-stat-value" id="cmgLocationCount"></div></div>
        <div class="cmg-stat"><div class="cmg-stat-label">主标题</div><div class="cmg-stat-value" id="cmgMainTitle"></div></div>
        <div class="cmg-stat"><div class="cmg-stat-label">模式</div><div class="cmg-stat-value">Widget</div></div>
      </div>
    </section>
    <div class="cmg-tabs" id="cmgTabs"></div>
    <section class="cmg-layout">
      <div class="cmg-card">
        <h2 id="cmgDiagramTitle"></h2>
        <p class="cmg-desc" id="cmgDiagramDesc"></p>
        <div id="cmgDiagram" style="margin-top:14px"></div>
        <div class="cmg-overview" id="cmgOverview"></div>
        <div class="cmg-note" id="cmgFooter"></div>
      </div>
      <aside class="cmg-card">
        <h2 id="cmgSideTitle"></h2>
        <p class="cmg-desc" id="cmgSideDesc"></p>
        <div class="cmg-legend">
          <div class="cmg-legend-item"><span class="cmg-dot blue"></span><span>入口 / 接入层</span></div>
          <div class="cmg-legend-item"><span class="cmg-dot purple"></span><span>业务编排 / trace 主体</span></div>
          <div class="cmg-legend-item"><span class="cmg-dot amber"></span><span>逻辑块 / Mermaid</span></div>
          <div class="cmg-legend-item"><span class="cmg-dot green"></span><span>状态同步 / 收口</span></div>
          <div class="cmg-legend-item"><span class="cmg-dot red"></span><span>风险 / 特殊支路</span></div>
        </div>
        <h3>文本调用图</h3>
        <pre class="cmg-pre" id="cmgTextDiagram"></pre>
        <h3>阅读要点</h3>
        <ol class="cmg-guide" id="cmgGuide"></ol>
        <h3>关键定位点</h3>
        <div class="cmg-locations" id="cmgLocations"></div>
      </aside>
    </section>
  </div>
  <script>
    const codeMap = ${payload};
    const sourcePathLabel = ${sourceLabel};
    const overviewCards = [
      ["先看总览","先把入口、编排、核心收口这些层站稳。"],
      ["再看 trace","按 trace 看链路，而不是一开始就扎进单个文件。"],
      ["定位点可点","点任意定位点可以把分析继续回传给 portal 或 Glimpse。"],
      ["默认先展示","普通请求优先 widget 可视化，不默认先落盘。"]
    ];
    const tabs = document.getElementById('cmgTabs');
    const heroTitle = document.getElementById('cmgHeroTitle');
    const heroDesc = document.getElementById('cmgHeroDesc');
    const metaSource = document.getElementById('cmgMetaSource');
    const metaTrace = document.getElementById('cmgMetaTrace');
    const traceCount = document.getElementById('cmgTraceCount');
    const locationCount = document.getElementById('cmgLocationCount');
    const mainTitle = document.getElementById('cmgMainTitle');
    const diagramTitle = document.getElementById('cmgDiagramTitle');
    const diagramDesc = document.getElementById('cmgDiagramDesc');
    const diagram = document.getElementById('cmgDiagram');
    const overview = document.getElementById('cmgOverview');
    const footer = document.getElementById('cmgFooter');
    const sideTitle = document.getElementById('cmgSideTitle');
    const sideDesc = document.getElementById('cmgSideDesc');
    const textDiagram = document.getElementById('cmgTextDiagram');
    const guide = document.getElementById('cmgGuide');
    const locations = document.getElementById('cmgLocations');
    const views = [{ id:'overview', label:'总览', overview:true }, ...(codeMap.traces || []).map(trace => ({ ...trace, overview:false }))];
    function escapeHtml(text){ return String(text || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
    function emitLocationClick(location){ const payload={ type:'codemap-location-click', location:location }; if(window.parent && window.parent!==window){ window.parent.postMessage(payload,'*'); } if(window.glimpse && typeof window.glimpse.send==='function'){ try { window.glimpse.send(payload); } catch {} } }
    function bindLocationClicks(items){ document.querySelectorAll('.cmg-location[data-location-index]').forEach((node)=>{ node.addEventListener('click',()=>{ const index=Number(node.getAttribute('data-location-index')); const location=(items || [])[index]; if(location) emitLocationClick(location); }); }); }
    async function renderMermaid(sourceCode){ if(!sourceCode){ diagram.innerHTML='<div class="cmg-desc">当前视图没有 Mermaid 图。</div>'; return; } const id='cmg_mermaid_'+Math.random().toString(36).slice(2); const result = await mermaid.render(id, sourceCode); diagram.innerHTML = result.svg; }
    function renderGuide(items){ guide.innerHTML=(items || []).map(item => '<li>' + escapeHtml(item) + '</li>').join(''); if(!guide.innerHTML){ guide.innerHTML='<li>当前 trace 没写 guide，可直接看文本调用图和定位点。</li>'; } }
    function renderLocations(items){ const list=items || []; locations.innerHTML=list.map((item,index)=>['<div class="cmg-location" data-location-index="'+String(index)+'">','<div class="cmg-location-head">','<div class="cmg-location-title">'+escapeHtml(item.title || item.path)+'</div>','<div class="cmg-location-id">'+escapeHtml(item.id || '')+'</div>','</div>','<div class="cmg-location-path">'+escapeHtml(item.path || '')+'</div>','<div class="cmg-location-line">'+escapeHtml(item.line || '')+'</div>','<div class="cmg-location-desc">'+escapeHtml(item.description || '')+'</div>','</div>'].join('')).join(''); if(!locations.innerHTML){ locations.innerHTML='<div class="cmg-location"><div class="cmg-location-desc">当前 trace 没有定位点。</div></div>'; return; } bindLocationClicks(list); }
    function renderOverview(){ overview.innerHTML=overviewCards.map(([title,text])=>['<div class="cmg-overview-item">','<h4>'+escapeHtml(title)+'</h4>','<p>'+escapeHtml(text)+'</p>','</div>'].join('')).join(''); footer.innerHTML='默认是 widget-first 的 CodeMap 体验。只有在需要保存和复用时，才建议再走持久化导出。'; }
    async function renderView(id){ document.querySelectorAll('.cmg-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.id===id)); const view=views.find(item=>item.id===id) || views[0]; if(view.overview){ diagramTitle.textContent=codeMap.title || 'CodeMap 总览'; diagramDesc.textContent=codeMap.description || ''; sideTitle.textContent='总览阅读顺序'; sideDesc.textContent='建议顺序：先看总览，再看具体 trace，最后点定位点继续深挖。'; textDiagram.textContent=[codeMap.title || 'CodeMap','├── 总览结构','├── trace 切换','├── 文本调用图','└── 关键定位点'].join('\n'); renderGuide(['先看体系，再看细节。','默认先展示，不默认先导出。','点击定位点可以继续让 agent 深挖。']); renderLocations((codeMap.traces || []).flatMap(trace => (trace.locations || []).slice(0,1).map(location => ({ id: trace.id, title: trace.title, path: location.path + (location.lineNumber ? ':' + String(location.lineNumber) : ''), line: location.lineContent || '', description: location.description || trace.description || '', traceId: trace.id, traceTitle: trace.title })))); renderOverview(); await renderMermaid(codeMap.mermaidDiagram || ''); return; } diagramTitle.textContent=view.title || 'Trace'; diagramDesc.textContent=view.description || ''; sideTitle.textContent=view.title || 'Trace'; sideDesc.textContent=view.description || ''; textDiagram.textContent=view.textDiagram || ''; renderGuide(view.guide || []); renderLocations(view.locations || []); overview.innerHTML=''; footer.innerHTML='当前视图是 trace <code>' + escapeHtml(view.id || '') + '</code>。如需保存，再走持久化导出。'; await renderMermaid(view.mermaid || codeMap.mermaidDiagram || ''); }
    function setTabs(){ tabs.innerHTML=views.map(view => '<button class="cmg-tab" data-id="'+escapeHtml(view.id)+'">'+escapeHtml(view.label)+'</button>').join(''); tabs.addEventListener('click',(event)=>{ const button=event.target.closest('.cmg-tab'); if(button) renderView(button.dataset.id); }); }
    heroTitle.textContent=codeMap.title || 'CodeMap'; heroDesc.textContent=codeMap.description || ''; metaSource.textContent=sourcePathLabel; metaTrace.textContent='traces: ' + String((codeMap.traces || []).length); traceCount.textContent=String((codeMap.traces || []).length); locationCount.textContent=String((codeMap.traces || []).reduce((sum, trace) => sum + (trace.locations || []).length, 0)); mainTitle.textContent=(codeMap.title || 'CodeMap').slice(0,12); setTabs();
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({ startOnLoad:false, securityLevel:'loose', theme:'base', fontFamily:'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', flowchart:{ curve:'basis', htmlLabels:true }, themeVariables:{ primaryTextColor:'#111827', lineColor:'#95a4b6', fontSize:'14px', background:'#ffffff', mainBkg:'#ffffff', clusterBkg:'#ffffff', clusterBorder:'#d9e0ea' } });
    renderView('overview');
  </script>`;
}
