import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("companion-ecosystem-scene")
export class CompanionEcosystemScene extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
    .scene { padding: 8rem 1.5rem; background: #0c0c0e; border-block: 1px solid #18181b; }
    .inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 0.72fr 1.28fr; gap: 5rem; }
    .intro { align-self: start; position: sticky; top: 7rem; }
    .kicker { color: #71717a; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 1rem; }
    h2 { margin: 0 0 1.25rem; color: #fafafa; font-size: clamp(2.25rem, 4.5vw, 3.7rem); line-height: 1.03; letter-spacing: -0.04em; font-weight: 600; }
    .intro p { margin: 0; color: #71717a; line-height: 1.75; max-width: 44ch; }

    .map { position: relative; border-left: 1px solid #3f3f46; }
    .core { position: absolute; left: 0; top: 50%; transform: translate(-50%, -50%); width: 5.25rem; height: 5.25rem; display: grid; place-items: center; border-radius: 50%; background: #10b981; color: #07110d; font-size: 0.8rem; font-weight: 700; text-align: center; box-shadow: 0 0 0 10px #0c0c0e; z-index: 2; }
    .lane { position: relative; padding: 0 0 3.25rem 4rem; }
    .lane + .lane { padding-top: 3.25rem; border-top: 1px solid #27272a; }
    .lane::before { content: ''; position: absolute; left: 0; top: 2.25rem; width: 2.5rem; border-top: 1px solid #3f3f46; }
    .lane + .lane::before { top: 5.5rem; }
    .lane-meta { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; margin-bottom: 0.85rem; }
    .lane-name { color: #d4d4d8; font: 0.7rem/1 'JetBrains Mono', monospace; letter-spacing: 0.05em; text-transform: uppercase; }
    .lane-role { color: #52525b; font-size: 0.72rem; }
    .lane h3 { margin: 0 0 0.8rem; color: #fafafa; font-size: 1.65rem; font-weight: 600; letter-spacing: -0.02em; }
    .lane p { margin: 0 0 1.25rem; color: #a1a1aa; font-size: 0.92rem; line-height: 1.7; max-width: 62ch; }
    .capabilities { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1.25rem; }
    .cap { padding: 0.35rem 0; margin-right: 0.75rem; color: #71717a; font: 0.67rem/1.2 'JetBrains Mono', monospace; border-bottom: 1px solid #3f3f46; }
    .cap.orange { color: #fb923c; border-color: rgba(249,115,22,0.45); }
    .cap.blue { color: #93c5fd; border-color: rgba(96,165,250,0.45); }
    .links { display: flex; gap: 1rem; flex-wrap: wrap; }
    a { color: #a1a1aa; text-decoration: none; font-size: 0.78rem; font-weight: 600; }
    a:hover { color: #fafafa; }
    a:focus-visible { outline: 2px solid #10b981; outline-offset: 4px; }
    .boundary { margin-top: 3.25rem; padding: 1.25rem 0 0 4rem; border-top: 1px solid #27272a; color: #52525b; font-size: 0.75rem; line-height: 1.65; }
    .boundary strong { color: #a1a1aa; font-weight: 600; }

    @media (prefers-color-scheme: light) {
      .scene { background: #f4f4f5; border-color: #e4e4e7; }
      h2, .lane h3 { color: #18181b; }
      .intro p, .lane p { color: #52525b; }
      .map { border-color: #d4d4d8; }
      .core { box-shadow: 0 0 0 10px #f4f4f5; }
      .lane + .lane, .boundary { border-color: #e4e4e7; }
      .lane::before { border-color: #a1a1aa; }
      .lane-name, .boundary strong { color: #3f3f46; }
      .lane-role, .boundary { color: #71717a; }
      .cap { color: #52525b; border-color: #d4d4d8; }
      .cap.orange { color: #c2410c; border-color: rgba(194,65,12,0.35); }
      .cap.blue { color: #1d4ed8; border-color: rgba(29,78,216,0.3); }
      a { color: #52525b; }
      a:hover { color: #18181b; }
    }

    @media (max-width: 900px) { .inner { grid-template-columns: 1fr; gap: 3rem; } .intro { position: static; } }
    @media (max-width: 640px) { .scene { padding: 5rem 1rem; } .map { margin-left: 1rem; } .core { top: 0; transform: translate(-50%, -35%); width: 4.25rem; height: 4.25rem; } .lane { padding-left: 2.5rem; } .lane::before { width: 1.5rem; } .boundary { padding-left: 2.5rem; } }
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
          <div class="intro">
            <div class="kicker">COMPANION ECOSYSTEM</div>
            <h2>${zh ? "核心保持单一，边界向外延伸" : "One core. Clear extensions around it."}</h2>
            <p>${zh ? "Pi 仍然是 Agent Runtime。配套产品只在明确边界上增强它：一个负责终端交互，一个负责跨会话连续性。" : "Pi remains the agent runtime. Companion products extend it only at explicit boundaries: one owns terminal interaction, the other owns cross-session continuity."}</p>
          </div>

          <div class="map">
            <div class="core">Pi<br>Core</div>

            <article class="lane">
              <div class="lane-meta"><span class="lane-name">grok-pi-tui</span><span class="lane-role">${zh ? "交互面" : "interaction surface"}</span></div>
              <h3>${zh ? "把 Pi 投射到 Grok Build 原生 Pager" : "Project Pi into Grok Build's native Pager"}</h3>
              <p>${zh ? "Pi 保留模型、Provider、工具、扩展、Skill、Session 与执行；Grok Pager 成为唯一终端 UI。Remote TUI bridge 只连接能力，不再制造第二套界面。" : "Pi keeps models, providers, tools, extensions, skills, sessions, and execution; Grok Pager becomes the only terminal UI. The Remote TUI bridge connects capabilities without inventing a second interface."}</p>
              <div class="capabilities"><span class="cap orange">Pager</span><span class="cap">ACP</span><span class="cap">JSONL RPC</span><span class="cap">Tool cards</span><span class="cap">Diffs</span><span class="cap">Dialogs</span></div>
              <div class="links"><a href="https://github.com/Dwsy/grok-pi-tui" target="_blank" rel="noopener">GitHub ↗</a><a href="https://dwsy.github.io/grok-pi-tui/" target="_blank" rel="noopener">${zh ? "项目主页 ↗" : "Project site ↗"}</a></div>
            </article>

            <article class="lane">
              <div class="lane-meta"><span class="lane-name">pi-session-manager</span><span class="lane-role">${zh ? "连续性层" : "continuity layer"}</span></div>
              <h3>${zh ? "把 Agent 留下的 Session 变成工程资产" : "Turn agent sessions into engineering artifacts"}</h3>
              <p>${zh ? "本地索引 Pi 与其他 coding agent 的历史，重建树、Branch Atlas、Tool Trace 和 compaction context，再通过搜索、Kanban、resume / convert / export 把工作继续下去。" : "Index Pi and other coding-agent histories locally, reconstruct trees, Branch Atlas, tool traces, and compaction context, then continue work through search, Kanban, resume / convert / export."}</p>
              <div class="capabilities"><span class="cap blue">local-first</span><span class="cap">Pi</span><span class="cap">Claude Code</span><span class="cap">Codex</span><span class="cap">Gemini CLI</span><span class="cap">Cursor</span><span class="cap">Antigravity</span></div>
              <div class="links"><a href="https://github.com/Dwsy/pi-session-manager" target="_blank" rel="noopener">GitHub ↗</a><a href="https://dwsy.github.io/pi-session-manager/" target="_blank" rel="noopener">${zh ? "文档 / Demo ↗" : "Docs / demo ↗"}</a></div>
            </article>

            <div class="boundary"><strong>${zh ? "边界原则：" : "Boundary principle: "}</strong>${zh ? "grok-pi-tui 不接管 Agent Runtime；Pi Session Manager 不变成 Agent GUI。两者都围绕 Pi 工作，而不是把 Pi 包进新的黑盒。" : "grok-pi-tui does not take over the agent runtime; Pi Session Manager does not become an agent GUI. Both work around Pi instead of wrapping it in a new black box."}</div>
          </div>
        </div>
      </section>
    `;
  }
}
