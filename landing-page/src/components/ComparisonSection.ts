import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Comparison Section - Data Table Style
 */
@customElement("comparison-section")
export class ComparisonSection extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .section {
      padding: 8rem 1.5rem;
      background: #09090b;
      position: relative;
    }

    .inner {
      max-width: 900px;
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

    /* Comparison Table */
    .table {
      border: 1px solid #27272a;
      border-radius: 1rem;
      overflow: hidden;
    }

    .row {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr;
      border-bottom: 1px solid #27272a;
    }

    .row:last-child {
      border-bottom: none;
    }

    .row.header {
      background: #18181b;
    }

    .cell {
      padding: 1rem 1.5rem;
      font-size: 0.9375rem;
    }

    .cell.feature {
      color: #a1a1aa;
    }

    .cell.pi {
      color: #10b981;
      font-weight: 500;
    }

    .cell.others {
      color: #52525b;
    }

    .row.header .cell {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #71717a;
    }

    @media (max-width: 640px) {
      .cell {
        padding: 0.875rem 1rem;
        font-size: 0.8125rem;
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
    const rows = [0, 1, 2, 3, 4];

    return html`
      <section class="section" id="comparison">
        <div class="inner">
          <div class="header">
            <span class="label">${f('comparison.label')}</span>
            <h2 class="title">${f('comparison.title')}</h2>
            <p class="subtitle">${f('comparison.subtitle')}</p>
          </div>

          <div class="table">
            <div class="row header">
              <div class="cell feature">${f('comparison.headers.feature')}</div>
              <div class="cell pi">${f('comparison.headers.pi')}</div>
              <div class="cell others">${f('comparison.headers.others')}</div>
            </div>
            ${rows.map(i => html`
              <div class="row">
                <div class="cell feature">${f(`comparison.rows.${i}.feature`)}</div>
                <div class="cell pi">${f(`comparison.rows.${i}.pi`)}</div>
                <div class="cell others">${f(`comparison.rows.${i}.others`)}</div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `;
  }
}
