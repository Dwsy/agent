import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Extensions Section - Rich Extension Ecosystem Showcase
 * DESIGN_VARIANCE: 8 | MOTION_INTENSITY: 7 | VISUAL_DENSITY: 5
 */
@customElement("extensions-section")
export class ExtensionsSection extends LitElement {
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
      margin-bottom: 4rem;
      max-width: 600px;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #f59e0b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
    }

    .label::before {
      content: '';
      width: 24px;
      height: 1px;
      background: #f59e0b;
    }

    .title {
      font-size: clamp(2rem, 4vw, 3rem);
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.02em;
      line-height: 1.05;
      margin-bottom: 1rem;
    }

    .subtitle {
      font-size: 1.0625rem;
      color: #71717a;
      line-height: 1.7;
    }

    /* Stats Bar */
    .stats-bar {
      display: flex;
      gap: 3rem;
      padding: 1.5rem 2rem;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      margin-bottom: 3rem;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #fafafa;
      font-family: 'JetBrains Mono', monospace;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* Extension Categories Grid */
    .categories {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .category {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      padding: 1.75rem;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      overflow: hidden;
    }

    .category::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .category:hover {
      transform: translateY(-4px);
      border-color: var(--accent);
    }

    .category:hover::before {
      opacity: 1;
    }

    .category:nth-child(1) { --accent: #10b981; }
    .category:nth-child(2) { --accent: #3b82f6; }
    .category:nth-child(3) { --accent: #f59e0b; }

    .category-header {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      margin-bottom: 1.25rem;
    }

    .category-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.625rem;
      display: grid;
      place-items: center;
      font-size: 1.125rem;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.05);
      color: var(--accent);
    }

    .category-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #fafafa;
    }

    .category-count {
      margin-left: auto;
      padding: 0.25rem 0.625rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 0.375rem;
      font-size: 0.75rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
    }

    .category-desc {
      font-size: 0.875rem;
      color: #71717a;
      line-height: 1.6;
      margin-bottom: 1.25rem;
    }

    /* Extension List */
    .ext-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .ext-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0.875rem;
      background: rgba(255, 255, 255, 0.02);
      border-radius: 0.5rem;
      font-size: 0.8125rem;
      color: #a1a1aa;
      transition: all 0.2s;
      cursor: pointer;
    }

    .ext-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #fafafa;
    }

    .ext-status {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      animation: pulse-dot 2s ease-in-out infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
      50% { opacity: 0.8; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0); }
    }

    /* Code Demo Section */
    .code-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .code-panel {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.25rem;
      overflow: hidden;
    }

    .code-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1rem;
      background: #27272a;
      border-bottom: 1px solid #3f3f46;
    }

    .code-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .code-dot.red { background: #ef4444; }
    .code-dot.yellow { background: #eab308; }
    .code-dot.green { background: #22c55e; }

    .code-title {
      margin-left: 0.5rem;
      font-size: 0.75rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
    }

    .code-body {
      padding: 1.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      line-height: 1.8;
      color: #a1a1aa;
      overflow-x: auto;
    }

    .code-keyword { color: #c084fc; }
    .code-string { color: #4ade80; }
    .code-func { color: #60a5fa; }
    .code-comment { color: #52525b; }
    .code-plain { color: #a1a1aa; }

    /* Extension Gallery */
    .gallery {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 1rem;
    }

    .gallery-item {
      aspect-ratio: 1;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
    }

    .gallery-item:hover {
      transform: translateY(-4px) scale(1.02);
      border-color: #f59e0b;
      background: #1c1c1f;
    }

    .gallery-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.75rem;
      background: rgba(245, 158, 11, 0.1);
      display: grid;
      place-items: center;
      font-size: 1rem;
      font-weight: 700;
      color: #f59e0b;
    }

    .gallery-name {
      font-size: 0.75rem;
      color: #a1a1aa;
      font-weight: 500;
    }

    /* Background Decoration */
    .bg-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(245, 158, 11, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(245, 158, 11, 0.03) 1px, transparent 1px);
      background-size: 60px 60px;
      pointer-events: none;
    }

    .bg-glow {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 800px;
      height: 800px;
      background: radial-gradient(circle, rgba(245, 158, 11, 0.05) 0%, transparent 70%);
      pointer-events: none;
    }

    @media (max-width: 1024px) {
      .categories { grid-template-columns: 1fr; }
      .code-section { grid-template-columns: 1fr; }
      .gallery { grid-template-columns: repeat(4, 1fr); }
      .stats-bar { flex-wrap: wrap; gap: 1.5rem; }
    }

    @media (max-width: 640px) {
      .gallery { grid-template-columns: repeat(3, 1fr); }
    }
  `;

  @state() private locale: Locale = i18n.getCurrentLocale();
  @state() private activeTab = 0;
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

  private t(key: string) {
    return i18n.t(key);
  }

  render() {
    const f = i18n.t.bind(i18n);
    const isZh = i18n.getCurrentLocale() === 'zh-CN';

    const commands = isZh 
      ? ['/research', '/scout', '/plan', '/work', '/review', '/brainstorm']
      : ['/research', '/scout', '/plan', '/work', '/review', '/brainstorm'];

    const tools = isZh
      ? ['web-fetch', 'ast-grep', 'ace-tool', 'codemap', 'send-request', 'tmux']
      : ['web-fetch', 'ast-grep', 'ace-tool', 'codemap', 'send-request', 'tmux'];

    const gateways = isZh
      ? ['Telegram', 'Discord', 'WebChat', 'API', 'Cron', 'Webhook']
      : ['Telegram', 'Discord', 'WebChat', 'API', 'Cron', 'Webhook'];

    const gallery = isZh
      ? ['git-commit', 'notify', 'continue', 'handoff', 'hash-trigger', 'pi-messenger']
      : ['git-commit', 'notify', 'continue', 'handoff', 'hash-trigger', 'pi-messenger'];

    return html`
      <section class="section" id="extensions">
        <div class="bg-grid"></div>
        <div class="bg-glow"></div>

        <div class="inner">
          <div class="header">
            <span class="label">${f('extensions.label')}</span>
            <h2 class="title">${isZh ? '无限扩展生态' : 'Infinite Extensibility'}</h2>
            <p class="subtitle">${isZh 
              ? '从 CLI 命令到 TUI 组件，从网关插件到定时任务。每个人都是扩展作者。' 
              : 'From CLI commands to TUI components, from gateway plugins to cron jobs. Everyone is an extension author.'}</p>
          </div>

          <!-- Stats Bar -->
          <div class="stats-bar">
            <div class="stat">
              <span class="stat-value">26+</span>
              <span class="stat-label">${isZh ? '内置扩展' : 'Built-in'}</span>
            </div>
            <div class="stat">
              <span class="stat-value">42</span>
              <span class="stat-label">${isZh ? '技能' : 'Skills'}</span>
            </div>
            <div class="stat">
              <span class="stat-value">16</span>
              <span class="stat-label">${isZh ? '网关钩子' : 'Hooks'}</span>
            </div>
            <div class="stat">
              <span class="stat-value">0</span>
              <span class="stat-label">${isZh ? '配置复杂度' : 'Config Complexity'}</span>
            </div>
          </div>

          <!-- Extension Categories -->
          <div class="categories">
            <!-- Commands -->
            <div class="category">
              <div class="category-header">
                <div class="category-icon">/</div>
                <span class="category-title">${isZh ? '斜杠命令' : 'Slash Commands'}</span>
                <span class="category-count">15</span>
              </div>
              <p class="category-desc">${isZh 
                ? '交互式命令系统。支持参数补全、历史记录、上下文感知。' 
                : 'Interactive command system. Supports arg completion, history, context awareness.'}</p>
              <div class="ext-list">
                ${commands.map(cmd => html`
                  <div class="ext-item">
                    <span class="ext-status"></span>
                    <span>${cmd}</span>
                  </div>
                `)}
              </div>
            </div>

            <!-- Tools -->
            <div class="category">
              <div class="category-header">
                <div class="category-icon">T</div>
                <span class="category-title">${isZh ? '工具技能' : 'Tool Skills'}</span>
                <span class="category-count">42</span>
              </div>
              <p class="category-desc">${isZh 
                ? '可复用的能力单元。每个技能都是独立的 npm 包，按需加载。' 
                : 'Reusable capability units. Each skill is an independent npm package, loaded on demand.'}</p>
              <div class="ext-list">
                ${tools.map(tool => html`
                  <div class="ext-item">
                    <span class="ext-status"></span>
                    <span>${tool}</span>
                  </div>
                `)}
              </div>
            </div>

            <!-- Gateway -->
            <div class="category">
              <div class="category-header">
                <div class="category-icon">G</div>
                <span class="category-title">${isZh ? '网关插件' : 'Gateway Plugins'}</span>
                <span class="category-count">8</span>
              </div>
              <p class="category-desc">${isZh 
                ? '多通道接入。16 个生命周期钩子，消息管道可编程。' 
                : 'Multi-channel access. 16 lifecycle hooks, programmable message pipeline.'}</p>
              <div class="ext-list">
                ${gateways.map(gw => html`
                  <div class="ext-item">
                    <span class="ext-status"></span>
                    <span>${gw}</span>
                  </div>
                `)}
              </div>
            </div>
          </div>

          <!-- Code Demo -->
          <div class="code-section">
            <div class="code-panel">
              <div class="code-header">
                <span class="code-dot red"></span>
                <span class="code-dot yellow"></span>
                <span class="code-dot green"></span>
                <span class="code-title">extension.ts</span>
              </div>
              <div class="code-body">
                <div><span class="code-keyword">export default</span> <span class="code-keyword">function</span> <span class="code-func">myExtension</span>(pi) {</div>
                <div>&nbsp;&nbsp;<span class="code-comment">// Register a slash command</span></div>
                <div>&nbsp;&nbsp;pi.<span class="code-func">registerCommand</span>({</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;name: <span class="code-string">'/hello'</span>,</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="code-keyword">async</span> <span class="code-func">handler</span>(args) {</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="code-keyword">return</span> <span class="code-string">'Hello from my extension!'</span>;</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;}</div>
                <div>&nbsp;&nbsp;});</div>
                <div>&nbsp;&nbsp;<span class="code-comment">// Register a tool</span></div>
                <div>&nbsp;&nbsp;pi.<span class="code-func">registerTool</span>({</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;name: <span class="code-string">'my_tool'</span>,</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;description: <span class="code-string">'Does something cool'</span></div>
                <div>&nbsp;&nbsp;});</div>
                <div>}</div>
              </div>
            </div>

            <div class="code-panel">
              <div class="code-header">
                <span class="code-dot red"></span>
                <span class="code-dot yellow"></span>
                <span class="code-dot green"></span>
                <span class="code-title">skill.json</span>
              </div>
              <div class="code-body">
                <div>{</div>
                <div>&nbsp;&nbsp;<span class="code-string">"name"</span>: <span class="code-string">"my-skill"</span>,</div>
                <div>&nbsp;&nbsp;<span class="code-string">"version"</span>: <span class="code-string">"1.0.0"</span>,</div>
                <div>&nbsp;&nbsp;<span class="code-string">"description"</span>: <span class="code-string">"A reusable skill"</span>,</div>
                <div>&nbsp;&nbsp;<span class="code-string">"entry"</span>: <span class="code-string">"./index.ts"</span>,</div>
                <div>&nbsp;&nbsp;<span class="code-string">"permissions"</span>: [<span class="code-string">"fs:read"</span>],</div>
                <div>&nbsp;&nbsp;<span class="code-string">"hooks"</span>: {</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="code-string">"onInit"</span>: <span class="code-string">"init"</span>,</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;<span class="code-string">"onMessage"</span>: <span class="code-string">"handleMessage"</span></div>
                <div>&nbsp;&nbsp;}</div>
                <div>}</div>
              </div>
            </div>
          </div>

          <!-- Extension Gallery -->
          <div class="gallery">
            ${gallery.map(ext => html`
              <div class="gallery-item">
                <div class="gallery-icon">${ext.charAt(0).toUpperCase()}</div>
                <span class="gallery-name">${ext}</span>
              </div>
            `)}
          </div>
        </div>
      </section>
    `;
  }
}
