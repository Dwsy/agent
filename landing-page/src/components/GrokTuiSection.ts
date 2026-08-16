import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("grok-tui-section")
export class GrokTuiSection extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }

    .section {
      padding: 3rem 1.5rem 7rem;
      background: #09090b;
    }

    .inner {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: 4rem;
      align-items: center;
      padding: 2.5rem 0;
      border-top: 1px solid #27272a;
      border-bottom: 1px solid #27272a;
    }

    .copy { max-width: 620px; }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.625rem;
      color: #f97316;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 1.25rem;
    }

    .label::before {
      content: '';
      width: 28px;
      height: 1px;
      background: #f97316;
    }

    h2 {
      margin: 0 0 1.25rem;
      color: #fafafa;
      font-size: clamp(2rem, 4vw, 3.25rem);
      line-height: 1.05;
      letter-spacing: -0.03em;
      font-weight: 600;
    }

    .description {
      margin: 0 0 1.75rem;
      color: #a1a1aa;
      font-size: 1.0625rem;
      line-height: 1.75;
      max-width: 58ch;
    }

    .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }

    .action {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.75rem;
      padding: 0 1rem;
      border-radius: 0.625rem;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 600;
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
    }

    .action:hover { transform: translateY(-1px); }
    .action:focus-visible { outline: 2px solid #f97316; outline-offset: 3px; }

    .primary { background: #f97316; color: #09090b; }
    .primary:hover { background: #fb923c; }

    .secondary {
      color: #d4d4d8;
      border: 1px solid #3f3f46;
      background: #18181b;
    }
    .secondary:hover { border-color: #71717a; }

    .bridge {
      min-width: 0;
      padding: 1.5rem;
      background: #111113;
      border: 1px solid #27272a;
      border-radius: 1rem;
    }

    .bridge-title {
      color: #71717a;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 1rem;
    }

    .flow {
      display: grid;
      grid-template-columns: 1fr auto 1fr auto 1.15fr auto 1fr;
      align-items: center;
      gap: 0.5rem;
    }

    .node {
      min-width: 0;
      min-height: 5.5rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.35rem;
      padding: 0.875rem;
      border: 1px solid #2f2f33;
      border-radius: 0.75rem;
      background: #18181b;
    }

    .node strong { color: #fafafa; font-size: 0.875rem; }
    .node span { color: #71717a; font-size: 0.7rem; line-height: 1.4; }
    .node.pi { border-color: rgba(16, 185, 129, 0.35); }
    .node.pager { border-color: rgba(249, 115, 22, 0.35); }
    .arrow { color: #52525b; font-size: 1rem; }

    .install {
      margin-top: 1rem;
      padding: 0.875rem 1rem;
      border-radius: 0.625rem;
      background: #09090b;
      border: 1px solid #27272a;
      color: #a1a1aa;
      font: 0.75rem/1.5 'JetBrains Mono', monospace;
      overflow-x: auto;
      white-space: nowrap;
    }

    .install b { color: #10b981; font-weight: 500; }

    @media (max-width: 900px) {
      .inner { grid-template-columns: 1fr; gap: 2rem; }
    }

    @media (max-width: 640px) {
      .section { padding: 2rem 1rem 5rem; }
      .flow { grid-template-columns: 1fr; }
      .arrow { transform: rotate(90deg); justify-self: center; }
      .node { min-height: auto; }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private unsubscribe?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.unsubscribe = i18n.subscribe(() => {
      this.locale = i18n.getCurrentLocale();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  render() {
    const isZh = this.locale === "zh-CN";

    return html`
      <section class="section" id="grok-tui">
        <div class="inner">
          <div class="copy">
            <div class="label">${isZh ? "推荐配套 · GROK-PI-TUI" : "Recommended companion · GROK-PI-TUI"}</div>
            <h2>${isZh ? "Pi 的运行时，Grok Build 的原生终端体验" : "Pi runtime. Grok Build native terminal experience."}</h2>
            <p class="description">
              ${isZh
                ? "grok-pi-tui 通过 Remote TUI bridge 把 Pi 接入 Grok Build 原生 Pager。Pi 继续拥有模型、Provider、工具、扩展、Skill、Session 与 Agent 执行；Pager 专注输入、Markdown、Tool Card、Diff、Dialog 和 Scrollback。两者配套使用，既保留 Pi 的可编程能力，也获得更完整的原生终端交互。"
                : "grok-pi-tui connects Pi to Grok Build's native Pager through a Remote TUI bridge. Pi keeps ownership of models, providers, tools, extensions, skills, sessions, and agent execution; Pager owns input, Markdown, tool cards, diffs, dialogs, and scrollback. Use them together for Pi's programmable runtime with a richer native terminal experience."}
            </p>
            <div class="actions">
              <a class="action primary" href="https://github.com/Dwsy/grok-pi-tui" target="_blank" rel="noopener">
                ${isZh ? "查看 grok-pi-tui" : "Explore grok-pi-tui"}
              </a>
              <a class="action secondary" href="https://dwsy.github.io/grok-pi-tui/" target="_blank" rel="noopener">
                ${isZh ? "项目主页" : "Project site"}
              </a>
            </div>
          </div>

          <div class="bridge" aria-label="grok-pi-tui architecture">
            <div class="bridge-title">Remote TUI bridge</div>
            <div class="flow">
              <div class="node pager"><strong>Grok Pager</strong><span>${isZh ? "唯一终端 UI" : "native terminal UI"}</span></div>
              <span class="arrow">↔</span>
              <div class="node"><strong>ACP</strong><span>${isZh ? "交互协议" : "interaction protocol"}</span></div>
              <span class="arrow">↔</span>
              <div class="node"><strong>pi-grok-adapter</strong><span>JSONL RPC ↔ ACP</span></div>
              <span class="arrow">↔</span>
              <div class="node pi"><strong>Pi Core</strong><span>${isZh ? "模型 · 工具 · 扩展 · Session" : "models · tools · extensions · sessions"}</span></div>
            </div>
            <div class="install"><b>$</b> curl -fsSL https://github.com/Dwsy/grok-pi/releases/latest/download/install.sh | sh</div>
          </div>
        </div>
      </section>
    `;
  }
}
