import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

const LAYER_KEYS = ["channels", "pipeline", "plugins", "runtime", "security"] as const;

const LAYER_COLORS: Record<string, { from: string; to: string }> = {
  channels: { from: "#2563EB", to: "#60A5FA" },
  pipeline: { from: "#8B5CF6", to: "#A78BFA" },
  plugins:  { from: "#22D3EE", to: "#67E8F9" },
  runtime:  { from: "#10B981", to: "#34D399" },
  security: { from: "#F97316", to: "#FB923C" },
};

const STAT_KEYS = ["modules", "hooks", "apis", "security"] as const;

@customElement("gateway-section")
export class GatewaySection extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }

    .section {
      padding: 7rem 1.5rem;
      background: #0F172A;
      position: relative;
    }

    .inner { max-width: 72rem; margin: 0 auto; position: relative; z-index: 1; }

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
      max-width: 42rem;
      margin: 0 auto;
      line-height: 1.7;
      font-family: "DM Sans", sans-serif;
    }

    /* ── two-column layout ── */
    .columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
      align-items: start;
    }

    /* ── LEFT: layer diagram ── */
    .layers {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      /* scroll reveal */
      opacity: 0;
      transform: translateX(-24px);
    }

    .layers.revealed {
      opacity: 1;
      transform: translateX(0);
      transition: opacity 0.6s ease, transform 0.6s ease;
    }

    .layer {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(51, 65, 85, 0.4);
      position: relative;
      overflow: hidden;
      /* stagger */
      opacity: 0;
      transform: translateY(12px);
    }

    .layer.revealed {
      opacity: 1;
      transform: translateY(0);
      transition: opacity 0.4s ease, transform 0.4s ease;
    }

    /* colored left bar */
    .layer-bar {
      width: 4px;
      height: 100%;
      border-radius: 2px;
      position: absolute;
      left: 0;
      top: 0;
    }

    .layer-num {
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
      flex-shrink: 0;
      color: #fff;
    }

    .layer-text { flex: 1; min-width: 0; }

    .layer-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
      margin: 0 0 0.2rem;
    }

    .layer-desc {
      font-size: 0.8rem;
      color: #94A3B8;
      font-family: "DM Sans", sans-serif;
      margin: 0;
      line-height: 1.5;
    }

    /* connector line between layers */
    .connector {
      width: 2px;
      height: 0.75rem;
      background: rgba(51, 65, 85, 0.6);
      margin: -0.375rem 0 -0.375rem 2.1rem;
      border-radius: 1px;
    }

    /* ── RIGHT: stats + highlights ── */
    .right-col {
      opacity: 0;
      transform: translateX(24px);
    }

    .right-col.revealed {
      opacity: 1;
      transform: translateX(0);
      transition: opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 0.75rem;
      padding: 1.25rem;
      text-align: center;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
      background: linear-gradient(135deg, #60A5FA, #A78BFA);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0;
    }

    .stat-label {
      font-size: 0.8rem;
      color: #94A3B8;
      font-family: "DM Sans", sans-serif;
      margin: 0.25rem 0 0;
    }

    /* highlights */
    .highlights-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0 0 1rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .highlights {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .highlights li {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.5rem 0;
      color: #CBD5E1;
      font-size: 0.85rem;
      font-family: "DM Sans", sans-serif;
      line-height: 1.55;
      border-bottom: 1px solid rgba(51, 65, 85, 0.25);
    }

    .highlights li:last-child { border-bottom: none; }

    .check-icon {
      width: 1.125rem;
      height: 1.125rem;
      flex-shrink: 0;
      margin-top: 2px;
      color: #10B981;
    }

    /* ── responsive ── */
    @media (max-width: 768px) {
      .section { padding: 4rem 1rem; }
      .columns {
        grid-template-columns: 1fr;
        gap: 2.5rem;
      }
      .connector { margin-left: 2.1rem; }
    }

    @media (prefers-reduced-motion: reduce) {
      .layers, .right-col, .layer {
        opacity: 1;
        transform: none;
        transition: none;
      }
      .layers.revealed, .right-col.revealed, .layer.revealed {
        transition: none;
      }
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
    const targets = this.shadowRoot?.querySelectorAll(".layers, .right-col, .layer");
    if (!targets?.length) return;

    this._io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            const delay = Number(el.dataset.delay ?? 0);
            setTimeout(() => el.classList.add("revealed"), delay);
            this._io!.unobserve(el);
          }
        });
      },
      { threshold: 0.1 }
    );

    targets.forEach((t) => this._io!.observe(t));
  }

  private t(key: string) { return i18n.t(key); }

  private _renderLayers() {
    const items: unknown[] = [];
    LAYER_KEYS.forEach((key, idx) => {
      if (idx > 0) {
        items.push(html`<div class="connector"></div>`);
      }
      const c = LAYER_COLORS[key];
      items.push(html`
        <div class="layer" data-delay="${idx * 100}">
          <div class="layer-bar" style="background: linear-gradient(180deg, ${c.from}, ${c.to})"></div>
          <div class="layer-num" style="background: ${c.from}">${idx + 1}</div>
          <div class="layer-text">
            <p class="layer-title">${this.t(`gateway.layers.${key}.title`)}</p>
            <p class="layer-desc">${this.t(`gateway.layers.${key}.desc`)}</p>
          </div>
        </div>
      `);
    });
    return items;
  }

  private _checkSvg() {
    return html`<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`;
  }

  render() {
    void this.locale;
    return html`
      <section class="section" id="gateway">
        <div class="inner">
          <div class="header">
            <p class="label">${this.t("gateway.label")}</p>
            <h2 class="title">${this.t("gateway.title")}</h2>
            <p class="subtitle">${this.t("gateway.subtitle")}</p>
          </div>

          <div class="columns">
            <!-- LEFT: Architecture layers -->
            <div class="layers">
              ${this._renderLayers()}
            </div>

            <!-- RIGHT: Stats + Highlights -->
            <div class="right-col">
              <div class="stats-grid">
                ${STAT_KEYS.map((k) => html`
                  <div class="stat-card">
                    <p class="stat-value">${this.t(`gateway.stats.${k}.value`)}</p>
                    <p class="stat-label">${this.t(`gateway.stats.${k}.label`)}</p>
                  </div>
                `)}
              </div>

              <p class="highlights-title">Highlights</p>
              <ul class="highlights">
                ${Array.from({ length: 6 }, (_, i) => html`
                  <li>${this._checkSvg()} ${this.t(`gateway.highlights.${i}`)}</li>
                `)}
              </ul>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}
