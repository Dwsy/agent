import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

const COL_KEYS = ["models", "skills", "agents", "security"] as const;

const ICONS: Record<string, string> = {
  models: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="10" stroke="#60A5FA" stroke-width="1.5"/><circle cx="14" cy="14" r="4" fill="#2563EB"/><line x1="14" y1="4" x2="14" y2="10" stroke="#60A5FA" stroke-width="1.5"/><line x1="14" y1="18" x2="14" y2="24" stroke="#60A5FA" stroke-width="1.5"/></svg>`,
  skills: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="4" y="4" width="20" height="20" rx="4" stroke="#A78BFA" stroke-width="1.5"/><rect x="9" y="9" width="10" height="10" rx="2" fill="#7C3AED"/></svg>`,
  agents: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><polygon points="14,3 25,10 25,20 14,27 3,20 3,10" stroke="#34D399" stroke-width="1.5" fill="none"/><circle cx="14" cy="15" r="3.5" fill="#059669"/></svg>`,
  security: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 3L4 8v6c0 6.5 4.3 11.5 10 13 5.7-1.5 10-6.5 10-13V8L14 3z" stroke="#F59E0B" stroke-width="1.5" fill="none"/><rect x="11" y="12" width="6" height="5" rx="1" fill="#D97706"/></svg>`,
};

@customElement("tech-specs")
export class TechSpecs extends LitElement {
  static styles = css`
    :host { display: block; }
    .section { padding: 6rem 1.5rem; background: #0A0F1E; }
    .header { text-align: center; margin-bottom: 4rem; }
    .label { font-size: 0.8rem; font-weight: 600; color: #A78BFA; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; font-family: "Space Grotesk", sans-serif; }
    .title { font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; color: #F1F5F9; margin-bottom: 1rem; font-family: "Space Grotesk", sans-serif; letter-spacing: -0.01em; }
    .subtitle { font-size: 1.05rem; color: #94A3B8; max-width: 36rem; margin: 0 auto; font-family: "DM Sans", sans-serif; }
    .grid { max-width: 64rem; margin: 0 auto; display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
    .col { background: #1E293B; border: 1px solid rgba(51,65,85,0.4); border-radius: 12px; padding: 2rem; opacity: 0; transform: translateY(24px); transition: opacity 0.5s ease, transform 0.5s ease; }
    .col.visible { opacity: 1; transform: translateY(0); }
    .col-icon { margin-bottom: 1rem; line-height: 0; }
    .col-title { font-size: 1.15rem; font-weight: 600; color: #F1F5F9; margin-bottom: 1rem; font-family: "Space Grotesk", sans-serif; }
    .col-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
    .col-list li { font-size: 0.88rem; color: #94A3B8; line-height: 1.5; font-family: "DM Sans", sans-serif; padding-left: 1rem; position: relative; }
    .col-list li::before { content: ""; position: absolute; left: 0; top: 0.55em; width: 5px; height: 5px; border-radius: 50%; background: #2563EB; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();
  private observer?: IntersectionObserver;

  connectedCallback() {
    super.connectedCallback();
    this.id = "tech-specs";
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  disconnectedCallback() { super.disconnectedCallback(); this.observer?.disconnect(); }

  protected firstUpdated() {
    this.observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          const el = e.target as HTMLElement;
          setTimeout(() => el.classList.add("visible"), parseInt(el.dataset.delay || "0", 10));
          this.observer!.unobserve(el);
        }
      }),
      { threshold: 0.1, rootMargin: "0px 0px -30px 0px" },
    );
    this.renderRoot.querySelectorAll(".col").forEach((el, i) => {
      (el as HTMLElement).dataset.delay = String(i * 100);
      this.observer!.observe(el);
    });
  }

  private getItems(key: string): string[] {
    const base = `techSpecs.columns.${key}.items`;
    const items: string[] = [];
    for (let i = 0; i < 4; i++) {
      const v = i18n.t(`${base}.${i}`);
      if (v !== `${base}.${i}`) items.push(v);
    }
    return items;
  }

  render() {
    const f = i18n.t.bind(i18n);
    return html`
      <section class="section">
        <div class="header">
          <p class="label">${f("techSpecs.label")}</p>
          <h2 class="title">${f("techSpecs.title")}</h2>
          <p class="subtitle">${f("techSpecs.subtitle")}</p>
        </div>
        <div class="grid">
          ${COL_KEYS.map(key => html`
            <div class="col">
              <div class="col-icon">${unsafeHTML(ICONS[key])}</div>
              <h3 class="col-title">${f(`techSpecs.columns.${key}.title`)}</h3>
              <ul class="col-list">
                ${this.getItems(key).map(item => html`<li>${item}</li>`)}
              </ul>
            </div>
          `)}
        </div>
      </section>
    `;
  }
}
