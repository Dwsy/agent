import { html, LitElement, css } from "lit";
import { customElement, state } from "lit/decorators.js";

@customElement("pi-app")
export class App extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .app-container {
      min-height: 100vh;
      background: #0a0a0f;
      color: #fff;
      padding: 2rem;
    }

    h1 {
      color: #00f0ff;
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    p {
      color: #a0a0a5;
      font-size: 1.25rem;
    }

    .test-box {
      background: #1a1a1f;
      border: 1px solid #2a2a30;
      border-radius: 12px;
      padding: 2rem;
      margin-top: 2rem;
    }
  `;

  @state()
  message = "Hello, Pi Agent!";

  render() {
    return html`
      <div class="app-container">
        <h1>${this.message}</h1>
        <p>Landing page is working correctly!</p>

        <div class="test-box">
          <h2>Test Section</h2>
          <p>This is a test box to verify rendering works.</p>
        </div>
      </div>
    `;
  }
}