import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

const TAG_COLORS: Record<string, string> = {
  "Multi-Agent": "#2563EB",
  "Delegation": "#8B5CF6",
  "Automation": "#F97316",
  "Memory": "#10B981",
  "Safety": "#EF4444",
  "DX": "#22D3EE",
  "Fun": "#F472B6",
  // zh-CN fallbacks
  "多代理": "#2563EB",
  "委派": "#8B5CF6",
  "自动化": "#F97316",
  "记忆": "#10B981",
  "安全": "#EF4444",
  "体验": "#22D3EE",
  "开发体验": "#22D3EE",
  "娱乐": "#F472B6",
  "趣味": "#F472B6",
};

const CARD_KEYS = [
  "subagentOrch",
  "interactiveShell",
  "loop",
  "rolePersona",
  "planMode",
  "safetyGates",
  "outputStyles",
  "games",
] as const;

@customElement("extensions-section")
export class ExtensionsSection extends LitElement {
  static styles = css`
    :host { display: block; }

    .ext-section {
      padding: 6rem 1.5rem;
      background: #0F172A;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #A78BFA;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
    }

    .section-subtitle {
      font-size: 1.05rem;
      color: #94A3B8;
      max-width: 36rem;
      margin: 0 auto;
      font-family: "DM Sans", sans-serif;
    }

    .grid {
      max-width: 72rem;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.25rem;
    }

    .card {
      background: rgba(30, 41, 59, 0.35);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 1.5rem;
      transition: border-color 0.25s, box-shadow 0.25s;
      position: relative;
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.45s ease-out, transform 0.45s ease-out,
                  border-color 0.25s, box-shadow 0.25s;
    }

    .card.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .card:hover {
      border-color: var(--glow-color, rgba(167, 139, 250, 0.45));
      box-shadow: 0 0 24px -4px var(--glow-color, rgba(167, 139, 250, 0.15));
    }

    /* Top gradient line */
    .card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--glow-color, rgba(167, 139, 250, 0.3));
      opacity: 0;
      transition: opacity 0.25s;
    }

    .card:hover::before { opacity: 1; }

    .tag {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.65rem;
      font-weight: 600;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: 0.03em;
      margin-bottom: 0.75rem;
      color: white;
    }

    .card-title {
      font-size: 1rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 0.5rem;
      font-family: "Space Grotesk", sans-serif;
      line-height: 1.3;
    }

    .card-desc {
      color: #94A3B8;
      font-size: 0.825rem;
      line-height: 1.65;
      font-family: "DM Sans", sans-serif;
    }

    @media (prefers-reduced-motion: reduce) {
      .card { opacity: 1; transform: none; transition: none; }
    }

    @media (max-width: 1024px) {
      .grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 640px) {
      .ext-section { padding: 3.5rem 1rem; }
      .grid { grid-template-columns: 1fr; gap: 1rem; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();
  private observer?: IntersectionObserver;

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.observer?.disconnect();
  }

  protected firstUpdated() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            const delay = parseInt(el.dataset.delay || "0", 10);
            setTimeout(() => el.classList.add("visible"), delay);
            this.observer!.unobserve(el);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -30px 0px" },
    );

    this.renderRoot.querySelectorAll(".card").forEach((el, i) => {
      (el as HTMLElement).dataset.delay = String(i * 80);
      this.observer!.observe(el);
    });
  }

  private tagColor(tag: string): string {
    return TAG_COLORS[tag] || "#64748B";
  }

  render() {
    const f = i18n.t.bind(i18n);

    return html`
      <section class="ext-section" id="extensions">
        <div class="section-header">
          <p class="section-label">${f("extensions.label")}</p>
          <h2 class="section-title">${f("extensions.title")}</h2>
          <p class="section-subtitle">${f("extensions.subtitle")}</p>
        </div>
        <div class="grid">
          ${CARD_KEYS.map(key => {
            const tag = f(`extensions.cards.${key}.tag`);
            const color = this.tagColor(tag);
            return html`
              <div class="card" style="--glow-color: ${color}40">
                <span class="tag" style="background: ${color}">${tag}</span>
                <h3 class="card-title">${f(`extensions.cards.${key}.title`)}</h3>
                <p class="card-desc">${f(`extensions.cards.${key}.description`)}</p>
              </div>
            `;
          })}
        </div>
      </section>
    `;
  }
}
