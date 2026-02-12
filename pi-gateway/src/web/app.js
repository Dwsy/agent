/**
 * pi-gateway Web UI — Lit components, zero build.
 *
 * Architecture:
 *   gw-app           Root shell (sidebar + router)
 *     gw-chat        WebChat panel (messages, input, streaming)
 *     gw-sessions    Sessions list panel
 *     gw-plugins     Plugins list panel
 *     gw-health      Health/stats panel
 *
 * Communication: WebSocket to ws(s)://{host}:{port} using the
 * Gateway req/res/event protocol (aligned with OpenClaw).
 */

import { LitElement, html, css } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";
import hljs from "highlight.js";

// Configure marked with highlight.js
marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

// ============================================================================
// Markdown / HTML Renderer
// ============================================================================

/**
 * Convert markdown text to HTML using marked + highlight.js.
 * Handles thinking blocks (<think>) as collapsible panels.
 */
function renderMarkdown(text) {
  if (!text) return "";

  // Extract and render <think> blocks as collapsible details
  let processed = text.replace(
    /<think>([\s\S]*?)<\/think>/g,
    (_m, content) => {
      const trimmed = content.trim();
      if (!trimmed) return "";
      return `<details class="thinking-panel"><summary>💭 Thinking</summary><div class="thinking-content">${marked.parse(trimmed)}</div></details>`;
    }
  );

  // Render remaining markdown
  return marked.parse(processed);
}

/**
 * Format tool call for display — collapsible details panel.
 */
function renderToolCall(name, args) {
  let summary = name;
  if (args) {
    switch (name) {
      case "read":
        summary = `read ${args.path || args.filePath || args.file || ""}`;
        break;
      case "write":
        summary = `write ${args.path || args.filePath || args.file || ""}`;
        break;
      case "edit":
      case "multi_edit":
        summary = `${name} ${args.path || args.filePath || args.file || ""}`;
        break;
      case "bash":
        summary = `bash ${(args.command || args.cmd || "").slice(0, 120)}`;
        break;
      default: {
        const payload = JSON.stringify(args);
        summary = payload.length > 120 ? `${name} ${payload.slice(0, 120)}...` : `${name} ${payload}`;
      }
    }
  }
  const argsHtml = args ? `<pre><code>${JSON.stringify(args, null, 2)}</code></pre>` : "";
  return `<details class="tool-call"><summary>→ ${summary}</summary>${argsHtml}</details>`;
}

/**
 * Check if text contains HTML tags
 */
function containsHtml(text) {
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * Render message content (auto-detect markdown or HTML)
 */
function renderMessageContent(text) {
  if (!text) return html``;

  // If already HTML (from Telegram), use directly
  if (containsHtml(text)) {
    return unsafeHTML(text);
  }

  // Otherwise, render markdown
  return unsafeHTML(renderMarkdown(text));
}

// ============================================================================
// WebSocket Connection Manager
// ============================================================================

class GatewayConnection {
  constructor() {
    this.ws = null;
    this.reqId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.connected = false;
    this.onStatusChange = () => {};
  }

  connect(url) {
    if (this.ws) this.ws.close();

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this.onStatusChange(true);
      this.request("connect", {}).catch(() => {});
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.onStatusChange(false);
      setTimeout(() => this.connect(url), 3000);
    };

    this.ws.onerror = () => {};

    this.ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(e.data);
        if (frame.type === "res" && this.pending.has(frame.id)) {
          const { resolve, reject } = this.pending.get(frame.id);
          this.pending.delete(frame.id);
          frame.ok ? resolve(frame.payload) : reject(new Error(frame.error));
        } else if (frame.type === "event") {
          const handlers = this.listeners.get(frame.event) || [];
          handlers.forEach((h) => h(frame.payload));
        }
      } catch {}
    };
  }

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Not connected"));
      }
      const id = `ui-${++this.reqId}`;
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Timeout"));
        }
      }, 30000);
      this.ws.send(JSON.stringify({ type: "req", id, method, params }));
    });
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
    return () => {
      const arr = this.listeners.get(event);
      if (arr) this.listeners.set(event, arr.filter((h) => h !== handler));
    };
  }
}

const gw = new GatewayConnection();

// ============================================================================
// gw-app — Root Application Shell
// ============================================================================

class GwApp extends LitElement {
  static properties = {
    activeTab: { type: String },
    connected: { type: Boolean },
    isMobile: { type: Boolean },
  };

  static styles = css`
    :host {
      display: flex;
      height: 100vh;
      height: 100dvh;
      width: 100vw;
      overflow: hidden;
    }

    .app-container {
      display: flex;
      width: 100%;
      height: 100%;
    }

    nav {
      width: 220px;
      min-width: 220px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 16px 0;
    }

    nav.mobile {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: auto;
      max-height: 60px;
      flex-direction: row !important;
      justify-content: space-around;
      padding: 8px 0;
      border-top: 1px solid var(--border);
      border-right: none;
      z-index: 100;
      background: var(--bg-secondary);
    }

    .status-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 56px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      z-index: 100;
    }

    .status-bar .title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    /* Mobile styles */
    @media (max-width: 768px) {
      .app-container {
        flex-direction: column;
        padding-top: 56px;
        padding-bottom: 60px;
      }

      nav.mobile .nav-items {
        flex-direction: row;
        display: flex;
        width: 100%;
        justify-content: space-around;
        padding: 0;
      }

      nav.mobile .nav-item {
        flex: 1;
        flex-direction: column;
        align-items: center;
        padding: 4px;
        font-size: 12px;
        border-left: none;
        gap: 2px;
      }

      nav.mobile .nav-item .icon {
        font-size: 20px;
      }

      nav.mobile .nav-item .label {
        font-size: 10px;
      }

      nav.mobile .nav-footer {
        display: none;
      }

      main {
        height: calc(100dvh - 56px - 60px);
      }
    }

    .nav-header {
      padding: 0 16px 16px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .nav-header h1 {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--danger);
      transition: background var(--transition);
    }
    .dot.on { background: var(--success); }

    .nav-items {
      list-style: none;
      padding: 8px 0;
      flex: 1;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: all var(--transition);
      font-size: 13px;
      border-left: 2px solid transparent;
    }

    .nav-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .nav-item.active {
      color: var(--accent);
      border-left-color: var(--accent);
      background: var(--accent-muted);
    }

    .nav-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border-subtle);
      font-size: 11px;
      color: var(--text-muted);
    }

    main {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  `;

  constructor() {
    super();
    this.activeTab = "chat";
    this.connected = false;
    this.isMobile = window.matchMedia("(max-width: 768px)").matches;
    this.touchStartX = 0;
    this.touchStartY = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    gw.onStatusChange = (c) => { this.connected = c; };
    if (!gw.ws) {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      gw.connect(`${protocol}//${location.host}`);
    } else if (gw.connected) {
      this.connected = true;
    }

    // Mobile detection
    const mql = window.matchMedia("(max-width: 768px)");
    mql.addEventListener("change", (e) => {
      this.isMobile = e.matches;
      this.requestUpdate();
    });

    // Touch gesture support for mobile
    this.addEventListener("touchstart", this.handleTouchStart, { passive: true });
    this.addEventListener("touchend", this.handleTouchEnd, { passive: true });

    // Prevent zoom on double tap
    this.addEventListener("dblclick", (e) => e.preventDefault());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("touchstart", this.handleTouchStart);
    this.removeEventListener("touchend", this.handleTouchEnd);
  }

  handleTouchStart(e) {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  handleTouchEnd(e) {
    if (!this.isMobile) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;

    // Horizontal swipe detection (minimum 50px)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      const tabs = ["chat", "sessions", "plugins", "health"];
      const currentIndex = tabs.indexOf(this.activeTab);

      if (deltaX < 0 && currentIndex < tabs.length - 1) {
        // Swipe left -> next tab
        this.switchTab(tabs[currentIndex + 1]);
      } else if (deltaX > 0 && currentIndex > 0) {
        // Swipe right -> previous tab
        this.switchTab(tabs[currentIndex - 1]);
      }
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
  }

  _handleSessionSelect(session) {
    this.switchTab("chat");
    const chat = this.renderRoot.querySelector("gw-chat");
    if (chat && chat.loadSession) {
      chat.loadSession(session.sessionKey);
    }
  }

  render() {
    const tabs = [
      { id: "chat", label: "Chat", icon: "💬" },
      { id: "sessions", label: "Sessions", icon: "📋" },
      { id: "plugins", label: "Plugins", icon: "🧩" },
      { id: "health", label: "Health", icon: "📊" },
    ];

    return html`
      ${this.isMobile ? html`
        <div class="status-bar">
          <span class="title">pi-gateway</span>
          <span class="dot ${this.connected ? "on" : ""}"></span>
        </div>
      ` : ""}
      <div class="app-container">
        <nav class="sidebar ${this.isMobile ? "mobile" : ""}">
          ${!this.isMobile ? html`
            <div class="nav-header">
              <h1>pi-gateway</h1>
              <span class="dot ${this.connected ? "on" : ""}"></span>
            </div>
          ` : ""}
          <ul class="nav-items">
            ${tabs.map((t) => html`
              <li class="nav-item ${this.activeTab === t.id ? "active" : ""}"
                  @click=${() => this.switchTab(t.id)}>
                <span class="icon">${t.icon}</span>
                <span class="label">${t.label}</span>
              </li>
            `)}
          </ul>
          <div class="nav-footer">v0.1.0</div>
        </nav>
        <main>
          ${this.activeTab === "chat" ? html`<gw-chat .connection=${gw}></gw-chat>` : ""}
          ${this.activeTab === "sessions" ? html`<gw-sessions .connection=${gw} .onSessionSelect=${(s) => this._handleSessionSelect(s)}></gw-sessions>` : ""}
          ${this.activeTab === "plugins" ? html`<gw-plugins .connection=${gw}></gw-plugins>` : ""}
          ${this.activeTab === "health" ? html`<gw-health .connection=${gw}></gw-health>` : ""}
        </main>
      </div>
    `;
  }
}
customElements.define("gw-app", GwApp);

// ============================================================================
// gw-chat — WebChat Panel
// ============================================================================

class GwChat extends LitElement {
  static properties = {
    connection: { type: Object },
    messages: { type: Array },
    inputText: { type: String },
    isStreaming: { type: Boolean },
    isTyping: { type: Boolean },
    wsConnected: { type: Boolean },
    sessionKey: { type: String },
    _sidebarOpen: { type: Boolean, state: true },
    _sessions: { type: Array, state: true },
    _currentAgent: { type: String, state: true },
    _availableRoles: { type: Array, state: true },
    _currentRole: { type: String, state: true },
  };

  static styles = css`
    :host {
      display: flex;
      height: 100%;
    }

    /* ---- Session Sidebar ---- */
    .sidebar {
      width: 260px;
      min-width: 260px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      transition: margin-left 0.2s ease;
      overflow: hidden;
    }
    .sidebar.collapsed {
      margin-left: -260px;
    }
    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sidebar-header h3 {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .new-session-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      padding: 4px 10px;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: background var(--transition);
    }
    .new-session-btn:hover { background: var(--accent-hover); }

    .session-list {
      flex: 1;
      overflow-y: auto;
      padding: 6px 0;
    }
    .session-item {
      display: flex;
      flex-direction: column;
      padding: 10px 14px;
      cursor: pointer;
      border-left: 2px solid transparent;
      transition: all var(--transition);
    }
    .session-item:hover { background: var(--bg-hover); }
    .session-item.active {
      background: var(--accent-muted);
      border-left-color: var(--accent);
    }
    .session-item-title {
      font-size: 13px;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session-item-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 3px;
      font-size: 11px;
      color: var(--text-muted);
    }
    .session-item-meta .badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }
    .session-item-meta .badge.streaming {
      background: rgba(63,185,80,.15);
      color: var(--success);
    }
    .session-item-actions {
      display: flex;
      gap: 4px;
      margin-top: 4px;
      opacity: 0;
      transition: opacity var(--transition);
    }
    .session-item:hover .session-item-actions { opacity: 1; }
    .session-item-actions button {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
    }
    .session-item-actions button:hover { background: var(--bg-hover); color: var(--text-primary); }
    .session-item-actions button.danger { color: var(--danger); border-color: var(--danger); }
    .session-item-actions button.danger:hover { background: rgba(248,81,73,.1); }

    .sidebar-empty {
      padding: 20px 14px;
      text-align: center;
      color: var(--text-muted);
      font-size: 12px;
    }

    /* ---- Chat Main ---- */
    .chat-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    /* ---- Chat Header ---- */
    .chat-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-secondary);
      min-height: 44px;
    }
    .toggle-sidebar {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      width: 30px;
      height: 30px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
      transition: all var(--transition);
    }
    .toggle-sidebar:hover { background: var(--bg-hover); color: var(--text-primary); }
    .chat-title {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .agent-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--accent-muted);
      color: var(--accent);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .role-select {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 11px;
      padding: 3px 6px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      outline: none;
    }
    .role-select:hover { border-color: var(--accent); }

    /* ---- Mobile sidebar overlay ---- */
    .sidebar-overlay {
      display: none;
    }
    @media (max-width: 768px) {
      .sidebar {
        position: fixed;
        top: 56px;
        left: 0;
        bottom: 60px;
        z-index: 200;
        width: 280px;
        min-width: 280px;
        transition: transform 0.2s ease;
        transform: translateX(0);
      }
      .sidebar.collapsed {
        margin-left: 0;
        transform: translateX(-100%);
      }
      .sidebar-overlay {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.5);
        z-index: 199;
      }
      .sidebar-overlay.hidden { display: none; }
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .welcome {
      text-align: center;
      margin: auto;
      color: var(--text-secondary);
    }
    .welcome h2 { font-size: 20px; margin-bottom: 8px; color: var(--text-primary); }
    .welcome p { font-size: 13px; }

    .msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: var(--radius);
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .msg.user {
      align-self: flex-end;
      background: var(--accent-muted);
      color: var(--text-primary);
      border: 1px solid rgba(88,166,255,.2);
    }

    .msg.assistant {
      align-self: flex-start;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-subtle);
    }

    .msg.error {
      background: rgba(248,81,73,.1);
      border: 1px solid rgba(248,81,73,.3);
      color: var(--danger);
    }

    /* Thinking collapsible panel (streaming) */
    details.msg.thinking {
      max-width: 80%;
      align-self: flex-start;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0;
      font-size: 13px;
    }
    details.msg.thinking summary {
      padding: 8px 12px;
      cursor: pointer;
      user-select: none;
      list-style: none;
    }
    details.msg.thinking summary::-webkit-details-marker { display: none; }
    .thinking-indicator { color: var(--text-secondary); font-size: 12px; }
    .thinking-content {
      padding: 0 12px 10px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.5;
      max-height: 200px;
      overflow-y: auto;
      border-top: 1px solid var(--border);
    }

    .msg code {
      font-family: var(--font-mono);
      font-size: 12px;
      background: var(--bg-primary);
      padding: 1px 4px;
      border-radius: 3px;
    }

    .msg pre {
      background: var(--bg-primary);
      padding: 10px;
      border-radius: var(--radius-sm);
      overflow-x: auto;
      margin: 8px 0;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.4;
    }

    .typing {
      align-self: flex-start;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      color: var(--text-secondary);
      font-size: 13px;
    }

    .typing-dots span {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-muted);
      animation: blink 1.4s infinite both;
    }
    .typing-dots span:nth-child(2) { animation-delay: .2s; }
    .typing-dots span:nth-child(3) { animation-delay: .4s; }

    @keyframes blink {
      0%, 80%, 100% { opacity: 0; }
      40% { opacity: 1; }
    }

    /* Extension UI prompt */
    .ext-ui {
      margin: 0 20px;
      padding: 14px;
      background: var(--bg-secondary);
      border: 1px solid var(--accent);
      border-radius: var(--radius);
      animation: slideUp 0.2s ease;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ext-ui-title {
      font-weight: 500;
      font-size: 13px;
      margin-bottom: 10px;
      color: var(--accent);
    }
    .ext-ui-message {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 10px;
    }
    .ext-ui-options {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
    }
    .ext-ui-option {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px 12px;
      color: var(--text-primary);
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.15s;
    }
    .ext-ui-option:hover {
      border-color: var(--accent);
    }
    .ext-ui-hint {
      display: block;
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 2px;
    }
    .ext-ui-input {
      width: 100%;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-family: var(--font-mono, monospace);
      font-size: 13px;
      padding: 8px 10px;
      resize: vertical;
      min-height: 60px;
      margin-bottom: 10px;
      outline: none;
      box-sizing: border-box;
    }
    .ext-ui-input:focus { border-color: var(--accent); }
    .ext-ui-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .ext-ui-submit {
      background: var(--accent);
      color: white;
      border: none;
      border-radius: var(--radius);
      padding: 6px 16px;
      font-size: 13px;
      cursor: pointer;
    }
    .ext-ui-cancel {
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 6px 16px;
      font-size: 13px;
      cursor: pointer;
    }
    .ext-ui-progress {
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .ext-ui-progress-bar {
      height: 100%;
      background: var(--accent);
      transition: width 0.3s ease;
    }
    .ext-ui-progress-text {
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* Image preview bar */
    .image-preview-bar {
      display: flex;
      gap: 8px;
      padding: 8px 20px 0;
      overflow-x: auto;
    }
    .image-preview {
      position: relative;
      flex-shrink: 0;
    }
    .image-preview img {
      height: 60px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      object-fit: cover;
    }
    .image-remove {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--danger, #f85149);
      color: white;
      border: none;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    /* Message images */
    .msg-images {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .msg-image {
      max-width: 300px;
      max-height: 200px;
      border-radius: var(--radius);
      object-fit: contain;
      cursor: pointer;
      transition: opacity var(--transition);
    }
    .msg-image:hover { opacity: 0.85; }

    /* Media images from agent MEDIA: directives */
    .media-images {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .media-img {
      max-width: 400px;
      max-height: 300px;
      border-radius: var(--radius);
      object-fit: contain;
      cursor: pointer;
      border: 1px solid var(--border-subtle);
      transition: opacity var(--transition);
    }
    .media-img:hover { opacity: 0.85; }
    .media-download {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--accent);
      font-size: 12px;
      text-decoration: none;
      margin-top: 6px;
    }
    .media-download:hover { background: var(--bg-hover); }

    /* Lightbox overlay */
    .lightbox {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0,0,0,.85);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: zoom-out;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .lightbox img {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    /* Attach button */
    .attach-btn {
      background: transparent;
      border: none;
      font-size: 18px;
      cursor: pointer;
      padding: 4px;
      opacity: 0.6;
      transition: opacity 0.15s;
    }
    .attach-btn:hover { opacity: 1; }

    .input-area {
      padding: 12px 20px 16px;
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
    }

    form {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    textarea {
      flex: 1;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 14px;
      padding: 10px 12px;
      resize: none;
      outline: none;
      min-height: 40px;
      max-height: 120px;
      transition: border-color var(--transition);
    }
    textarea:focus { border-color: var(--accent); }
    textarea::placeholder { color: var(--text-muted); }

    button {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--accent);
      border: none;
      border-radius: var(--radius);
      color: #fff;
      cursor: pointer;
      transition: background var(--transition);
      flex-shrink: 0;
    }
    button:hover { background: var(--accent-hover); }
    button.abort { background: var(--danger); }
    button.abort:hover { background: #da3633; }
    button:disabled { opacity: .4; cursor: default; }

    /* Mobile responsive */
    @media (max-width: 768px) {
      :host {
        height: calc(100dvh - 56px - 60px);
      }

      .messages {
        padding: 12px;
        gap: 8px;
      }

      .msg {
        max-width: 85%;
        padding: 10px 14px;
        font-size: 15px;
        line-height: 1.5;
      }

      .welcome {
        padding: 0 20px;
      }

      .welcome h2 {
        font-size: 18px;
      }

      .input-area {
        position: fixed;
        bottom: 60px;
        left: 0;
        right: 0;
        padding: 12px;
        background: var(--bg-primary);
        z-index: 90;
      }

      form {
        gap: 10px;
      }

      textarea {
        font-size: 16px;
        padding: 12px 16px;
        border-radius: 20px;
        min-height: 44px;
      }

      button {
        width: 44px;
        height: 44px;
        border-radius: 50%;
      }
    }

    @media (max-width: 375px) {
      .msg {
        max-width: 90%;
        font-size: 14px;
      }
    }
  `;

  constructor() {
    super();
    this.messages = [];
    this.inputText = "";
    this.isStreaming = false;
    this.isTyping = false;
    this.wsConnected = false;
    this.sessionKey = "";
    this._sidebarOpen = false;
    this._sessions = [];
    this._currentAgent = "";
    this._availableRoles = [];
    this._currentRole = "";
    this._unsubs = [];
    this._connPoll = null;
    this._gotStreamingDelta = false;
    this._pendingUI = null;
    this._thinkingText = "";
    this._isThinking = false;
    this._pendingImages = [];
    this._lightboxSrc = null; // Lightbox image URL
  }

  connectedCallback() {
    super.connectedCallback();
    this.wsConnected = gw.connected;
    this._connPoll = setInterval(() => {
      if (this.wsConnected !== gw.connected) {
        this.wsConnected = gw.connected;
        if (gw.connected) this._loadSessions();
      }
    }, 500);
    // Load sessions and roles once connected
    if (gw.connected) {
      this._loadSessions();
      this._loadRoles();
    }
    const origOnStatus = gw.onStatusChange;
    gw.onStatusChange = (c) => {
      origOnStatus(c);
      if (c) { this._loadSessions(); this._loadRoles(); }
    };
    this._unsubs.push(
      gw.on("chat.reply", (p) => {
        // Skip if we already displayed this via streaming events
        if (!this._gotStreamingDelta) {
          const msg = { role: "assistant", text: p.text };
          if (p.images?.length) msg.mediaImages = p.images; // Signed URLs from backend
          this.messages = [...this.messages, msg];
          this._scrollBottom();
        } else {
          // Streaming already displayed text — but check for images from MEDIA directives
          if (p.images?.length) {
            const last = this.messages[this.messages.length - 1];
            if (last && (last.role === "assistant" || last.role === "streaming")) {
              last.role = "assistant";
              last.mediaImages = p.images;
              this.messages = [...this.messages];
            }
          }
        }
        this._gotStreamingDelta = false;
        this.isStreaming = false;
        this.isTyping = false;
      }),
      gw.on("chat.typing", (p) => {
        this.isTyping = p.typing;
      }),
      gw.on("agent", (p) => {
        // Handle streaming text_delta and thinking events for real-time display
        const ame = p.assistantMessageEvent;
        if (p.type === "message_update" && ame) {
          const isTextDelta = ame.type === "text_delta" && ame.delta;
          const isThinkingStart = ame.type === "thinking_start";
          const isThinkingDelta = ame.type === "thinking_delta" && ame.delta;
          const isThinkingEnd = ame.type === "thinking_end";
          const isToolStart = ame.type === "tool_use" && ame.name;

          // Tool call: render as collapsible panel
          if (isToolStart) {
            const toolHtml = renderToolCall(ame.name, ame.input);
            const last = this.messages[this.messages.length - 1];
            if (last?.role === "streaming") {
              last.text += "\n" + toolHtml;
              this.messages = [...this.messages];
            } else {
              this.messages = [...this.messages, { role: "streaming", text: toolHtml }];
            }
            this._scrollBottom();
            return;
          }

          // Thinking: track separately, render as collapsible panel
          if (isThinkingStart) {
            this._isThinking = true;
            this._thinkingText = "";
            this._updateThinkingMessage();
            this._scrollBottom();
            return;
          }
          if (isThinkingDelta) {
            this._thinkingText += ame.delta;
            this._updateThinkingMessage();
            this._scrollBottom();
            return;
          }
          if (isThinkingEnd) {
            this._isThinking = false;
            this._updateThinkingMessage();
            return;
          }

          // Text delta: append to streaming message
          if (isTextDelta) {
            this._gotStreamingDelta = true;
            const last = this.messages[this.messages.length - 1];

            if (last?.role === "streaming") {
              last.text += ame.delta;
              this.messages = [...this.messages];
            } else {
              this.messages = [...this.messages, { role: "streaming", text: ame.delta }];
            }
            this.isTyping = false;
            this._scrollBottom();
          }
        }
        if (p.type === "agent_end") {
          // Convert streaming message to final assistant message
          const last = this.messages[this.messages.length - 1];
          if (last?.role === "streaming") {
            last.role = "assistant";
            this.messages = [...this.messages];
          }
          // Finalize thinking panel
          this._isThinking = false;
          this._thinkingText = "";
          this.isStreaming = false;
          this.isTyping = false;
        }
      }),
      // Extension UI: prompt forwarded from agent
      gw.on("extension_ui_request", (p) => {
        this._pendingUI = p;
        this.requestUpdate();
        this._scrollBottom();
      }),
      // Extension UI: prompt resolved by another client
      gw.on("extension_ui_dismissed", (p) => {
        if (this._pendingUI?.id === p.id) {
          this._pendingUI = null;
          this.requestUpdate();
        }
      }),
      // Media push from send_media API
      gw.on("media_event", (p) => {
        if (p.sessionKey && p.sessionKey !== this.sessionKey) return;
        const isImage = ["photo", "image"].includes(p.type) || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(p.filename || "");
        if (isImage && p.url) {
          // Append to last assistant message or create new one
          const last = this.messages[this.messages.length - 1];
          if (last && (last.role === "assistant" || last.role === "streaming")) {
            last.mediaImages = [...(last.mediaImages || []), p.url];
            this.messages = [...this.messages];
          } else {
            this.messages = [...this.messages, { role: "assistant", text: p.caption || "", mediaImages: [p.url] }];
          }
        } else if (p.url) {
          // Non-image file: render as download link
          const label = p.caption || p.filename || "Download";
          const link = `[📎 ${label}](${p.url})`;
          this.messages = [...this.messages, { role: "assistant", text: link }];
        }
        this._scrollBottom();
      }),
      // Agent-initiated text messages via send_message tool (v3.4 T1)
      gw.on("message_event", (p) => {
        if (p.sessionKey && p.sessionKey !== this.sessionKey) return;
        if (p.type === "text" && p.text) {
          this.messages = [...this.messages, { role: "assistant", text: p.text }];
          this._scrollBottom();
        }
      }),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubs.forEach((u) => u());
    if (this._connPoll) clearInterval(this._connPoll);
  }

  async loadSession(sessionKey) {
    if (!sessionKey) return;
    this.sessionKey = sessionKey;
    // Parse agent from session key (agent:{agentId}:{channel}:{scope}:{id})
    const parts = sessionKey.split(":");
    this._currentAgent = parts.length >= 2 ? parts[1] : "";
    this._currentRole = "";
    // Try to get role from session state
    try {
      const state = await gw.request("sessions.get", { sessionKey });
      if (state?.role) this._currentRole = state.role;
    } catch {}
    try {
      const history = await gw.request("chat.history", { sessionKey });
      this.messages = (history?.messages || []).map((m) => ({
        role: m.role,
        text: m.content,
        mediaImages: m.mediaImages || undefined,
      }));
      this._scrollBottom();
    } catch (err) {
      console.error("Failed to load session history:", err);
    }
  }

  async _loadSessions() {
    try {
      const list = await gw.request("sessions.list");
      this._sessions = (list || []).sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
    } catch {
      this._sessions = [];
    }
  }

  async _loadRoles() {
    try {
      const res = await gw.request("session.listRoles");
      this._availableRoles = res?.roles || [];
    } catch {
      this._availableRoles = [];
    }
  }

  _newSession() {
    // Generate a new webchat session key
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const agentId = this._currentAgent || "main";
    const newKey = `agent:${agentId}:webchat:dm:${id}`;
    this.sessionKey = newKey;
    this.messages = [];
    this._currentRole = "";
    this._thinkingText = "";
    this._isThinking = false;
    this._gotStreamingDelta = false;
    this.isStreaming = false;
    this.isTyping = false;
    this._sidebarOpen = false;
    // Refresh session list after a short delay (session created on first message)
    this.requestUpdate();
  }

  _selectSession(session) {
    this.loadSession(session.sessionKey);
    // Close sidebar on mobile
    if (window.matchMedia("(max-width: 768px)").matches) {
      this._sidebarOpen = false;
    }
  }

  async _deleteSession(sessionKey, ev) {
    ev.stopPropagation();
    try {
      await gw.request("sessions.delete", { sessionKey });
      if (this.sessionKey === sessionKey) {
        this.sessionKey = "";
        this.messages = [];
      }
      this._loadSessions();
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  }

  async _changeRole(ev) {
    const role = ev.target.value;
    if (!role || !this.sessionKey) return;
    try {
      await gw.request("session.setRole", { sessionKey: this.sessionKey, role });
      this._currentRole = role;
    } catch (err) {
      console.error("Failed to set role:", err);
    }
  }

  _toggleSidebar() {
    this._sidebarOpen = !this._sidebarOpen;
    if (this._sidebarOpen) this._loadSessions();
  }

  _formatSessionTitle(session) {
    const key = session.sessionKey || "";
    // Extract meaningful parts: agent:main:webchat:dm:xxx -> "webchat dm xxx"
    const parts = key.split(":");
    if (parts.length >= 5) {
      const agent = parts[1] === "main" ? "" : parts[1] + " · ";
      const channel = parts[2];
      const id = parts.slice(4).join(":");
      return `${agent}${channel} · ${id.slice(0, 8)}`;
    }
    return key.length > 30 ? key.slice(0, 30) + "…" : key;
  }

  _formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString();
  }

  _openLightbox(src) {
    this._lightboxSrc = src;
    this.requestUpdate();
  }

  _closeLightbox() {
    this._lightboxSrc = null;
    this.requestUpdate();
  }

  async _send(e) {
    e.preventDefault();
    const text = this.inputText.trim();
    const images = this._pendingImages.length > 0 ? [...this._pendingImages] : undefined;
    if ((!text && !images) || this.isStreaming) return;

    // Show user message with image previews
    const userMsg = { role: "user", text: text || "(image)", images };
    this.messages = [...this.messages, userMsg];
    this.inputText = "";
    this._pendingImages = [];
    this.requestUpdate();
    this.isStreaming = true;
    this.isTyping = true;
    this._scrollBottom();

    try {
      const payload = { text: text || "Describe this image." };
      if (this.sessionKey) payload.sessionKey = this.sessionKey;
      if (images) {
        payload.images = images.map((img) => ({ data: img.data, mimeType: img.mimeType }));
      }
      await gw.request("chat.send", payload);
      // Refresh session list (new session may have been created)
      setTimeout(() => this._loadSessions(), 500);
    } catch (err) {
      this.messages = [...this.messages, { role: "error", text: err.message }];
      this.isStreaming = false;
      this.isTyping = false;
    }
  }

  async _abort() {
    try {
      await gw.request("chat.abort", { sessionKey: this.sessionKey || undefined });
    } catch {}
    this.isStreaming = false;
    this.isTyping = false;
  }

  async _respondUI(value, cancelled = false) {
    if (!this._pendingUI) return;
    const id = this._pendingUI.id;
    try {
      await gw.request("extension_ui_response", {
        id,
        ...(cancelled ? { cancelled: true } : { value, confirmed: typeof value === "boolean" ? value : undefined }),
      });
    } catch (err) {
      console.error("Extension UI response failed:", err);
    }
    this._pendingUI = null;
    this.requestUpdate();
  }

  _onKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this._send(e);
    }
  }

  _onInput(e) {
    this.inputText = e.target.value;
    // Auto-resize
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }

  _onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) this._addImageFile(file);
        return;
      }
    }
  }

  _onFileSelect(e) {
    const files = e.target.files;
    if (!files) return;
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        this._addImageFile(file);
      }
    }
    e.target.value = "";
  }

  _addImageFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      this._pendingImages = [...this._pendingImages, {
        data: base64,
        mimeType: file.type,
        name: file.name,
        preview: reader.result, // data URL for preview
      }];
      this.requestUpdate();
    };
    reader.readAsDataURL(file);
  }

  _removeImage(index) {
    this._pendingImages = this._pendingImages.filter((_, i) => i !== index);
    this.requestUpdate();
  }

  _updateThinkingMessage() {
    // Insert or update a "thinking" role message in the messages array
    const last = this.messages[this.messages.length - 1];
    if (last?.role === "thinking") {
      last.text = this._thinkingText;
      last.isThinking = this._isThinking;
      this.messages = [...this.messages];
    } else if (this._thinkingText || this._isThinking) {
      this.messages = [...this.messages, { role: "thinking", text: this._thinkingText, isThinking: this._isThinking }];
    }
  }

  _scrollBottom() {
    requestAnimationFrame(() => {
      const el = this.renderRoot.querySelector(".messages");
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  _renderExtensionUI() {
    const ui = this._pendingUI;
    if (!ui) return "";
    const title = ui.title || "Agent Request";

    switch (ui.method) {
      case "select":
      case "multiselect": {
        const options = ui.options || [];
        return html`
          <div class="ext-ui">
            <div class="ext-ui-title">${title}</div>
            <div class="ext-ui-options">
              ${options.map((opt) => {
                const label = typeof opt === "string" ? opt : opt.label;
                const value = typeof opt === "string" ? opt : opt.value;
                const hint = typeof opt === "object" ? opt.hint : null;
                return html`
                  <button class="ext-ui-option" @click=${() => this._respondUI(value)}>
                    ${label}${hint ? html`<span class="ext-ui-hint">${hint}</span>` : ""}
                  </button>
                `;
              })}
            </div>
            <button class="ext-ui-cancel" @click=${() => this._respondUI(null, true)}>Cancel</button>
          </div>
        `;
      }
      case "text":
      case "editor":
        return html`
          <div class="ext-ui">
            <div class="ext-ui-title">${title}</div>
            <textarea
              class="ext-ui-input"
              placeholder=${ui.placeholder || ""}
              .value=${ui.defaultValue || ""}
              @keydown=${(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  this._respondUI(e.target.value);
                }
              }}
            ></textarea>
            <div class="ext-ui-actions">
              <button class="ext-ui-submit" @click=${(e) => {
                const ta = this.renderRoot.querySelector(".ext-ui-input");
                this._respondUI(ta?.value || "");
              }}>Submit</button>
              <button class="ext-ui-cancel" @click=${() => this._respondUI(null, true)}>Cancel</button>
            </div>
          </div>
        `;
      case "confirm":
        return html`
          <div class="ext-ui">
            <div class="ext-ui-title">${title}</div>
            ${ui.message ? html`<div class="ext-ui-message">${ui.message}</div>` : ""}
            <div class="ext-ui-actions">
              <button class="ext-ui-submit" @click=${() => this._respondUI(true)}>Yes</button>
              <button class="ext-ui-cancel" @click=${() => this._respondUI(false)}>No</button>
            </div>
          </div>
        `;
      case "progress":
        return html`
          <div class="ext-ui">
            <div class="ext-ui-title">${ui.label || title}</div>
            ${ui.total ? html`
              <div class="ext-ui-progress">
                <div class="ext-ui-progress-bar" style="width: ${Math.round(((ui.current || 0) / ui.total) * 100)}%"></div>
              </div>
              <div class="ext-ui-progress-text">${ui.current || 0} / ${ui.total}</div>
            ` : html`<div class="ext-ui-progress-text">Processing...</div>`}
          </div>
        `;
      default:
        return html`
          <div class="ext-ui">
            <div class="ext-ui-title">${title}</div>
            <button class="ext-ui-cancel" @click=${() => this._respondUI(null, true)}>Dismiss</button>
          </div>
        `;
    }
  }

  render() {
    const sessionTitle = this.sessionKey
      ? this._formatSessionTitle({ sessionKey: this.sessionKey })
      : "New Chat";

    return html`
      <!-- Sidebar overlay (mobile) -->
      <div class="sidebar-overlay ${this._sidebarOpen ? "" : "hidden"}"
           @click=${() => { this._sidebarOpen = false; }}></div>

      <!-- Session Sidebar -->
      <aside class="sidebar ${this._sidebarOpen ? "" : "collapsed"}">
        <div class="sidebar-header">
          <h3>Sessions</h3>
          <button class="new-session-btn" @click=${() => this._newSession()}>+ New</button>
        </div>
        <div class="session-list">
          ${this._sessions.length === 0
            ? html`<div class="sidebar-empty">No sessions yet</div>`
            : this._sessions.map((s) => html`
              <div class="session-item ${s.sessionKey === this.sessionKey ? "active" : ""}"
                   @click=${() => this._selectSession(s)}>
                <div class="session-item-title">${this._formatSessionTitle(s)}</div>
                <div class="session-item-meta">
                  <span>${s.messageCount ?? 0} msgs</span>
                  <span>${this._formatTime(s.lastActivity)}</span>
                  ${s.isStreaming ? html`<span class="badge streaming">live</span>` : ""}
                  ${s.role ? html`<span class="badge">${s.role}</span>` : ""}
                </div>
                <div class="session-item-actions">
                  <button class="danger" @click=${(e) => this._deleteSession(s.sessionKey, e)}>Delete</button>
                </div>
              </div>
            `)}
        </div>
      </aside>

      <!-- Chat Main -->
      <div class="chat-main">
        <div class="chat-header">
          <button class="toggle-sidebar" @click=${() => this._toggleSidebar()}
                  title="Toggle sessions">☰</button>
          <span class="chat-title">${sessionTitle}</span>
          ${this._currentAgent && this._currentAgent !== "main"
            ? html`<span class="agent-badge">🤖 ${this._currentAgent}</span>`
            : ""}
          ${this._availableRoles.length > 1
            ? html`<select class="role-select" .value=${this._currentRole || "default"}
                           @change=${this._changeRole}>
                ${this._availableRoles.map((r) => html`<option value=${r} ?selected=${r === (this._currentRole || "default")}>${r}</option>`)}
              </select>`
            : ""}
        </div>

        <div class="messages">
          ${this.messages.length === 0
            ? html`<div class="welcome">
                <h2>pi-gateway WebChat</h2>
                <p>Type a message to chat with your pi agent.</p>
              </div>`
            : this.messages.map((m) => {
                if (m.role === "thinking") {
                  return html`
                    <details class="msg thinking" ?open=${m.isThinking}>
                      <summary>
                        ${m.isThinking ? html`<span class="thinking-indicator">💭 Thinking...</span>` : html`<span class="thinking-indicator">💭 Thought process</span>`}
                      </summary>
                      <div class="thinking-content">${renderMessageContent(m.text)}</div>
                    </details>
                  `;
                }
                return html`
                  <div class="msg ${m.role === "streaming" ? "assistant" : m.role}">
                    ${m.images?.length ? html`
                      <div class="msg-images">
                        ${m.images.map((img) => html`<img src=${img.preview || `data:${img.mimeType};base64,${img.data}`} class="msg-image" @click=${() => this._openLightbox(img.preview || `data:${img.mimeType};base64,${img.data}`)} />`)}
                      </div>
                    ` : ""}
                    ${renderMessageContent(m.text)}
                    ${m.mediaImages?.length ? html`
                      <div class="media-images">
                        ${m.mediaImages.map((url) => html`<img src=${url} class="media-img" @click=${() => this._openLightbox(url)} loading="lazy" />`)}
                      </div>
                    ` : ""}
                  </div>
                `;
              })}
          ${this.isTyping && !this.messages.some((m) => m.role === "streaming")
            ? html`<div class="typing">
                <span class="typing-dots"><span></span><span></span><span></span></span>
                Thinking...
              </div>`
            : ""}
        </div>
        ${this._pendingUI ? this._renderExtensionUI() : ""}
        ${this._pendingImages.length > 0 ? html`
          <div class="image-preview-bar">
            ${this._pendingImages.map((img, i) => html`
              <div class="image-preview">
                <img src=${img.preview} alt=${img.name} />
                <button class="image-remove" @click=${() => this._removeImage(i)}>×</button>
              </div>
            `)}
          </div>
        ` : ""}
        <div class="input-area">
          <form @submit=${this._send}>
            <input type="file" accept="image/*" multiple
              style="display:none" id="file-input"
              @change=${this._onFileSelect} />
            <button type="button" class="attach-btn"
              @click=${() => this.renderRoot.querySelector("#file-input").click()}
              title="Attach image">📎</button>
            <textarea
              .value=${this.inputText}
              @input=${this._onInput}
              @keydown=${this._onKeydown}
              @paste=${this._onPaste}
              placeholder="Type a message... (Enter to send)"
              rows="1"
              ?disabled=${!this.wsConnected}
            ></textarea>
            ${this.isStreaming
              ? html`<button type="button" class="abort" @click=${this._abort} title="Abort">■</button>`
              : html`<button type="submit" ?disabled=${!this.inputText.trim() && !this._pendingImages.length || !this.wsConnected} title="Send">➤</button>`}
          </form>
        </div>
      </div>
      ${this._lightboxSrc ? html`
        <div class="lightbox" @click=${() => this._closeLightbox()}>
          <img src=${this._lightboxSrc} />
        </div>
      ` : ""}
    `;
  }
}
customElements.define("gw-chat", GwChat);

// ============================================================================
// gw-sessions — Sessions Admin Panel
// ============================================================================

class GwSessions extends LitElement {
  static properties = {
    sessions: { type: Array },
    loading: { type: Boolean },
    onSessionSelect: { type: Function },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      padding: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    h2 { font-size: 18px; font-weight: 600; }

    button {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 12px;
    }
    button:hover { background: var(--bg-hover); color: var(--text-primary); }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    th {
      text-align: left;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .5px;
    }

    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-primary);
    }

    .key { font-family: var(--font-mono); font-size: 11px; color: var(--accent); }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 500;
    }
    .badge.streaming { background: rgba(63,185,80,.15); color: var(--success); }
    .badge.idle { background: var(--bg-tertiary); color: var(--text-secondary); }
    .empty { color: var(--text-muted); text-align: center; padding: 40px; }

    tr {
      cursor: pointer;
      transition: background var(--transition);
    }
    tr:hover { background: var(--bg-hover); }
    tr.selected { background: var(--accent-muted); }

    .actions {
      display: flex;
      gap: 8px;
    }
    .actions button {
      padding: 4px 10px;
      font-size: 11px;
    }
    .actions button.primary {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    .actions button.primary:hover {
      background: var(--accent-hover);
    }
    .actions button.danger {
      color: var(--danger);
      border-color: var(--danger);
    }
    .actions button.danger:hover {
      background: rgba(248,81,73,.1);
    }
  `;

  constructor() {
    super();
    this.sessions = [];
    this.loading = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  async _load() {
    this.loading = true;
    try {
      this.sessions = await gw.request("sessions.list");
    } catch {
      this.sessions = [];
    }
    this.loading = false;
  }

  _selectSession(session) {
    if (this.onSessionSelect) {
      this.onSessionSelect(session);
    }
  }

  async _resumeSession(sessionKey) {
    try {
      await gw.request("session.resume", { sessionKey });
      this._selectSession({ sessionKey });
    } catch (err) {
      console.error("Failed to resume session:", err);
    }
  }

  async _closeSession(sessionKey, ev) {
    ev.stopPropagation();
    try {
      await gw.request("session.close", { sessionKey });
      this._load();
    } catch (err) {
      console.error("Failed to close session:", err);
    }
  }

  render() {
    return html`
      <div class="header">
        <h2>Active Sessions</h2>
        <button @click=${() => this._load()}>Refresh</button>
      </div>
      ${this.sessions.length === 0
        ? html`<div class="empty">${this.loading ? "Loading..." : "No active sessions"}</div>`
        : html`
          <table>
            <thead><tr>
              <th>Session Key</th>
              <th>Role</th>
              <th>Messages</th>
              <th>Status</th>
              <th>Last Activity</th>
            </tr></thead>
            <tbody>
              ${this.sessions.map((s) => html`
                <tr @click=${() => this._selectSession(s)}>
                  <td class="key">${s.sessionKey}</td>
                  <td>${s.role ?? "default"}</td>
                  <td>${s.messageCount}</td>
                  <td><span class="badge ${s.isStreaming ? "streaming" : "idle"}">${s.isStreaming ? "streaming" : "idle"}</span></td>
                  <td>
                    <div class="actions">
                      <button class="primary" @click=${(e) => { e.stopPropagation(); this._resumeSession(s.sessionKey); }}>Resume</button>
                      <button class="danger" @click=${(e) => this._closeSession(s.sessionKey, e)}>Close</button>
                    </div>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        `}
    `;
  }
}
customElements.define("gw-sessions", GwSessions);

// ============================================================================
// gw-plugins — Plugins Admin Panel
// ============================================================================

class GwPlugins extends LitElement {
  static properties = {
    data: { type: Object },
    loading: { type: Boolean },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      padding: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    h2 { font-size: 18px; font-weight: 600; }
    h3 { font-size: 14px; font-weight: 600; margin: 16px 0 8px; color: var(--text-secondary); }

    button {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 12px;
    }
    button:hover { background: var(--bg-hover); color: var(--text-primary); }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .card-icon {
      width: 36px; height: 36px;
      border-radius: var(--radius-sm);
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }

    .card-info { flex: 1; }
    .card-name { font-weight: 500; font-size: 14px; }
    .card-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }

    .tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--accent-muted);
      color: var(--accent);
    }

    .empty { color: var(--text-muted); text-align: center; padding: 40px; }
  `;

  constructor() {
    super();
    this.data = null;
    this.loading = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  async _load() {
    this.loading = true;
    try {
      this.data = await gw.request("plugins.list");
    } catch {
      this.data = null;
    }
    this.loading = false;
  }

  render() {
    const icons = { telegram: "✈️", discord: "🎮", webchat: "💬" };

    if (!this.data) {
      return html`<div class="empty">${this.loading ? "Loading..." : "Failed to load plugins"}</div>`;
    }

    return html`
      <div class="header">
        <h2>Loaded Plugins</h2>
        <button @click=${() => this._load()}>Refresh</button>
      </div>

      <h3>Channels (${this.data.channels?.length ?? 0})</h3>
      ${(this.data.channels ?? []).map((ch) => html`
        <div class="card">
          <div class="card-icon">${icons[ch] ?? "📡"}</div>
          <div class="card-info">
            <div class="card-name">${ch}</div>
            <div class="card-desc">Channel plugin</div>
          </div>
          <span class="tag">active</span>
        </div>
      `)}

      <h3>Tools (${this.data.tools?.length ?? 0})</h3>
      ${(this.data.tools ?? []).length === 0
        ? html`<div class="empty">No custom tools registered</div>`
        : (this.data.tools ?? []).map((t) => html`
            <div class="card">
              <div class="card-icon">🔧</div>
              <div class="card-info"><div class="card-name">${t}</div></div>
              <span class="tag">active</span>
            </div>
          `)}
    `;
  }
}
customElements.define("gw-plugins", GwPlugins);

// ============================================================================
// gw-health — Health Panel
// ============================================================================

class GwHealth extends LitElement {
  static properties = {
    data: { type: Object },
    loading: { type: Boolean },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      padding: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    h2 { font-size: 18px; font-weight: 600; }

    button {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 12px;
    }
    button:hover { background: var(--bg-hover); color: var(--text-primary); }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius);
      padding: 16px;
    }

    .stat-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .5px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .stat-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    pre {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius);
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      overflow-x: auto;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .empty { color: var(--text-muted); text-align: center; padding: 40px; }
  `;

  constructor() {
    super();
    this.data = null;
    this.loading = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  async _load() {
    this.loading = true;
    try {
      this.data = await gw.request("health");
    } catch {
      this.data = null;
    }
    this.loading = false;
  }

  render() {
    if (!this.data) {
      return html`<div class="empty">${this.loading ? "Loading..." : "Failed to load health data"}</div>`;
    }

    const pool = this.data.pool ?? {};
    const queue = this.data.queue ?? {};

    return html`
      <div class="header">
        <h2>System Health</h2>
        <button @click=${() => this._load()}>Refresh</button>
      </div>

      <div class="grid">
        <div class="stat-card">
          <div class="stat-label">RPC Processes</div>
          <div class="stat-value">${pool.total ?? 0}</div>
          <div class="stat-sub">${pool.active ?? 0} active / ${pool.idle ?? 0} idle (max ${pool.maxCapacity ?? 0})</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active Sessions</div>
          <div class="stat-value">${this.data.sessions ?? 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Message Queue</div>
          <div class="stat-value">${queue.totalPending ?? 0}</div>
          <div class="stat-sub">${queue.sessions ?? 0} session queue(s)</div>
        </div>
      </div>

      <h3 style="font-size:14px; color:var(--text-secondary); margin-bottom:8px;">Raw Health Data</h3>
      <pre>${JSON.stringify(this.data, null, 2)}</pre>
    `;
  }
}
customElements.define("gw-health", GwHealth);
