import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("runtime-system-scene")
export class RuntimeSystemScene extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #111113; }
    .inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 0.78fr 1.22fr; gap: 6rem; align-items: start; }
    h2 { margin: 0 0 1.25rem; color: #fafafa; font-size: clamp(2.4rem, 5vw, 4.5rem); line-height: 0.98; letter-spacing: -0.045em; font-weight: 620; max-width: 9ch; }
    .lead { margin: 0; color: #a1a1aa; font-size: 1rem; line-height: 1.75; max-width: 44ch; }
    .list { border-top: 1px solid #3f3f46; }
    .item { padding: 1.6rem 0; border-bottom: 1px solid #27272a; display: grid; grid-template-columns: 11rem 1fr; gap: 2rem; }
    .item h3 { margin: 0; color: #e4e4e7; font-size: 0.95rem; font-weight: 650; }
    .item p { margin: 0; color: #71717a; font-size: 0.9rem; line-height: 1.7; }
    .item code { color: #34d399; font: 0.78rem/1.5 'JetBrains Mono', monospace; background: transparent; }
    .protocol { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #3f3f46; color: #71717a; font-size: 0.82rem; line-height: 1.7; }
    .protocol strong { color: #d4d4d8; font-weight: 650; }

    @media (prefers-color-scheme: light) {
      .scene { background: #f7f7f5; }
      h2 { color: #18181b; }
      .lead, .item p, .protocol { color: #52525b; }
      .list, .item, .protocol { border-color: #d4d4d8; }
      .item h3, .protocol strong { color: #27272a; }
      .item code { color: #047857; }
    }
    @media (max-width: 850px) { .inner { grid-template-columns: 1fr; gap: 3rem; } h2 { max-width: 12ch; } }
    @media (max-width: 560px) { .scene { padding: 5rem 1rem; } .item { grid-template-columns: 1fr; gap: 0.5rem; } }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private unsubscribe?: () => void;
  connectedCallback() { super.connectedCallback(); this.unsubscribe = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); }); }
  disconnectedCallback() { super.disconnectedCallback(); this.unsubscribe?.(); }

  render() {
    const zh = this.locale === "zh-CN";
    const items = zh ? [
      ["上下文", "关键状态可以保存、回看和恢复。长会话通过 compact 保留 handoff，而不是把全部历史继续塞进窗口。", "tag · history · checkout · compact"],
      ["角色记忆", "工作目录自动映射角色；daily、pending、knowledge 分开，稳定经验才进入长期记忆。", "role mapping · memory.search · viewer"],
      ["Gateway", "session-aware routing 和 RPC worker pool 把同一套 Pi 能力接到 Web、API 与消息通道。", "WebSocket · HTTP · RPC"],
      ["验证", "Provider Trace 观察模型链路；交付前同时检查测试、diff 和 worktree 状态。", "trace · test · diff · state"],
    ] : [
      ["Context", "Important states can be saved, inspected, and restored. Compaction preserves the handoff instead of carrying the whole transcript forever.", "tag · history · checkout · compact"],
      ["Role memory", "Workspace paths map to roles; daily, pending, and knowledge remain separate so only stable experience becomes durable memory.", "role mapping · memory.search · viewer"],
      ["Gateway", "Session-aware routing and an RPC worker pool expose the same Pi capabilities through Web, APIs, and messaging channels.", "WebSocket · HTTP · RPC"],
      ["Verification", "Provider Trace observes the model path; delivery checks tests, diff, and worktree state together.", "trace · test · diff · state"],
    ];
    return html`
      <section class="scene" id="runtime">
        <div class="inner">
          <div><h2>${zh ? "持续工作的运行时" : "A runtime that keeps working"}</h2><p class="lead">${zh ? "这里没有固定五阶段，也没有为了展示而存在的流程图。Pi 只保留真实工程需要的状态：代码在哪里、上下文到哪了、记忆属于谁、模型做了什么、修改是否验证。" : "There is no mandatory five-step ceremony and no process diagram for show. Pi keeps the state real engineering needs: where the code is, where context stands, who owns memory, what the model did, and whether the change was verified."}</p><div class="protocol"><strong>${zh ? "执行原则" : "Execution principle"}</strong><br>${zh ? "按 L1–L4 复杂度路由；先读真实实现，再做最小修改。" : "Route by L1–L4 complexity; read the real implementation first, then make the smallest change."}</div></div>
          <div class="list">${items.map(item => html`<div class="item"><h3>${item[0]}</h3><div><p>${item[1]}</p><code>${item[2]}</code></div></div>`)}</div>
        </div>
      </section>
    `;
  }
}
