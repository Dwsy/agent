import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("pi-footer")
export class Footer extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .footer {
      background: #0A0F1E;
      border-top: 1px solid rgba(51, 65, 85, 0.5);
      padding: 4rem 1.5rem 2rem;
    }

    .footer-content {
      max-width: 7xl;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 3rem;
      margin-bottom: 3rem;
    }

    .footer-brand {
      max-width: 300px;
    }

    .footer-logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .logo-icon {
      width: 2rem;
      height: 2rem;
      background: linear-gradient(135deg, #2563EB 0%, #8B5CF6 100%);
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .footer-logo svg {
      color: white;
    }

    .footer-logo-text {
      font-size: 1.25rem;
      font-weight: 700;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
    }

    .footer-description {
      color: #94A3B8;
      line-height: 1.7;
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
      font-family: "DM Sans", sans-serif;
    }

    .footer-section h4 {
      color: #F1F5F9;
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .footer-links {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .footer-links li {
      margin-bottom: 0.75rem;
    }

    .footer-links a {
      color: #94A3B8;
      text-decoration: none;
      font-size: 0.9rem;
      transition: color 0.2s ease-out;
      font-family: "DM Sans", sans-serif;
    }

    .footer-links a:hover {
      color: #60A5FA;
    }

    .footer-bottom {
      max-width: 7xl;
      margin: 0 auto;
      padding-top: 2rem;
      border-top: 1px solid rgba(51, 65, 85, 0.3);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .footer-copyright {
      color: #64748B;
      font-size: 0.875rem;
      font-family: "DM Sans", sans-serif;
    }

    .footer-social {
      display: flex;
      gap: 1rem;
    }

    .social-link {
      color: #64748B;
      transition: color 0.2s ease-out;
    }

    .social-link:hover {
      color: #60A5FA;
    }

    @media (max-width: 1024px) {
      .footer-content {
        grid-template-columns: repeat(2, 1fr);
        gap: 2rem;
      }
    }

    @media (max-width: 640px) {
      .footer-content {
        grid-template-columns: 1fr;
      }

      .footer-bottom {
        flex-direction: column;
        text-align: center;
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
      <footer class="footer">
        <div class="footer-content">
          <div class="footer-brand">
            <div class="footer-logo">
              <div class="logo-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span class="footer-logo-text">Pi Agent</span>
            </div>
            <p class="footer-description">
              ${i18n.t("footer.description")}
            </p>
          </div>

          <div class="footer-section">
            <h4>${i18n.t("footer.links.product")}</h4>
            <ul class="footer-links">
              <li><a href="#features">${i18n.t("common.features")}</a></li>
              <li><a href="#tech-specs">${i18n.t("common.techSpecs")}</a></li>
              <li><a href="#get-started">${i18n.t("common.getStarted")}</a></li>
              <li><a href="#docs">${i18n.t("common.docs")}</a></li>
            </ul>
          </div>

          <div class="footer-section">
            <h4>${i18n.t("footer.links.resources")}</h4>
            <ul class="footer-links">
              <li><a href="#">API Reference</a></li>
              <li><a href="#">Skills Guide</a></li>
              <li><a href="#">Extensions</a></li>
              <li><a href="#">Examples</a></li>
            </ul>
          </div>

          <div class="footer-section">
            <h4>${i18n.t("footer.links.community")}</h4>
            <ul class="footer-links">
              <li><a href="#">GitHub</a></li>
              <li><a href="#">Discord</a></li>
              <li><a href="#">Twitter</a></li>
              <li><a href="#">Blog</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-bottom">
          <p class="footer-copyright">${i18n.t("footer.copyright")}</p>
          <div class="footer-social">
            <a href="#" class="social-link" aria-label="GitHub">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.2-5.1-5.4 0-1.2.4-2.2 1.1-3-.1-.3-.5-1.4.1-3 0 0 .9-.3 3 .1.9-.2 1.8-.4 2.7-.4.9 0 1.8.2 2.7.4 2.1-.4 3-.1 3-.1.6 1.6.2 2.7.1 3 .7.8 1.1 1.8 1.1 3 0 4.2-2.6 5.1-5.1 5.4.4.4.7 1.1.7 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 0z"/>
              </svg>
            </a>
            <a href="#" class="social-link" aria-label="Twitter">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a href="#" class="social-link" aria-label="Discord">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </a>
          </div>
        </div>
      </footer>
    `;
  }
}