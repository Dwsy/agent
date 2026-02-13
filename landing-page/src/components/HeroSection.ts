import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "../i18n/i18n-manager";

@customElement("hero-section")
export class HeroSection extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .hero {
      min-height: 92vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 5rem 1.5rem 4rem;
      background: linear-gradient(180deg, #0F172A 0%, #0A0F1E 100%);
      position: relative;
      overflow: hidden;
    }

    /* Ambient glow */
    .hero::before {
      content: "";
      position: absolute;
      top: -30%;
      left: 50%;
      transform: translateX(-50%);
      width: 140%;
      height: 80%;
      background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.07) 0%, rgba(139, 92, 246, 0.04) 40%, transparent 70%);
      animation: drift 12s ease-in-out infinite;
      pointer-events: none;
    }

    /* Grid pattern overlay */
    .hero::after {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(51, 65, 85, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(51, 65, 85, 0.08) 1px, transparent 1px);
      background-size: 60px 60px;
      pointer-events: none;
    }

    .hero-content {
      position: relative;
      z-index: 1;
      max-width: 56rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1.25rem;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 9999px;
      color: #60A5FA;
      font-size: 0.8rem;
      font-weight: 600;
      margin-bottom: 2rem;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: 0.02em;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      background: #60A5FA;
      border-radius: 50%;
      animation: blink 2s ease-in-out infinite;
    }

    h1 {
      font-size: clamp(2.5rem, 5.5vw, 4.5rem);
      font-weight: 700;
      line-height: 1.08;
      margin-bottom: 1.5rem;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
      letter-spacing: -0.02em;
    }

    h1 .gradient {
      background: linear-gradient(135deg, #60A5FA 0%, #A78BFA 50%, #F472B6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .description {
      font-size: 1.125rem;
      line-height: 1.75;
      color: #94A3B8;
      margin-bottom: 2.5rem;
      max-width: 42rem;
      margin-left: auto;
      margin-right: auto;
      font-family: "DM Sans", sans-serif;
    }

    /* Stats bar */
    .stats-bar {
      display: flex;
      justify-content: center;
      gap: 2.5rem;
      margin-bottom: 3rem;
      flex-wrap: wrap;
    }

    .stat-item {
      text-align: center;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #F1F5F9;
      font-family: "Space Grotesk", sans-serif;
      line-height: 1;
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.75rem;
      font-weight: 500;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-family: "DM Sans", sans-serif;
    }

    .stat-divider {
      width: 1px;
      height: 3rem;
      background: rgba(51, 65, 85, 0.5);
      align-self: center;
    }

    /* CTA buttons */
    .cta-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .cta-primary, .cta-secondary {
      padding: 0.875rem 2rem;
      border-radius: 0.5rem;
      font-size: 0.95rem;
      font-weight: 600;
      font-family: "DM Sans", sans-serif;
      cursor: pointer;
      transition: all 0.2s ease-out;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .cta-primary {
      background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
      color: white;
      border: none;
    }

    .cta-primary:hover {
      box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4);
    }

    .cta-secondary {
      background: rgba(30, 41, 59, 0.6);
      color: #F1F5F9;
      border: 1px solid rgba(51, 65, 85, 0.6);
      backdrop-filter: blur(10px);
    }

    .cta-secondary:hover {
      border-color: rgba(96, 165, 250, 0.5);
      background: rgba(30, 41, 59, 0.9);
    }

    /* Terminal preview */
    .terminal-preview {
      margin-top: 3.5rem;
      max-width: 38rem;
      margin-left: auto;
      margin-right: auto;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(51, 65, 85, 0.5);
      border-radius: 0.75rem;
      overflow: hidden;
      text-align: left;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }

    .terminal-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: rgba(30, 41, 59, 0.6);
      border-bottom: 1px solid rgba(51, 65, 85, 0.3);
    }

    .terminal-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .dot-red { background: #EF4444; }
    .dot-yellow { background: #F59E0B; }
    .dot-green { background: #22C55E; }

    .terminal-title {
      flex: 1;
      text-align: center;
      font-size: 0.75rem;
      color: #64748B;
      font-family: "JetBrains Mono", monospace;
    }

    .terminal-body {
      padding: 1.25rem;
      font-family: "JetBrains Mono", monospace;
      font-size: 0.8rem;
      line-height: 1.8;
    }

    .terminal-line {
      display: flex;
      gap: 0.5rem;
    }

    .terminal-prompt {
      color: #22C55E;
      user-select: none;
    }

    .terminal-cmd {
      color: #60A5FA;
    }

    .terminal-output {
      color: #94A3B8;
      padding-left: 1.5rem;
    }

    .terminal-phase {
      color: #A78BFA;
    }

    .terminal-success {
      color: #22C55E;
    }

    @keyframes drift {
      0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
      50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    @media (prefers-reduced-motion: reduce) {
      .hero::before { animation: none; }
      .badge-dot { animation: none; }
    }

    @media (max-width: 768px) {
      .hero { padding: 3rem 1rem 2rem; min-height: auto; }
      h1 { font-size: 2rem; }
      .description { font-size: 1rem; }
      .stats-bar { gap: 1.5rem; }
      .stat-value { font-size: 1.5rem; }
      .stat-divider { display: none; }
      .cta-buttons { flex-direction: column; width: 100%; }
      .cta-primary, .cta-secondary { width: 100%; justify-content: center; }
      .terminal-preview { margin-top: 2rem; }
      .terminal-body { font-size: 0.7rem; padding: 1rem; }
    }
  `;

  @state() locale: Locale = i18n.getCurrentLocale();

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
      <section class="hero">
        <div class="hero-content">
          <span class="badge">
            <span class="badge-dot"></span>
            ${f("hero.badge")}
          </span>
          <h1>
            ${f("hero.title")}<br />
            <span class="gradient">${f("hero.subtitle")}</span>
          </h1>
          <p class="description">${f("hero.description")}</p>

          <div class="stats-bar">
            <div class="stat-item">
              <div class="stat-value">${f("hero.stats.skills")}</div>
              <div class="stat-label">${f("hero.stats.skillsLabel")}</div>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <div class="stat-value">${f("hero.stats.extensions")}</div>
              <div class="stat-label">${f("hero.stats.extensionsLabel")}</div>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <div class="stat-value">${f("hero.stats.subagents")}</div>
              <div class="stat-label">${f("hero.stats.subagentsLabel")}</div>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <div class="stat-value">${f("hero.stats.channels")}</div>
              <div class="stat-label">${f("hero.stats.channelsLabel")}</div>
            </div>
          </div>

          <div class="cta-buttons">
            <a href="#get-started" class="cta-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              ${f("hero.ctas.primary")}
            </a>
            <a href="#workflow" class="cta-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              ${f("hero.ctas.secondary")}
            </a>
          </div>

          <!-- Terminal demo -->
          <div class="terminal-preview">
            <div class="terminal-header">
              <span class="terminal-dot dot-red"></span>
              <span class="terminal-dot dot-yellow"></span>
              <span class="terminal-dot dot-green"></span>
              <span class="terminal-title">pi agent</span>
            </div>
            <div class="terminal-body">
              <div class="terminal-line"><span class="terminal-prompt">❯</span> <span class="terminal-cmd">/scout authentication flow</span></div>
              <div class="terminal-output"><span class="terminal-phase">Phase 1</span> → ace-tool semantic search...</div>
              <div class="terminal-output terminal-success">✓ Found 4 files, 12 symbols, 3 call chains</div>
              <div class="terminal-line" style="margin-top:0.5rem"><span class="terminal-prompt">❯</span> <span class="terminal-cmd">/brainstorm caching strategy</span></div>
              <div class="terminal-output"><span class="terminal-phase">Phase 2</span> → Codex + Gemini cross-validation...</div>
              <div class="terminal-output terminal-success">✓ Issue created · 3 subtasks · EventStorming diagram</div>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}
