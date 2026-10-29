import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("extend-and-prove-scene")
export class ExtendAndProveScene extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
    .scene { padding: 7rem 1.5rem; background: #111113; }
    .inner { max-width: 1200px; margin: 0 auto; }
    .head { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 5rem; margin-bottom: 4rem; align-items: end; }
    h2 { margin: 0; color: #fafafa; font-size: clamp(2.4rem, 5vw, 4.5rem); line-height: 0.98; letter-spacing: -0.045em; font-weight: 620; max-width: 10ch; }
    .head p { margin: 0; color: #a1a1aa; font-size: 1rem; line-height: 1.75; max-width: 58ch; }
    .layout { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 5rem; align-items: start; }
    .extension { border-top: 1px solid #3f3f46; padding-top: 1.5rem; }
    .extension h3 { margin: 0 0 0.75rem; color: #e4e4e7; font-size: 1.2rem; font-weight: 620; }
    .extension p { margin: 0 0 1rem; color: #71717a; line-height: 1.7; font-size: 0.9rem; }
    .resources { margin: 0 0 1.5rem; color: #a1a1aa; font-size: 0.78rem; line-height: 1.8; }
    pre { margin: 0; padding: 1rem 0; overflow-x: auto; border-top: 1px solid #27272a; border-bottom: 1px solid #27272a; color: #a1a1aa; font: 0.72rem/1.7 'JetBrains Mono', monospace; }
    pre b, pre em { color: #34d399; font-weight: 500; font-style: normal; }
    .proof { border-top: 1px solid #3f3f46; }
    .proof-head, .proof-row { display: grid; grid-template-columns: 1.2fr 1fr 1fr; }
    .proof-cell { padding: 0.95rem 0; border-bottom: 1px solid #27272a; color: #71717a; font-size: 0.8rem; line-height: 1.5; }
    .proof-cell + .proof-cell { padding-left: 1rem; }
    .proof-head .proof-cell { color: #a1a1aa; font-size: 0.72rem; font-weight: 650; }
    .proof-cell.pi { color: #d4d4d8; font-weight: 600; }
    .proof-note { padding-top: 1rem; color: #52525b; font-size: 0.75rem; line-height: 1.6; }

    @media (prefers-color-scheme: light) {
      .scene { background: #f7f7f5; }
      h2, .extension h3 { color: #18181b; }
      .head p, .extension p { color: #52525b; }
      .extension, pre, .proof, .proof-cell { border-color: #d4d4d8; }
      .resources, .proof-head .proof-cell { color: #71717a; }
      .proof-cell { color: #52525b; }
      .proof-cell.pi { color: #27272a; }
      .proof-note { color: #71717a; }
      pre b, pre em { color: #047857; }
    }
    @media (max-width: 850px) { .head, .layout { grid-template-columns: 1fr; gap: 2rem; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .proof { overflow-x: auto; } .proof-head, .proof-row { min-width: 620px; } }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private unsubscribe?: () => void;
  connectedCallback() { super.connectedCallback(); this.unsubscribe = i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); }); }
  disconnectedCallback() { super.disconnectedCallback(); this.unsubscribe?.(); }

  render() {
    const zh = this.locale === "zh-CN";
    const rows = zh ? [
      ["上下文生命周期", "tag / checkout / compact", "会话历史"],
      ["代码定位", "语义 / 精确 / AST", "基础搜索"],
      ["交互表面", "TUI / Web / GAPP", "聊天界面"],
      ["长期记忆", "角色记忆 / 检索 / viewer", "临时提示"],
      ["可观测与分发", "Provider Trace / Gateway RPC", "单一接口"],
    ] : [
      ["Context lifecycle", "tag / checkout / compact", "session history"],
      ["Code location", "semantic / exact / AST", "basic search"],
      ["Interaction surface", "TUI / Web / GAPP", "chat surface"],
      ["Durable memory", "role memory / retrieval / viewer", "temporary prompt"],
      ["Observe & distribute", "Provider Trace / Gateway RPC", "single interface"],
    ];
    return html`
      <section class="scene" id="extensions">
        <div class="inner">
          <div class="head"><h2>${zh ? "扩展，而不是堆功能" : "Extend without feature sprawl"}</h2><p>${zh ? "扩展、Skill、工具、GAPP 和 Provider 都是按任务加载的运行时资源。核心保持小，能力在需要时接入。" : "Extensions, skills, tools, GAPPs, and providers are runtime resources loaded for the task. The core stays small; capability plugs in when needed."}</p></div>
          <div class="layout">
            <div class="extension"><h3>${zh ? "当前工作集" : "Current working set"}</h3><p>${zh ? "常用能力来自项目真实配置，不是固定功能清单。" : "Common capabilities come from the project's real configuration, not a fixed feature checklist."}</p><div class="resources">ace-tool · ast-grep · codemap · diagnose · GAPP · provider-trace · role-persona</div><pre><b>pi</b>.registerTool({
  name: <em>"project_map"</em>,
  execute: async (ctx) => ctx.ui.custom(...)
})</pre></div>
            <div class="proof" id="comparison"><div class="proof-head"><div class="proof-cell">${zh ? "边界" : "Boundary"}</div><div class="proof-cell">Pi</div><div class="proof-cell">${zh ? "常见工具" : "Typical tool"}</div></div>${rows.map(row => html`<div class="proof-row"><div class="proof-cell">${row[0]}</div><div class="proof-cell pi">${row[1]}</div><div class="proof-cell">${row[2]}</div></div>`)}<div class="proof-note">${zh ? "这里比较的是运行时边界，不是模型排行榜。" : "This compares runtime boundaries, not model rankings."}</div></div>
          </div>
        </div>
      </section>
    `;
  }
}
