import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("tech-specs")
export class TechSpecs extends LitElement {
  static styles = css`
    :host { display: block; }

    .specs-section {
      padding: 6rem 1.5rem;
      background: #0F172A;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #60A5FA;
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

    .specs-grid {
      max-width: 72rem;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
    }

    .spec-column {
      background: rgba(30, 41, 59, 0.3);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 1.75rem;
    }

    .spec-title {
      font-size: 1.05rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .spec-title svg { color: #60A5FA; }

    .spec-item {
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(51, 65, 85, 0.2);
    }

    .spec-item:last-child { border-bottom: none; }

    .spec-value {
      font-size: 0.875rem;
      color: #CBD5E1;
      font-family: "DM Sans", sans-serif;
      line-height: 1.5;
    }

    @media (max-width: 768px) {
      .specs-grid { grid-template-columns: 1fr; }
      .specs-section { padding: 3.5rem 1rem; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  render() {
    const f = i18n.t.bind(i18n);

    const columns = [
      {
        key: "core",
        icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m18.07-5.07l-4.24 4.24M9.17 14.83l-4.24 4.24m0-14.14l4.24 4.24m5.66 5.66l4.24 4.24"/></svg>`,
        items: ["primary", "codex", "gemini", "specialized"],
      },
      {
        key: "skills",
        icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
        items: ["search", "ast", "docs", "tools"],
      },
      {
        key: "subagents",
        icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        items: ["scout", "worker", "reviewer", "creative"],
      },
      {
        key: "protocols",
        icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        items: ["ssot", "sandbox", "sovereignty", "routing"],
      },
    ];

    return html`
      <section class="specs-section" id="tech-specs">
        <div class="section-header">
          <p class="section-label">${f("techSpecs.label")}</p>
          <h2 class="section-title">${f("techSpecs.title")}</h2>
          <p class="section-subtitle">${f("techSpecs.subtitle")}</p>
        </div>
        <div class="specs-grid">
          ${columns.map(col => html`
            <div class="spec-column">
              <h3 class="spec-title">
                ${col.icon}
                ${f(`techSpecs.columns.${col.key}.title`)}
              </h3>
              ${col.items.map(item => html`
                <div class="spec-item">
                  <p class="spec-value">${f(`techSpecs.columns.${col.key}.items.${item}`)}</p>
                </div>
              `)}
            </div>
          `)}
        </div>
      </section>
    `;
  }
}
