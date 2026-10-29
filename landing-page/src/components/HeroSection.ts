import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("hero-section")
export class HeroSection extends LitElement {
  static styles = css`
    *, *::before, *::after { box-sizing: border-box; }
    :host { display: block; width: 100%; }
    .hero { padding: clamp(5rem, 9vw, 8rem) 1.5rem 4rem; background: #09090b; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .lead { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: clamp(3rem, 8vw, 8rem); align-items: end; padding-bottom: clamp(4rem, 7vw, 6rem); }
    h1 { margin: 0; max-width: 8ch; color: #fafafa; font-size: clamp(3.5rem, 8vw, 7rem); line-height: 0.92; letter-spacing: -0.055em; font-weight: 650; }
    .pitch { max-width: 620px; }
    .pitch p { margin: 0 0 1.75rem; color: #a1a1aa; font-size: clamp(1rem, 1.5vw, 1.2rem); line-height: 1.7; }
    .actions { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
    .primary { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1rem; background: #047857; color: #fff; text-decoration: none; font-size: 0.85rem; font-weight: 650; border: 1px solid #047857; }
    .primary:hover { background: #065f46; border-color: #065f46; }
    .secondary { color: #a1a1aa; text-decoration: none; font-size: 0.85rem; font-weight: 600; border-bottom: 1px solid #3f3f46; padding-bottom: 0.15rem; }
    .secondary:hover { color: #fafafa; border-color: #a1a1aa; }
    a:focus-visible { outline: 2px solid #10b981; outline-offset: 4px; }

    .index { border-top: 1px solid #27272a; border-bottom: 1px solid #27272a; }
    .row { display: grid; grid-template-columns: 10rem 1fr 1fr; gap: 2rem; padding: 1.15rem 0; border-top: 1px solid #202023; align-items: baseline; }
    .row:first-child { border-top: 0; }
    .name { color: #f4f4f5; font-size: 0.9rem; font-weight: 650; }
    .detail { color: #71717a; font-size: 0.82rem; line-height: 1.55; }
    .proof { color: #52525b; font-size: 0.76rem; line-height: 1.55; }
    .proof strong { color: #34d399; font-weight: 600; }

    @media (prefers-color-scheme: light) {
      .hero { background: #fff; }
      h1 { color: #18181b; }
      .pitch p { color: #52525b; }
      .secondary { color: #52525b; border-color: #d4d4d8; }
      .secondary:hover { color: #18181b; border-color: #71717a; }
      .index, .row { border-color: #e4e4e7; }
      .name { color: #18181b; }
      .detail { color: #52525b; }
      .proof { color: #71717a; }
      .proof strong { color: #047857; }
    }

    @media (max-width: 800px) {
      .lead { grid-template-columns: 1fr; gap: 2rem; align-items: start; }
      h1 { max-width: 10ch; }
      .row { grid-template-columns: 1fr; gap: 0.35rem; padding: 1rem 0; }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private unsubscribe?: () => void;
  connectedCallback() { super.connectedCallback(); this.unsubscribe = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); }); }
  disconnectedCallback() { super.disconnectedCallback(); this.unsubscribe?.(); }

  render() {
    const zh = this.locale === "zh-CN";
    const rows = zh ? [
      ["代码理解", "语义检索、精确搜索、AST 与调用链一起定位真实实现。", "先读再改"],
      ["上下文", "tag、history、checkout、compact 管理长会话，而不是无限堆历史。", "可恢复"],
      ["角色记忆", "工作目录映射角色，短期 context 与长期 knowledge 分开维护。", "跨会话"],
      ["GAPP", "项目图、diff、状态和操作可以成为会话里的原生界面。", "可交互"],
      ["可观测", "Provider Trace 把模型路由、请求响应和失败路径留在同一条证据链。", "可检查"],
      ["分发", "Gateway/RPC 把同一个 Pi 接到 Web、API 和消息入口。", "session-aware"],
    ] : [
      ["Code understanding", "Semantic retrieval, exact search, AST, and call paths locate the real implementation.", "read before edit"],
      ["Context", "Tag, history, checkout, and compact keep long sessions manageable without dumping endless history.", "recoverable"],
      ["Role memory", "Workspace paths map to roles; short-term context stays separate from durable knowledge.", "cross-session"],
      ["GAPP", "Project maps, diffs, live state, and actions can become native session interfaces.", "interactive"],
      ["Observability", "Provider Trace keeps model routing, requests, responses, and failure paths inspectable.", "inspectable"],
      ["Distribution", "Gateway/RPC exposes the same Pi runtime through Web, APIs, and messaging entry points.", "session-aware"],
    ];

    return html`
      <section class="hero" id="features">
        <div class="inner">
          <div class="lead">
            <h1>${zh ? "Pi 工程工作台" : "Pi engineering workbench"}</h1>
            <div class="pitch">
              <p>${zh ? "围绕 Pi Core 构建的工程环境。它先理解项目，再持续管理上下文和角色记忆；需要时生成 GAPP、切换 Provider、通过 Gateway/RPC 分发，最后用测试、diff 和工作树状态交付。" : "An engineering environment built around Pi Core. It understands the project first, preserves context and role memory, generates GAPP interfaces when useful, routes through providers and Gateway/RPC, and closes with tests, diff, and worktree state."}</p>
              <div class="actions"><a class="primary" href="https://github.com/Dwsy/agent" target="_blank" rel="noopener">${zh ? "查看仓库" : "View repository"}</a><a class="secondary" href="https://github.com/Dwsy/agent#readme" target="_blank" rel="noopener">${zh ? "阅读配置说明" : "Read the configuration"}</a></div>
            </div>
          </div>

          <div class="index">
            ${rows.map(row => html`<div class="row"><div class="name">${row[0]}</div><div class="detail">${row[1]}</div><div class="proof"><strong>${row[2]}</strong></div></div>`)}
          </div>
        </div>
      </section>
    `;
  }
}
