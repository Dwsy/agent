import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

// Components
import "./components/Navbar";
import "./components/HeroSection";
import "./components/RuntimeSystemScene";
import "./components/CompanionEcosystemScene";
import "./components/ExtendAndProveScene";
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
        <runtime-system-scene></runtime-system-scene>
        <companion-ecosystem-scene></companion-ecosystem-scene>
        <extend-and-prove-scene></extend-and-prove-scene>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `;
  }
}
