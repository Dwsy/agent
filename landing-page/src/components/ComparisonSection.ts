import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

const FEATURES = [
  "multiModel", "multiAgent", "skillSystem", "extensionSystem",
  "gateway", "safetyGates", "memorySystem", "mandatoryWorkflow", "openSource",
] as const;

const TOOLS = ["pi", "claudeCode", "cursor", "aider"] as const;

@customElement("comparison-section")
export class ComparisonSection extends LitElement {
  static styles = css`
    :host { display: block; }

    .cmp-section {
      padding: 6rem 1.5rem;
      background: #0A0F1E;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #22D3EE;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
    }

    .section-subtitle {
      font-size: 1.05rem;
      color: #94A3B8;
      max-width: 36rem;
      margin: 0 auto;
      font-family: "DM Sans", sans-serif;
    }

    .table-wrap {
      max-width: 56rem;
      margin: 0 auto;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 1rem;
      border: 1px solid rgba(51, 65, 85, 0.4);
      background: rgba(30, 41, 59, 0.25);
    }

    table {
      width: 100%;
      min-width: 36rem;
      border-collapse: collapse;
      font-family: "DM Sans", sans-serif;
    }

    th, td {
      padding: 0.875rem 1.25rem;
      text-align: center;
      border-bottom: 1px solid rgba(51, 65, 85, 0.3);
      font-size: 0.9rem;
    }

    th {
      font-family: "Space Grotesk", sans-serif;
      font-weight: 600;
      color: #94A3B8;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: rgba(15, 23, 42, 0.6);
      position: sticky;
      top: 0;
      z-index: 1;
    }

    th.pi-col, td.pi-col {
      background: rgba(6, 182, 212, 0.08);
      position: sticky;
      left: 0;
      z-index: 2;
    }

    th.pi-col {
      color: #22D3EE;
      z-index: 3;
    }

    th.feature-col, td.feature-col {
      text-align: left;
      color: #CBD5E1;
      font-weight: 500;
      position: sticky;
      left: 0;
      background: rgba(15, 23, 42, 0.85);
      z-index: 2;
      min-width: 10rem;
    }

    th.feature-col { z-index: 3; }

    tr:last-child td { border-bottom: none; }

    tr:hover td { background: rgba(51, 65, 85, 0.15); }
    tr:hover td.pi-col { background: rgba(6, 182, 212, 0.12); }
    tr:hover td.feature-col { background: rgba(15, 23, 42, 0.9); }

    .check { color: #4ADE80; font-weight: 700; font-size: 1rem; }
    .dash  { color: #475569; font-size: 1rem; }

    .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.5s ease, transform 0.5s ease; }
    .reveal.visible { opacity: 1; transform: translateY(0); }

    @media (prefers-reduced-motion: reduce) {
      .reveal { opacity: 1; transform: none; transition: none; }
    }

    @media (max-width: 768px) {
      .cmp-section { padding: 3.5rem 1rem; }
      th, td { padding: 0.625rem 0.75rem; font-size: 0.8rem; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();
  @state() private _visible = false;

  private _unsub?: () => void;
  private _observer?: IntersectionObserver;

  connectedCallback() {
    super.connectedCallback();
    this.id = "comparison";
    this._unsub = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
    this._observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { this._visible = true; this._observer?.disconnect(); } },
      { threshold: 0.15 },
    );
    this._observer.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._observer?.disconnect();
  }

  private _cell(val: boolean) {
    return val
      ? html`<span class="check">✓</span>`
      : html`<span class="dash">—</span>`;
  }

  render() {
    const f = i18n.t.bind(i18n);
    const vals = {
      pi:         [true, true, true, true, true, true, true, true, true],
      claudeCode: [false, false, false, true, false, false, false, false, false],
      cursor:     [true, false, false, true, false, false, false, false, false],
      aider:      [true, false, false, false, false, false, false, false, true],
    } as Record<string, boolean[]>;

    return html`
      <section class="cmp-section">
        <div class="section-header reveal ${this._visible ? "visible" : ""}">
          <p class="section-label">${f("comparison.label")}</p>
          <h2 class="section-title">${f("comparison.title")}</h2>
          <p class="section-subtitle">${f("comparison.subtitle")}</p>
        </div>
        <div class="table-wrap reveal ${this._visible ? "visible" : ""}">
          <table role="grid" aria-label="${f("comparison.title")}">
            <thead>
              <tr>
                <th class="feature-col"></th>
                ${TOOLS.map(t => html`
                  <th class="${t === "pi" ? "pi-col" : ""}">${f(`comparison.tools.${t}`)}</th>
                `)}
              </tr>
            </thead>
            <tbody>
              ${FEATURES.map((feat, i) => html`
                <tr>
                  <td class="feature-col">${f(`comparison.features.${feat}`)}</td>
                  ${TOOLS.map(t => html`
                    <td class="${t === "pi" ? "pi-col" : ""}">${this._cell(vals[t][i])}</td>
                  `)}
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }
}
