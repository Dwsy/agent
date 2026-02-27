import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";
import "./GatewayVisualization";

/**
 * Gateway Section - With Animated Architecture Visualization
 */
@customElement("gateway-section")
export class GatewaySection extends LitElement {
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
      margin-bottom: 4rem;
      max-width: 480px;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #3b82f6;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .label::before {
      content: '';
      width: 24px;
      height: 1px;
      background: #3b82f6;
    }

    .title {
      font-size: clamp(2rem, 4vw, 2.75rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.1;
      margin-bottom: 1rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    /* Feature Grid */
    .features {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-top: 3rem;
    }

    .feature {
      padding: 1.25rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      transition: all 0.3s ease;
    }

    .feature:hover {
      border-color: #3b82f6;
      transform: translateY(-2px);
    }

    .feature-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #fafafa;
      margin-bottom: 0.25rem;
    }

    .feature-label {
      font-size: 0.8125rem;
      color: #71717a;
    }

    @media (max-width: 768px) {
      .features { grid-template-columns: repeat(2, 1fr); }
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

  private t(key: string) {
    return i18n.t(key);
  }

  render() {
    const f = i18n.t.bind(i18n);
    const isZh = i18n.getCurrentLocale() === 'zh-CN';

    return html`
      <section class="section" id="gateway">
        <div class="inner">
          <div class="header">
            <span class="label">${f('gateway.label')}</span>
            <h2 class="title">${f('gateway.title')}</h2>
            <p class="subtitle">${f('gateway.subtitle')}</p>
          </div>

          <gateway-visualization></gateway-visualization>

          <div class="features">
            <div class="feature">
              <div class="feature-value">65+</div>
              <div class="feature-label">${isZh ? '模块' : 'Modules'}</div>
            </div>
            <div class="feature">
              <div class="feature-value">16</div>
              <div class="feature-label">${isZh ? '生命周期钩子' : 'Lifecycle Hooks'}</div>
            </div>
            <div class="feature">
              <div class="feature-value">3</div>
              <div class="feature-label">${isZh ? '通道' : 'Channels'}</div>
            </div>
            <div class="feature">
              <div class="feature-value">&lt;10ms</div>
              <div class="feature-label">${isZh ? '延迟' : 'Latency'}</div>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}
