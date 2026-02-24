import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Extensions Section - Simplified Grid
 */
@customElement("extensions-section")
export class ExtensionsSection extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .section {
      padding: 8rem 1.5rem;
      background: #0c0c0e;
      position: relative;
    }

    .inner {
      max-width: 1200px;
      margin: 0 auto;
    }

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
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .label::before {
      content: '';
      width: 24px;
      height: 1px;
      background: #10b981;
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

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
    }

    .card {
      padding: 1.75rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .card:hover {
      border-color: #3f3f46;
      transform: translateY(-2px);
    }

    .card-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 0.5rem;
    }

    .card-desc {
      font-size: 0.9375rem;
      color: #71717a;
      line-height: 1.6;
    }

    @media (max-width: 768px) {
      .grid {
        grid-template-columns: 1fr;
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

  private t(key: string) {
    return i18n.t(key);
  }

  render() {
    const f = i18n.t.bind(i18n);
    const cards = ['commands', 'tools', 'gateway'];

    return html`
      <section class="section" id="extensions">
        <div class="inner">
          <div class="header">
            <span class="label">${f('extensions.label')}</span>
            <h2 class="title">${f('extensions.title')}</h2>
            <p class="subtitle">${f('extensions.subtitle')}</p>
          </div>

          <div class="grid">
            ${cards.map(key => html`
              <div class="card">
                <div class="card-title">${f(`extensions.categories.${key}.title`)}</div>
                <div class="card-desc">${f(`extensions.categories.${key}.desc`)}</div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `;
  }
}
