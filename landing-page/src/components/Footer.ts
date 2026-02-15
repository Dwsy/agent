import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

const REPO = "https://github.com/Dwsy/agent";

const PRODUCT_LINKS = [
  { key: "features", href: "#features" },
  { key: "gateway", href: "#gateway" },
  { key: "workflow", href: "#workflow" },
  { key: "extensions", href: "#extensions" },
];
const RESOURCE_LINKS = [
  { key: "docs", href: REPO },
  { key: "skills", href: REPO },
  { key: "changelog", href: REPO },
];
const COMMUNITY_LINKS = [
  { key: "github", href: REPO },
  { key: "issues", href: `${REPO}/issues` },
];

@customElement("pi-footer")
export class Footer extends LitElement {
  static styles = css`
    :host { display: block; }
    .footer { background: #0A0F1E; border-top: 1px solid rgba(51,65,85,0.4); padding: 4rem 1.5rem 2rem; font-family: "DM Sans", sans-serif; }
    .inner { max-width: 64rem; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 3rem; margin-bottom: 3rem; }
    .brand-desc { font-size: 0.88rem; color: #718096; line-height: 1.6; max-width: 18rem; }
    .logo { font-size: 1.2rem; font-weight: 700; color: #F1F5F9; font-family: "Space Grotesk", sans-serif; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
    .logo-dot { width: 8px; height: 8px; border-radius: 50%; background: #2563EB; }
    .col-title { font-size: 0.8rem; font-weight: 600; color: #F1F5F9; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 1rem; font-family: "Space Grotesk", sans-serif; }
    .links { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
    .links a { font-size: 0.88rem; color: #94A3B8; text-decoration: none; transition: color 0.2s; }
    .links a:hover { color: #F1F5F9; }
    .bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 2rem; border-top: 1px solid rgba(51,65,85,0.3); }
    .copyright { font-size: 0.8rem; color: #718096; }
    .social a { color: #718096; transition: color 0.2s; }
    .social a:hover { color: #F1F5F9; }
    .social svg { width: 20px; height: 20px; }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; gap: 2rem; }
      .bottom { flex-direction: column; gap: 1rem; text-align: center; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  private renderLinks(links: { key: string; href: string }[]) {
    const f = i18n.t.bind(i18n);
    const isExternal = (h: string) => h.startsWith("http");
    return links.map(l => html`
      <li><a href=${l.href} ?target=${isExternal(l.href) ? "_blank" : undefined} ?rel=${isExternal(l.href) ? "noopener" : undefined}>${f(`footer.items.${l.key}`)}</a></li>
    `);
  }

  render() {
    const f = i18n.t.bind(i18n);
    return html`
      <footer class="footer">
        <div class="inner">
          <div class="grid">
            <div>
              <div class="logo"><span class="logo-dot"></span> Pi Agent</div>
              <p class="brand-desc">${f("footer.description")}</p>
            </div>
            <div>
              <h4 class="col-title">${f("footer.links.product")}</h4>
              <ul class="links">${this.renderLinks(PRODUCT_LINKS)}</ul>
            </div>
            <div>
              <h4 class="col-title">${f("footer.links.resources")}</h4>
              <ul class="links">${this.renderLinks(RESOURCE_LINKS)}</ul>
            </div>
            <div>
              <h4 class="col-title">${f("footer.links.community")}</h4>
              <ul class="links">${this.renderLinks(COMMUNITY_LINKS)}</ul>
            </div>
          </div>
          <div class="bottom">
            <span class="copyright">${f("footer.copyright")}</span>
            <div class="social">
              <a href=${REPO} target="_blank" rel="noopener" aria-label="GitHub">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    `;
  }
}
