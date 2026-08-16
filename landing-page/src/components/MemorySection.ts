import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Context + Memory Section
 * Session context: tag / checkout / compact
 * Role memory: workspace mapping + vector recall + viewer
 * Promotion path: daily → pending → consolidated / knowledge
 */
@customElement("memory-section")
export class MemorySection extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }

    .section {
      padding: 8rem 1.5rem;
      background: #0c0c0e;
      position: relative;
      overflow: hidden;
    }

    .inner { max-width: 1200px; margin: 0 auto; position: relative; z-index: 1; }

    .header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      margin-bottom: 5rem;
      align-items: end;
    }

    .header-left { max-width: 480px; }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #a855f7;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .label::before {
      content: '';
      width: 24px;
      height: 1px;
      background: #a855f7;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.05;
      margin-bottom: 1.25rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    /* Memory Stack Visualization */
    .memory-stack {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      position: relative;
    }

    .memory-layer {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 1.75rem;
      position: relative;
      overflow: hidden;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .memory-layer:hover {
      transform: translateY(-8px);
      border-color: #a855f7;
      box-shadow: 0 20px 60px -20px rgba(168, 85, 247, 0.2);
    }

    .layer-badge {
      position: absolute;
      top: 1rem;
      right: 1rem;
      padding: 0.25rem 0.625rem;
      background: rgba(168, 85, 247, 0.1);
      border: 1px solid rgba(168, 85, 247, 0.2);
      border-radius: 0.375rem;
      font-size: 0.6875rem;
      font-weight: 600;
      color: #a855f7;
      font-family: 'JetBrains Mono', monospace;
    }

    .layer-icon {
      width: 3rem;
      height: 3rem;
      border-radius: 0.875rem;
      background: rgba(168, 85, 247, 0.1);
      display: grid;
      place-items: center;
      font-size: 1.25rem;
      margin-bottom: 1.25rem;
    }

    .layer-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 0.5rem;
    }

    .layer-desc {
      font-size: 0.875rem;
      color: #71717a;
      line-height: 1.6;
      margin-bottom: 1.25rem;
    }

    .layer-tech {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
    }

    .tech-tag {
      padding: 0.25rem 0.5rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid #27272a;
      border-radius: 0.25rem;
      font-size: 0.6875rem;
      color: #a1a1aa;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Animated Data Flow */
    .data-flow {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }

    .flow-line {
      position: absolute;
      height: 1px;
      background: linear-gradient(90deg, transparent, #a855f7, transparent);
      opacity: 0.3;
      animation: flow 3s linear infinite;
    }

    .flow-line:nth-child(1) { top: 30%; left: 0; width: 100%; animation-delay: 0s; }
    .flow-line:nth-child(2) { top: 50%; left: 0; width: 100%; animation-delay: 1s; }
    .flow-line:nth-child(3) { top: 70%; left: 0; width: 100%; animation-delay: 2s; }

    @keyframes flow {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    /* Memory Particles */
    .particle {
      position: absolute;
      width: 4px;
      height: 4px;
      background: #a855f7;
      border-radius: 50%;
      opacity: 0.4;
      animation: float-particle 8s ease-in-out infinite;
    }

    @keyframes float-particle {
      0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
      50% { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
    }

    /* Vector Search Demo */
    .vector-demo {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #0c0c0e;
      border-radius: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
    }

    .vector-query {
      color: #a855f7;
      margin-bottom: 0.5rem;
    }

    .vector-result {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.375rem 0;
      color: #a1a1aa;
    }

    .similarity-bar {
      width: 60px;
      height: 3px;
      background: #27272a;
      border-radius: 2px;
      overflow: hidden;
    }

    .similarity-fill {
      height: 100%;
      background: linear-gradient(90deg, #a855f7, #c084fc);
      border-radius: 2px;
      animation: fill-bar 2s ease-out forwards;
    }

    @keyframes fill-bar {
      from { width: 0; }
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .header { grid-template-columns: 1fr; gap: 2rem; }
      .memory-stack { grid-template-columns: 1fr; }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  private _unsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this._unsub = i18n.subscribe(() => {
      this.locale = i18n.getCurrentLocale();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
  }

  render() {
    const isZh = i18n.getCurrentLocale() === 'zh-CN';

    return html`
      <section class="section" id="memory">
        <div class="data-flow">
          <div class="flow-line"></div>
          <div class="flow-line"></div>
          <div class="flow-line"></div>
        </div>

        <div class="inner">
          <div class="header">
            <div class="header-left">
              <span class="label">${isZh ? '上下文与记忆' : 'Context + Memory'}</span>
              <h2 class="title">${isZh ? '会话可恢复，经验可沉淀' : 'Recover sessions. Accumulate knowledge.'}</h2>
              <p class="subtitle">${isZh 
                ? 'Pi 把短期上下文管理和长期角色记忆分开：会话用 tag / checkout / compact 控制，经验沿 daily → pending → consolidated / knowledge 逐步沉淀。'
                : 'Pi separates short-term context control from durable role memory: tag / checkout / compact for sessions, and daily → pending → consolidated / knowledge for promoted experience.'}</p>
            </div>
          </div>

          <div class="memory-stack">
            <!-- Session Context -->
            <div class="memory-layer">
              <span class="layer-badge">CTX</span>
              <div class="layer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg></div>
              <h3 class="layer-title">${isZh ? '会话上下文' : 'Session Context'}</h3>
              <p class="layer-desc">${isZh 
                ? '像 Git 一样给关键上下文打 tag、查看历史、checkout 语义节点，并在长会话中结构化 compact。'
                : 'Treat context like Git: tag important states, inspect history, checkout semantic points, and compact long sessions without losing the handoff.'}</p>
              <div class="layer-tech">
                <span class="tech-tag">tag</span>
                <span class="tech-tag">checkout</span>
                <span class="tech-tag">compact</span>
              </div>
              <div class="vector-demo">
                <div class="vector-query">context log --recent</div>
                <div class="vector-result" style="color: #52525b;">release-ready · verified</div>
                <div class="vector-result" style="color: #52525b;">root-cause · callers mapped</div>
              </div>
            </div>

            <!-- Role Memory -->
            <div class="memory-layer">
              <span class="layer-badge">ROLE</span>
              <div class="layer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
              <h3 class="layer-title">${isZh ? '角色记忆' : 'Role Memory'}</h3>
              <p class="layer-desc">${isZh 
                ? '工作目录自动映射角色；identity、约束、工具偏好与记忆按角色隔离，支持向量召回和独立 viewer。'
                : 'Workspace paths map to roles automatically; identity, constraints, tool habits, and memory stay role-scoped with vector recall and a dedicated viewer.'}</p>
              <div class="layer-tech">
                <span class="tech-tag">Role Mapping</span>
                <span class="tech-tag">LanceDB</span>
                <span class="tech-tag">Viewer</span>
              </div>
              <div class="vector-demo">
                <div class="vector-query">memory.search("deployment")</div>
                <div class="vector-result" style="color: #52525b;">role → global → project knowledge</div>
                <div class="vector-result" style="color: #52525b;">private context stays role-scoped</div>
              </div>
            </div>

            <!-- Knowledge Promotion -->
            <div class="memory-layer">
              <span class="layer-badge">KB</span>
              <div class="layer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
              <h3 class="layer-title">${isZh ? '知识晋升' : 'Knowledge Promotion'}</h3>
              <p class="layer-desc">${isZh 
                ? '会话残留先进入 daily，候选经验进入 pending，稳定规则再晋升为 consolidated 指针或共享 knowledge。'
                : 'Session residue lands in daily, candidates move through pending, and stable rules promote into consolidated pointers or shared knowledge.'}</p>
              <div class="layer-tech">
                <span class="tech-tag">daily</span>
                <span class="tech-tag">pending</span>
                <span class="tech-tag">knowledge</span>
              </div>
              <div class="vector-demo">
                <div class="vector-query">daily → pending → knowledge</div>
                <div class="vector-result" style="color: #52525b;">one rule · one pointer · reusable body</div>
                <div class="vector-result" style="color: #52525b;">noise stays out of durable memory</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}
