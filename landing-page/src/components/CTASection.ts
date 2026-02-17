import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("cta-section")
export class CTASection extends LitElement {
  static styles = css`
    :host { display: block; }
    .cta { position: relative; padding: 6rem 1.5rem; text-align: center; background: linear-gradient(180deg, #0A0F1E 0%, #0F172A 50%, #0A0F1E 100%); overflow: hidden; }
    .glow { position: absolute; top: 50%; left: 50%; width: 600px; height: 600px; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(37,99,235,0.15) 0%, rgba(139,92,246,0.06) 40%, transparent 70%); border-radius: 50%; pointer-events: none; animation: float 8s ease-in-out infinite; }
    @keyframes float { 0%, 100% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -52%) scale(1.08); } }
    .content { position: relative; z-index: 1; max-width: 40rem; margin: 0 auto; }
    .title { font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; color: #F1F5F9; margin-bottom: 1.25rem; font-family: "Space Grotesk", sans-serif; letter-spacing: -0.01em; }
    .desc { font-size: 1.05rem; color: #94A3B8; line-height: 1.7; margin-bottom: 2.5rem; font-family: "DM Sans", sans-serif; }
    .buttons { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.85rem 2rem; border-radius: 8px; font-size: 0.95rem; font-weight: 600; font-family: "Space Grotesk", sans-serif; text-decoration: none; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; }
    .btn:hover { transform: translateY(-2px); }
    .btn-primary { background: #2563EB; color: #fff; border: none; box-shadow: 0 0 20px rgba(37,99,235,0.3); }
    .btn-primary:hover { box-shadow: 0 0 30px rgba(37,99,235,0.5); }
    .btn-secondary { background: transparent; color: #F1F5F9; border: 1px solid rgba(51,65,85,0.6); }
    .btn-secondary:hover { border-color: #94A3B8; }
    .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.6s ease, transform 0.6s ease; }
    .reveal.visible { opacity: 1; transform: translateY(0); }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();
  private observer?: IntersectionObserver;

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  disconnectedCallback() { super.disconnectedCallback(); this.observer?.disconnect(); }

  protected firstUpdated() {
    this.observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { (e.target as HTMLElement).classList.add("visible"); this.observer!.unobserve(e.target); }
      }),
      { threshold: 0.15 },
    );
    const el = this.renderRoot.querySelector(".reveal");
    if (el) this.observer.observe(el);
  }

  render() {
    const f = i18n.t.bind(i18n);
    return html`
      <section class="cta">
        <div class="glow"></div>
        <div class="content reveal">
          <h2 class="title">${f("cta.title")}</h2>
          <p class="desc">${f("cta.description")}</p>
          <div class="buttons">
            <a class="btn btn-primary" href="https://github.com/Dwsy/agent" target="_blank" rel="noopener">${f("cta.primary")}</a>
            <a class="btn btn-secondary" href="https://github.com/Dwsy/agent" target="_blank" rel="noopener">${f("cta.secondary")}</a>
          </div>
        </div>
      </section>
    `;
  }
}
