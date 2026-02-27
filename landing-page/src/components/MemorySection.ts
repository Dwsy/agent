import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Memory System Section - Visualizing the 3-Layer Memory Stack
 * L3: Runtime (memoryLog + vector + tag)
 * L2: Consolidated (structured markdown)
 * L1: Daily (raw logs)
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
              <span class="label">${isZh ? '记忆架构' : 'Memory System'}</span>
              <h2 class="title">${isZh ? '三层记忆栈' : '3-Layer Memory Stack'}</h2>
              <p class="subtitle">${isZh 
                ? 'L3 运行时向量检索 + L2 结构化合并 + L1 原始日志。记忆塑造智能。' 
                : 'L3 runtime vector search + L2 structured consolidation + L1 raw logs. Memory shapes intelligence.'}</p>
            </div>
          </div>

          <div class="memory-stack">
            <!-- L3: Runtime -->
            <div class="memory-layer">
              <span class="layer-badge">L3</span>
              <div class="layer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg></div>
              <h3 class="layer-title">${isZh ? '运行时记忆' : 'Runtime Memory'}</h3>
              <p class="layer-desc">${isZh 
                ? '实时向量检索、标签索引、每日日志。毫秒级语义搜索。' 
                : 'Real-time vector retrieval, tag indexing, daily logs. Millisecond semantic search.'}</p>
              <div class="layer-tech">
                <span class="tech-tag">LanceDB</span>
                <span class="tech-tag">768-dim</span>
                <span class="tech-tag">BM25</span>
              </div>
              <div class="vector-demo">
                <div class="vector-query">> query: "auth patterns"</div>
                <div class="vector-result">
                  <span>auth.ts</span>
                  <div class="similarity-bar"><div class="similarity-fill" style="width: 94%"></div></div>
                  <span>0.94</span>
                </div>
                <div class="vector-result">
                  <span>middleware.ts</span>
                  <div class="similarity-bar"><div class="similarity-fill" style="width: 87%"></div></div>
                  <span>0.87</span>
                </div>
              </div>
            </div>

            <!-- L2: Consolidated -->
            <div class="memory-layer">
              <span class="layer-badge">L2</span>
              <div class="layer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
              <h3 class="layer-title">${isZh ? '结构化记忆' : 'Consolidated Memory'}</h3>
              <p class="layer-desc">${isZh 
                ? '自动提取关键经验，去重降噪，合并为持久知识。跨会话可用。' 
                : 'Auto-extract key learnings, dedupe noise, merge into persistent knowledge. Cross-session durable.'}</p>
              <div class="layer-tech">
                <span class="tech-tag">Markdown</span>
                <span class="tech-tag">LLM Extraction</span>
                <span class="tech-tag">7-day Cycle</span>
              </div>
              <div class="vector-demo">
                <div class="vector-query"># Learnings (High Priority)</div>
                <div class="vector-result" style="color: #52525b;">- [3x] Retrieve before modify</div>
                <div class="vector-result" style="color: #52525b;">- [3x] Unified Diff protocol</div>
              </div>
            </div>

            <!-- L1: Daily -->
            <div class="memory-layer">
              <span class="layer-badge">L1</span>
              <div class="layer-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
              <h3 class="layer-title">${isZh ? '原始日志' : 'Raw Logs'}</h3>
              <p class="layer-desc">${isZh 
                ? '每日完整会话记录，原始思考链，失败经验。回溯的根基。' 
                : 'Daily complete session transcripts, raw thought chains, failures. Foundation for recall.'}</p>
              <div class="layer-tech">
                <span class="tech-tag">Daily.md</span>
                <span class="tech-tag">JSONL</span>
                <span class="tech-tag">Immutable</span>
              </div>
              <div class="vector-demo">
                <div class="vector-query">2026-02-24.md</div>
                <div class="vector-result" style="color: #52525b;">- [14:32] Context retrieval</div>
                <div class="vector-result" style="color: #52525b;">- [15:45] Subagent dispatch</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}
