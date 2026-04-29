export function buildPortalHtml(port: number) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CodeMap Generative UI Portal</title>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #121a29;
      --panel-2: #182235;
      --panel-3: #0a1019;
      --text: #e8eef7;
      --muted: #8ea1ba;
      --border: #253247;
      --accent: #79b8ff;
      --green: #34d399;
      --amber: #fbbf24;
      --red: #f87171;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: var(--bg); color: var(--text); }
    .page { max-width: 1540px; margin: 0 auto; padding: 18px; }
    .hero, .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; }
    .hero { padding: 18px 20px; margin-bottom: 14px; }
    .hero h1 { margin: 0 0 8px; font-size: 28px; }
    .hero p { margin: 0; color: var(--muted); line-height: 1.8; font-size: 14px; }
    .meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    .meta span { border: 1px solid var(--border); background: var(--panel-2); border-radius: 999px; padding: 6px 10px; font-size: 12px; color: var(--muted); }
    .layout { display: grid; grid-template-columns: 380px 340px minmax(0, 1fr); gap: 14px; }
    .panel { padding: 16px; }
    h2 { margin: 0 0 10px; font-size: 19px; }
    h3 { margin: 0 0 8px; font-size: 15px; }
    .section { margin-top: 18px; }
    .section:first-child { margin-top: 0; }
    label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    input, textarea { width: 100%; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); border-radius: 12px; padding: 10px 12px; font: inherit; }
    textarea { min-height: 110px; resize: vertical; }
    .row { display: grid; gap: 10px; margin-bottom: 12px; }
    .actions, .mini-actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .actions { margin-top: 12px; }
    button { border: 1px solid var(--border); background: var(--panel-2); color: var(--text); border-radius: 12px; padding: 10px 14px; cursor: pointer; font: inherit; }
    button.primary { background: var(--accent); color: #08111d; border-color: var(--accent); }
    button:hover { filter: brightness(1.08); }
    #events { height: 220px; overflow: auto; border: 1px solid var(--border); border-radius: 14px; background: var(--panel-3); padding: 10px; font-size: 12px; line-height: 1.6; }
    .event { margin-bottom: 6px; color: var(--muted); }
    .event.success { color: var(--green); }
    .event.warn { color: var(--amber); }
    .event.error { color: var(--red); }
    .event.info { color: var(--accent); }
    #existingList, #historyList { display: grid; gap: 8px; margin-top: 10px; }
    .entry, .history-item {
      border: 1px solid var(--border);
      background: var(--panel-2);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .entry { cursor: pointer; }
    .entry:hover, .history-item:hover { border-color: var(--accent); }
    .entry-title, .history-title { font-size: 13px; font-weight: 600; }
    .entry-meta, .history-meta { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.65; word-break: break-all; }
    .history-item.active { border-color: var(--green); }
    .history-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .history-actions button { padding: 6px 10px; font-size: 12px; border-radius: 10px; }
    #preview { width: 100%; min-height: 920px; border: 1px solid var(--border); border-radius: 14px; background: white; }
    .toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 10px; }
    .status { font-size: 12px; color: var(--muted); }
    .tips { color: var(--muted); font-size: 12px; line-height: 1.7; }
    .empty { color: var(--muted); font-size: 12px; padding: 8px 0; }
    @media (max-width: 1320px) { .layout { grid-template-columns: 1fr; } #preview { min-height: 620px; } }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <h1>CodeMap Generative UI Portal</h1>
      <p>这是一个基于 <code>glimpseui</code> 思路的本地端口 + WebSocket 工作台。你可以在网页里发起生成请求、浏览已有 CodeMap、查看 agent/tool 事件、点击定位点把分析任务回传给当前会话，并直接预览 HTML 渲染结果。</p>
      <div class="meta">
        <span>HTTP Port: ${port}</span>
        <span id="wsState">WS: connecting</span>
        <span>模式：生成式插件宿主</span>
      </div>
    </section>
    <section class="layout">
      <aside class="panel">
        <div class="section">
          <h2>生成操作台</h2>
          <div class="row">
            <div>
              <label>需求描述</label>
              <textarea id="query" placeholder="例如：深度扫描支付系统后端全链路并生成 CodeMap"></textarea>
            </div>
            <div>
              <label>搜索根目录（每行一个，可选）</label>
              <textarea id="roots" placeholder="bestwond-fast-service\ndocs"></textarea>
            </div>
            <div>
              <label>已有路径（可选）</label>
              <input id="path" placeholder="docs/.codemap/index.json 或某个 codemap json/html" />
            </div>
            <div>
              <label>CodeMap ID / 标题（可选）</label>
              <input id="entryId" placeholder="20260327-001" />
            </div>
          </div>
          <div class="actions">
            <button class="primary" id="generateBtn">发起生成</button>
            <button id="renderBtn">渲染已有</button>
            <button id="listBtn">列出已有</button>
            <button id="openBtn">Glimpse 打开</button>
          </div>
        </div>
        <div class="section">
          <h2>现有 CodeMap</h2>
          <div class="tips">点击条目会自动回填 <code>path</code> 和 <code>id</code>，方便直接渲染或继续生成。</div>
          <div id="existingList"></div>
        </div>
      </aside>
      <aside class="panel">
        <div class="section">
          <h2>最近生成历史</h2>
          <div class="tips">这里保留最近 20 个渲染结果。可以快速回放预览，或再次用原生窗口打开。</div>
          <div id="historyList"></div>
        </div>
        <div class="section">
          <h2>选中定位点</h2>
          <div class="tips">点击右侧预览中的定位点后，这里会显示当前选中项。你可以继续分析，或直接发起 trace 增量修正。</div>
          <div id="selectedLocationCard" class="history-item">
            <div class="empty">还没有选中任何定位点。</div>
          </div>
          <div class="mini-actions" style="margin-top:10px;">
            <button id="analyzeBtn">继续分析</button>
            <button id="refineBtn">增量修正 trace</button>
          </div>
        </div>
        <div class="section">
          <h2>实时事件</h2>
          <div id="events"></div>
        </div>
      </aside>
      <main class="panel">
        <div class="toolbar">
          <h2 style="margin:0">HTML 预览</h2>
          <div class="status" id="status">idle</div>
        </div>
        <div class="tips" style="margin-bottom:10px;">如果你在预览页点击某个定位点，portal 会把该定位点分析请求通过 WebSocket 回传给当前 agent 会话。</div>
        <iframe id="preview"></iframe>
      </main>
    </section>
  </div>

  <script>
    const ws = new WebSocket('ws://' + location.host + '/ws');
    const wsState = document.getElementById('wsState');
    const statusNode = document.getElementById('status');
    const eventsNode = document.getElementById('events');
    const existingList = document.getElementById('existingList');
    const historyList = document.getElementById('historyList');
    const selectedLocationCard = document.getElementById('selectedLocationCard');
    const preview = document.getElementById('preview');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const refineBtn = document.getElementById('refineBtn');
    let historyItems = [];
    let activeHistoryId = null;
    let currentRender = { sourcePath: '', historyId: '' };
    let selectedLocation = null;

    function addEvent(text, kind) {
      const level = kind || 'info';
      const div = document.createElement('div');
      div.className = 'event ' + level;
      div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text;
      eventsNode.appendChild(div);
      eventsNode.scrollTop = eventsNode.scrollHeight;
    }

    function escapeHtml(value) {
      return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    }

    function send(type, payload) {
      const body = payload || {};
      if (ws.readyState !== WebSocket.OPEN) {
        addEvent('WebSocket 未连接，无法发送：' + type, 'error');
        return;
      }
      ws.send(JSON.stringify(Object.assign({ type }, body)));
    }

    function collectRoots() {
      return document.getElementById('roots').value
        .split(/\n+/)
        .map(item => item.trim())
        .filter(Boolean);
    }

    function currentPayload() {
      return {
        query: document.getElementById('query').value.trim(),
        roots: collectRoots(),
        path: document.getElementById('path').value.trim(),
        id: document.getElementById('entryId').value.trim(),
      };
    }

    function renderExistingEntries(payload) {
      existingList.innerHTML = '';
      const entries = payload.entries || [];
      if (entries.length === 0) {
        existingList.innerHTML = '<div class="empty">当前项目没有找到 docs/.codemap/index.json 或没有任何条目。</div>';
        return;
      }
      entries.forEach((entry) => {
        const div = document.createElement('div');
        div.className = 'entry';
        div.innerHTML = '<div class="entry-title">' + (entry.title || entry.id) + '</div>'
          + '<div class="entry-meta">' + entry.id + ' · ' + (entry.filename || '') + '</div>';
        div.onclick = () => {
          document.getElementById('path').value = payload.indexPath || '';
          document.getElementById('entryId').value = entry.id || '';
          addEvent('已选择现有 CodeMap：' + entry.id, 'info');
        };
        existingList.appendChild(div);
      });
    }

    function renderHistory() {
      historyList.innerHTML = '';
      if (historyItems.length === 0) {
        historyList.innerHTML = '<div class="empty">还没有渲染历史。先发起一次生成或渲染已有 CodeMap。</div>';
        return;
      }
      historyItems.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item' + (activeHistoryId === item.id ? ' active' : '');
        div.innerHTML = '<div class="history-title">' + (item.title || item.id) + '</div>'
          + '<div class="history-meta">' + (item.sourcePath || '(inline html)') + '<br />' + new Date(item.createdAt).toLocaleString() + '</div>';

        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const previewBtn = document.createElement('button');
        previewBtn.textContent = '预览';
        previewBtn.onclick = () => {
          send('history_render', { id: item.id });
          addEvent('已请求回放历史预览：' + item.title, 'info');
        };
        actions.appendChild(previewBtn);

        const openBtn = document.createElement('button');
        openBtn.textContent = '原生打开';
        openBtn.onclick = () => {
          send('history_open', { id: item.id });
          addEvent('已请求从历史打开原生窗口：' + item.title, 'info');
        };
        actions.appendChild(openBtn);

        div.appendChild(actions);
        historyList.appendChild(div);
      });
    }

    function renderSelectedLocation() {
      if (!selectedLocation) {
        selectedLocationCard.innerHTML = '<div class="empty">还没有选中任何定位点。</div>';
        return;
      }
      selectedLocationCard.innerHTML = [
        '<div class="history-title">' + escapeHtml(selectedLocation.title || selectedLocation.path || '未知定位点') + '</div>',
        '<div class="history-meta">'
          + 'Trace: ' + escapeHtml(selectedLocation.traceTitle || selectedLocation.traceId || '(unknown)') + '<br />'
          + 'Path: ' + escapeHtml(selectedLocation.path || '(unknown)')
          + '</div>',
        selectedLocation.line ? '<div class="location-line" style="margin-top:8px;">' + escapeHtml(selectedLocation.line) + '</div>' : '',
        selectedLocation.description ? '<div class="history-meta" style="margin-top:8px;">' + escapeHtml(selectedLocation.description) + '</div>' : ''
      ].join('');
    }

    function queueAnalyzeLocation() {
      if (!selectedLocation) {
        addEvent('请先在预览页选择一个定位点', 'warn');
        return;
      }
      send('analyze_location', { location: selectedLocation });
      addEvent('已请求继续分析定位点：' + (selectedLocation.title || selectedLocation.path || 'unknown'), 'info');
    }

    function queueRefineTrace() {
      if (!selectedLocation) {
        addEvent('请先在预览页选择一个定位点', 'warn');
        return;
      }
      send('refine_trace', {
        location: selectedLocation,
        sourcePath: currentRender.sourcePath || '',
        historyId: currentRender.historyId || '',
      });
      addEvent('已请求 trace 增量修正：' + (selectedLocation.traceTitle || selectedLocation.traceId || 'unknown trace'), 'info');
    }

    function updatePreview(html, historyId, sourcePath) {
      preview.srcdoc = html || '<p>无可用 HTML</p>';
      activeHistoryId = historyId || null;
      currentRender = { sourcePath: sourcePath || '', historyId: historyId || '' };
      renderHistory();
    }

    ws.onopen = () => {
      wsState.textContent = 'WS: connected';
      addEvent('WebSocket 已连接', 'success');
      send('list_existing');
    };

    ws.onclose = () => {
      wsState.textContent = 'WS: closed';
      addEvent('WebSocket 已断开', 'warn');
    };

    ws.onerror = () => addEvent('WebSocket 发生错误', 'error');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'pong') {
        addEvent('pong', 'info');
        return;
      }
      if (data.type === 'status') {
        statusNode.textContent = data.status || 'idle';
        addEvent(data.message || '状态更新', data.kind || 'info');
        return;
      }
      if (data.type === 'existing_list') {
        renderExistingEntries(data);
        addEvent('已加载已有 CodeMap 列表，共 ' + ((data.entries || []).length) + ' 个', 'success');
        return;
      }
      if (data.type === 'history_update') {
        historyItems = data.items || [];
        renderHistory();
        return;
      }
      if (data.type === 'render_result') {
        updatePreview(data.html, data.historyId, data.sourcePath);
        addEvent('HTML 预览已更新：' + (data.title || 'CodeMap'), 'success');
        return;
      }
      if (data.type === 'agent_event') {
        addEvent(data.message || 'agent event', data.kind || 'info');
        return;
      }
      if (data.type === 'error') {
        addEvent(data.message || 'unknown error', 'error');
      }
    };

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.type !== 'codemap-location-click') {
        return;
      }
      selectedLocation = data.location || null;
      renderSelectedLocation();
      queueAnalyzeLocation();
    });

    analyzeBtn.onclick = () => queueAnalyzeLocation();
    refineBtn.onclick = () => queueRefineTrace();

    document.getElementById('generateBtn').onclick = () => {
      const payload = currentPayload();
      if (!payload.query) {
        addEvent('请先输入需求描述', 'warn');
        return;
      }
      send('generate_request', payload);
      addEvent('已发送生成请求', 'info');
    };

    document.getElementById('renderBtn').onclick = () => {
      send('render_existing', currentPayload());
      addEvent('已请求渲染已有 CodeMap', 'info');
    };

    document.getElementById('listBtn').onclick = () => {
      send('list_existing');
      addEvent('已请求加载已有 CodeMap 列表', 'info');
    };

    document.getElementById('openBtn').onclick = () => {
      send('open_window', currentPayload());
      addEvent('已请求原生窗口打开', 'info');
    };

    renderSelectedLocation();
  </script>
</body>
</html>`;
}
