import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

// Components
import "./components/Navbar";
import "./components/HeroSection";
import "./components/GrokTuiSection";
import "./components/BentoGrid";
import "./components/GatewaySection";
import "./components/WorkflowSection";
import "./components/ExtensionsSection";
import "./components/ComparisonSection";
import "./components/MemorySection";
import "./components/TechSpecs";
import "./components/CTASection";
import "./components/Footer";

// Background
import "./components/CanvasBackground";

@customElement("pi-app")
export class App extends LitElement {
  
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <canvas-background></canvas-background>
      <pi-navbar></pi-navbar>
      <main id="main-content" style="position: relative; z-index: 1;">
        <hero-section></hero-section>
        <grok-tui-section></grok-tui-section>
        <bento-grid></bento-grid>
        <memory-section></memory-section>
        <gateway-section></gateway-section>
        <workflow-section></workflow-section>
        <extensions-section></extensions-section>
        <comparison-section></comparison-section>
        <tech-specs></tech-specs>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `;
  }
}
