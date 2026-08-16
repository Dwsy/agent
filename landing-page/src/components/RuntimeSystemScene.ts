import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("runtime-system-scene")
export class RuntimeSystemScene extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #09090b; }
    .inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 0.72fr 1.28fr; gap: 5rem; align-items: start; }
    .intro { position: sticky; top: 7rem; }
    .kicker { color: #10b981; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 1rem; }
    h2 { margin: 0 0 1.25rem; color: #fafafa; font-size: clamp(2.25rem, 4.5vw, 3.75rem); line-height: 1.02; letter-spacing: -0.04em; font-weight: 600; }
    .lead { color: #a1a1aa; font-size: 1.0625rem; line-height: 1.75; margin: 0 0 2rem; max-width: 46ch; }
    .principle { padding-top: 1.25rem; border-top: 1px solid #27272a; color: #71717a; font-size: 0.8125rem; line-height: 1.7; }
    .principle strong { color: #d4d4d8; }

    .system { border-left: 1px solid #27272a; }
    .module { position: relative; display: grid; grid-template-columns: 9rem 1fr; gap: 2rem; padding: 0 0 3.5rem 2.5rem; }
    .module:last-child { padding-bottom: 0; }
    .module::before { content: ''; position: absolute; left: -5px; top: 0.4rem; width: 9px; height: 9px; border-radius: 50%; background: #09090b; border: 2px solid #3f3f46; }
    .module.active::before { border-color: #10b981; box-shadow: 0 0 0 5px rgba(16,185,129,0.08); }
    .index { color: #52525b; font: 0.6875rem/1.4 'JetBrains Mono', monospace; letter-spacing: 0.06em; text-transform: uppercase; }
    .body { padding-bottom: 3.5rem; border-bottom: 1px solid #202023; }
    .module:last-child .body { border-bottom: 0; padding-bottom: 0; }
    .body h3 { margin: 0 0 0.75rem; color: #fafafa; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; }
    .body p { margin: 0 0 1.25rem; color: #71717a; line-height: 1.7; font-size: 0.9375rem; }
    .tokens { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .token { padding: 0.4rem 0.65rem; border: 1px solid #2f2f33; border-radius: 0.4rem; color: #a1a1aa; background: #111113; font: 0.6875rem/1 'JetBrains Mono', monospace; }
    .token.green { color: #34d399; border-color: rgba(16,185,129,0.2); background: rgba(16,185,129,0.06); }
    .flow { margin-top: 1.25rem; display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; }
    .flow-step { padding: 0.75rem; border-top: 1px solid #3f3f46; color: #71717a; font-size: 0.7rem; line-height: 1.45; }
    .flow-step strong { display: block; color: #d4d4d8; margin-bottom: 0.25rem; font-size: 0.75rem; }

    @media (max-width: 900px) { .inner { grid-template-columns: 1fr; gap: 3rem; } .intro { position: static; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .module { grid-template-columns: 1fr; gap: 0.75rem; padding-left: 1.5rem; } .flow { grid-template-columns: 1fr 1fr; } }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private unsubscribe?: () => void;
  connectedCallback() { super.connectedCallback(); this.unsubscribe = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); }); }
  disconnectedCallback() { super.disconnectedCallback(); this.unsubscribe?.(); }

  render() {
    const zh = this.locale === "zh-CN";
    return html`
      <section class="scene" id="runtime">
        <div class="inner">
          <div class="intro">
            <div class="kicker">${zh ? "PI RUNTIME SYSTEM" : "PI RUNTIME SYSTEM"}</div>
            <h2>${zh ? "不是一条流水线，是一个可恢复的运行系统" : "Not a pipeline. A recoverable runtime system."}</h2>
            <p class="lead">${zh ? "Pi 把代码定位、上下文生命周期、角色记忆、Gateway 分发和 Provider 可观测性放在同一个工程闭环里。每一层都能独立工作，也能在同一会话中组合。" : "Pi connects code location, context lifecycle, role memory, gateway distribution, and provider observability into one engineering loop. Each layer works independently and composes inside the same session."}</p>
            <div class="principle"><strong>${zh ? "工程协议" : "Engineering protocol"}</strong><br>${zh ? "L1–L4 按复杂度路由；先读真实实现，再做最小修改，最后用测试、diff 与状态交付证据。" : "Route by L1–L4 complexity; read the real implementation first, make the smallest change, then ship tests, diff, and state as evidence."}</div>
          </div>

          <div class="system">
            <article class="module active">
              <div class="index">01 / context</div>
              <div class="body"><h3>${zh ? "上下文像 Git 一样可操作" : "Context you can operate like Git"}</h3><p>${zh ? "关键状态可 tag、查看 history、checkout 语义节点；长会话通过 compact 保存 handoff，而不是把全部历史无限塞进窗口。" : "Tag important states, inspect history, checkout semantic points, and compact long sessions while preserving the handoff instead of endlessly stuffing history into the window."}</p><div class="tokens"><span class="token green">tag</span><span class="token">checkout</span><span class="token">history</span><span class="token">compact</span></div></div>
            </article>
            <article class="module">
              <div class="index">02 / role memory</div>
              <div class="body"><h3>${zh ? "角色、记忆与知识分层" : "Role-scoped memory and knowledge"}</h3><p>${zh ? "工作目录自动映射角色；短期 session context 与长期 memory 分离，经验沿 daily → pending → consolidated / knowledge 晋升，并支持向量召回与 viewer。" : "Workspace paths map to roles automatically. Short-term session context stays separate from durable memory; experience promotes through daily → pending → consolidated / knowledge with vector recall and a viewer."}</p><div class="tokens"><span class="token">role mapping</span><span class="token green">memory.search</span><span class="token">LanceDB</span><span class="token">viewer</span></div></div>
            </article>
            <article class="module">
              <div class="index">03 / gateway</div>
              <div class="body"><h3>${zh ? "同一个 Pi，分发到更多入口" : "One Pi runtime, more entry points"}</h3><p>${zh ? "Gateway 用 session-aware routing、RPC worker pool 和插件管线把 Pi 接到 Web、API 与消息通道；worker 启动不依赖在线 provider。" : "Gateway uses session-aware routing, an RPC worker pool, and a plugin pipeline to expose Pi through Web, APIs, and messaging channels, with network-safe worker startup."}</p><div class="tokens"><span class="token">WebSocket</span><span class="token">HTTP</span><span class="token green">RPC pool</span><span class="token">offline-safe</span></div></div>
            </article>
            <article class="module">
              <div class="index">04 / observe + verify</div>
              <div class="body"><h3>${zh ? "从 Provider 到工作树都留下证据" : "Evidence from provider to worktree"}</h3><p>${zh ? "Provider Trace 观察请求与响应链路；工程闭环则把 locate → model → preserve → execute → verify 连接起来，最终检查测试、diff 与 worktree 状态。" : "Provider Trace observes request/response paths while the engineering loop connects locate → model → preserve → execute → verify, ending with tests, diff, and worktree state."}</p><div class="flow"><div class="flow-step"><strong>Locate</strong>semantic · exact · AST</div><div class="flow-step"><strong>Model</strong>callers · constraints</div><div class="flow-step"><strong>Preserve</strong>tag · compact</div><div class="flow-step"><strong>Execute</strong>edit · GAPP</div><div class="flow-step"><strong>Verify</strong>test · diff · state</div></div></div>
            </article>
          </div>
        </div>
      </section>
    `;
  }
}
