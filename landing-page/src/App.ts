import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import "./components/Navbar";
import "./components/HeroSection";
import "./components/BentoGrid";
import "./components/GatewaySection";
import "./components/WorkflowSection";
import "./components/ExtensionsSection";
import "./components/ComparisonSection";
import "./components/UseCasesSection";
import "./components/TechSpecs";
import "./components/CTASection";
import "./components/Footer";

@customElement("pi-app")
export class App extends LitElement {
  // Render into Light DOM so child element ids are accessible for anchor navigation
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <pi-navbar></pi-navbar>
      <main id="main-content" style="padding-top:4.5rem">
        <hero-section></hero-section>
        <bento-grid></bento-grid>
        <gateway-section></gateway-section>
        <workflow-section></workflow-section>
        <extensions-section></extensions-section>
        <comparison-section></comparison-section>
        <use-cases-section></use-cases-section>
        <tech-specs></tech-specs>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `;
  }
}
