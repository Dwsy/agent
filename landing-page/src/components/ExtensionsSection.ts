import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

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

    .ext-grid {
      max-width: 72rem;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
    }

    .ext-card {
      background: rgba(30, 41, 59, 0.35);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 1.75rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .ext-card:hover {
      border-color: rgba(167, 139, 250, 0.4);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
    }

    .ext-card-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.875rem;
    }

    .ext-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .icon-shell { background: rgba(34, 197, 94, 0.12); color: #4ADE80; }
    .icon-shield { background: rgba(239, 68, 68, 0.12); color: #F87171; }
    .icon-plan { background: rgba(59, 130, 246, 0.12); color: #60A5FA; }
    .icon-role { background: rgba(139, 92, 246, 0.12); color: #A78BFA; }
    .icon-game { background: rgba(249, 115, 22, 0.12); color: #FB923C; }
    .icon-cmd { background: rgba(6, 182, 212, 0.12); color: #22D3EE; }

    .ext-title {
      font-size: 1.05rem;
      font-weight: 600;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
    }

    .ext-description {
      color: #94A3B8;
      font-size: 0.875rem;
      line-height: 1.7;
      font-family: "DM Sans", sans-serif;
    }

    @media (prefers-reduced-motion: reduce) {
      .ext-card { transition: none; }
    }

    @media (max-width: 1024px) {
      .ext-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 768px) {
      .ext-section { padding: 3.5rem 1rem; }
      .ext-grid { grid-template-columns: 1fr; gap: 1rem; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  render() {
    const f = i18n.t.bind(i18n);
    const cards = [
      { key: "interactiveShell", iconClass: "icon-shell", icon: "⚡" },
      { key: "safetyGates",      iconClass: "icon-shield", icon: "🛡" },
      { key: "planMode",         iconClass: "icon-plan",   icon: "📋" },
      { key: "rolePersna",       iconClass: "icon-role",   icon: "🧠" },
      { key: "games",            iconClass: "icon-game",   icon: "🎮" },
      { key: "commands",         iconClass: "icon-cmd",    icon: "⌘" },
    ];

    return html`
      <section class="ext-section" id="extensions">
        <div class="section-header">
          <p class="section-label">${f("extensions.label")}</p>
          <h2 class="section-title">${f("extensions.title")}</h2>
          <p class="section-subtitle">${f("extensions.subtitle")}</p>
        </div>
        <div class="ext-grid">
          ${cards.map(c => html`
            <div class="ext-card">
              <div class="ext-card-header">
                <div class="ext-icon ${c.iconClass}">${c.icon}</div>
                <h3 class="ext-title">${f(`extensions.cards.${c.key}.title`)}</h3>
              </div>
              <p class="ext-description">${f(`extensions.cards.${c.key}.description`)}</p>
            </div>
          `)}
        </div>
      </section>
    `;
  }
}
