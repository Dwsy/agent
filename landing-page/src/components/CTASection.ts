import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("cta-section")
export class CTASection extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .cta-section {
      padding: 6rem 1.5rem;
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      position: relative;
      overflow: hidden;
    }

    .cta-section::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 800px;
      height: 800px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
      pointer-events: none;
    }

    .cta-content {
      max-width: 3xl;
      margin: 0 auto;
      text-align: center;
      position: relative;
      z-index: 1;
    }

    .cta-title {
      font-size: clamp(2.5rem, 5vw, 3.5rem);
      font-weight: 700;
      color: #F1F5F9;
      margin-bottom: 1.5rem;
      line-height: 1.1;
      font-family: "Space Grotesk", sans-serif;
    }

    .cta-description {
      font-size: 1.25rem;
      color: #94A3B8;
      margin-bottom: 2.5rem;
      line-height: 1.7;
      font-family: "DM Sans", sans-serif;
    }

    .cta-actions {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
    }

    .cta-primary, .cta-secondary {
      padding: 1rem 2.5rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      font-family: "DM Sans", sans-serif;
      cursor: pointer;
      transition: all 0.2s ease-out;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      width: fit-content;
    }

    .cta-primary {
      background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
      color: white;
      border: none;
    }

    .cta-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(59, 130, 246, 0.5);
    }

    .cta-secondary {
      background: rgba(30, 41, 59, 0.8);
      color: #F1F5F9;
      border: 1px solid rgba(51, 65, 85, 0.8);
      backdrop-filter: blur(10px);
    }

    .cta-secondary:hover {
      background: rgba(30, 41, 59, 1);
      border-color: #60A5FA;
    }

    @media (max-width: 768px) {
      .cta-section {
        padding: 4rem 1rem;
      }

      .cta-title {
        font-size: 2rem;
      }

      .cta-description {
        font-size: 1rem;
      }

      .cta-actions {
        width: 100%;
      }

      .cta-primary, .cta-secondary {
        width: 100%;
        justify-content: center;
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
    return html`
      <section class="cta-section" id="get-started">
        <div class="cta-content">
          <h2 class="cta-title">${i18n.t("cta.title")}</h2>
          <p class="cta-description">
            ${i18n.t("cta.description")}
          </p>
          <div class="cta-actions">
            <a href="#" class="cta-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              ${i18n.t("cta.primary")}
            </a>
            <a href="#docs" class="cta-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              ${i18n.t("cta.secondary")}
            </a>
          </div>
        </div>
      </section>
    `;
  }
}