import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("cta-section")
export class CTASection extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
    .section { padding: 7rem 1.5rem; background: #09090b; border-top: 1px solid #27272a; }
    .inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr auto; gap: 3rem; align-items: center; }
    .title { margin: 0 0 0.6rem; color: #fafafa; font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1; letter-spacing: -0.035em; font-weight: 620; }
    .subtitle { margin: 0; color: #71717a; font-size: 1rem; line-height: 1.7; max-width: 58ch; }
    .cta { display: inline-flex; align-items: center; min-height: 2.9rem; padding: 0 1.1rem; background: #047857; color: #fff; font-size: 0.88rem; font-weight: 650; text-decoration: none; border: 1px solid #047857; }
    .cta:hover { background: #065f46; border-color: #065f46; }
    .cta:focus-visible { outline: 2px solid #10b981; outline-offset: 4px; }
    @media (prefers-color-scheme: light) { .section { background: #fff; border-color: #e4e4e7; } .title { color: #18181b; } .subtitle { color: #52525b; } }
    @media (max-width: 700px) { .inner { grid-template-columns: 1fr; gap: 1.5rem; } }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private unsub?: () => void;
  connectedCallback() { super.connectedCallback(); this.unsub = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); }); }
  disconnectedCallback() { super.disconnectedCallback(); this.unsub?.(); }
  render() { const f = i18n.t.bind(i18n); return html`<section class="section"><div class="inner"><div><h2 class="title">${f('cta.title')}</h2><p class="subtitle">${f('cta.subtitle')}</p></div><a href="https://github.com/Dwsy/agent" class="cta" target="_blank" rel="noopener">${f('cta.button')}</a></div></section>`; }
}
