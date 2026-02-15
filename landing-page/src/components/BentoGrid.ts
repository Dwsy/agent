import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

interface CardDef {
  key: string;
  icon: string;
  colorClass: string;
  accentColor: string;
  span2: boolean;
  hasFeatures: boolean;
  featureCount: number;
}

const CARDS: CardDef[] = [
  { key: "workflow",   icon: "workflow",   colorClass: "accent-blue",   accentColor: "#2563EB", span2: true,  hasFeatures: true,  featureCount: 4 },
  { key: "skills",     icon: "skills",     colorClass: "accent-purple", accentColor: "#8B5CF6", span2: false, hasFeatures: false, featureCount: 0 },
  { key: "subagents",  icon: "subagents",  colorClass: "accent-green",  accentColor: "#10B981", span2: false, hasFeatures: false, featureCount: 0 },
  { key: "search",     icon: "search",     colorClass: "accent-cyan",   accentColor: "#22D3EE", span2: false, hasFeatures: false, featureCount: 0 },
  { key: "gateway",    icon: "gateway",    colorClass: "accent-orange", accentColor: "#F97316", span2: false, hasFeatures: false, featureCount: 0 },
  { key: "enterprise", icon: "enterprise", colorClass: "accent-pink",   accentColor: "#EC4899", span2: true,  hasFeatures: true,  featureCount: 4 },
];

@customElement("bento-grid")
export class BentoGrid extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }

    .section {
      padding: 7rem 1.5rem;
      background: #0A0F1E;
      position: relative;
    }

    /* subtle grid texture */
    .section::after {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(51,65,85,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(51,65,85,0.06) 1px, transparent 1px);
      background-size: 48px 48px;
      pointer-events: none;
    }

    .inner { position: relative; z-index: 1; max-width: 72rem; margin: 0 auto; }

    /* ── header ── */
    .header { text-align: center; margin-bottom: 4rem; }

    .label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin: 0 0 1rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
    }

    .subtitle {
      font-size: 1.05rem;
      color: #94A3B8;
      max-width: 38rem;
      margin: 0 auto;
      line-height: 1.7;
      font-family: "DM Sans", sans-serif;
    }

    /* ── grid ── */
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
    }

    /* ── card ── */
    .card {
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 1rem;
      padding: 1.75rem;
      position: relative;
      overflow: hidden;
      transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
      /* scroll reveal initial state */
      opacity: 0;
      transform: translateY(24px);
    }

    .card.revealed {
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.5s ease, transform 0.5s ease, box-shadow 0.3s ease, border-color 0.3s ease;
    }

    /* accent border-top */
    .card::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      border-radius: 1rem 1rem 0 0;
    }

    .accent-blue::before   { background: linear-gradient(90deg, #2563EB, #60A5FA); }
    .accent-purple::before { background: linear-gradient(90deg, #8B5CF6, #A78BFA); }
    .accent-green::before  { background: linear-gradient(90deg, #10B981, #34D399); }
    .accent-cyan::before   { background: linear-gradient(90deg, #22D3EE, #67E8F9); }
    .accent-orange::before { background: linear-gradient(90deg, #F97316, #FB923C); }
    .accent-pink::before   { background: linear-gradient(90deg, #EC4899, #F472B6); }

    /* hover glow */
    .card:hover {
      transform: translateY(-2px);
      border-color: rgba(96, 165, 250, 0.35);
    }
    .card.revealed:hover { transform: translateY(-2px); }

    .accent-blue:hover   { box-shadow: 0 4px 30px rgba(37, 99, 235, 0.12); }
    .accent-purple:hover { box-shadow: 0 4px 30px rgba(139, 92, 246, 0.12); }
    .accent-green:hover  { box-shadow: 0 4px 30px rgba(16, 185, 129, 0.12); }
    .accent-cyan:hover   { box-shadow: 0 4px 30px rgba(34, 211, 238, 0.12); }
    .accent-orange:hover { box-shadow: 0 4px 30px rgba(249, 115, 22, 0.12); }
    .accent-pink:hover   { box-shadow: 0 4px 30px rgba(236, 72, 153, 0.12); }

    .span2 { grid-column: span 2; }

    /* ── card internals ── */
    .card-head {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      margin-bottom: 0.875rem;
    }

    .icon-box {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 0.625rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .icon-box.blue   { background: rgba(37, 99, 235, 0.15); color: #60A5FA; }
    .icon-box.purple { background: rgba(139, 92, 246, 0.15); color: #A78BFA; }
    .icon-box.green  { background: rgba(16, 185, 129, 0.15); color: #34D399; }
    .icon-box.cyan   { background: rgba(34, 211, 238, 0.15); color: #67E8F9; }
    .icon-box.orange { background: rgba(249, 115, 22, 0.15); color: #FB923C; }
    .icon-box.pink   { background: rgba(236, 72, 153, 0.15); color: #F472B6; }

    .card-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
      margin: 0;
    }

    .card-desc {
      color: #94A3B8;
      line-height: 1.7;
      font-size: 0.9rem;
      margin: 0;
      font-family: "DM Sans", sans-serif;
    }

    .features {
      list-style: none;
      padding: 0;
      margin: 1rem 0 0;
    }

    .features li {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      padding: 0.375rem 0;
      color: #94A3B8;
      font-size: 0.85rem;
      font-family: "DM Sans", sans-serif;
      line-height: 1.5;
    }

    .features li::before {
      content: "\u2192";
      color: #60A5FA;
      font-weight: 600;
      flex-shrink: 0;
      margin-top: 1px;
    }

    /* ── responsive ── */
    @media (max-width: 1024px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 640px) {
      .section { padding: 4rem 1rem; }
      .grid { grid-template-columns: 1fr; gap: 1rem; }
      .span2 { grid-column: span 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      .card { opacity: 1; transform: none; transition: none; }
      .card.revealed { transition: none; }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private _unsub?: () => void;
  private _io?: IntersectionObserver;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = i18n.subscribe(() => {
      this.locale = i18n.getCurrentLocale();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._io?.disconnect();
  }

  protected firstUpdated() {
    this._setupReveal();
  }

  private _setupReveal() {
    const cards = this.shadowRoot?.querySelectorAll(".card");
    if (!cards?.length) return;

    this._io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            const delay = Number(el.dataset.idx ?? 0) * 80;
            setTimeout(() => el.classList.add("revealed"), delay);
            this._io!.unobserve(el);
          }
        });
      },
      { threshold: 0.15 }
    );

    cards.forEach((c) => this._io!.observe(c));
  }

  private t(key: string) { return i18n.t(key); }

  /* ── SVG icons (simple geometric) ── */
  private _icon(type: string) {
    const s = 20;
    switch (type) {
      case "workflow":
        return html`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          <line x1="10" y1="6.5" x2="14" y2="6.5"/><line x1="6.5" y1="10" x2="6.5" y2="14"/>
        </svg>`;
      case "skills":
        return html`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>`;
      case "subagents":
        return html`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="3"/><circle cx="5" cy="17" r="2.5"/><circle cx="19" cy="17" r="2.5"/>
          <line x1="12" y1="11" x2="5" y2="14.5"/><line x1="12" y1="11" x2="19" y2="14.5"/>
        </svg>`;
      case "search":
        return html`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15" y2="15"/>
          <line x1="10" y1="7" x2="10" y2="13"/><line x1="7" y1="10" x2="13" y2="10"/>
        </svg>`;
      case "gateway":
        return html`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="6" rx="1.5"/><rect x="2" y="14" width="20" height="6" rx="1.5"/>
          <circle cx="6" cy="7" r="1" fill="currentColor"/><circle cx="6" cy="17" r="1" fill="currentColor"/>
        </svg>`;
      case "enterprise":
        return html`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>`;
      default:
        return html``;
    }
  }

  private _iconColor(key: string) {
    const map: Record<string, string> = {
      workflow: "blue", skills: "purple", subagents: "green",
      search: "cyan", gateway: "orange", enterprise: "pink",
    };
    return map[key] ?? "blue";
  }

  private _renderCard(card: CardDef, idx: number) {
    const base = `features.cards.${card.key}`;
    return html`
      <div
        class="card ${card.colorClass}${card.span2 ? " span2" : ""}"
        data-idx="${idx}"
      >
        <div class="card-head">
          <div class="icon-box ${this._iconColor(card.key)}">
            ${this._icon(card.icon)}
          </div>
          <h3 class="card-title">${this.t(`${base}.title`)}</h3>
        </div>
        <p class="card-desc">${this.t(`${base}.description`)}</p>
        ${card.hasFeatures
          ? html`<ul class="features">
              ${Array.from({ length: card.featureCount }, (_, i) =>
                html`<li>${this.t(`${base}.features.${i}`)}</li>`
              )}
            </ul>`
          : null}
      </div>
    `;
  }

  render() {
    void this.locale; // trigger reactivity
    return html`
      <section class="section" id="features">
        <div class="inner">
          <div class="header">
            <p class="label">${this.t("features.label")}</p>
            <h2 class="title">${this.t("features.title")}</h2>
            <p class="subtitle">${this.t("features.subtitle")}</p>
          </div>
          <div class="grid">
            ${CARDS.map((c, i) => this._renderCard(c, i))}
          </div>
        </div>
      </section>
    `;
  }
}
