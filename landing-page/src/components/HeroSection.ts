import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("hero-section")
export class HeroSection extends LitElement {
  static styles = css`
    *, *::before, *::after { box-sizing: border-box; }
    :host { display: block; width: 100%; }
    .hero { min-height: calc(100dvh - 4.5rem); padding: 1.25rem 1.5rem 2rem; background: #09090b; }
    .bento { max-width: 1200px; height: calc(100dvh - 7.25rem); min-height: 650px; max-height: 820px; margin: 0 auto; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); gap: 0.75rem; }
    .tile { min-width: 0; overflow: hidden; border: 1px solid #27272a; background: #111113; }
    .main { grid-column: 1 / 8; grid-row: 1 / 6; padding: clamp(2rem, 4vw, 4rem); display: flex; flex-direction: column; justify-content: center; background: #0c0c0e; }
    .terminal { grid-column: 8 / 13; grid-row: 1 / 4; background: #151517; display: flex; flex-direction: column; }
    .context { grid-column: 8 / 11; grid-row: 4 / 6; }
    .trace { grid-column: 11 / 13; grid-row: 4 / 6; }
    .role { grid-column: 1 / 4; grid-row: 6; }
    .gateway { grid-column: 4 / 7; grid-row: 6; }
    .extensions { grid-column: 7 / 10; grid-row: 6; }
    .companions { grid-column: 10 / 13; grid-row: 6; }

    .badge { display: inline-flex; align-items: center; gap: 0.5rem; width: fit-content; margin-bottom: 1.4rem; color: #34d399; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; }
    .badge::before { content: ''; width: 1.5rem; height: 1px; background: #10b981; }
    h1 { margin: 0 0 1.25rem; color: #fafafa; font-size: clamp(3rem, 5.5vw, 5.25rem); line-height: 0.98; letter-spacing: -0.055em; font-weight: 650; max-width: 10ch; }
    h1 .accent { color: #10b981; }
    .description { margin: 0 0 1.75rem; max-width: 52ch; color: #a1a1aa; font-size: 1rem; line-height: 1.7; }
    .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .action { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1rem; border: 1px solid #3f3f46; color: #d4d4d8; text-decoration: none; font-size: 0.82rem; font-weight: 600; }
    .action.primary { background: #10b981; border-color: #10b981; color: #07110d; }
    .action:hover { border-color: #71717a; color: #fafafa; }
    .action.primary:hover { background: #34d399; color: #07110d; }
    .action:focus-visible { outline: 2px solid #10b981; outline-offset: 3px; }
    .main-foot { margin-top: auto; padding-top: 1.5rem; display: flex; gap: 1.5rem; border-top: 1px solid #27272a; color: #52525b; font: 0.68rem/1.4 'JetBrains Mono', monospace; }
    .main-foot strong { display: block; color: #a1a1aa; font-weight: 500; margin-bottom: 0.2rem; }

    .terminal-head { display: flex; align-items: center; gap: 0.45rem; padding: 0.8rem 1rem; border-bottom: 1px solid #27272a; color: #52525b; font: 0.68rem/1 'JetBrains Mono', monospace; }
    .dot { width: 8px; height: 8px; border-radius: 50%; } .red { background: #ef4444; } .yellow { background: #eab308; } .green { background: #22c55e; }
    .terminal-title { margin-left: 0.35rem; }
    .terminal-body { flex: 1; padding: 1rem 1.1rem; display: flex; flex-direction: column; justify-content: center; color: #71717a; font: 0.72rem/1.65 'JetBrains Mono', monospace; }
    .command { color: #f4f4f5; } .prompt { color: #10b981; } .ok { color: #34d399; }
    .gapp-line { margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px solid #27272a; }

    .feature { padding: 1.15rem; display: flex; flex-direction: column; justify-content: space-between; }
    .eyebrow { color: #52525b; font: 0.62rem/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; }
    .feature h2 { margin: 0.65rem 0 0.4rem; color: #f4f4f5; font-size: 1rem; line-height: 1.15; font-weight: 600; letter-spacing: -0.015em; }
    .feature p { margin: 0; color: #71717a; font-size: 0.72rem; line-height: 1.5; }
    .tokens { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.8rem; }
    .token { color: #71717a; font: 0.61rem/1 'JetBrains Mono', monospace; border-bottom: 1px solid #3f3f46; padding-bottom: 0.2rem; }
    .token.hot { color: #34d399; border-color: rgba(52,211,153,0.5); }

    .mini { padding: 0.8rem 0.9rem; display: flex; flex-direction: column; justify-content: center; }
    .mini strong { color: #e4e4e7; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.3rem; }
    .mini span { color: #52525b; font-size: 0.64rem; line-height: 1.4; }
    .mini .mark { color: #10b981; font: 0.58rem/1 'JetBrains Mono', monospace; margin-bottom: 0.45rem; text-transform: uppercase; letter-spacing: 0.05em; }

    @media (prefers-color-scheme: light) {
      .hero { background: #ffffff; }
      .tile { border-color: #e4e4e7; background: #fafafa; }
      .main { background: #ffffff; }
      h1 { color: #18181b; }
      .description { color: #52525b; }
      .action { color: #3f3f46; border-color: #d4d4d8; background: #ffffff; }
      .action:hover { color: #18181b; border-color: #a1a1aa; }
      .main-foot { border-color: #e4e4e7; color: #71717a; }
      .main-foot strong { color: #3f3f46; }
      .terminal { background: #151517; border-color: #27272a; }
      .feature h2, .mini strong { color: #18181b; }
      .feature p, .mini span, .eyebrow { color: #71717a; }
      .token { color: #52525b; border-color: #d4d4d8; }
      .token.hot, .mini .mark { color: #047857; border-color: rgba(4,120,87,0.35); }
    }

    @media (max-width: 1000px) {
      .hero { min-height: auto; }
      .bento { height: auto; min-height: 0; max-height: none; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: auto; }
      .main, .terminal, .context, .trace, .role, .gateway, .extensions, .companions { grid-column: auto; grid-row: auto; }
      .main { grid-column: 1 / -1; min-height: 32rem; }
      .terminal { min-height: 18rem; }
      .context, .trace { min-height: 14rem; }
      .role, .gateway, .extensions, .companions { min-height: 8rem; }
    }

    @media (max-width: 640px) {
      .hero { padding: 0.75rem 1rem 1.5rem; }
      .bento { grid-template-columns: 1fr; gap: 0.6rem; }
      .main { min-height: 30rem; padding: 2rem 1.5rem; }
      h1 { font-size: clamp(2.75rem, 14vw, 4rem); }
      .terminal, .context, .trace, .role, .gateway, .extensions, .companions { grid-column: 1; min-height: auto; }
      .terminal { min-height: 17rem; }
      .feature { min-height: 12rem; }
      .mini { min-height: 7rem; }
      .main-foot { gap: 0.75rem; flex-wrap: wrap; }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private unsubscribe?: () => void;
  connectedCallback() { super.connectedCallback(); this.unsubscribe = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); }); }
  disconnectedCallback() { super.disconnectedCallback(); this.unsubscribe?.(); }

  render() {
    const zh = this.locale === "zh-CN";
    return html`
      <section class="hero" id="features">
        <div class="bento">
          <article class="tile main">
            <div class="badge">${zh ? "可编程 Agent Runtime" : "Programmable agent runtime"}</div>
            <h1>${zh ? html`把 AI 编程变成 <span class="accent">可编程系统</span>` : html`Make AI coding a <span class="accent">programmable system</span>`}</h1>
            <p class="description">${zh ? "不是聊天壳。Pi 把真实代码检索、可恢复上下文、角色长期记忆、原生 GAPP、Provider 可观测性与 Gateway/RPC 编排放进同一个运行时。" : "Not a chat shell. Pi puts real code retrieval, recoverable context, durable role memory, native GAPPs, provider observability, and Gateway/RPC orchestration in one runtime."}</p>
            <div class="actions"><a class="action primary" href="https://github.com/Dwsy/agent" target="_blank" rel="noopener">${zh ? "开始使用" : "Get started"} ↗</a><a class="action" href="https://github.com/Dwsy/agent#readme" target="_blank" rel="noopener">${zh ? "阅读文档" : "Read docs"}</a></div>
            <div class="main-foot"><div><strong>Context</strong>tag · checkout · compact</div><div><strong>Protocol</strong>L1–L4 complexity routing</div><div><strong>Verify</strong>test · diff · worktree</div></div>
          </article>

          <article class="tile terminal">
            <div class="terminal-head"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span><span class="terminal-title">pi-agent</span></div>
            <div class="terminal-body"><div><span class="prompt">$</span> <span class="command">pi "trace the real flow, then fix it"</span></div><div>retrieving symbols + callers...</div><div>checkpointing context...</div><div>applying surgical edit + verification...</div><div class="ok">evidence attached · worktree clean</div><div class="gapp-line"><span class="prompt">$</span> <span class="command">pi /gapp open dyncode-project-map</span></div></div>
          </article>

          <article class="tile feature context"><div><div class="eyebrow">01 / Context</div><h2>${zh ? "上下文像 Git 一样可操作" : "Operate context like Git"}</h2><p>${zh ? "保存语义节点，长会话 compact 后仍能恢复 handoff。" : "Save semantic states and recover the handoff after compaction."}</p></div><div class="tokens"><span class="token hot">tag</span><span class="token">checkout</span><span class="token">history</span><span class="token">compact</span></div></article>

          <article class="tile feature trace"><div><div class="eyebrow">02 / Observe</div><h2>Provider Trace</h2><p>${zh ? "请求、响应与工程验证留在同一条证据链。" : "Requests, responses, and verification stay on one evidence path."}</p></div><div class="tokens"><span class="token hot">trace</span><span class="token">insights</span><span class="token">verify</span></div></article>

          <article class="tile mini role"><div class="mark">Memory</div><strong>${zh ? "角色长期记忆" : "Durable role memory"}</strong><span>role mapping · vector recall · viewer</span></article>
          <article class="tile mini gateway"><div class="mark">Gateway</div><strong>Gateway / RPC</strong><span>session routing · worker pool · offline-safe</span></article>
          <article class="tile mini extensions"><div class="mark">Extend</div><strong>${zh ? "扩展 / Skill / GAPP" : "Extensions / Skills / GAPP"}</strong><span>ace · AST · browser · diagnose · custom UI</span></article>
          <article class="tile mini companions"><div class="mark">Companion</div><strong>grok-pi-tui + PSM</strong><span>${zh ? "原生终端体验 · 跨会话连续性" : "native terminal · session continuity"}</span></article>
        </div>
      </section>
    `;
  }
}
