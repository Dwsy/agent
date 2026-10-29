import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("companion-ecosystem-scene")
export class CompanionEcosystemScene extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #09090b; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .head { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 5rem; margin-bottom: 4rem; align-items: end; }
    h2 { margin: 0; color: #fafafa; font-size: clamp(2.4rem, 5vw, 4.5rem); line-height: 0.98; letter-spacing: -0.045em; font-weight: 620; max-width: 10ch; }
    .head p { margin: 0; color: #a1a1aa; font-size: 1rem; line-height: 1.75; max-width: 56ch; }
    .products { border-top: 1px solid #3f3f46; }
    .product { display: grid; grid-template-columns: 12rem 1fr auto; gap: 2.5rem; align-items: start; padding: 2rem 0; border-bottom: 1px solid #27272a; }
    .name { color: #e4e4e7; font-size: 0.9rem; font-weight: 650; }
    .body h3 { margin: 0 0 0.6rem; color: #f4f4f5; font-size: 1.25rem; font-weight: 620; }
    .body p { margin: 0 0 0.8rem; color: #71717a; font-size: 0.9rem; line-height: 1.7; max-width: 68ch; }
    .scope { color: #52525b; font-size: 0.76rem; line-height: 1.55; }
    a { color: #34d399; text-decoration: none; font-size: 0.82rem; font-weight: 600; border-bottom: 1px solid rgba(52,211,153,0.4); padding-bottom: 0.1rem; white-space: nowrap; }
    a:hover { color: #6ee7b7; border-color: #6ee7b7; }
    a:focus-visible { outline: 2px solid #10b981; outline-offset: 4px; }
    .boundary { margin-top: 1.5rem; color: #52525b; font-size: 0.78rem; line-height: 1.65; }

    @media (prefers-color-scheme: light) {
      .scene { background: #fff; }
      h2, .name, .body h3 { color: #18181b; }
      .head p, .body p { color: #52525b; }
      .products, .product { border-color: #d4d4d8; }
      .scope, .boundary { color: #71717a; }
      a { color: #047857; border-color: rgba(4,120,87,0.35); }
      a:hover { color: #065f46; border-color: #065f46; }
    }
    @media (max-width: 800px) { .head { grid-template-columns: 1fr; gap: 1.5rem; } .product { grid-template-columns: 1fr; gap: 0.6rem; } }
    @media (max-width: 560px) { .scene { padding: 5rem 1rem; } }
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
          <div class="head"><h2>${zh ? "Pi 周围的配套工具" : "Tools around Pi"}</h2><p>${zh ? "核心仍然是 Pi。配套项目只解决边界清楚的问题：grok-pi-tui 负责终端交互，Pi Session Manager 负责跨会话连续性。" : "Pi remains the core. Companion projects solve bounded problems: grok-pi-tui owns terminal interaction; Pi Session Manager owns cross-session continuity."}</p></div>
          <div class="products">
            <article class="product"><div class="name">grok-pi-tui</div><div class="body"><h3>${zh ? "Grok Pager 作为 Pi 的终端界面" : "Grok Pager as Pi's terminal interface"}</h3><p>${zh ? "Pi 保留模型、Provider、工具、扩展、Skill、Session 和执行；Remote TUI bridge 只负责把交互交给 Grok Pager。" : "Pi keeps models, providers, tools, extensions, skills, sessions, and execution. The Remote TUI bridge only hands interaction to Grok Pager."}</p><div class="scope">Pager · ACP · JSONL RPC · tool cards · diffs · dialogs</div></div><a href="https://github.com/Dwsy/grok-pi-tui" target="_blank" rel="noopener">GitHub</a></article>
            <article class="product"><div class="name">pi-session-manager</div><div class="body"><h3>${zh ? "把历史 Session 继续用起来" : "Keep historical sessions useful"}</h3><p>${zh ? "本地索引 Pi 与其他 coding agent 的历史，重建树、Branch Atlas、Tool Trace 和 compaction context，再通过搜索、Kanban、resume、convert、export 继续工作。" : "Index Pi and other coding-agent histories locally, reconstruct trees, Branch Atlas, tool traces, and compaction context, then continue through search, Kanban, resume, convert, and export."}</p><div class="scope">Pi · Claude Code · Codex · OpenCode · Gemini CLI · Cursor · Antigravity</div></div><a href="https://github.com/Dwsy/pi-session-manager" target="_blank" rel="noopener">GitHub</a></article>
          </div>
          <div class="boundary">${zh ? "两者都围绕 Pi 工作，不把 Pi 包进新的 Agent 黑盒。" : "Both work around Pi; neither wraps it in a new agent black box."}</div>
        </div>
      </section>
    `;
  }
}
