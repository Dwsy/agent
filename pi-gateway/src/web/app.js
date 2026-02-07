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

// ============================================================================
// Markdown / HTML Renderer (aligned with Telegram Bot)
// ============================================================================

/**
 * Convert markdown-like text to HTML (safe subset aligned with Telegram HTML mode)
 * Supports: **bold**, *italic*, `code`, ```code blocks```, [links](url)
 */
function renderMarkdown(text) {
  if (!text) return "";

  // Escape HTML first
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (```...```)
  html = html.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (match, lang, code) => `<pre><code class="language-${lang || "text"}">${code.trim()}</code></pre>`
  );

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold (**...**)
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic (*...* or _..._)
  html = html.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, "$1<em>$2</em>$3");
  html = html.replace(/(^|[^_])_([^_]+)_([^_]|$)/g, "$1<em>$2</em>$3");

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
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
    // Switch to chat tab and pass session info
    this.switchTab("chat");
    // Store selected session for gw-chat to pick up
    this.selectedSession = session;
    // Notify gw-chat to load session history
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
          ${this.activeTab === "chat" ? html`<gw-chat .connection=${gw} .sessionKey=${this.selectedSession?.sessionKey}></gw-chat>` : ""}
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
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
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
    this._unsubs = [];
    this._connPoll = null;
    this._gotStreamingDelta = false;
  }

  connectedCallback() {
    super.connectedCallback();
    // Poll gw.connected to update reactive state
    this.wsConnected = gw.connected;
    this._connPoll = setInterval(() => {
      if (this.wsConnected !== gw.connected) {
        this.wsConnected = gw.connected;
      }
    }, 500);
    this._unsubs.push(
      gw.on("chat.reply", (p) => {
        // Skip if we already displayed this via streaming events
        if (!this._gotStreamingDelta) {
          this.messages = [...this.messages, { role: "assistant", text: p.text }];
          this._scrollBottom();
        }
        this._gotStreamingDelta = false;
        this.isStreaming = false;
        this.isTyping = false;
      }),
      gw.on("chat.typing", (p) => {
        this.isTyping = p.typing;
      }),
      gw.on("agent", (p) => {
        // Handle streaming text_delta for real-time display
        if (p.type === "message_update" && p.assistantMessageEvent?.type === "text_delta") {
          this._gotStreamingDelta = true;
          const last = this.messages[this.messages.length - 1];
          if (last?.role === "streaming") {
            last.text += p.assistantMessageEvent.delta;
            this.messages = [...this.messages];
          } else {
            this.messages = [...this.messages, { role: "streaming", text: p.assistantMessageEvent.delta }];
          }
          this.isTyping = false;
          this._scrollBottom();
        }
        if (p.type === "agent_end") {
          // Convert streaming message to final assistant message
          const last = this.messages[this.messages.length - 1];
          if (last?.role === "streaming") {
            last.role = "assistant";
            this.messages = [...this.messages];
          }
          this.isStreaming = false;
          this.isTyping = false;
        }
      }),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubs.forEach((u) => u());
    if (this._connPoll) clearInterval(this._connPoll);
  }

  async updated(changed) {
    if (changed.has("sessionKey") && this.sessionKey) {
      await this.loadSession(this.sessionKey);
    }
  }

  async loadSession(sessionKey) {
    if (!sessionKey) return;
    this.sessionKey = sessionKey;
    try {
      const history = await gw.request("chat.history", { sessionKey });
      this.messages = (history?.messages || []).map((m) => ({
        role: m.role,
        text: m.content,
      }));
      this._scrollBottom();
    } catch (err) {
      console.error("Failed to load session history:", err);
    }
  }

  async _send(e) {
    e.preventDefault();
    const text = this.inputText.trim();
    if (!text || this.isStreaming) return;

    this.messages = [...this.messages, { role: "user", text }];
    this.inputText = "";
    this.isStreaming = true;
    this.isTyping = true;
    this._scrollBottom();

    try {
      await gw.request("chat.send", { text });
    } catch (err) {
      this.messages = [...this.messages, { role: "error", text: err.message }];
      this.isStreaming = false;
      this.isTyping = false;
    }
  }

  async _abort() {
    try {
      await gw.request("chat.abort", {});
    } catch {}
    this.isStreaming = false;
    this.isTyping = false;
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

  _scrollBottom() {
    requestAnimationFrame(() => {
      const el = this.renderRoot.querySelector(".messages");
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  render() {
    return html`
      <div class="messages">
        ${this.messages.length === 0
          ? html`<div class="welcome">
              <h2>pi-gateway WebChat</h2>
              <p>Type a message to chat with your pi agent.</p>
            </div>`
          : this.messages.map((m) => html`
              <div class="msg ${m.role === "streaming" ? "assistant" : m.role}">
                ${renderMessageContent(m.text)}
              </div>
            `)}
        ${this.isTyping && !this.messages.some((m) => m.role === "streaming")
          ? html`<div class="typing">
              <span class="typing-dots"><span></span><span></span><span></span></span>
              Thinking...
            </div>`
          : ""}
      </div>
      <div class="input-area">
        <form @submit=${this._send}>
          <textarea
            .value=${this.inputText}
            @input=${this._onInput}
            @keydown=${this._onKeydown}
            placeholder="Type a message... (Enter to send)"
            rows="1"
            ?disabled=${!this.wsConnected}
          ></textarea>
          ${this.isStreaming
            ? html`<button type="button" class="abort" @click=${this._abort} title="Abort">■</button>`
            : html`<button type="submit" ?disabled=${!this.inputText.trim() || !this.wsConnected} title="Send">➤</button>`}
        </form>
      </div>
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
