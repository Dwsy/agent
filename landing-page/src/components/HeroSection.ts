import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("hero-section")
export class HeroSection extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .hero {
      min-height: 90vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 4rem 1.5rem;
      background: linear-gradient(180deg, #0F172A 0%, #0A0F1E 100%);
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: "";
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%);
      animation: pulse 8s ease-in-out infinite;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      max-width: 4xl;
    }

    .badge {
      display: inline-block;
      padding: 0.5rem 1rem;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 9999px;
      color: #60A5FA;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 1.5rem;
      font-family: "Space Grotesk", sans-serif;
    }

    h1 {
      font-size: clamp(2.5rem, 5vw, 4rem);
      font-weight: 700;
      line-height: 1.1;
      margin-bottom: 1.5rem;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
    }

    h1 .gradient {
      background: linear-gradient(135deg, #60A5FA 0%, #A78BFA 50%, #F472B6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .description {
      font-size: 1.25rem;
      line-height: 1.7;
      color: #94A3B8;
      margin-bottom: 2.5rem;
      max-width: 2xl;
      font-family: "DM Sans", sans-serif;
    }

    .cta-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .cta-primary, .cta-secondary {
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      font-family: "DM Sans", sans-serif;
      cursor: pointer;
      transition: all 0.2s ease-out;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .cta-primary {
      background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
      color: white;
      border: none;
    }

    .cta-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4);
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

    @keyframes pulse {
      0%, 100% {
        opacity: 0.5;
        transform: scale(1);
      }
      50% {
        opacity: 0.8;
        transform: scale(1.05);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .hero::before {
        animation: none;
      }
    }

    @media (max-width: 768px) {
      .hero {
        padding: 3rem 1rem;
      }

      h1 {
        font-size: 2rem;
      }

      .description {
        font-size: 1rem;
      }

      .cta-buttons {
        flex-direction: column;
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
      <section class="hero">
        <div class="hero-content">
          <span class="badge">${i18n.t("hero.badge")}</span>
          <h1>
            ${i18n.t("hero.title")}<br/>
            <span class="gradient">${i18n.t("hero.subtitle")}</span>
          </h1>
          <p class="description">
            ${i18n.t("hero.description")}
          </p>
          <div class="cta-buttons">
            <a href="#get-started" class="cta-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              ${i18n.t("hero.ctas.primary")}
            </a>
            <a href="#features" class="cta-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
              ${i18n.t("hero.ctas.secondary")}
            </a>
          </div>
        </div>
      </section>
    `;
  }
}