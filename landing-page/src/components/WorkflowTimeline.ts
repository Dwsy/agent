import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Workflow Timeline - Animated SVG Path with Phase Nodes
 * Shows the 5-phase pipeline as a connected journey
 */
@customElement("workflow-timeline")
export class WorkflowTimeline extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #09090b;
      position: relative;
      overflow: hidden;
    }

    .inner { max-width: 1200px; margin: 0 auto; }

    .header {
      text-align: center;
      margin-bottom: 5rem;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #f97316;
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
      margin-bottom: 1rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    /* Timeline Container */
    .timeline {
      position: relative;
      padding: 2rem 0;
    }

    /* SVG Path */
    .timeline-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .path-bg {
      fill: none;
      stroke: #27272a;
      stroke-width: 2;
      stroke-dasharray: 8 4;
    }

    .path-active {
      fill: none;
      stroke: url(#timeline-gradient);
      stroke-width: 3;
      stroke-dasharray: 1000;
      stroke-dashoffset: 1000;
      animation: draw-path 3s ease-out forwards;
    }

    @keyframes draw-path {
      to { stroke-dashoffset: 0; }
    }

    /* Phase Nodes */
    .phases {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 1.5rem;
      position: relative;
      z-index: 1;
    }

    .phase {
      text-align: center;
      opacity: 0;
      transform: translateY(20px);
      animation: fade-up 0.6s ease-out forwards;
    }

    .phase:nth-child(1) { animation-delay: 0.2s; }
    .phase:nth-child(2) { animation-delay: 0.6s; }
    .phase:nth-child(3) { animation-delay: 1.0s; }
    .phase:nth-child(4) { animation-delay: 1.4s; }
    .phase:nth-child(5) { animation-delay: 1.8s; }

    @keyframes fade-up {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .phase-node {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.25rem;
      background: #18181b;
      border: 2px solid #27272a;
      border-radius: 50%;
      display: grid;
      place-items: center;
      position: relative;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .phase:hover .phase-node {
      border-color: #f97316;
      box-shadow: 0 0 30px rgba(249, 115, 22, 0.2);
      transform: scale(1.05);
    }

    .phase-number {
      font-size: 1.25rem;
      font-weight: 700;
      color: #52525b;
      font-family: 'JetBrains Mono', monospace;
      transition: color 0.3s;
    }

    .phase:hover .phase-number {
      color: #f97316;
    }

    .phase-status {
      position: absolute;
      bottom: -4px;
      right: -4px;
      width: 20px;
      height: 20px;
      background: #10b981;
      border: 3px solid #18181b;
      border-radius: 50%;
      animation: pulse-status 2s ease-in-out infinite;
    }

    @keyframes pulse-status {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.7; }
    }

    .phase-title {
      font-size: 1rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 0.5rem;
    }

    .phase-desc {
      font-size: 0.8125rem;
      color: #71717a;
      line-height: 1.6;
      max-width: 180px;
      margin: 0 auto;
    }

    /* Tools Tags */
    .phase-tools {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.375rem;
      margin-top: 1rem;
    }

    .tool-tag {
      padding: 0.25rem 0.5rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid #27272a;
      border-radius: 0.25rem;
      font-size: 0.6875rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Arrow Indicators */
    .arrow {
      position: absolute;
      top: 32px;
      width: 40px;
      height: 2px;
      background: linear-gradient(90deg, #27272a, #3f3f46);
    }

    .arrow::after {
      content: '';
      position: absolute;
      right: 0;
      top: -3px;
      border: 4px solid transparent;
      border-left: 6px solid #3f3f46;
    }

    /* Progress Bar */
    .progress-container {
      margin-top: 4rem;
      padding: 1.5rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .progress-label {
      font-size: 0.8125rem;
      color: #a1a1aa;
    }

    .progress-value {
      font-size: 0.8125rem;
      color: #f97316;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
    }

    .progress-bar {
      height: 4px;
      background: #27272a;
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      width: 100%;
      background: linear-gradient(90deg, #f97316, #fb923c);
      border-radius: 2px;
      animation: shimmer-progress 2s linear infinite;
      background-size: 200% 100%;
    }

    @keyframes shimmer-progress {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .phases {
        grid-template-columns: repeat(3, 1fr);
        gap: 2rem;
      }
    }

    @media (max-width: 640px) {
      .phases {
        grid-template-columns: 1fr;
        gap: 2.5rem;
      }

      .phase-node {
        width: 56px;
        height: 56px;
      }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  @state() private progress = 0;
  private _unsub?: () => void;
  private _progressInterval?: number;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = i18n.subscribe(() => {
      this.locale = i18n.getCurrentLocale();
    });

    // Simulate progress
    this._progressInterval = window.setInterval(() => {
      this.progress = (this.progress + 1) % 100;
    }, 100);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    if (this._progressInterval) clearInterval(this._progressInterval);
  }

  private t(key: string) {
    return i18n.t(key);
  }

  render() {
    const f = i18n.t.bind(i18n);
    const isZh = i18n.getCurrentLocale() === 'zh-CN';

    const phases = [
      { num: '01', title: f('workflow.phases.0.title'), desc: f('workflow.phases.0.desc'), tools: ['ace', 'rg', 'ast-grep'] },
      { num: '02', title: f('workflow.phases.1.title'), desc: f('workflow.phases.1.desc'), tools: ['callers', 'constraints'] },
      { num: '03', title: f('workflow.phases.2.title'), desc: f('workflow.phases.2.desc'), tools: ['tag', 'compact'] },
      { num: '04', title: f('workflow.phases.3.title'), desc: f('workflow.phases.3.desc'), tools: ['edit', 'gapp'] },
      { num: '05', title: f('workflow.phases.4.title'), desc: f('workflow.phases.4.desc'), tools: ['test', 'diff'] },
    ];

    return html`
      <section class="section" id="workflow">
        <div class="inner">
          <div class="header">
            <span class="label">${isZh ? '工程闭环' : 'Engineering Loop'}</span>
            <h2 class="title">${f('workflow.title')}</h2>
            <p class="subtitle">${f('workflow.subtitle')}</p>
          </div>

          <div class="timeline">
            <!-- Connecting Line SVG -->
            <svg class="timeline-svg" viewBox="0 0 1000 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="timeline-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style="stop-color:#f97316;stop-opacity:1" />
                  <stop offset="50%" style="stop-color:#fb923c;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#f97316;stop-opacity:1" />
                </linearGradient>
              </defs>
              <!-- Background path -->
              <path class="path-bg" d="M 100 50 L 900 50" />
              <!-- Active animated path -->
              <path class="path-active" d="M 100 50 L 900 50" />
            </svg>

            <div class="phases">
              ${phases.map((phase, i) => html`
                <div class="phase">
                  <div class="phase-node">
                    <span class="phase-number">${phase.num}</span>
                    ${i < 3 ? html`<span class="phase-status"></span>` : ''}
                  </div>
                  <h3 class="phase-title">${phase.title}</h3>
                  <p class="phase-desc">${phase.desc}</p>
                  <div class="phase-tools">
                    ${phase.tools.map(tool => html`<span class="tool-tag">${tool}</span>`)}
                  </div>
                </div>
              `)}
            </div>
          </div>

          <div class="progress-container">
            <div class="progress-header">
              <span class="progress-label">${isZh ? '当前任务进度' : 'Current Task Progress'}</span>
              <span class="progress-value">${this.progress}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${this.progress}%"></div>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}
