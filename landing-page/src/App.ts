import { html, LitElement, css } from "lit";
import { customElement } from "lit/decorators.js";
import "./components/Navbar";
import "./components/HeroSection";
import "./components/WorkflowSection";
import "./components/BentoGrid";
import "./components/ExtensionsSection";
import "./components/UseCasesSection";
import "./components/TechSpecs";
import "./components/CTASection";
import "./components/Footer";

@customElement("pi-app")
export class App extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }

    main {
      padding-top: 4.5rem;
    }

    @media (max-width: 768px) {
      main {
        padding-top: 4rem;
      }
    }
  `;

  render() {
    return html`
      <pi-navbar></pi-navbar>
      <main>
        <hero-section></hero-section>
        <bento-grid></bento-grid>
        <workflow-section></workflow-section>
        <extensions-section></extensions-section>
        <use-cases-section></use-cases-section>
        <tech-specs></tech-specs>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `;
  }
}
