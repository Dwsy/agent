import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";

/**
 * Gateway Architecture Visualization
 * Animated SVG showing message flow through the pipeline
 */
@customElement("gateway-visualization")
export class GatewayVisualization extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }

    .viz-container {
      position: relative;
      width: 100%;
      height: 500px;
      background: #0c0c0e;
      border-radius: 1.25rem;
      overflow: hidden;
      border: 1px solid #27272a;
    }

    /* SVG Styles */
    svg {
      width: 100%;
      height: 100%;
    }

    .node {
      fill: #18181b;
      stroke: #27272a;
      stroke-width: 1;
      transition: all 0.3s ease;
    }

    .node:hover {
      stroke: #3b82f6;
      fill: #1e293b;
    }

    .node-label {
      fill: #a1a1aa;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      text-anchor: middle;
      dominant-baseline: middle;
    }

    .node-title {
      fill: #fafafa;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Geist', sans-serif;
      text-anchor: middle;
      dominant-baseline: middle;
    }

    /* Animated Particles */
    .particle {
      fill: #3b82f6;
      filter: drop-shadow(0 0 4px #3b82f6);
    }

    .particle-purple {
      fill: #a855f7;
      filter: drop-shadow(0 0 4px #a855f7);
    }

    .particle-green {
      fill: #10b981;
      filter: drop-shadow(0 0 4px #10b981);
    }

    /* Connection Lines */
    .connection {
      fill: none;
      stroke: #27272a;
      stroke-width: 1.5;
    }

    .connection.active {
      stroke: url(#gradient-blue);
      stroke-width: 2;
    }

    /* Animated Path */
    .path-flow {
      fill: none;
      stroke: #3b82f6;
      stroke-width: 2;
      stroke-dasharray: 8 4;
      animation: dash 1s linear infinite;
      opacity: 0.6;
    }

    .path-flow-purple {
      stroke: #a855f7;
      animation-delay: 0.3s;
    }

    .path-flow-green {
      stroke: #10b981;
      animation-delay: 0.6s;
    }

    @keyframes dash {
      to { stroke-dashoffset: -12; }
    }

    /* Status Indicators */
    .status-dot {
      animation: pulse-status 2s ease-in-out infinite;
    }

    @keyframes pulse-status {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Legend */
    .legend {
      position: absolute;
      bottom: 1rem;
      left: 1rem;
      display: flex;
      gap: 1.5rem;
      padding: 0.75rem 1rem;
      background: rgba(24, 24, 27, 0.9);
      border: 1px solid #27272a;
      border-radius: 0.625rem;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.6875rem;
      color: #a1a1aa;
    }

    .legend-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .legend-dot.blue { background: #3b82f6; }
    .legend-dot.purple { background: #a855f7; }
    .legend-dot.green { background: #10b981; }

    /* Data Counter */
    .counter {
      position: absolute;
      top: 1rem;
      right: 1rem;
      padding: 0.5rem 0.875rem;
      background: rgba(24, 24, 27, 0.9);
      border: 1px solid #27272a;
      border-radius: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #a1a1aa;
    }

    .counter-value {
      color: #10b981;
      font-weight: 600;
    }
  `;

  @state() private messageCount = 1247;
  private _interval?: number;

  connectedCallback() {
    super.connectedCallback();
    this._interval = window.setInterval(() => {
      this.messageCount += Math.floor(Math.random() * 3);
    }, 2000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._interval) clearInterval(this._interval);
  }

  render() {
    return html`
      <div class="viz-container">
        <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="gradient-blue" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0" />
              <stop offset="50%" style="stop-color:#3b82f6;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <!-- Connection Paths -->
          <!-- Channels to Dispatcher -->
          <path class="connection" d="M 100 100 L 250 250" />
          <path class="connection" d="M 100 250 L 250 250" />
          <path class="connection" d="M 100 400 L 250 250" />
          
          <!-- Dispatcher to Pipeline -->
          <path class="connection" d="M 350 250 L 450 250" />
          
          <!-- Pipeline to Runtime -->
          <path class="connection" d="M 550 250 L 650 150" />
          <path class="connection" d="M 550 250 L 650 250" />
          <path class="connection" d="M 550 250 L 650 350" />

          <!-- Animated Flow Lines -->
          <path class="path-flow" d="M 100 100 L 250 250" />
          <path class="path-flow path-flow-purple" d="M 100 250 L 250 250" />
          <path class="path-flow path-flow-green" d="M 100 400 L 250 250" />
          <path class="path-flow" d="M 350 250 L 450 250" />
          <path class="path-flow path-flow-purple" d="M 550 250 L 650 150" />
          <path class="path-flow path-flow-green" d="M 550 250 L 650 350" />

          <!-- Channel Nodes -->
          <g transform="translate(60, 70)">
            <rect class="node" x="0" y="0" width="80" height="60" rx="8" />
            <text class="node-title" x="40" y="25">Telegram</text>
            <text class="node-label" x="40" y="42">Webhook</text>
            <circle class="status-dot" cx="70" cy="10" r="3" fill="#10b981" />
          </g>

          <g transform="translate(60, 220)">
            <rect class="node" x="0" y="0" width="80" height="60" rx="8" />
            <text class="node-title" x="40" y="25">Discord</text>
            <text class="node-label" x="40" y="42">Gateway</text>
            <circle class="status-dot" cx="70" cy="10" r="3" fill="#10b981" />
          </g>

          <g transform="translate(60, 370)">
            <rect class="node" x="0" y="0" width="80" height="60" rx="8" />
            <text class="node-title" x="40" y="25">WebChat</text>
            <text class="node-label" x="40" y="42">WebSocket</text>
            <circle class="status-dot" cx="70" cy="10" r="3" fill="#10b981" />
          </g>

          <!-- Dispatcher -->
          <g transform="translate(250, 210)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" fill="#1e293b" stroke="#3b82f6" />
            <text class="node-title" x="50" y="30">Dispatcher</text>
            <text class="node-label" x="50" y="50">Route & Load</text>
            <text class="node-label" x="50" y="65">Balance</text>
          </g>

          <!-- Pipeline -->
          <g transform="translate(450, 210)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" fill="#1e293b" stroke="#a855f7" />
            <text class="node-title" x="50" y="30">Pipeline</text>
            <text class="node-label" x="50" y="50">16 Hooks</text>
            <text class="node-label" x="50" y="65">Transform</text>
          </g>

          <!-- Runtime Nodes -->
          <g transform="translate(650, 110)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" />
            <text class="node-title" x="50" y="30">RPC Pool</text>
            <text class="node-label" x="50" y="50">Process</text>
            <text class="node-label" x="50" y="65">Manager</text>
          </g>

          <g transform="translate(650, 210)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" />
            <text class="node-title" x="50" y="30">Session</text>
            <text class="node-label" x="50" y="50">State</text>
            <text class="node-label" x="50" y="65">Router</text>
          </g>

          <g transform="translate(650, 310)">
            <rect class="node" x="0" y="0" width="100" height="80" rx="8" />
            <text class="node-title" x="50" y="30">Cron</text>
            <text class="node-label" x="50" y="50">Scheduled</text>
            <text class="node-label" x="50" y="65">Tasks</text>
          </g>

          <!-- Animated Particles -->
          <circle class="particle" cx="175" cy="175" r="4">
            <animate attributeName="cx" values="100;250" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="cy" values="100;250" dur="1.5s" repeatCount="indefinite" />
          </circle>

          <circle class="particle-purple" cx="175" cy="250" r="4">
            <animate attributeName="cx" values="100;250" dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="cy" values="250;250" dur="1.2s" repeatCount="indefinite" />
          </circle>

          <circle class="particle-green" cx="175" cy="325" r="4">
            <animate attributeName="cx" values="100;250" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="cy" values="400;250" dur="1.8s" repeatCount="indefinite" />
          </circle>

          <circle class="particle" cx="400" cy="250" r="4">
            <animate attributeName="cx" values="350;550" dur="1s" repeatCount="indefinite" />
          </circle>
        </svg>

        <div class="legend">
          <div class="legend-item">
            <div class="legend-dot blue"></div>
            <span>Message Flow</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot purple"></div>
            <span>Transform</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot green"></div>
            <span>Response</span>
          </div>
        </div>

        <div class="counter">
          Messages: <span class="counter-value">${this.messageCount.toLocaleString()}</span>/s
        </div>
      </div>
    `;
  }
}
