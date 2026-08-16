import { html, LitElement, css } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Canvas Background - Animated Network/Constellation Effect
 * Renders connected particles with SVG lines for better performance
 */
@customElement("canvas-background")
export class CanvasBackground extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }

    canvas {
      width: 100%;
      height: 100%;
      opacity: 0.4;
    }

    @media (prefers-color-scheme: light) {
      canvas { opacity: 0; }
    }
  `;

  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D;
  private particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    opacity: number;
  }> = [];
  private animationId?: number;
  private resizeObserver?: ResizeObserver;

  private readonly PARTICLE_COUNT = 30;
  private readonly CONNECTION_DISTANCE = 150;
  private readonly MAX_CONNECTIONS = 3;

  firstUpdated() {
    this.canvas = this.renderRoot.querySelector('canvas') as HTMLCanvasElement;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d') || undefined;
    if (!this.ctx) return;

    this.setupCanvas();
    this.initParticles();
    this.animate();

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => {
      this.setupCanvas();
    });
    this.resizeObserver.observe(this.canvas);
  }

  private setupCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  private initParticles() {
    if (!this.canvas) return;
    this.particles = [];

    for (let i = 0; i < this.PARTICLE_COUNT; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.3 + 0.1,
      });
    }
  }

  private animate = () => {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Update and draw particles
    this.particles.forEach((particle, i) => {
      // Update position
      particle.x += particle.vx;
      particle.y += particle.vy;

      // Bounce off edges
      if (particle.x < 0 || particle.x > this.canvas!.width) particle.vx *= -1;
      if (particle.y < 0 || particle.y > this.canvas!.height) particle.vy *= -1;

      // Draw particle
      this.ctx!.beginPath();
      this.ctx!.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      this.ctx!.fillStyle = `rgba(16, 185, 129, ${particle.opacity})`;
      this.ctx!.fill();

      // Draw connections
      let connections = 0;
      for (let j = i + 1; j < this.particles.length; j++) {
        if (connections >= this.MAX_CONNECTIONS) break;

        const other = this.particles[j];
        const dx = particle.x - other.x;
        const dy = particle.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.CONNECTION_DISTANCE) {
          const opacity = (1 - distance / this.CONNECTION_DISTANCE) * 0.15;
          this.ctx!.beginPath();
          this.ctx!.moveTo(particle.x, particle.y);
          this.ctx!.lineTo(other.x, other.y);
          this.ctx!.strokeStyle = `rgba(16, 185, 129, ${opacity})`;
          this.ctx!.lineWidth = 0.5;
          this.ctx!.stroke();
          connections++;
        }
      }
    });

    this.animationId = requestAnimationFrame(this.animate);
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();
  }

  render() {
    return html`<canvas></canvas>`;
  }
}
