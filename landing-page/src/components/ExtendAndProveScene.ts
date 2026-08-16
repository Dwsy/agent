import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("extend-and-prove-scene")
export class ExtendAndProveScene extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #09090b; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .head { max-width: 760px; margin-bottom: 3.5rem; }
    .kicker { color: #10b981; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 1rem; }
    h2 { margin: 0 0 1rem; color: #fafafa; font-size: clamp(2.25rem, 4.5vw, 3.75rem); line-height: 1.03; letter-spacing: -0.04em; font-weight: 600; }
    .head p { margin: 0; color: #71717a; font-size: 1rem; line-height: 1.75; max-width: 62ch; }
    .layout { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 1rem; align-items: stretch; }
    .extension { padding: 2rem; border: 1px solid #27272a; border-radius: 1rem; background: #111113; display: flex; flex-direction: column; }
    .extension h3 { margin: 0 0 0.75rem; color: #fafafa; font-size: 1.5rem; }
    .extension > p { margin: 0 0 1.5rem; color: #71717a; line-height: 1.65; }
    .resource-line { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1.5rem; }
    .resource { padding: 0.4rem 0.6rem; border-radius: 0.4rem; border: 1px solid #2f2f33; color: #a1a1aa; font: 0.67rem/1 'JetBrains Mono', monospace; }
    .resource.hot { color: #34d399; border-color: rgba(16,185,129,0.22); background: rgba(16,185,129,0.06); }
    pre { margin: auto 0 0; padding: 1.25rem; overflow-x: auto; border-radius: 0.75rem; background: #09090b; border: 1px solid #27272a; color: #a1a1aa; font: 0.72rem/1.7 'JetBrains Mono', monospace; }
    pre b { color: #c084fc; font-weight: 500; } pre em { color: #4ade80; font-style: normal; }
    .proof { border: 1px solid #27272a; border-radius: 1rem; overflow: hidden; background: #0c0c0e; }
    .proof-head, .proof-row { display: grid; grid-template-columns: 1.25fr 1fr 1fr; }
    .proof-head { background: #18181b; }
    .proof-cell { padding: 1rem 1.1rem; border-bottom: 1px solid #27272a; color: #71717a; font-size: 0.78rem; line-height: 1.5; }
    .proof-head .proof-cell { color: #a1a1aa; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
    .proof-cell.pi { color: #34d399; }
    .proof-row:last-child .proof-cell { border-bottom: 0; }
    .proof-note { padding: 1.25rem; border-top: 1px solid #27272a; color: #52525b; font-size: 0.72rem; line-height: 1.6; }
    @media (prefers-color-scheme: light) {
      .scene { background: #f7f7f5; }
      h2, .extension h3 { color: #18181b; }
      .head p, .extension > p { color: #52525b; }
      .extension { background: #ffffff; border-color: #e4e4e7; }
      .resource { border-color: #e4e4e7; color: #52525b; background: #fafafa; }
      .resource.hot { color: #047857; border-color: rgba(16,185,129,0.18); background: rgba(16,185,129,0.06); }
      .proof { background: #ffffff; border-color: #e4e4e7; }
      .proof-head { background: #f4f4f5; }
      .proof-cell { border-color: #e4e4e7; color: #52525b; }
      .proof-head .proof-cell { color: #71717a; }
      .proof-cell.pi { color: #047857; }
      .proof-note { border-color: #e4e4e7; color: #71717a; }
    }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .proof { overflow-x: auto; } .proof-head, .proof-row { min-width: 640px; } }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private unsubscribe?: () => void;
  connectedCallback() { super.connectedCallback(); this.unsubscribe = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); }); }
  disconnectedCallback() { super.disconnectedCallback(); this.unsubscribe?.(); }

  render() {
    const zh = this.locale === "zh-CN";
    const rows = zh ? [
      ["上下文生命周期", "tag + checkout + compact", "会话即上下文"],
      ["代码定位", "语义 + 精确 + AST", "基础搜索"],
      ["交互表面", "TUI + Web + GAPP", "单一聊天界面"],
      ["长期记忆", "角色记忆 + 检索 + viewer", "临时提示词"],
      ["可观测与分发", "Provider Trace + Gateway/RPC", "单一接口"],
    ] : [
      ["Context lifecycle", "tag + checkout + compact", "session-only context"],
      ["Code location", "semantic + exact + AST", "basic search"],
      ["Interaction surface", "TUI + Web + GAPP", "single chat surface"],
      ["Durable memory", "role memory + retrieval + viewer", "temporary prompts"],
      ["Observe & distribute", "Provider Trace + Gateway/RPC", "single interface"],
    ];
    return html`
      <section class="scene" id="extensions">
        <div class="inner">
          <div class="head"><div class="kicker">EXTEND & PROVE</div><h2>${zh ? "能力可以扩展，差异必须能解释" : "Extend the capability. Prove the difference."}</h2><p>${zh ? "Pi 的价值不来自固定功能清单，而来自可编程扩展面与可验证运行时。左边是如何接能力，右边是为什么这些能力改变了 Agent 的工作方式。" : "Pi's value is not a fixed feature checklist. It comes from a programmable extension surface and a verifiable runtime. The left shows how capability plugs in; the right shows why the runtime changes the way an agent works."}</p></div>
          <div class="layout">
            <div class="extension"><h3>${zh ? "按任务组合资源" : "Compose resources per task"}</h3><p>${zh ? "扩展、Skill、工具、命令、GAPP 和 Provider 都是运行时资源；需要时加载，不需要时不把复杂度塞进核心。" : "Extensions, skills, tools, commands, GAPPs, and providers are runtime resources. Load them when needed instead of baking every capability into the core."}</p><div class="resource-line"><span class="resource hot">ace-tool</span><span class="resource">ast-grep</span><span class="resource">codemap</span><span class="resource">diagnose</span><span class="resource">impeccable</span><span class="resource hot">GAPP</span><span class="resource">provider-trace</span><span class="resource">role-persona</span></div><pre><b>pi</b>.registerTool({
  name: <em>"project_map"</em>,
  execute: async (ctx) => {
    await ctx.ui.custom(...)
  }
})</pre></div>
            <div class="proof" id="comparison"><div class="proof-head"><div class="proof-cell">${zh ? "能力" : "Capability"}</div><div class="proof-cell">Pi Runtime</div><div class="proof-cell">${zh ? "典型工具" : "Typical tools"}</div></div>${rows.map(row => html`<div class="proof-row"><div class="proof-cell">${row[0]}</div><div class="proof-cell pi">${row[1]}</div><div class="proof-cell">${row[2]}</div></div>`)}<div class="proof-note">${zh ? "对比的是运行时边界，不是模型排行榜：同一个模型在不同上下文、记忆、UI、可观测与分发能力下，会形成完全不同的工程体验。" : "This compares runtime boundaries, not model rankings. The same model behaves very differently when context, memory, UI, observability, and distribution capabilities change."}</div></div>
          </div>
        </div>
      </section>
    `;
  }
}
