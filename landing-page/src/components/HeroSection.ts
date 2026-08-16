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
    .tile { min-width: 0; overflow: hidden; border: 1px solid #27272a; border-radius: 0.7rem; background: #111113; }
    .main { grid-column: 1 / 8; grid-row: 1 / 6; padding: clamp(2rem, 4vw, 4rem); display: flex; flex-direction: column; justify-content: center; background: #0c0c0e; }
    .context { grid-column: 8 / 11; grid-row: 1 / 3; }
    .trace { grid-column: 11 / 13; grid-row: 1 / 3; }
    .gapp { grid-column: 8 / 13; grid-row: 3 / 5; background: #151517; border-color: #27272a; }
    .evidence { grid-column: 8 / 13; grid-row: 5 / 6; background: #151517; border-color: #27272a; }
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
    .action.primary { background: #047857; border-color: #047857; color: #ffffff; }
    .action:hover { border-color: #71717a; color: #fafafa; }
    .action.primary:hover { background: #065f46; border-color: #065f46; color: #ffffff; }
    .action:focus-visible { outline: 2px solid #10b981; outline-offset: 3px; }
    .main-foot { margin-top: auto; padding-top: 1.5rem; display: flex; gap: 1.5rem; border-top: 1px solid #27272a; color: #52525b; font: 0.68rem/1.4 'JetBrains Mono', monospace; }
    .main-foot strong { display: block; color: #a1a1aa; font-weight: 500; margin-bottom: 0.2rem; }

    .gapp { padding: 1rem; display: grid; grid-template-columns: 0.72fr 1.28fr; gap: 1rem; align-items: stretch; }
    .gapp-copy { display: flex; flex-direction: column; justify-content: space-between; padding: 0.25rem; }
    .gapp-copy .eyebrow { color: #34d399; }
    .gapp-copy h2 { margin: 0.55rem 0 0.45rem; color: #f4f4f5; font-size: 1.15rem; line-height: 1.15; }
    .gapp-copy p { margin: 0; color: #71717a; font-size: 0.7rem; line-height: 1.5; }
    .gapp-stage { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 0.45rem; padding: 0.45rem; border: 1px solid #27272a; background: #0c0c0e; }
    .gapp-nav { padding: 0.55rem; border-right: 1px solid #27272a; color: #52525b; font: 0.58rem/1.8 'JetBrains Mono', monospace; }
    .gapp-nav strong { display: block; color: #34d399; font-weight: 500; }
    .gapp-canvas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; }
    .gapp-node { min-height: 2.5rem; padding: 0.45rem; border: 1px solid #2f2f33; color: #71717a; font: 0.55rem/1.35 'JetBrains Mono', monospace; }
    .gapp-node.hot { color: #d4d4d8; border-color: rgba(16,185,129,0.35); background: rgba(16,185,129,0.06); }

    .feature { padding: 1.15rem; display: flex; flex-direction: column; justify-content: space-between; }
    .eyebrow { color: #52525b; font: 0.62rem/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; }
    .feature h2 { margin: 0.65rem 0 0.4rem; color: #f4f4f5; font-size: 1rem; line-height: 1.15; font-weight: 600; letter-spacing: -0.015em; }
    .feature p { margin: 0; color: #71717a; font-size: 0.72rem; line-height: 1.5; }
    .tokens { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.8rem; }
    .token { color: #71717a; font: 0.61rem/1 'JetBrains Mono', monospace; border-bottom: 1px solid #3f3f46; padding-bottom: 0.2rem; }
    .token.hot { color: #34d399; border-color: rgba(52,211,153,0.5); }

    .evidence { padding: 0.8rem 1rem; display: grid; grid-template-columns: auto 1fr; gap: 1rem; align-items: center; }
    .evidence-label { color: #34d399; font: 0.62rem/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
    .evidence-flow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; }
    .evidence-step { min-width: 0; padding-left: 0.6rem; border-left: 1px solid #3f3f46; }
    .evidence-step strong { display: block; color: #d4d4d8; font-size: 0.66rem; font-weight: 600; margin-bottom: 0.15rem; }
    .evidence-step span { color: #52525b; font: 0.56rem/1.3 'JetBrains Mono', monospace; }

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
      .context, .trace, .role, .gateway, .extensions, .companions { background: #ffffff; border-color: #e4e4e7; }
      .context, .role { box-shadow: inset 3px 0 0 #10b981; }
      .trace, .gateway { box-shadow: inset 3px 0 0 #a1a1aa; }
      .extensions, .companions { box-shadow: inset 3px 0 0 #34d399; }
      .gapp { background: #fafafa; border-color: #d4d4d8; }
      .gapp-copy .eyebrow { color: #047857; }
      .gapp-copy h2 { color: #18181b; }
      .gapp-copy p { color: #52525b; }
      .gapp-stage { background: #ffffff; border-color: #d4d4d8; }
      .gapp-nav { border-color: #e4e4e7; color: #71717a; }
      .gapp-nav strong { color: #047857; }
      .gapp-node { background: #fafafa; border-color: #e4e4e7; color: #71717a; }
      .gapp-node.hot { background: #ecfdf5; border-color: #6ee7b7; color: #065f46; }
      .evidence { background: #f7f7f5; border-color: #d4d4d8; }
      .evidence-label { color: #047857; }
      .evidence-step { border-color: #d4d4d8; }
      .evidence-step strong { color: #27272a; }
      .evidence-step span { color: #71717a; }
      .feature h2, .mini strong { color: #18181b; }
      .feature p, .mini span, .eyebrow { color: #52525b; }
      .token { color: #475569; border-color: #cbd5e1; }
      .token.hot, .mini .mark { color: #047857; border-color: rgba(4,120,87,0.35); }
    }

    @media (max-width: 1000px) {
      .hero { min-height: auto; }
      .bento { height: auto; min-height: 0; max-height: none; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: auto; }
      .main, .context, .trace, .gapp, .evidence, .role, .gateway, .extensions, .companions { grid-column: auto; grid-row: auto; }
      .main { grid-column: 1 / -1; min-height: 32rem; }
      .context, .trace { min-height: 14rem; }
      .gapp { min-height: 18rem; }
      .evidence { min-height: 8rem; }
      .role, .gateway, .extensions, .companions { min-height: 8rem; }
    }

    @media (max-width: 640px) {
      .hero { padding: 0.75rem 1rem 1.5rem; }
      .bento { grid-template-columns: 1fr; gap: 0.6rem; }
      .main { min-height: 30rem; padding: 2rem 1.5rem; }
      h1 { font-size: clamp(2.75rem, 14vw, 4rem); }
      .context, .trace, .gapp, .evidence, .role, .gateway, .extensions, .companions { grid-column: 1; min-height: auto; }
      .gapp { grid-template-columns: 1fr; min-height: 18rem; }
      .feature { min-height: 12rem; }
      .evidence { grid-template-columns: 1fr; min-height: 10rem; }
      .evidence-flow { grid-template-columns: 1fr 1fr; }
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
            <div class="badge">${zh ? "PI ENGINEERING WORKBENCH" : "PI ENGINEERING WORKBENCH"}</div>
            <h1>${zh ? html`为真实软件工程打造的 <span class="accent">Pi 工作台</span>` : html`A <span class="accent">Pi workbench</span> for real software engineering`}</h1>
            <p class="description">${zh ? "这是我们围绕 Pi Core 构建的一套工程工作环境：它先读懂真实代码，再管理长会话上下文与角色记忆；需要时生成 GAPP 界面、切换 Provider、通过 Gateway/RPC 分发，并用测试、diff 与工作树状态完成交付。" : "An engineering environment built around Pi Core: understand the real code first, preserve long-running context and role memory, generate GAPP interfaces when useful, route across providers and Gateway/RPC, then close the loop with tests, diff, and worktree state."}</p>
            <div class="actions"><a class="action primary" href="https://github.com/Dwsy/agent" target="_blank" rel="noopener">${zh ? "开始使用" : "Get started"} ↗</a><a class="action" href="https://github.com/Dwsy/agent#readme" target="_blank" rel="noopener">${zh ? "阅读文档" : "Read docs"}</a></div>
            <div class="main-foot"><div><strong>${zh ? "读懂项目" : "Understand the project"}</strong>${zh ? "语义检索 · AST · callers" : "semantic search · AST · callers"}</div><div><strong>${zh ? "保持连续" : "Keep continuity"}</strong>${zh ? "context · role memory · compact" : "context · role memory · compact"}</div><div><strong>${zh ? "交付证据" : "Ship evidence"}</strong>${zh ? "test · diff · worktree" : "test · diff · worktree"}</div></div>
          </article>

          <article class="tile feature context"><div><div class="eyebrow">01 / Context</div><h2>${zh ? "上下文像 Git 一样可操作" : "Operate context like Git"}</h2><p>${zh ? "给关键语义状态打 tag、查看 history、checkout 回任意 checkpoint；长会话 compact 后仍保留任务 handoff。" : "Tag semantic states, inspect history, checkout any checkpoint, and keep the task handoff intact after long-session compaction."}</p></div><div class="tokens"><span class="token hot">tag</span><span class="token">checkout</span><span class="token">history</span><span class="token">compact</span></div></article>

          <article class="tile feature trace"><div><div class="eyebrow">02 / Observe</div><h2>Provider Trace</h2><p>${zh ? "观察 provider 请求/响应、模型路由与失败链路，再把测试、diff、worktree 状态接到同一条证据链。" : "Inspect provider requests/responses, model routing, and failure paths, then connect tests, diff, and worktree state to the same evidence trail."}</p></div><div class="tokens"><span class="token hot">trace</span><span class="token">insights</span><span class="token">verify</span></div></article>

          <article class="tile gapp"><div class="gapp-copy"><div><div class="eyebrow">03 / Native UI</div><h2>${zh ? "GAPP：Agent 原生生成交互界面" : "GAPP: agent-native interactive UI"}</h2><p>${zh ? "不是把结果塞回聊天气泡；项目图、diff、状态和操作可以直接成为会话的一部分。" : "Not another chat bubble. Project maps, diffs, live state, and actions can become part of the session itself."}</p></div><div class="tokens"><span class="token hot">project map</span><span class="token">diff</span><span class="token">live state</span></div></div><div class="gapp-stage"><div class="gapp-nav"><strong>PROJECT MAP</strong>src/<br>extensions/<br>gateway/<br>roles/</div><div class="gapp-canvas"><div class="gapp-node hot">context<br>checkpoint</div><div class="gapp-node">provider<br>trace</div><div class="gapp-node">role<br>memory</div><div class="gapp-node hot">gateway<br>RPC</div></div></div></article>

          <article class="tile evidence"><div class="evidence-label">Evidence rail</div><div class="evidence-flow"><div class="evidence-step"><strong>Locate</strong><span>semantic · AST</span></div><div class="evidence-step"><strong>Model</strong><span>callers · constraints</span></div><div class="evidence-step"><strong>Preserve</strong><span>tag · compact</span></div><div class="evidence-step"><strong>Execute</strong><span>edit · GAPP</span></div><div class="evidence-step"><strong>Verify</strong><span>test · diff · state</span></div></div></article>

          <article class="tile mini role"><div class="mark">Memory</div><strong>${zh ? "角色长期记忆" : "Durable role memory"}</strong><span>${zh ? "workspace→role · daily→pending→knowledge · 向量召回 · viewer" : "workspace→role · daily→pending→knowledge · vector recall · viewer"}</span></article>
          <article class="tile mini gateway"><div class="mark">Gateway</div><strong>Gateway / RPC</strong><span>${zh ? "session-aware routing · RPC worker pool · WebSocket/HTTP · offline-safe" : "session-aware routing · RPC worker pool · WebSocket/HTTP · offline-safe"}</span></article>
          <article class="tile mini extensions"><div class="mark">Extend</div><strong>${zh ? "扩展 / Skill / GAPP" : "Extensions / Skills / GAPP"}</strong><span>${zh ? "ace-tool · AST · browser · diagnose · 自定义工具与交互面" : "ace-tool · AST · browser · diagnose · custom tools and UI surfaces"}</span></article>
          <article class="tile mini companions"><div class="mark">Companion</div><strong>grok-pi-tui + PSM</strong><span>${zh ? "Grok Pager 原生终端 · Session 搜索/树/Kanban · resume/export" : "Grok Pager native TUI · session search/tree/Kanban · resume/export"}</span></article>
        </div>
      </section>
    `;
  }
}
