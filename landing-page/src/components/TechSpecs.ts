import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Tech Specs - Interactive System Architecture
 * Animated data flow with hover interactions
 */
@customElement("tech-specs")
export class TechSpecs extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #0c0c0e;
      position: relative;
    }

    .inner { max-width: 1200px; margin: 0 auto; }

    .header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #ec4899;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .title {
      font-size: clamp(2rem, 4vw, 2.75rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
    }

    .specs-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
      margin-bottom: 4rem;
    }

    .spec-category {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 1.75rem;
      transition: all 0.3s ease;
    }

    .spec-category:hover {
      border-color: #3f3f46;
      transform: translateY(-2px);
    }

    .spec-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #27272a;
    }

    .spec-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.625rem;
      display: grid;
      place-items: center;
    }

    .spec-icon svg {
      width: 20px;
      height: 20px;
    }

    .spec-icon.runtime { background: rgba(16, 185, 129, 0.1); color: #10b981; }
    .spec-icon.gateway { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
    .spec-icon.memory { background: rgba(168, 85, 247, 0.1); color: #a855f7; }
    .spec-icon.security { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

    .spec-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
    }

    .spec-list {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }

    .spec-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.875rem;
    }

    .spec-label {
      color: #71717a;
    }

    .spec-value {
      color: #a1a1aa;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
    }

    .spec-value.highlight {
      color: #10b981;
    }

    /* Architecture Diagram - Interactive */
    .arch-diagram {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 2rem;
      overflow-x: auto;
      position: relative;
    }

    .arch-title {
      font-size: 1rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 1.5rem;
      text-align: center;
    }

    .arch-svg {
      width: 100%;
      min-width: 800px;
      height: 350px;
    }

    /* Nodes */
    .arch-node {
      fill: #27272a;
      stroke: #3f3f46;
      stroke-width: 1.5;
      transition: all 0.3s ease;
      cursor: pointer;
    }

    .arch-node:hover {
      fill: #3f3f46;
      stroke: #10b981;
      filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.3));
    }

    .arch-node.active {
      fill: #1e293b;
      stroke: #10b981;
      filter: drop-shadow(0 0 12px rgba(16, 185, 129, 0.4));
    }

    /* Node Labels */
    .arch-label {
      fill: #a1a1aa;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      text-anchor: middle;
      pointer-events: none;
      transition: all 0.3s ease;
    }

    .arch-node:hover + .arch-label,
    .arch-node.active + .arch-label {
      fill: #fafafa;
      font-weight: 600;
    }

    /* Connection Lines */
    .arch-connector {
      stroke: #3f3f46;
      stroke-width: 1.5;
      fill: none;
      stroke-dasharray: 4 4;
      transition: all 0.3s ease;
    }

    .arch-connector.active {
      stroke: #10b981;
      stroke-width: 2;
      animation: flow 1s linear infinite;
    }

    @keyframes flow {
      to { stroke-dashoffset: -8; }
    }

    /* Data Flow Animation */
    .data-packet {
      fill: #10b981;
      filter: drop-shadow(0 0 4px #10b981);
    }

    /* Pulse Effect */
    .pulse-ring {
      fill: none;
      stroke: #10b981;
      stroke-width: 2;
      opacity: 0;
    }

    .pulse-ring.animating {
      animation: pulse-ring 2s ease-out infinite;
    }

    @keyframes pulse-ring {
      0% { r: 30; opacity: 0.6; stroke-width: 2; }
      100% { r: 50; opacity: 0; stroke-width: 0; }
    }

    /* Node Info Panel */
    .node-info {
      position: absolute;
      bottom: 1.5rem;
      left: 1.5rem;
      right: 1.5rem;
      padding: 1rem 1.25rem;
      background: rgba(24, 24, 27, 0.95);
      border: 1px solid #27272a;
      border-radius: 0.75rem;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s ease;
      pointer-events: none;
    }

    .node-info.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .node-info-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #10b981;
      margin-bottom: 0.375rem;
    }

    .node-info-desc {
      font-size: 0.8125rem;
      color: #71717a;
    }

    /* Traffic Counter */
    .traffic-counter {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
      padding: 0.5rem 0.875rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #10b981;
    }

    .traffic-counter span {
      font-weight: 600;
    }

    @media (max-width: 768px) {
      .specs-grid { grid-template-columns: 1fr; }
      .arch-svg { min-width: 600px; height: 280px; }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  @state() private activeNode: string | null = null;
  @state() private packetCount = 0;
  private _unsub?: () => void;
  private _counterInterval?: number;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = i18n.subscribe(() => {
      this.locale = i18n.getCurrentLocale();
    });
    
    // Simulate packet counter
    this._counterInterval = window.setInterval(() => {
      this.packetCount += Math.floor(Math.random() * 5) + 1;
    }, 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    if (this._counterInterval) clearInterval(this._counterInterval);
  }

  private _handleNodeHover(nodeId: string) {
    this.activeNode = nodeId;
  }

  private _handleNodeLeave() {
    this.activeNode = null;
  }

  private _getNodeInfo(nodeId: string, isZh: boolean): { title: string; desc: string } {
    const info: Record<string, { zh: string; en: string; descZh: string; descEn: string }> = {
      core: { 
        zh: 'Pi Core', 
        en: 'Pi Core', 
        descZh: '核心编排引擎，管理扩展生命周期', 
        descEn: 'Core orchestration engine managing extension lifecycle' 
      },
      extensions: { 
        zh: '扩展系统', 
        en: 'Extensions', 
        descZh: '插件化架构，支持命令、工具、钩子', 
        descEn: 'Plugin architecture supporting commands, tools, hooks' 
      },
      skills: { 
        zh: '技能系统', 
        en: 'Skills', 
        descZh: '42+ 可复用技能单元', 
        descEn: '42+ reusable capability units' 
      },
      subagents: { 
        zh: '子代理网格', 
        en: 'Subagents', 
        descZh: '25+ 专用代理通过 Crew 协议协调', 
        descEn: '25+ specialized agents coordinated via Crew protocol' 
      },
      gateway: { 
        zh: '网关', 
        en: 'Gateway', 
        descZh: '多通道接入，16 个生命周期钩子', 
        descEn: 'Multi-channel access with 16 lifecycle hooks' 
      },
      rpc: { 
        zh: 'RPC 池', 
        en: 'RPC Pool', 
        descZh: '进程池管理，会话路由', 
        descEn: 'Process pool management, session routing' 
      },
      channels: { 
        zh: '通道', 
        en: 'Channels', 
        descZh: 'Telegram / Discord / WebChat / API', 
        descEn: 'Telegram / Discord / WebChat / API' 
      },
      memory: { 
        zh: '记忆系统', 
        en: 'Memory', 
        descZh: '三层记忆栈：L3 运行时 + L2 合并 + L1 日志', 
        descEn: '3-layer memory: L3 runtime + L2 consolidated + L1 logs' 
      },
    };
    
    const node = info[nodeId];
    return {
      title: isZh ? node.zh : node.en,
      desc: isZh ? node.descZh : node.descEn
    };
  }

  render() {
    const isZh = i18n.getCurrentLocale() === 'zh-CN';
    const nodeInfo = this.activeNode ? this._getNodeInfo(this.activeNode, isZh) : null;

    return html`
      <section class="section" id="specs">
        <div class="inner">
          <div class="header">
            <span class="label">${isZh ? '技术规格' : 'Technical Specifications'}</span>
            <h2 class="title">${isZh ? '系统架构' : 'System Architecture'}</h2>
          </div>

          <div class="specs-grid">
            <!-- Runtime -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon runtime"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
                <span class="spec-title">${isZh ? '运行时' : 'Runtime'}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item"><span class="spec-label">${isZh ? '语言' : 'Language'}</span><span class="spec-value">TypeScript 5.3</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '引擎' : 'Engine'}</span><span class="spec-value">Node.js 20+</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '打包' : 'Bundler'}</span><span class="spec-value">Vite 5</span></div>
                <div class="spec-item"><span class="spec-label">TUI</span><span class="spec-value highlight">React + Ink</span></div>
              </div>
            </div>

            <!-- Gateway -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon gateway"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
                <span class="spec-title">${isZh ? '网关' : 'Gateway'}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item"><span class="spec-label">${isZh ? '协议' : 'Protocol'}</span><span class="spec-value">WebSocket + HTTP/2</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '并发' : 'Concurrency'}</span><span class="spec-value highlight">1000+ sessions</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '延迟' : 'Latency'}</span><span class="spec-value">&lt; 10ms p99</span></div>
                <div class="spec-item"><span class="spec-label">RPC</span><span class="spec-value">JSON-RPC 2.0</span></div>
              </div>
            </div>

            <!-- Memory -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon memory"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5z"/><circle cx="12" cy="13" r="2"/></svg></div>
                <span class="spec-title">${isZh ? '记忆' : 'Memory'}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item"><span class="spec-label">${isZh ? '向量维度' : 'Vector Dim'}</span><span class="spec-value">768 (Gemma)</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '检索' : 'Retrieval'}</span><span class="spec-value highlight">Vector + BM25</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '数据库' : 'Database'}</span><span class="spec-value">LanceDB</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '存储' : 'Storage'}</span><span class="spec-value">Markdown + SQLite</span></div>
              </div>
            </div>

            <!-- Security -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon security"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
                <span class="spec-title">${isZh ? '安全' : 'Security'}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item"><span class="spec-label">${isZh ? '认证' : 'Auth'}</span><span class="spec-value highlight">HMAC-SHA256</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '沙箱' : 'Sandbox'}</span><span class="spec-value">Unified Diff</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '网络' : 'Network'}</span><span class="spec-value">SSRF Guard</span></div>
                <div class="spec-item"><span class="spec-label">${isZh ? '执行' : 'Execution'}</span><span class="spec-value">Allowlist</span></div>
              </div>
            </div>
          </div>

          <!-- Interactive Architecture Diagram -->
          <div class="arch-diagram">
            <h3 class="arch-title">${isZh ? '数据流架构 (悬停查看详情)' : 'Data Flow Architecture (hover for details)'}</h3>
            
            <div class="traffic-counter">
              ${isZh ? '数据包' : 'Packets'}: <span>${this.packetCount.toLocaleString()}</span>
            </div>

            <svg class="arch-svg" viewBox="0 0 900 380">
              <defs>
                <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style="stop-color:#3f3f46;stop-opacity:1" />
                  <stop offset="50%" style="stop-color:#10b981;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#3f3f46;stop-opacity:1" />
                </linearGradient>
                <filter id="node-glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              <!-- Connection Lines - Extensions to Core -->
              <path class="arch-connector ${this.activeNode === 'extensions' || this.activeNode === 'core' ? 'active' : ''}" d="M 230 70 L 350 190" />
              <path class="arch-connector ${this.activeNode === 'skills' || this.activeNode === 'core' ? 'active' : ''}" d="M 230 160 L 350 190" />
              <path class="arch-connector ${this.activeNode === 'subagents' || this.activeNode === 'core' ? 'active' : ''}" d="M 230 250 L 350 190" />
              
              <!-- Connection Lines - Core to Gateway -->
              <path class="arch-connector ${this.activeNode === 'core' || this.activeNode === 'gateway' ? 'active' : ''}" d="M 450 190 L 570 70" />
              <path class="arch-connector ${this.activeNode === 'core' || this.activeNode === 'rpc' ? 'active' : ''}" d="M 450 190 L 570 160" />
              <path class="arch-connector ${this.activeNode === 'core' || this.activeNode === 'channels' ? 'active' : ''}" d="M 450 190 L 570 250" />
              
              <!-- Connection Line - Core to Memory -->
              <path class="arch-connector ${this.activeNode === 'core' || this.activeNode === 'memory' ? 'active' : ''}" d="M 400 230 L 400 290" />

              <!-- Pulse Rings -->
              <circle class="pulse-ring ${this.activeNode === 'core' ? 'animating' : ''}" cx="400" cy="190" />

              <!-- Extension Nodes -->
              <rect class="arch-node ${this.activeNode === 'extensions' ? 'active' : ''}" 
                x="150" y="50" width="80" height="40" rx="6" 
                @mouseenter="${() => this._handleNodeHover('extensions')}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="190" y="75">Extensions</text>

              <rect class="arch-node ${this.activeNode === 'skills' ? 'active' : ''}" 
                x="150" y="140" width="80" height="40" rx="6" 
                @mouseenter="${() => this._handleNodeHover('skills')}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="190" y="165">Skills</text>

              <rect class="arch-node ${this.activeNode === 'subagents' ? 'active' : ''}" 
                x="150" y="230" width="80" height="40" rx="6" 
                @mouseenter="${() => this._handleNodeHover('subagents')}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="190" y="255">Subagents</text>

              <!-- Core Node -->
              <rect class="arch-node ${this.activeNode === 'core' ? 'active' : ''}" 
                x="350" y="160" width="100" height="70" rx="8" 
                @mouseenter="${() => this._handleNodeHover('core')}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="400" y="200" style="font-size: 14px; font-weight: 600;">Pi Core</text>

              <!-- Gateway Nodes -->
              <rect class="arch-node ${this.activeNode === 'gateway' ? 'active' : ''}" 
                x="570" y="50" width="80" height="40" rx="6" 
                @mouseenter="${() => this._handleNodeHover('gateway')}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="610" y="75">Gateway</text>

              <rect class="arch-node ${this.activeNode === 'rpc' ? 'active' : ''}" 
                x="570" y="140" width="80" height="40" rx="6" 
                @mouseenter="${() => this._handleNodeHover('rpc')}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="610" y="165">RPC Pool</text>

              <rect class="arch-node ${this.activeNode === 'channels' ? 'active' : ''}" 
                x="570" y="230" width="80" height="40" rx="6" 
                @mouseenter="${() => this._handleNodeHover('channels')}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="610" y="255">Channels</text>

              <!-- Memory Node -->
              <rect class="arch-node ${this.activeNode === 'memory' ? 'active' : ''}" 
                x="360" y="290" width="80" height="40" rx="6" 
                @mouseenter="${() => this._handleNodeHover('memory')}" 
                @mouseleave="${this._handleNodeLeave}" />
              <text class="arch-label" x="400" y="315">Memory</text>

              <!-- Data Packets -->
              <circle class="data-packet" cx="290" cy="130" r="4">
                <animate attributeName="cx" values="230;350" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="cy" values="70;190" dur="1.5s" repeatCount="indefinite" />
              </circle>
              <circle class="data-packet" cx="290" cy="175" r="4">
                <animate attributeName="cx" values="350;570" dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="cy" values="190;70" dur="1.2s" repeatCount="indefinite" />
              </circle>
              <circle class="data-packet" cx="400" cy="260" r="4">
                <animate attributeName="cy" values="190;290" dur="2s" repeatCount="indefinite" />
              </circle>
            </svg>

            <div class="node-info ${this.activeNode ? 'visible' : ''}">
              ${nodeInfo ? html`
                <div class="node-info-title">${nodeInfo.title}</div>
                <div class="node-info-desc">${nodeInfo.desc}</div>
              ` : html`
                <div class="node-info-title">${isZh ? '悬停节点查看详情' : 'Hover nodes for details'}</div>
                <div class="node-info-desc">${isZh ? '数据包在节点间实时流动' : 'Data packets flow between nodes in real-time'}</div>
              `}
            </div>
          </div>
        </div>
      </section>
    `;
  }
}
