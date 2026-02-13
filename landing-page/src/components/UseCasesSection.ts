import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("use-cases-section")
export class UseCasesSection extends LitElement {
  static styles = css`
    :host { display: block; }

    .uc-section {
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

    .uc-grid {
      max-width: 72rem;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
    }

    .uc-card {
      background: rgba(30, 41, 59, 0.35);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 2rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .uc-card:hover {
      border-color: rgba(34, 211, 238, 0.35);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
    }

    .uc-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      background: rgba(6, 182, 212, 0.15);
      color: #22D3EE;
      border-radius: 0.375rem;
      font-size: 0.8rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
      margin-bottom: 1rem;
    }

    .uc-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .uc-description {
      color: #94A3B8;
      font-size: 0.9rem;
      line-height: 1.7;
      margin-bottom: 1rem;
      font-family: "DM Sans", sans-serif;
    }

    .uc-command {
      display: inline-block;
      padding: 0.5rem 0.875rem;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 0.375rem;
      font-family: "JetBrains Mono", monospace;
      font-size: 0.8rem;
      color: #60A5FA;
    }

    @media (prefers-reduced-motion: reduce) {
      .uc-card { transition: none; }
    }

    @media (max-width: 768px) {
      .uc-section { padding: 3.5rem 1rem; }
      .uc-grid { grid-template-columns: 1fr; gap: 1rem; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  render() {
    const f = i18n.t.bind(i18n);
    const cases = ["scout", "brainstorm", "multiAgent", "gateway"];

    return html`
      <section class="uc-section" id="use-cases">
        <div class="section-header">
          <p class="section-label">${f("useCases.label")}</p>
          <h2 class="section-title">${f("useCases.title")}</h2>
          <p class="section-subtitle">${f("useCases.subtitle")}</p>
        </div>
        <div class="uc-grid">
          ${cases.map((c, i) => html`
            <div class="uc-card">
              <div class="uc-number">${i + 1}</div>
              <h3 class="uc-title">${f(`useCases.cases.${c}.title`)}</h3>
              <p class="uc-description">${f(`useCases.cases.${c}.description`)}</p>
              <code class="uc-command">${f(`useCases.cases.${c}.command`)}</code>
            </div>
          `)}
        </div>
      </section>
    `;
  }
}
