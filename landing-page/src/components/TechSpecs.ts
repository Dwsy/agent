import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Tech Specs - Detailed System Specifications
 * Grid layout with animated counters and specs
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

    /* Specs Grid */
    .specs-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
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
      font-size: 1.125rem;
    }

    .spec-icon.runtime { background: rgba(16, 185, 129, 0.1); }
    .spec-icon.gateway { background: rgba(59, 130, 246, 0.1); }
    .spec-icon.memory { background: rgba(168, 85, 247, 0.1); }
    .spec-icon.security { background: rgba(239, 68, 68, 0.1); }

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

    /* Architecture Diagram */
    .arch-diagram {
      margin-top: 4rem;
      padding: 2rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      overflow-x: auto;
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
      height: 300px;
    }

    .arch-node {
      fill: #27272a;
      stroke: #3f3f46;
      stroke-width: 1;
    }

    .arch-label {
      fill: #a1a1aa;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      text-anchor: middle;
    }

    .arch-connector {
      stroke: #3f3f46;
      stroke-width: 1;
      fill: none;
      stroke-dasharray: 4 2;
    }

    @media (max-width: 768px) {
      .specs-grid { grid-template-columns: 1fr; }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private _unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = i18n.subscribe(() => {
      this.locale = i18n.getCurrentLocale();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
  }

  render() {
    const isZh = i18n.getCurrentLocale() === 'zh-CN';

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
                <div class="spec-icon runtime">⚡</div>
                <span class="spec-title">${isZh ? '运行时' : 'Runtime'}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '语言' : 'Language'}</span>
                  <span class="spec-value">TypeScript 5.3</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '引擎' : 'Engine'}</span>
                  <span class="spec-value">Node.js 20+</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '打包' : 'Bundler'}</span>
                  <span class="spec-value">Vite 5</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">TUI</span>
                  <span class="spec-value highlight">React + Ink</span>
                </div>
              </div>
            </div>

            <!-- Gateway -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon gateway">🌐</div>
                <span class="spec-title">${isZh ? '网关' : 'Gateway'}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '协议' : 'Protocol'}</span>
                  <span class="spec-value">WebSocket + HTTP/2</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '并发' : 'Concurrency'}</span>
                  <span class="spec-value highlight">1000+ sessions</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '延迟' : 'Latency'}</span>
                  <span class="spec-value">&lt; 10ms p99</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">RPC</span>
                  <span class="spec-value">JSON-RPC 2.0</span>
                </div>
              </div>
            </div>

            <!-- Memory -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon memory">🧠</div>
                <span class="spec-title">${isZh ? '记忆' : 'Memory'}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '向量维度' : 'Vector Dim'}</span>
                  <span class="spec-value">768 (Gemma)</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '检索' : 'Retrieval'}</span>
                  <span class="spec-value highlight">Vector + BM25</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '数据库' : 'Database'}</span>
                  <span class="spec-value">LanceDB</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '存储' : 'Storage'}</span>
                  <span class="spec-value">Markdown + SQLite</span>
                </div>
              </div>
            </div>

            <!-- Security -->
            <div class="spec-category">
              <div class="spec-header">
                <div class="spec-icon security">🔒</div>
                <span class="spec-title">${isZh ? '安全' : 'Security'}</span>
              </div>
              <div class="spec-list">
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '认证' : 'Auth'}</span>
                  <span class="spec-value highlight">HMAC-SHA256</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '沙箱' : 'Sandbox'}</span>
                  <span class="spec-value">Unified Diff</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '网络' : 'Network'}</span>
                  <span class="spec-value">SSRF Guard</span>
                </div>
                <div class="spec-item">
                  <span class="spec-label">${isZh ? '执行' : 'Execution'}</span>
                  <span class="spec-value">Allowlist</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Architecture Diagram -->
          <div class="arch-diagram">
            <h3 class="arch-title">${isZh ? '数据流架构' : 'Data Flow Architecture'}</h3>
            <svg class="arch-svg" viewBox="0 0 800 300">
              <!-- Core -->
              <rect class="arch-node" x="350" y="120" width="100" height="60" rx="8" />
              <text class="arch-label" x="400" y="155">Pi Core</text>

              <!-- Extensions -->
              <rect class="arch-node" x="150" y="50" width="80" height="40" rx="6" />
              <text class="arch-label" x="190" y="75">Extensions</text>

              <rect class="arch-node" x="150" y="120" width="80" height="40" rx="6" />
              <text class="arch-label" x="190" y="145">Skills</text>

              <rect class="arch-node" x="150" y="190" width="80" height="40" rx="6" />
              <text class="arch-label" x="190" y="215">Subagents</text>

              <!-- Gateway -->
              <rect class="arch-node" x="570" y="50" width="80" height="40" rx="6" />
              <text class="arch-label" x="610" y="75">Gateway</text>

              <rect class="arch-node" x="570" y="120" width="80" height="40" rx="6" />
              <text class="arch-label" x="610" y="145">RPC Pool</text>

              <rect class="arch-node" x="570" y="190" width="80" height="40" rx="6" />
              <text class="arch-label" x="610" y="215">Channels</text>

              <!-- Memory -->
              <rect class="arch-node" x="360" y="240" width="80" height="40" rx="6" />
              <text class="arch-label" x="400" y="265">Memory</text>

              <!-- Connections -->
              <path class="arch-connector" d="M 230 70 L 350 150" />
              <path class="arch-connector" d="M 230 140 L 350 150" />
              <path class="arch-connector" d="M 230 210 L 350 150" />
              <path class="arch-connector" d="M 450 150 L 570 70" />
              <path class="arch-connector" d="M 450 150 L 570 140" />
              <path class="arch-connector" d="M 450 150 L 570 210" />
              <path class="arch-connector" d="M 400 180 L 400 240" />
            </svg>
          </div>
        </div>
      </section>
    `;
  }
}
