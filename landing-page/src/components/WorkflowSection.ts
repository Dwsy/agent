import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("workflow-section")
export class WorkflowSection extends LitElement {
  static styles = css`
    :host { display: block; }

    .workflow-section {
      padding: 6rem 1.5rem;
      background: #0A0F1E;
    }

    .section-header { text-align: center; margin-bottom: 4rem; }
    .section-label { font-size: 0.8rem; font-weight: 600; color: #60A5FA; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; font-family: "Space Grotesk", sans-serif; }
    .section-title { font-size: clamp(2rem, 4vw, 3rem); font-weight: 700; color: #F1F5F9; margin-bottom: 1rem; font-family: "Space Grotesk", sans-serif; letter-spacing: -0.01em; }
    .section-subtitle { font-size: 1.05rem; color: #94A3B8; max-width: 36rem; margin: 0 auto; font-family: "DM Sans", sans-serif; }

    /* Timeline */
    .timeline {
      max-width: 48rem;
      margin: 0 auto;
      position: relative;
    }

    .timeline::before {
      content: "";
      position: absolute;
      left: 1.5rem;
      top: 0;
      bottom: 0;
      width: 2px;
      background: linear-gradient(180deg, #2563EB 0%, #8B5CF6 50%, #22C55E 100%);
      opacity: 0.35;
    }

    .phase {
      display: flex;
      gap: 1.5rem;
      padding-bottom: 1.75rem;
      position: relative;
      opacity: 0;
      transform: translateY(24px);
      transition: opacity 0.5s ease-out, transform 0.5s ease-out;
    }

    .phase.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .phase:last-child { padding-bottom: 0; }

    /* Numbered circle with gradient border */
    .phase-num { flex-shrink: 0; width: 3rem; height: 3rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 700; color: #F1F5F9; font-family: "Space Grotesk", sans-serif; position: relative; z-index: 1; background: #0A0F1E; }
    .phase-num::before { content: ""; position: absolute; inset: -2px; border-radius: 50%; z-index: -1; }
    .p1 .phase-num::before { background: linear-gradient(135deg, #2563EB, #3B82F6); }
    .p2 .phase-num::before { background: linear-gradient(135deg, #7C3AED, #8B5CF6); }
    .p3 .phase-num::before { background: linear-gradient(135deg, #D97706, #F59E0B); }
    .p4 .phase-num::before { background: linear-gradient(135deg, #059669, #10B981); }
    .p5 .phase-num::before { background: linear-gradient(135deg, #DC2626, #EF4444); }

    .phase-card { flex: 1; background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(51, 65, 85, 0.4); border-radius: 0.75rem; padding: 1.25rem 1.5rem; transition: border-color 0.2s; }
    .phase-card:hover { border-color: rgba(96, 165, 250, 0.4); }
    .phase-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem; }
    .phase-title { font-size: 1.05rem; font-weight: 600; color: #F1F5F9; font-family: "Space Grotesk", sans-serif; }
    .phase-tool { padding: 0.25rem 0.625rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 0.25rem; font-size: 0.7rem; font-weight: 500; color: #60A5FA; font-family: "JetBrains Mono", monospace; white-space: nowrap; }
    .phase-desc { color: #94A3B8; font-size: 0.875rem; line-height: 1.65; font-family: "DM Sans", sans-serif; }

    /* Complexity routing */
    .complexity { max-width: 48rem; margin: 3.5rem auto 0; background: rgba(30, 41, 59, 0.35); border: 1px solid rgba(51, 65, 85, 0.4); border-radius: 1rem; padding: 1.75rem; opacity: 0; transform: translateY(24px); transition: opacity 0.5s ease-out, transform 0.5s ease-out; }
    .complexity.visible { opacity: 1; transform: translateY(0); }
    .complexity-title { font-size: 1.05rem; font-weight: 600; color: #F1F5F9; margin-bottom: 1.25rem; font-family: "Space Grotesk", sans-serif; }

    .levels {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .level { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; background: rgba(15, 23, 42, 0.5); border-radius: 0.5rem; position: relative; overflow: hidden; }
    .level::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
    .level-l1::before { background: #22C55E; }
    .level-l2::before { background: #F59E0B; }
    .level-l3::before { background: #F97316; }
    .level-l4::before { background: #EF4444; }
    .level-label { font-size: 0.8rem; font-weight: 700; font-family: "Space Grotesk", sans-serif; min-width: 5.5rem; flex-shrink: 0; }
    .level-l1 .level-label { color: #4ADE80; }
    .level-l2 .level-label { color: #FBBF24; }
    .level-l3 .level-label { color: #FB923C; }
    .level-l4 .level-label { color: #F87171; }
    .level-desc { font-size: 0.8rem; color: #94A3B8; font-family: "DM Sans", sans-serif; line-height: 1.4; }
    .level-bar { margin-left: auto; width: 4rem; height: 4px; border-radius: 2px; background: rgba(51, 65, 85, 0.4); flex-shrink: 0; overflow: hidden; }
    .level-bar-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease-out; }
    .level-l1 .level-bar-fill { background: #22C55E; width: 25%; }
    .level-l2 .level-bar-fill { background: #F59E0B; width: 50%; }
    .level-l3 .level-bar-fill { background: #F97316; width: 75%; }
    .level-l4 .level-bar-fill { background: #EF4444; width: 100%; }

    @media (prefers-reduced-motion: reduce) {
      .phase, .complexity { opacity: 1; transform: none; transition: none; }
      .phase-card { transition: none; }
    }

    @media (max-width: 768px) {
      .workflow-section { padding: 3.5rem 1rem; }
      .timeline::before { left: 1.125rem; }
      .phase-num { width: 2.25rem; height: 2.25rem; font-size: 0.9rem; }
      .phase { gap: 1rem; }
      .level { flex-wrap: wrap; gap: 0.5rem; }
      .level-bar { width: 100%; margin-left: 0; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();
  private observer?: IntersectionObserver;

  connectedCallback() {
    super.connectedCallback();
    i18n.subscribe(() => { this.locale = i18n.getCurrentLocale(); this.requestUpdate(); });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.observer?.disconnect();
  }

  protected firstUpdated() {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const el = e.target as HTMLElement;
            const delay = parseInt(el.dataset.delay || "0", 10);
            setTimeout(() => el.classList.add("visible"), delay);
            this.observer!.unobserve(el);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    const items = this.renderRoot.querySelectorAll(".phase, .complexity");
    items.forEach((el, i) => {
      (el as HTMLElement).dataset.delay = String(i * 100);
      this.observer!.observe(el);
    });
  }

  render() {
    const f = i18n.t.bind(i18n);
    const phases = [1, 2, 3, 4, 5] as const;
    const levels = ["l1", "l2", "l3", "l4"] as const;

    return html`
      <section class="workflow-section" id="workflow">
        <div class="section-header">
          <p class="section-label">${f("workflow.label")}</p>
          <h2 class="section-title">${f("workflow.title")}</h2>
          <p class="section-subtitle">${f("workflow.subtitle")}</p>
        </div>

        <div class="timeline">
          ${phases.map(n => html`
            <div class="phase p${n}">
              <div class="phase-num">${n}</div>
              <div class="phase-card">
                <div class="phase-head">
                  <h3 class="phase-title">${f(`workflow.phases.phase${n}.title`)}</h3>
                  <span class="phase-tool">${f(`workflow.phases.phase${n}.tool`)}</span>
                </div>
                <p class="phase-desc">${f(`workflow.phases.phase${n}.description`)}</p>
              </div>
            </div>
          `)}
        </div>

        <div class="complexity">
          <h3 class="complexity-title">${f("workflow.complexity.title")}</h3>
          <div class="levels">
            ${levels.map(l => html`
              <div class="level level-${l}">
                <span class="level-label">${f(`workflow.complexity.${l}.label`)}</span>
                <span class="level-desc">${f(`workflow.complexity.${l}.desc`)}</span>
                <div class="level-bar"><div class="level-bar-fill"></div></div>
              </div>
            `)}
          </div>
        </div>
      </section>
    `;
  }
}
