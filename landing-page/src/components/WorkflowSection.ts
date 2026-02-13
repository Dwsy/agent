import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("workflow-section")
export class WorkflowSection extends LitElement {
  static styles = css`
    :host { display: block; }

    .workflow-section {
      padding: 6rem 1.5rem;
      background: #0F172A;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.75rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.01em;
    }

    .section-subtitle {
      font-size: 1.05rem;
      color: #94A3B8;
      max-width: 36rem;
      margin: 0 auto;
      font-family: "DM Sans", sans-serif;
    }

    /* Timeline layout */
    .workflow-timeline {
      max-width: 48rem;
      margin: 0 auto;
      position: relative;
    }

    /* Vertical connector line */
    .workflow-timeline::before {
      content: "";
      position: absolute;
      left: 1.75rem;
      top: 0;
      bottom: 0;
      width: 2px;
      background: linear-gradient(180deg, #2563EB 0%, #8B5CF6 50%, #22C55E 100%);
      opacity: 0.3;
    }

    .phase-item {
      display: flex;
      gap: 1.5rem;
      padding-bottom: 1.5rem;
      position: relative;
    }

    .phase-item:last-child { padding-bottom: 0; }

    .phase-marker {
      flex-shrink: 0;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      font-weight: 700;
      color: white;
      font-family: "Space Grotesk", sans-serif;
      position: relative;
      z-index: 1;
    }

    .phase-1 { background: linear-gradient(135deg, #2563EB, #3B82F6); }
    .phase-2 { background: linear-gradient(135deg, #7C3AED, #8B5CF6); }
    .phase-3 { background: linear-gradient(135deg, #D97706, #F59E0B); }
    .phase-4 { background: linear-gradient(135deg, #059669, #10B981); }
    .phase-5 { background: linear-gradient(135deg, #DC2626, #EF4444); }

    .phase-body {
      flex: 1;
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      transition: border-color 0.2s;
    }

    .phase-body:hover {
      border-color: rgba(96, 165, 250, 0.4);
    }

    .phase-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .phase-title {
      font-size: 1.05rem;
      font-weight: 600;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
    }

    .phase-tool {
      padding: 0.25rem 0.625rem;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
      color: #60A5FA;
      font-family: "JetBrains Mono", monospace;
    }

    .phase-description {
      color: #94A3B8;
      font-size: 0.875rem;
      line-height: 1.65;
      font-family: "DM Sans", sans-serif;
    }

    /* Complexity routing */
    .complexity-box {
      max-width: 48rem;
      margin: 3.5rem auto 0;
      background: rgba(30, 41, 59, 0.35);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 1.75rem;
    }

    .complexity-title {
      font-size: 1.05rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 1.25rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .complexity-levels {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
    }

    .level-item {
      padding: 0.75rem;
      background: rgba(15, 23, 42, 0.5);
      border-radius: 0.5rem;
      border-left: 3px solid;
    }

    .level-l1 { border-color: #22C55E; }
    .level-l2 { border-color: #F59E0B; }
    .level-l3 { border-color: #F97316; }
    .level-l4 { border-color: #EF4444; }

    .level-text {
      font-size: 0.8rem;
      color: #94A3B8;
      line-height: 1.5;
      font-family: "DM Sans", sans-serif;
    }

    /* Commands */
    .commands-box {
      max-width: 48rem;
      margin: 1.5rem auto 0;
      background: rgba(30, 41, 59, 0.35);
      border: 1px solid rgba(51, 65, 85, 0.4);
      border-radius: 1rem;
      padding: 1.75rem;
    }

    .commands-title {
      font-size: 1.05rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .command-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0;
      border-bottom: 1px solid rgba(51, 65, 85, 0.2);
    }

    .command-row:last-child { border-bottom: none; }

    .command-code {
      background: rgba(15, 23, 42, 0.8);
      padding: 0.375rem 0.625rem;
      border-radius: 0.25rem;
      font-family: "JetBrains Mono", monospace;
      font-size: 0.8rem;
      color: #60A5FA;
      min-width: 7rem;
    }

    .command-desc {
      color: #94A3B8;
      font-size: 0.875rem;
      font-family: "DM Sans", sans-serif;
    }

    @media (max-width: 768px) {
      .workflow-section { padding: 3.5rem 1rem; }
      .workflow-timeline::before { left: 1.25rem; }
      .phase-marker { width: 2.5rem; height: 2.5rem; font-size: 1rem; }
      .complexity-levels { grid-template-columns: repeat(2, 1fr); }
      .command-row { flex-direction: column; align-items: flex-start; }
    }

    @media (max-width: 480px) {
      .complexity-levels { grid-template-columns: 1fr; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  render() {
    const f = i18n.t.bind(i18n);
    const phases = [1, 2, 3, 4, 5];

    return html`
      <section class="workflow-section" id="workflow">
        <div class="section-header">
          <p class="section-label">${f("workflow.label")}</p>
          <h2 class="section-title">${f("workflow.title")}</h2>
          <p class="section-subtitle">${f("workflow.subtitle")}</p>
        </div>

        <div class="workflow-timeline">
          ${phases.map(n => html`
            <div class="phase-item">
              <div class="phase-marker phase-${n}">${n}</div>
              <div class="phase-body">
                <div class="phase-header">
                  <h3 class="phase-title">${f(`workflow.phases.phase${n}.title`)}</h3>
                  <span class="phase-tool">${f(`workflow.phases.phase${n}.tool`)}</span>
                </div>
                <p class="phase-description">${f(`workflow.phases.phase${n}.description`)}</p>
              </div>
            </div>
          `)}
        </div>

        <div class="complexity-box">
          <h3 class="complexity-title">${f("workflow.complexity.title")}</h3>
          <div class="complexity-levels">
            <div class="level-item level-l1"><span class="level-text">${f("workflow.complexity.l1")}</span></div>
            <div class="level-item level-l2"><span class="level-text">${f("workflow.complexity.l2")}</span></div>
            <div class="level-item level-l3"><span class="level-text">${f("workflow.complexity.l3")}</span></div>
            <div class="level-item level-l4"><span class="level-text">${f("workflow.complexity.l4")}</span></div>
          </div>
        </div>

        <div class="commands-box">
          <h3 class="commands-title">${f("workflow.commands.title")}</h3>
          <div class="command-row">
            <code class="command-code">/scout</code>
            <span class="command-desc">${f("workflow.commands.scout")}</span>
          </div>
          <div class="command-row">
            <code class="command-code">/analyze</code>
            <span class="command-desc">${f("workflow.commands.analyze")}</span>
          </div>
          <div class="command-row">
            <code class="command-code">/brainstorm</code>
            <span class="command-desc">${f("workflow.commands.brainstorm")}</span>
          </div>
          <div class="command-row">
            <code class="command-code">/research</code>
            <span class="command-desc">${f("workflow.commands.research")}</span>
          </div>
        </div>
      </section>
    `;
  }
}
