import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("bento-grid")
export class BentoGrid extends LitElement {
  static styles = css`
    :host { display: block; }

    .bento-section {
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

    .bento-grid {
      max-width: 72rem;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
    }

    .bento-card {
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 1.75rem;
      transition: border-color 0.2s, box-shadow 0.2s;
      position: relative;
      overflow: hidden;
    }

    .bento-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.2), transparent);
    }

    .bento-card:hover {
      border-color: rgba(96, 165, 250, 0.4);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
    }

    .card-span-2 { grid-column: span 2; }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      margin-bottom: 1rem;
    }

    .card-icon {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 0.625rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .icon-blue { background: rgba(59, 130, 246, 0.15); color: #60A5FA; }
    .icon-purple { background: rgba(139, 92, 246, 0.15); color: #A78BFA; }
    .icon-green { background: rgba(34, 197, 94, 0.15); color: #4ADE80; }
    .icon-orange { background: rgba(249, 115, 22, 0.15); color: #FB923C; }
    .icon-pink { background: rgba(236, 72, 153, 0.15); color: #F472B6; }
    .icon-cyan { background: rgba(6, 182, 212, 0.15); color: #22D3EE; }

    .card-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
    }

    .card-description {
      color: #94A3B8;
      line-height: 1.7;
      font-size: 0.9rem;
      margin-bottom: 0.75rem;
      font-family: "DM Sans", sans-serif;
    }

    .feature-list {
      list-style: none;
      padding: 0;
      margin: 1rem 0 0;
    }

    .feature-list li {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      padding: 0.375rem 0;
      color: #94A3B8;
      font-size: 0.85rem;
      font-family: "DM Sans", sans-serif;
      line-height: 1.5;
    }

    .feature-list li::before {
      content: "→";
      color: #60A5FA;
      font-weight: 600;
      flex-shrink: 0;
      margin-top: 1px;
    }

    @media (prefers-reduced-motion: reduce) {
      .bento-card { transition: none; }
    }

    @media (max-width: 1024px) {
      .bento-grid { grid-template-columns: repeat(2, 1fr); }
      .card-span-2 { grid-column: span 2; }
    }

    @media (max-width: 768px) {
      .bento-section { padding: 3.5rem 1rem; }
      .bento-grid { grid-template-columns: 1fr; gap: 1rem; }
      .card-span-2 { grid-column: span 1; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  render() {
    const f = i18n.t.bind(i18n);
    return html`
      <section class="bento-section" id="features">
        <div class="section-header">
          <p class="section-label">${f("features.label")}</p>
          <h2 class="section-title">${f("features.title")}</h2>
          <p class="section-subtitle">${f("features.subtitle")}</p>
        </div>

        <div class="bento-grid">
          <!-- Workflow: span 2 -->
          <div class="bento-card card-span-2">
            <div class="card-header">
              <div class="card-icon icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <h3 class="card-title">${f("features.cards.workflow.title")}</h3>
            </div>
            <p class="card-description">${f("features.cards.workflow.description")}</p>
            <ul class="feature-list">
              ${["features.cards.workflow.features.0","features.cards.workflow.features.1","features.cards.workflow.features.2","features.cards.workflow.features.3","features.cards.workflow.features.4"].map(k => html`<li>${f(k)}</li>`)}
            </ul>
          </div>

          <!-- Skills -->
          <div class="bento-card">
            <div class="card-header">
              <div class="card-icon icon-purple">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              </div>
              <h3 class="card-title">${f("features.cards.skills.title")}</h3>
            </div>
            <p class="card-description">${f("features.cards.skills.description")}</p>
          </div>

          <!-- Subagents -->
          <div class="bento-card">
            <div class="card-header">
              <div class="card-icon icon-green">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <h3 class="card-title">${f("features.cards.subagents.title")}</h3>
            </div>
            <p class="card-description">${f("features.cards.subagents.description")}</p>
          </div>

          <!-- Search -->
          <div class="bento-card">
            <div class="card-header">
              <div class="card-icon icon-cyan">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <h3 class="card-title">${f("features.cards.search.title")}</h3>
            </div>
            <p class="card-description">${f("features.cards.search.description")}</p>
          </div>

          <!-- Gateway -->
          <div class="bento-card">
            <div class="card-header">
              <div class="card-icon icon-orange">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <h3 class="card-title">${f("features.cards.gateway.title")}</h3>
            </div>
            <p class="card-description">${f("features.cards.gateway.description")}</p>
          </div>

          <!-- Enterprise: span 2 -->
          <div class="bento-card card-span-2">
            <div class="card-header">
              <div class="card-icon icon-pink">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3 class="card-title">${f("features.cards.enterprise.title")}</h3>
            </div>
            <p class="card-description">${f("features.cards.enterprise.description")}</p>
            <ul class="feature-list">
              ${["features.cards.enterprise.features.0","features.cards.enterprise.features.1","features.cards.enterprise.features.2","features.cards.enterprise.features.3"].map(k => html`<li>${f(k)}</li>`)}
            </ul>
          </div>
        </div>
      </section>
    `;
  }
}
