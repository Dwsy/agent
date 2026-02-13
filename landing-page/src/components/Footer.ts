import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("pi-footer")
export class Footer extends LitElement {
  static styles = css`
    :host { display: block; }

    .footer {
      background: #0A0F1E;
      border-top: 1px solid rgba(51, 65, 85, 0.4);
      padding: 3.5rem 1.5rem 1.5rem;
    }

    .footer-content {
      max-width: 72rem;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 2.5rem;
      margin-bottom: 2.5rem;
    }

    .footer-brand { max-width: 280px; }

    .footer-logo {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      margin-bottom: 0.875rem;
    }

    .logo-icon {
      width: 1.75rem;
      height: 1.75rem;
      background: linear-gradient(135deg, #2563EB 0%, #8B5CF6 100%);
      border-radius: 0.375rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .footer-logo-text {
      font-size: 1.125rem;
      font-weight: 700;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
    }

    .footer-description {
      color: #64748B;
      line-height: 1.7;
      font-size: 0.85rem;
      font-family: "DM Sans", sans-serif;
    }

    .footer-section h4 {
      color: #E2E8F0;
      font-size: 0.875rem;
      font-weight: 600;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .footer-links {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .footer-links li { margin-bottom: 0.5rem; }

    .footer-links a {
      color: #64748B;
      text-decoration: none;
      font-size: 0.85rem;
      transition: color 0.15s;
      font-family: "DM Sans", sans-serif;
    }

    .footer-links a:hover { color: #60A5FA; }

    .footer-bottom {
      max-width: 72rem;
      margin: 0 auto;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(51, 65, 85, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .footer-copyright {
      color: #475569;
      font-size: 0.8rem;
      font-family: "DM Sans", sans-serif;
    }

    .footer-social {
      display: flex;
      gap: 0.875rem;
    }

    .social-link {
      color: #475569;
      transition: color 0.15s;
    }

    .social-link:hover { color: #60A5FA; }

    @media (max-width: 1024px) {
      .footer-content { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 640px) {
      .footer-content { grid-template-columns: 1fr; }
      .footer-bottom { flex-direction: column; text-align: center; }
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
      <footer class="footer">
        <div class="footer-content">
          <div class="footer-brand">
            <div class="footer-logo">
              <div class="logo-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span class="footer-logo-text">Pi Agent</span>
            </div>
            <p class="footer-description">${f("footer.description")}</p>
          </div>

          <div class="footer-section">
            <h4>${f("footer.links.product")}</h4>
            <ul class="footer-links">
              <li><a href="#features">${f("common.features")}</a></li>
              <li><a href="#workflow">${f("common.workflow")}</a></li>
              <li><a href="#extensions">${f("common.extensions")}</a></li>
              <li><a href="#tech-specs">${f("common.techSpecs")}</a></li>
            </ul>
          </div>

          <div class="footer-section">
            <h4>${f("footer.links.resources")}</h4>
            <ul class="footer-links">
              <li><a href="#">API Reference</a></li>
              <li><a href="#">Skills Guide</a></li>
              <li><a href="#">Extensions</a></li>
              <li><a href="#">Examples</a></li>
            </ul>
          </div>

          <div class="footer-section">
            <h4>${f("footer.links.community")}</h4>
            <ul class="footer-links">
              <li><a href="#">GitHub</a></li>
              <li><a href="#">Discord</a></li>
              <li><a href="#">Twitter</a></li>
              <li><a href="#">Blog</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-bottom">
          <p class="footer-copyright">${f("footer.copyright")}</p>
          <div class="footer-social">
            <a href="#" class="social-link" aria-label="GitHub">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.4 0-1.2.4-2.2 1.1-3-.1-.3-.5-1.4.1-3 0 0 .9-.3 3 .1.9-.2 1.8-.4 2.7-.4.9 0 1.8.2 2.7.4 2.1-.4 3-.1 3-.1.6 1.6.2 2.7.1 3 .7.8 1.1 1.8 1.1 3 0 4.2-2.6 5.1-5.1 5.4.4.4.7 1.1.7 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 0z"/></svg>
            </a>
            <a href="#" class="social-link" aria-label="Twitter">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
          </div>
        </div>
      </footer>
    `;
  }
}
