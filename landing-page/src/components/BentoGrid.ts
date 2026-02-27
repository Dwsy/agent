import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Bento Grid - Motion-Engine Paradigm v2
 * DESIGN_VARIANCE: 8 | MOTION_INTENSITY: 6 | VISUAL_DENSITY: 4
 */
@customElement("bento-grid")
export class BentoGrid extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #09090b;
      position: relative;
    }

    .inner { max-width: 1200px; margin: 0 auto; }

    .header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      margin-bottom: 5rem;
      align-items: end;
    }

    .header-left { max-width: 480px; }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.05;
      margin-bottom: 1.25rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    .header-right {
      display: flex;
      gap: 3rem;
      justify-content: flex-end;
    }

    .stat-block {
      text-align: right;
    }

    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 0.5rem;
    }

    /* Bento Grid - Asymmetric Masonry */
    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      grid-auto-rows: 140px;
      gap: 1.25rem;
    }

    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
    }

    .card:hover {
      transform: translateY(-4px);
      border-color: #3f3f46;
    }

    .card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(500px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(16, 185, 129, 0.08), transparent 40%);
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }

    .card:hover::before { opacity: 1; }

    /* Card Sizes - True Asymmetric */
    .card.span-6 { grid-column: span 6; }
    .card.span-4 { grid-column: span 4; }
    .card.span-3 { grid-column: span 3; }
    .card.row-2 { grid-row: span 2; }
    .card.row-3 { grid-row: span 3; }
    .card.row-4 { grid-row: span 4; }

    /* Card Types */
    .card-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .card-icon {
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.625rem;
      display: grid;
      place-items: center;
      font-size: 0.875rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .card-icon.accent {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }

    .card-icon.purple {
      background: rgba(168, 85, 247, 0.12);
      color: #a855f7;
    }

    .card-icon.blue {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
    }

    .card-icon.orange {
      background: rgba(249, 115, 22, 0.12);
      color: #f97316;
    }

    .card-title {
      font-size: 1rem;
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.01em;
    }

    .card-desc {
      font-size: 0.875rem;
      color: #71717a;
      line-height: 1.6;
    }

    /* Feature List */
    .features {
      list-style: none;
      padding: 0;
      margin: auto 0 0 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .feature {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-size: 0.8125rem;
      color: #a1a1aa;
    }

    .feature::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #10b981;
      flex-shrink: 0;
    }

    /* Live Status Widget */
    .status-widget {
      margin-top: auto;
      padding: 1rem;
      background: rgba(16, 185, 129, 0.05);
      border-radius: 0.75rem;
      border: 1px solid rgba(16, 185, 129, 0.1);
    }

    .status-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
      50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
    }

    .status-text {
      font-size: 0.6875rem;
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }

    .status-metrics {
      display: flex;
      gap: 1.5rem;
    }

    .metric {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .metric-value {
      font-size: 1.125rem;
      font-weight: 700;
      color: #fafafa;
      font-family: 'JetBrains Mono', monospace;
    }

    .metric-label {
      font-size: 0.6875rem;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Terminal Widget */
    .terminal {
      background: #0c0c0e;
      border-radius: 0.75rem;
      padding: 1rem;
      margin-top: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
    }

    .terminal-line {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.375rem;
    }

    .terminal-prompt {
      color: #10b981;
      flex-shrink: 0;
    }

    .terminal-command {
      color: #a1a1aa;
    }

    .terminal-cursor {
      display: inline-block;
      width: 6px;
      height: 1.2em;
      background: #10b981;
      animation: blink 1s step-end infinite;
      vertical-align: text-bottom;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* Code Preview */
    .code-preview {
      background: #0c0c0e;
      border-radius: 0.75rem;
      padding: 1rem;
      margin-top: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.6875rem;
      line-height: 1.7;
      overflow-x: auto;
    }

    .code-line { display: flex; gap: 0.75rem; }
    .code-num { color: #3f3f46; user-select: none; min-width: 1.5rem; }
    .code-keyword { color: #c084fc; }
    .code-string { color: #4ade80; }
    .code-func { color: #60a5fa; }
    .code-plain { color: #a1a1aa; }
    .code-comment { color: #52525b; }

    /* Skill Tags */
    .skill-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: auto;
    }

    .skill-tag {
      padding: 0.375rem 0.75rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid #27272a;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      color: #a1a1aa;
      transition: all 0.2s;
    }

    .skill-tag:hover {
      border-color: #3f3f46;
      color: #fafafa;
    }

    /* Agent Grid */
    .agent-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
      margin-top: auto;
    }

    .agent-cell {
      aspect-ratio: 1;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 0.5rem;
      display: grid;
      place-items: center;
      font-size: 0.625rem;
      color: #52525b;
      font-weight: 600;
      transition: all 0.3s;
    }

    .agent-cell:hover {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }

    .agent-cell.active {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .header {
        grid-template-columns: 1fr;
        gap: 2rem;
      }
      .header-right { justify-content: flex-start; }
      .grid {
        grid-template-columns: repeat(6, 1fr);
      }
      .card.span-6 { grid-column: span 6; }
      .card.span-4 { grid-column: span 3; }
      .card.span-3 { grid-column: span 3; }
    }

    @media (max-width: 640px) {
      .grid {
        grid-template-columns: 1fr;
        grid-auto-rows: auto;
      }
      .card.span-6,
      .card.span-4,
      .card.span-3 {
        grid-column: span 1;
      }
      .card.row-2,
      .card.row-3,
      .card.row-4 {
        grid-row: span 1;
      }
      .agent-grid {
        grid-template-columns: repeat(5, 1fr);
      }
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

  private _handleMouseMove(e: MouseEvent) {
    const card = e.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  }

  render() {
    const f = (key: string) => i18n.t(key);
    const isZh = i18n.getCurrentLocale() === 'zh-CN';
    const agents = isZh 
      ? ['侦察', '规划', '执行', '审查', '视觉', '研究', 'API测', '安全', '简化', '码图', '脑暴', '系统']
      : ['SC', 'PL', 'WR', 'RV', 'VS', 'RS', 'AP', 'SE', 'SI', 'CM', 'BR', 'SD'];

    return html`
      <section class="section" id="features">
        <div class="inner">
          <div class="header">
            <div class="header-left">
              <span class="label">${f('features.label')}</span>
              <h2 class="title">${f('features.title').replace(', ', ',<br>')}</h2>
              <p class="subtitle">${f('features.subtitle')}</p>
            </div>
            <div class="header-right">
              <div class="stat-block">
                <div class="stat-value">42</div>
                <div class="stat-label">${isZh ? '技能' : 'Skills'}</div>
              </div>
              <div class="stat-block">
                <div class="stat-value">25+</div>
                <div class="stat-label">${isZh ? '代理' : 'Agents'}</div>
              </div>
              <div class="stat-block">
                <div class="stat-value">5</div>
                <div class="stat-label">${isZh ? '阶段' : 'Phases'}</div>
              </div>
            </div>
          </div>

          <div class="grid">
            <!-- Row 1: Workflow (Large) -->
            <div class="card span-6 row-4" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon accent">WF</div>
                <span class="card-title">${f('features.workflow.title')}</span>
              </div>
              <p class="card-desc">${f('features.workflow.desc')}</p>
              <ul class="features">
                ${[0, 1, 2, 3].map(i => html`<li class="feature">${f(`features.workflow.features.${i}`)}</li>`)}
              </ul>
              <div class="status-widget">
                <div class="status-header">
                  <span class="status-dot"></span>
                  <span class="status-text">Live System Status</span>
                </div>
                <div class="status-metrics">
                  <div class="metric">
                    <span class="metric-value">2.4k</span>
                    <span class="metric-label">${f('features.workflow.metrics.tasks')}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-value">98.7%</span>
                    <span class="metric-label">${f('features.workflow.metrics.success')}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-value">142</span>
                    <span class="metric-label">${f('features.workflow.metrics.active')}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Skills -->
            <div class="card span-3 row-2" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon purple">SK</div>
                <span class="card-title">${f('features.skills.title')}</span>
              </div>
              <p class="card-desc">${f('features.skills.desc')}</p>
              <div class="skill-tags">
                ${[0, 1, 2, 3, 4].map(i => html`<span class="skill-tag">${f(`features.skills.tags.${i}`)}</span>`)}
              </div>
            </div>

            <!-- Subagents Grid -->
            <div class="card span-3 row-2" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon blue">SA</div>
                <span class="card-title">${f('features.subagents.title')}</span>
              </div>
              <p class="card-desc">${f('features.subagents.desc')}</p>
              <div class="agent-grid">
                ${agents.map((code, i) => html`
                  <div class="agent-cell ${i < 5 ? 'active' : ''}">${code}</div>
                `)}
              </div>
            </div>

            <!-- Search -->
            <div class="card span-3 row-2" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon accent">SR</div>
                <span class="card-title">${f('features.search.title')}</span>
              </div>
              <p class="card-desc">${f('features.search.desc')}</p>
              <div class="terminal">
                <div class="terminal-line">
                  <span class="terminal-prompt">$</span>
                  <span class="terminal-command">${f('features.search.example')}</span>
                </div>
                <div class="terminal-line">
                  <span class="terminal-prompt">$</span>
                  <span class="terminal-command">ace "find middleware"</span>
                  <span class="terminal-cursor"></span>
                </div>
              </div>
            </div>

            <!-- Gateway Code -->
            <div class="card span-3 row-2" @mousemove=${this._handleMouseMove}>
              <div class="card-header">
                <div class="card-icon orange">GW</div>
                <span class="card-title">${f('features.gateway.title')}</span>
              </div>
              <p class="card-desc">${f('features.gateway.desc')}</p>
              <div class="code-preview">
                <div class="code-line">
                  <span class="code-num">1</span>
                  <span class="code-plain"><span class="code-keyword">await</span> <span class="code-func">gateway</span>.route({</span>
                </div>
                <div class="code-line">
                  <span class="code-num">2</span>
                  <span class="code-plain">  channel: <span class="code-string">'telegram'</span>,</span>
                </div>
                <div class="code-line">
                  <span class="code-num">3</span>
                  <span class="code-plain">  session: <span class="code-func">uuid</span>()</span>
                </div>
                <div class="code-line">
                  <span class="code-num">4</span>
                  <span class="code-plain">});</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}
