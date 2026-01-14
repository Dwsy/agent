import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("tech-specs")
export class TechSpecs extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .specs-section {
      padding: 5rem 1.5rem;
      background: #0F172A;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-subtitle {
      font-size: 1.125rem;
      color: #94A3B8;
      max-width: 2xl;
      margin: 0 auto;
      font-family: "DM Sans", sans-serif;
    }

    .specs-grid {
      max-width: 6xl;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 2rem;
    }

    .spec-column {
      background: rgba(30, 41, 59, 0.3);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 1rem;
      padding: 2rem;
    }

    .spec-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .spec-title svg {
      color: #60A5FA;
    }

    .spec-item {
      padding: 1rem 0;
      border-bottom: 1px solid rgba(51, 65, 85, 0.3);
    }

    .spec-item:last-child {
      border-bottom: none;
    }

    .spec-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: #E2E8F0;
      margin-bottom: 0.25rem;
      font-family: "DM Sans", sans-serif;
    }

    .spec-value {
      font-size: 0.95rem;
      color: #94A3B8;
      font-family: "DM Sans", sans-serif;
    }

    @media (max-width: 768px) {
      .specs-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
      }

      .specs-section {
        padding: 3rem 1rem;
      }

      .spec-column {
        padding: 1.5rem;
      }
    }
  `;

  @state()
  locale: Locale = i18n.getCurrentLocale();

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => {
      this.locale = i18n.getCurrentLocale();
      this.requestUpdate();
    });
  }

  render() {
    const f = i18n.t.bind(i18n);

    const specItems = (path: string, items: string[]) =>
      items.map((key: string) => {
        const lastDot = key.lastIndexOf(".");
        const name = key.substring(0, lastDot);
        const value = key.substring(lastDot + 1);
        return html`
          <div class="spec-item">
            <p class="spec-name">${f(`${path}.${name}`)}</p>
            <p class="spec-value">${f(`${path}.${value}`)}</p>
          </div>
        `;
      });

    return html`
      <section class="specs-section" id="tech-specs">
        <div class="section-header">
          <p class="section-label">${f("techSpecs.label")}</p>
          <h2 class="section-title">${f("techSpecs.title")}</h2>
          <p class="section-subtitle">${f("techSpecs.subtitle")}</p>
        </div>

        <div class="specs-grid">
          <div class="spec-column">
            <h3 class="spec-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M12 8v4"/>
                <path d="M12 16h.01"/>
              </svg>
              ${f("techSpecs.columns.core.title")}
            </h3>
            ${specItems("techSpecs.columns.core.items", ["primary.primary", "codex.codex", "gemini.gemini", "specialized.专用"])}
          </div>

          <div class="spec-column">
            <h3 class="spec-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              ${f("techSpecs.columns.skills.title")}
            </h3>
            ${specItems("techSpecs.columns.skills.items", ["search.search", "ast.ast", "docs.docs", "other.other"])}
          </div>

          <div class="spec-column">
            <h3 class="spec-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              ${f("techSpecs.columns.subagents.title")}
            </h3>
            ${specItems("techSpecs.columns.subagents.items", ["scout.scout", "worker.worker", "planner.planner", "reviewer.reviewer", "brainstormer.brainstormer"])}
          </div>

          <div class="spec-column">
            <h3 class="spec-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              ${f("techSpecs.columns.protocols.title")}
            </h3>
            ${specItems("techSpecs.columns.protocols.items", ["ssot.ssot", "filesystem.filesystem", "sovereignty.sovereignty", "sandbox.sandbox"])}
          </div>
        </div>
      </section>
    `;
  }
}
