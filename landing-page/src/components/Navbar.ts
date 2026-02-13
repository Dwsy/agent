import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("pi-navbar")
export class Navbar extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0.75rem;
      left: 0.75rem;
      right: 0.75rem;
      z-index: 1000;
    }

    .nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1.25rem;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 0.75rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      text-decoration: none;
    }

    .logo-icon {
      width: 2.25rem;
      height: 2.25rem;
      background: linear-gradient(135deg, #2563EB 0%, #8B5CF6 100%);
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-text {
      font-size: 1.25rem;
      font-weight: 700;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .nav-link {
      color: #94A3B8;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: color 0.2s;
      font-family: "DM Sans", sans-serif;
    }

    .nav-link:hover { color: #60A5FA; }

    .nav-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .lang-toggle {
      padding: 0.375rem 0.75rem;
      background: rgba(30, 41, 59, 0.6);
      color: #94A3B8;
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 0.375rem;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: "DM Sans", sans-serif;
    }

    .lang-toggle:hover {
      color: #60A5FA;
      border-color: rgba(96, 165, 250, 0.4);
    }

    .cta-button {
      padding: 0.5rem 1rem;
      background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
      color: white;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: box-shadow 0.2s;
      text-decoration: none;
      font-family: "DM Sans", sans-serif;
    }

    .cta-button:hover {
      box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
    }

    /* Mobile menu */
    .menu-toggle {
      display: none;
      background: none;
      border: none;
      color: #94A3B8;
      cursor: pointer;
      padding: 0.25rem;
    }

    .mobile-menu {
      display: none;
      position: absolute;
      top: calc(100% + 0.5rem);
      left: 0;
      right: 0;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 0.75rem;
      padding: 1rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .mobile-menu.open { display: flex; }

    .mobile-link {
      color: #94A3B8;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      padding: 0.625rem 0.75rem;
      border-radius: 0.375rem;
      transition: background 0.15s, color 0.15s;
      font-family: "DM Sans", sans-serif;
    }

    .mobile-link:hover {
      background: rgba(30, 41, 59, 0.6);
      color: #60A5FA;
    }

    @media (max-width: 768px) {
      .nav-links { display: none; }
      .cta-button { display: none; }
      .menu-toggle { display: block; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();
  @state() menuOpen = false;

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  toggleLocale() {
    i18n.setLocale(this.locale === "zh-CN" ? "en-US" : "zh-CN");
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu() {
    this.menuOpen = false;
  }

  render() {
    const f = i18n.t.bind(i18n);
    const links = [
      { href: "#features", label: f("navbar.links.features") },
      { href: "#workflow", label: f("navbar.links.workflow") },
      { href: "#extensions", label: f("navbar.links.extensions") },
      { href: "#tech-specs", label: f("navbar.links.techSpecs") },
    ];

    return html`
      <nav class="nav">
        <a href="#" class="logo">
          <div class="logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span class="logo-text">Pi Agent</span>
        </a>

        <div class="nav-links">
          ${links.map(l => html`<a href="${l.href}" class="nav-link">${l.label}</a>`)}
        </div>

        <div class="nav-actions">
          <button class="lang-toggle" @click="${this.toggleLocale}" aria-label="Switch language">
            ${this.locale === "zh-CN" ? "EN" : "中文"}
          </button>
          <a href="#get-started" class="cta-button">${f("navbar.cta")}</a>
          <button class="menu-toggle" @click="${this.toggleMenu}" aria-label="Menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              ${this.menuOpen
                ? html`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`
                : html`<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>`
              }
            </svg>
          </button>
        </div>
      </nav>

      <div class="mobile-menu ${this.menuOpen ? "open" : ""}">
        ${links.map(l => html`<a href="${l.href}" class="mobile-link" @click="${this.closeMenu}">${l.label}</a>`)}
        <a href="#get-started" class="mobile-link" @click="${this.closeMenu}">${f("navbar.cta")}</a>
      </div>
    `;
  }
}
