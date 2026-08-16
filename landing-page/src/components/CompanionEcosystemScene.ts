import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("companion-ecosystem-scene")
export class CompanionEcosystemScene extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #0c0c0e; border-top: 1px solid #18181b; border-bottom: 1px solid #18181b; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .head { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 4rem; align-items: end; margin-bottom: 4rem; }
    .kicker { color: #a1a1aa; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 0; color: #fafafa; font-size: clamp(2.25rem, 4.5vw, 3.75rem); line-height: 1.02; letter-spacing: -0.04em; font-weight: 600; }
    .head p { margin: 0; color: #71717a; line-height: 1.75; max-width: 58ch; }
    .products { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 1rem; }
    .product { min-height: 32rem; padding: 2rem; border: 1px solid #27272a; border-radius: 1.25rem; background: #111113; display: flex; flex-direction: column; overflow: hidden; }
    .product.grok { background: linear-gradient(145deg, rgba(249,115,22,0.08), transparent 42%), #111113; }
    .product.psm { background: linear-gradient(145deg, rgba(96,165,250,0.08), transparent 42%), #111113; }
    .product-label { font: 0.6875rem/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 2.5rem; }
    .grok .product-label { color: #fb923c; } .psm .product-label { color: #93c5fd; }
    .product h3 { margin: 0 0 0.9rem; color: #fafafa; font-size: 1.75rem; font-weight: 600; letter-spacing: -0.02em; }
    .product p { margin: 0 0 1.5rem; color: #a1a1aa; line-height: 1.7; font-size: 0.9375rem; }
    .diagram { margin-top: auto; padding-top: 2rem; border-top: 1px solid #27272a; }
    .bridge { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; align-items: stretch; }
    .bridge-node { min-height: 5rem; padding: 0.7rem; border: 1px solid #2f2f33; border-radius: 0.6rem; color: #d4d4d8; font-size: 0.7rem; line-height: 1.45; display: flex; flex-direction: column; justify-content: center; }
    .bridge-node span { color: #52525b; margin-top: 0.2rem; }
    .sources { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem; }
    .source { padding: 0.35rem 0.55rem; border: 1px solid #2f2f33; border-radius: 0.35rem; color: #71717a; font: 0.65rem/1 'JetBrains Mono', monospace; }
    .psm-flow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
    .psm-step { padding: 0.7rem; border-top: 1px solid #3f3f46; color: #71717a; font-size: 0.7rem; }
    .psm-step strong { display: block; color: #d4d4d8; margin-bottom: 0.25rem; }
    .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1.5rem; }
    a { color: #d4d4d8; text-decoration: none; padding: 0.65rem 0.85rem; border: 1px solid #3f3f46; border-radius: 0.5rem; font-size: 0.8rem; font-weight: 600; }
    a:hover { border-color: #71717a; color: #fafafa; }
    a:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 3px; }
    @media (max-width: 900px) { .head, .products { grid-template-columns: 1fr; } .product { min-height: auto; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .bridge, .psm-flow { grid-template-columns: 1fr 1fr; } }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private unsubscribe?: () => void;
  connectedCallback() { super.connectedCallback(); this.unsubscribe = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); }); }
  disconnectedCallback() { super.disconnectedCallback(); this.unsubscribe?.(); }

  render() {
    const zh = this.locale === "zh-CN";
    return html`
      <section class="scene" id="ecosystem">
        <div class="inner">
          <div class="head"><div><div class="kicker">${zh ? "COMPANION ECOSYSTEM" : "COMPANION ECOSYSTEM"}</div><h2>${zh ? "Pi 保持核心，体验和连续性向外扩展" : "Keep Pi at the core. Extend experience and continuity."}</h2></div><p>${zh ? "两款配套产品都不接管 Agent：grok-pi-tui 把 Pi 投射到 Grok Build 原生 Pager；Pi Session Manager 则管理 Agent 留下的 session 历史、结构和恢复入口。" : "Neither companion takes over the agent. grok-pi-tui projects Pi into Grok Build's native Pager; Pi Session Manager manages the session history, structure, and resume paths agents leave behind."}</p></div>
          <div class="products">
            <article class="product grok"><div class="product-label">grok-pi-tui · remote TUI bridge</div><h3>${zh ? "Pi Runtime × Grok Pager" : "Pi Runtime × Grok Pager"}</h3><p>${zh ? "Pi 继续拥有模型、Provider、工具、扩展、Skill、Session 与执行；Grok Pager 成为唯一终端 UI，负责输入、Markdown、Tool Card、Diff、Dialog 与 Scrollback。" : "Pi keeps models, providers, tools, extensions, skills, sessions, and execution; Grok Pager becomes the only terminal UI for input, Markdown, tool cards, diffs, dialogs, and scrollback."}</p><div class="diagram"><div class="bridge"><div class="bridge-node">Grok Pager<span>native TUI</span></div><div class="bridge-node">ACP<span>interaction</span></div><div class="bridge-node">pi-grok-adapter<span>JSONL RPC ↔ ACP</span></div><div class="bridge-node">Pi Core<span>agent runtime</span></div></div><div class="actions"><a href="https://github.com/Dwsy/grok-pi-tui" target="_blank" rel="noopener">GitHub ↗</a><a href="https://dwsy.github.io/grok-pi-tui/" target="_blank" rel="noopener">${zh ? "项目主页 ↗" : "Project site ↗"}</a></div></div></article>
            <article class="product psm"><div class="product-label">pi-session-manager · local-first workbench</div><h3>${zh ? "Session 不再是一次性聊天记录" : "Sessions stop being disposable chat logs"}</h3><p>${zh ? "跨 Agent 索引、搜索、树与 Kanban、Branch Atlas、Tool Trace、token/cost 统计，以及 resume / convert / export。管理 Agent 周围的工作，而不是替代 Agent。" : "Cross-agent indexing, search, trees and Kanban, Branch Atlas, tool traces, token/cost stats, plus resume / convert / export. It manages the work around the agent, not the agent itself."}</p><div class="diagram"><div class="sources">${["Pi","Claude Code","Codex","OpenCode","Gemini CLI","Cursor","Antigravity"].map(s => html`<span class="source">${s}</span>`)}</div><div class="psm-flow"><div class="psm-step"><strong>Index</strong>scan</div><div class="psm-step"><strong>Understand</strong>tree · trace</div><div class="psm-step"><strong>Organize</strong>search · kanban</div><div class="psm-step"><strong>Resume</strong>export · continue</div></div><div class="actions"><a href="https://github.com/Dwsy/pi-session-manager" target="_blank" rel="noopener">GitHub ↗</a><a href="https://dwsy.github.io/pi-session-manager/" target="_blank" rel="noopener">${zh ? "文档 / Demo ↗" : "Docs / demo ↗"}</a></div></div></article>
          </div>
        </div>
      </section>
    `;
  }
}
