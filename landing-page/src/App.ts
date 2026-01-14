import { html, LitElement, css } from "lit";
import { customElement } from "lit/decorators.js";
import "./components/Navbar";
import "./components/HeroSection";
import "./components/WorkflowSection";
import "./components/BentoGrid";
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

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: #0F172A;
      color: #F1F5F9;
      font-family: "DM Sans", sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    main {
      padding-top: 5rem;
    }

    @media (max-width: 768px) {
      main {
        padding-top: 5.5rem;
      }
    }
  `;

  render() {
    return html`
      <pi-navbar></pi-navbar>
      <main>
        <hero-section></hero-section>
        <workflow-section></workflow-section>
        <bento-grid></bento-grid>
        <tech-specs></tech-specs>
        <cta-section></cta-section>
      </main>
      <pi-footer></pi-footer>
    `;
  }
}