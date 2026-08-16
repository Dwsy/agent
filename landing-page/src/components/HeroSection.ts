import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

/**
 * Hero Section - Split Screen Asymmetric Layout
 * DESIGN_VARIANCE: 8 - Asymmetric, left-aligned content
 * MOTION_INTENSITY: 6 - Spring physics, staggered reveals
 * VISUAL_DENSITY: 4 - Gallery mode, generous whitespace
 */
@customElement("hero-section")
export class HeroSection extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .hero {
      min-height: 100dvh;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      align-items: center;
      padding: 6rem 4rem 4rem;
      position: relative;
      overflow: hidden;
    }

    /* Background - Subtle Grid + Gradient */
    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 50% at 20% 40%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse 60% 40% at 80% 60%, rgba(16, 185, 129, 0.05) 0%, transparent 50%);
      pointer-events: none;
    }

    .hero::after {
      content: '';
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(63, 63, 70, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(63, 63, 70, 0.05) 1px, transparent 1px);
      background-size: 80px 80px;
      pointer-events: none;
    }

    /* Left Content - Asymmetric Alignment */
    .content {
      position: relative;
      z-index: 1;
      padding-left: 5vw;
      max-width: 640px;
    }

    /* Status Badge */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 9999px;
      color: #34d399;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 2rem;
      width: fit-content;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      background: #10b981;
      border-radius: 50%;
      animation: pulse-dot 2s ease-in-out infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.8); }
    }

    /* Typography - Geist, Tight Tracking */
    h1 {
      font-size: clamp(2.75rem, 5vw, 4.5rem);
      font-weight: 600;
      line-height: 1.05;
      margin-bottom: 1.5rem;
      color: #fafafa;
      letter-spacing: -0.03em;
    }

    h1 .accent {
      color: #10b981;
      font-weight: 700;
    }

    .description {
      font-size: 1.125rem;
      line-height: 1.7;
      color: #a1a1aa;
      max-width: 480px;
      margin-bottom: 2.5rem;
    }

    /* CTA Group */
    .cta-group {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-bottom: 3rem;
    }

    .cta-primary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1.75rem;
      background: #10b981;
      color: #09090b;
      font-weight: 600;
      font-size: 0.9375rem;
      border-radius: 0.625rem;
      text-decoration: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
    }

    .cta-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(16, 185, 129, 0.4);
    }

    .cta-primary:active {
      transform: translateY(0) scale(0.98);
    }

    .cta-secondary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1.5rem;
      background: transparent;
      color: #a1a1aa;
      font-weight: 500;
      font-size: 0.9375rem;
      border: 1px solid #3f3f46;
      border-radius: 0.625rem;
      text-decoration: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cta-secondary:hover {
      border-color: #52525b;
      color: #fafafa;
      background: rgba(255, 255, 255, 0.03);
    }

    /* Stats Row */
    .stats {
      display: flex;
      gap: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #27272a;
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
      letter-spacing: -0.02em;
    }

    .stat-label {
      font-size: 0.8125rem;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Right Side - Visual */
    .visual {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-right: 2rem;
    }

    .terminal {
      width: 100%;
      max-width: 520px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1rem;
      overflow: hidden;
      box-shadow:
        0 40px 80px -20px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.03);
      animation: float 6s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-12px) rotate(0.5deg); }
    }

    .terminal-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1rem;
      background: #27272a;
      border-bottom: 1px solid #3f3f46;
    }

    .terminal-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .terminal-dot.red { background: #ef4444; }
    .terminal-dot.yellow { background: #eab308; }
    .terminal-dot.green { background: #22c55e; }

    .terminal-title {
      margin-left: 0.5rem;
      font-size: 0.75rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
    }

    .terminal-body {
      padding: 1.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      line-height: 1.7;
      color: #a1a1aa;
    }

    .terminal-line {
      display: flex;
      gap: 0.75rem;
    }

    .terminal-prompt {
      color: #10b981;
      flex-shrink: 0;
    }

    .terminal-cursor {
      display: inline-block;
      width: 8px;
      height: 1.2em;
      background: #10b981;
      animation: blink 1s step-end infinite;
      vertical-align: text-bottom;
      margin-left: 2px;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    .terminal-command {
      color: #fafafa;
    }

    .terminal-output {
      color: #71717a;
      margin: 0.5rem 0 1rem 1.5rem;
    }

    /* Mobile Override - Single Column */
    @media (max-width: 1024px) {
      .hero {
        grid-template-columns: 1fr;
        gap: 3rem;
        padding: 6rem 1.5rem 4rem;
      }

      .content {
        padding-left: 0;
        max-width: 100%;
      }

      .visual {
        padding-right: 0;
        order: -1;
      }

      .terminal {
        max-width: 100%;
      }

      .stats {
        gap: 2rem;
      }
    }

    @media (max-width: 640px) {
      h1 {
        font-size: 2.25rem;
      }

      .description {
        font-size: 1rem;
      }

      .cta-group {
        flex-direction: column;
        align-items: stretch;
      }

      .stats {
        flex-direction: column;
        gap: 1.5rem;
      }
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

  private t(key: string) {
    return i18n.t(key);
  }

  render() {
    const f = i18n.t.bind(i18n);

    return html`
      <section class="hero" id="features">
        <div class="content">
          <div class="badge">
            <span class="badge-dot"></span>
            ${f('hero.badge')}
          </div>

          <h1>
            ${f('hero.title.part1')}
            <span class="accent">${f('hero.title.accent')}</span>
            ${f('hero.title.part2')}
          </h1>

          <p class="description">${f('hero.description')}</p>

          <div class="cta-group">
            <a href="https://github.com/Dwsy/agent" class="cta-primary" target="_blank" rel="noopener">
              ${f('hero.cta.primary')}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </a>
            <a href="#gateway" class="cta-secondary">
              ${f('hero.cta.secondary')}
            </a>
          </div>

          <div class="stats">
            <div class="stat">
              <span class="stat-value">Context</span>
              <span class="stat-label">${f('hero.stats.commands')}</span>
            </div>
            <div class="stat">
              <span class="stat-value">GAPP</span>
              <span class="stat-label">${f('hero.stats.extensions')}</span>
            </div>
            <div class="stat">
              <span class="stat-value">Trace</span>
              <span class="stat-label">${f('hero.stats.productivity')}</span>
            </div>
          </div>
        </div>

        <div class="visual">
          <div class="terminal">
            <div class="terminal-header">
              <span class="terminal-dot red"></span>
              <span class="terminal-dot yellow"></span>
              <span class="terminal-dot green"></span>
              <span class="terminal-title">pi-agent</span>
            </div>
            <div class="terminal-body">
              <div class="terminal-line">
                <span class="terminal-prompt">$</span>
                <span class="terminal-command">pi "trace the real flow, then fix it"</span>
              </div>
              <div class="terminal-output">
                retrieving symbols + callers...<br>
                checkpointing context...<br>
                applying surgical edit + verification...<br>
                <span style="color: #10b981;">evidence attached · worktree clean</span>
              </div>
              <div class="terminal-line">
                <span class="terminal-prompt">$</span>
                <span class="terminal-command">pi /gapp open dyncode-project-map</span>
                <span class="terminal-cursor"></span>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}
