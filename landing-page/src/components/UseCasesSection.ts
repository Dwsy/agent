import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

const CASES = ["scout", "crew", "gateway", "selfImprove"] as const;

@customElement("use-cases-section")
export class UseCasesSection extends LitElement {
  static styles = css`
    :host { display: block; }

    .uc-section {
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
      color: #22D3EE;
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

    .uc-grid {
      max-width: 72rem;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
    }

    .uc-card {
      background: rgba(30, 41, 59, 0.35);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 2rem;
      opacity: 0;
      transform: translateY(24px);
      transition: opacity 0.5s ease, transform 0.5s ease, border-color 0.2s, box-shadow 0.2s;
    }

    .uc-card.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .uc-card:hover {
      border-color: rgba(34, 211, 238, 0.35);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
      transform: translateY(-4px);
    }

    .uc-card.visible:hover {
      transform: translateY(-4px);
    }

    .uc-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      background: rgba(6, 182, 212, 0.15);
      color: #22D3EE;
      border-radius: 0.375rem;
      font-size: 0.8rem;
      font-weight: 700;
      font-family: "Space Grotesk", sans-serif;
      margin-bottom: 1rem;
    }

    .uc-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .uc-description {
      color: #94A3B8;
      font-size: 0.9rem;
      line-height: 1.7;
      margin-bottom: 1rem;
      font-family: "DM Sans", sans-serif;
    }

    .uc-cmd-wrap {
      display: flex; align-items: center; gap: 0.5rem;
      background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 0.375rem; padding: 0.5rem 0.75rem;
    }

    .uc-command {
      flex: 1; font-family: "JetBrains Mono", monospace; font-size: 0.8rem;
      color: #60A5FA; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .copy-btn {
      flex-shrink: 0; background: none; border: none; color: #475569;
      cursor: pointer; padding: 0.125rem; font-size: 0.85rem; line-height: 1; transition: color 0.15s;
    }
    .copy-btn:hover { color: #94A3B8; }
    .copy-btn.copied { color: #4ADE80; }

    .reveal-header {
      opacity: 0;
      transform: translateY(24px);
      transition: opacity 0.5s ease, transform 0.5s ease;
    }

    .reveal-header.visible {
      opacity: 1;
      transform: translateY(0);
    }

    @media (prefers-reduced-motion: reduce) {
      .uc-card, .reveal-header { opacity: 1; transform: none; transition: none; }
      .uc-card:hover { transform: none; }
    }

    @media (max-width: 768px) {
      .uc-section { padding: 3.5rem 1rem; }
      .uc-grid { grid-template-columns: 1fr; gap: 1rem; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();
  @state() private _headerVisible = false;
  @state() private _cardVisible: boolean[] = [false, false, false, false];
  @state() private _copiedIdx = -1;

  private _unsub?: () => void;
  private _observer?: IntersectionObserver;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
    this._observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const idx = el.dataset.idx;
          if (idx === "header") {
            this._headerVisible = true;
          } else if (idx !== undefined) {
            const arr = [...this._cardVisible];
            arr[Number(idx)] = true;
            this._cardVisible = arr;
          }
          this._observer?.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
  }

  protected updated() {
    const root = this.renderRoot;
    const header = root.querySelector<HTMLElement>("[data-idx='header']");
    if (header && !this._headerVisible) this._observer?.observe(header);
    root.querySelectorAll<HTMLElement>(".uc-card").forEach((el) => {
      const i = Number(el.dataset.idx);
      if (!this._cardVisible[i]) this._observer?.observe(el);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
    this._observer?.disconnect();
  }

  private _copy(text: string, idx: number) {
    navigator.clipboard.writeText(text).catch(() => {});
    this._copiedIdx = idx;
    setTimeout(() => { this._copiedIdx = -1; }, 1500);
  }

  render() {
    const f = i18n.t.bind(i18n);
    return html`
      <section class="uc-section" id="use-cases">
        <div class="section-header reveal-header ${this._headerVisible ? "visible" : ""}" data-idx="header">
          <p class="section-label">${f("useCases.label")}</p>
          <h2 class="section-title">${f("useCases.title")}</h2>
          <p class="section-subtitle">${f("useCases.subtitle")}</p>
        </div>
        <div class="uc-grid">
          ${CASES.map((c, i) => {
            const cmd = f(`useCases.cases.${c}.command`);
            return html`
              <div class="uc-card ${this._cardVisible[i] ? "visible" : ""}"
                   data-idx="${i}"
                   style="transition-delay: ${i * 0.1}s">
                <div class="uc-number">${String(i + 1).padStart(2, "0")}</div>
                <h3 class="uc-title">${f(`useCases.cases.${c}.title`)}</h3>
                <p class="uc-description">${f(`useCases.cases.${c}.description`)}</p>
                <div class="uc-cmd-wrap">
                  <code class="uc-command">${cmd}</code>
                  <button class="copy-btn ${this._copiedIdx === i ? "copied" : ""}"
                          @click=${() => this._copy(cmd, i)}
                          aria-label="Copy command">
                    ${this._copiedIdx === i ? "✓" : "⧉"}
                  </button>
                </div>
              </div>
            `;
          })}
        </div>
      </section>
    `;
  }
}
