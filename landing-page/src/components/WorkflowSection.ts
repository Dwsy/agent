import { html, LitElement, css } from "lit";
import { customElement } from "lit/decorators.js";
import "./WorkflowTimeline";

/**
 * Workflow Section - Wrapper for WorkflowTimeline
 */
@customElement("workflow-section")
export class WorkflowSection extends LitElement {
  static styles = css`
    :host { display: block; width: 100%; }
  `;

  render() {
    return html`<workflow-timeline></workflow-timeline>`;
  }
}
