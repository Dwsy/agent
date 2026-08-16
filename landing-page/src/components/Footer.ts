import { html, LitElement, css } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Footer - Minimal, Clean
 */
@customElement("pi-footer")
export class Footer extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .footer {
      padding: 3rem 1.5rem;
      background: #09090b;
      border-top: 1px solid #27272a;
    }

    .inner {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }

    .logo {
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 0.375rem;
      background: #10b981;
      display: grid;
      place-items: center;
      font-size: 0.875rem;
      font-weight: 700;
      color: #09090b;
    }

    .brand-text {
      font-size: 0.9375rem;
      font-weight: 600;
      color: #fafafa;
    }

    .tagline {
      font-size: 0.8125rem;
      color: #52525b;
      margin-top: 0.25rem;
    }

    .links {
      display: flex;
      gap: 2rem;
    }

    .link {
      font-size: 0.8125rem;
      color: #71717a;
      text-decoration: none;
      transition: color 0.2s;
    }

    .link:hover {
      color: #fafafa;
    }

    @media (prefers-color-scheme: light) {
      .footer { background: #f8fafc; border-top-color: #e4e4e7; }
      .brand-text { color: #18181b; }
      .tagline, .link { color: #71717a; }
      .link:hover { color: #18181b; }
    }

    @media (max-width: 640px) {
      .inner {
        flex-direction: column;
        gap: 1.5rem;
        text-align: center;
      }

      .links {
        gap: 1.5rem;
      }
    }
  `;

  render() {
    return html`
      <footer class="footer">
        <div class="inner">
          <div class="brand">
            <div class="logo">π</div>
            <div>
              <div class="brand-text">Pi Agent</div>
              <div class="tagline">Engineering-grade AI orchestration.</div>
            </div>
          </div>
          <div class="links">
            <a href="https://github.com/Dwsy/agent" class="link" target="_blank" rel="noopener">GitHub</a>
            <a href="#" class="link">Documentation</a>
            <a href="#" class="link">Discord</a>
          </div>
        </div>
      </footer>
    `;
  }
}
