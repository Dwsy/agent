import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("workflow-section")
export class WorkflowSection extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .workflow-section {
      padding: 5rem 1.5rem;
      background: #0F172A;
    }

    .section-header {
      text-align: center;
      margin-bottom: 4rem;
    }

    .section-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 700;
      color: #F1F5F9;
      margin-bottom: 1rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .section-subtitle {
      font-size: 1.125rem;
      color: #94A3B8;
      max-width: 2xl;
      margin: 0 auto;
      font-family: "DM Sans", sans-serif;
    }

    .workflow-flow {
      max-width: 4xl;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .workflow-phase {
      display: flex;
      gap: 1.5rem;
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 1rem;
      padding: 1.5rem;
      transition: all 0.2s ease-out;
    }

    .workflow-phase:hover {
      border-color: rgba(96, 165, 250, 0.5);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }

    .phase-number {
      flex-shrink: 0;
      width: 3.5rem;
      height: 3.5rem;
      background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
      border-radius: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 700;
      color: white;
      font-family: "Space Grotesk", sans-serif;
    }

    .phase-content {
      flex: 1;
    }

    .phase-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 0.5rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .phase-description {
      color: #94A3B8;
      line-height: 1.6;
      margin-bottom: 0.75rem;
      font-family: "DM Sans", sans-serif;
    }

    .phase-tool {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.375rem 0.75rem;
      background: rgba(59, 130, 246, 0.15);
      border-radius: 0.375rem;
      font-size: 0.8rem;
      font-weight: 500;
      color: #60A5FA;
      font-family: "DM Sans", sans-serif;
    }

    .commands-box {
      max-width: 5xl;
      margin: 4rem auto 0;
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 1rem;
      padding: 2rem;
    }

    .commands-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #F1F5F9;
      margin-bottom: 1.5rem;
      font-family: "Space Grotesk", sans-serif;
    }

    .command-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 0;
      border-bottom: 1px solid rgba(51, 65, 85, 0.3);
    }

    .command-item:last-child {
      border-bottom: none;
    }

    .command-code {
      background: rgba(15, 23, 42, 0.8);
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-family: "JetBrains Mono", monospace;
      font-size: 0.9rem;
      color: #60A5FA;
      min-width: fit-content;
    }

    .command-description {
      color: #94A3B8;
      font-family: "DM Sans", sans-serif;
    }

    @media (max-width: 768px) {
      .workflow-section {
        padding: 3rem 1rem;
      }

      .workflow-phase {
        flex-direction: column;
      }

      .phase-number {
        width: 3rem;
        height: 3rem;
        font-size: 1.25rem;
      }

      .commands-box {
        padding: 1.5rem;
      }

      .command-item {
        flex-direction: column;
        align-items: flex-start;
      }

      .command-code {
        width: 100%;
      }
    }
  `;

  @state()
  locale: Locale = i18n.getCurrentLocale();

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => {
      this.locale = i18n.getCurrentLocale();
      this.requestUpdate();
    });
  }

  render() {
    const f = i18n.t.bind(i18n);

    return html`
      <section class="workflow-section" id="workflow">
        <div class="section-header">
          <p class="section-label">${f("workflow.label")}</p>
          <h2 class="section-title">${f("workflow.title")}</h2>
          <p class="section-subtitle">${f("workflow.subtitle")}</p>
        </div>

        <div class="workflow-flow">
          <div class="workflow-phase">
            <div class="phase-number">1</div>
            <div class="phase-content">
              <h3 class="phase-title">${f("workflow.phases.phase1.title")}</h3>
              <p class="phase-description">${f("workflow.phases.phase1.description")}</p>
              <span class="phase-tool">${f("workflow.phases.phase1.tool")}</span>
            </div>
          </div>

          <div class="workflow-phase">
            <div class="phase-number">2</div>
            <div class="phase-content">
              <h3 class="phase-title">${f("workflow.phases.phase2.title")}</h3>
              <p class="phase-description">${f("workflow.phases.phase2.description")}</p>
              <span class="phase-tool">${f("workflow.phases.phase2.tool")}</span>
            </div>
          </div>

          <div class="workflow-phase">
            <div class="phase-number">3</div>
            <div class="phase-content">
              <h3 class="phase-title">${f("workflow.phases.phase3.title")}</h3>
              <p class="phase-description">${f("workflow.phases.phase3.description")}</p>
              <span class="phase-tool">${f("workflow.phases.phase3.tool")}</span>
            </div>
          </div>

          <div class="workflow-phase">
            <div class="phase-number">4</div>
            <div class="phase-content">
              <h3 class="phase-title">${f("workflow.phases.phase4.title")}</h3>
              <p class="phase-description">${f("workflow.phases.phase4.description")}</p>
              <span class="phase-tool">${f("workflow.phases.phase4.tool")}</span>
            </div>
          </div>

          <div class="workflow-phase">
            <div class="phase-number">5</div>
            <div class="phase-content">
              <h3 class="phase-title">${f("workflow.phases.phase5.title")}</h3>
              <p class="phase-description">${f("workflow.phases.phase5.description")}</p>
              <span class="phase-tool">${f("workflow.phases.phase5.tool")}</span>
            </div>
          </div>
        </div>

        <div class="commands-box">
          <h3 class="commands-title">${f("workflow.commands.title")}</h3>
          <div class="command-item">
            <code class="command-code">/scout</code>
            <span class="command-description">${f("workflow.commands.scout")}</span>
          </div>
          <div class="command-item">
            <code class="command-code">/analyze</code>
            <span class="command-description">${f("workflow.commands.analyze")}</span>
          </div>
          <div class="command-item">
            <code class="command-code">/brainstorm</code>
            <span class="command-description">${f("workflow.commands.brainstorm")}</span>
          </div>
          <div class="command-item">
            <code class="command-code">/research</code>
            <span class="command-description">${f("workflow.commands.research")}</span>
          </div>
        </div>
      </section>
    `;
  }
}
