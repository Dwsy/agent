import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("pi-navbar")
export class Navbar extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 1rem;
      left: 1rem;
      right: 1rem;
      z-index: 1000;
    }

    .nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 0.75rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
    }

    .logo-icon {
      width: 2.5rem;
      height: 2.5rem;
      background: linear-gradient(135deg, #2563EB 0%, #8B5CF6 100%);
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-text {
      font-size: 1.5rem;
      font-weight: 700;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .nav-link {
      color: #94A3B8;
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 500;
      transition: color 0.2s ease-out;
      font-family: "DM Sans", sans-serif;
    }

    .nav-link:hover {
      color: #60A5FA;
    }

    .cta-button {
      padding: 0.625rem 1.25rem;
      background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease-out;
      text-decoration: none;
      font-family: "DM Sans", sans-serif;
    }

    .cta-button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
    }

    .lang-toggle {
      padding: 0.5rem 1rem;
      background: rgba(30, 41, 59, 0.6);
      color: #94A3B8;
      border: 1px solid rgba(51, 65, 85, 0.6);
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease-out;
      font-family: "DM Sans", sans-serif;
    }

    .lang-toggle:hover {
      background: rgba(30, 41, 59, 1);
      color: #60A5FA;
      border-color: #60A5FA;
    }

    @media (max-width: 768px) {
      .nav-links {
        display: none;
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

  disconnectedCallback() {
    super.disconnectedCallback();
    // Unsubscribe handled by i18n manager reference
  }

  toggleLocale() {
    const newLocale: Locale = this.locale === "zh-CN" ? "en-US" : "zh-CN";
    i18n.setLocale(newLocale);
  }

  render() {
    return html`
      <nav class="nav">
        <a href="#" class="logo">
          <div class="logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span class="logo-text">Pi Agent</span>
        </a>
        <div class="nav-links">
          <a href="#features" class="nav-link">${i18n.t("navbar.links.features")}</a>
          <a href="#tech-specs" class="nav-link">${i18n.t("navbar.links.techSpecs")}</a>
          <a href="#docs" class="nav-link">${i18n.t("navbar.links.docs")}</a>
        </div>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <button
            class="lang-toggle"
            @click="${this.toggleLocale}"
            aria-label="Switch language"
          >
            ${this.locale === "zh-CN" ? "EN" : "中文"}
          </button>
          <a href="#get-started" class="cta-button">${i18n.t("navbar.cta")}</a>
        </div>
      </nav>
    `;
  }
}