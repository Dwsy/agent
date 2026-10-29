// ── Render Policy: route-plan grounding enforcement ───────────────────────
//
// Plan-parameterized copy of `enforceGroundingForPlan` + NON_FACTUAL_ROUTE_IDS
// from tools.ts. tools.ts still carries its ctx-based duplicate; that copy will
// be deleted in a later cleanup pass once the registered tools are removed.
// Semantics and error messages are intentionally identical to tools.ts today.

import type { GroundingDeclaration } from "./grounding.js";

export interface VisualPlanState {
  route: string | null;
  target: "markdown" | "show_widget" | "show_canvas";
  research: string | null;
}

const NON_FACTUAL_ROUTE_IDS = new Set(["illustration", "ui-mockup", "interactive-explainer"]);

export function enforceGroundingForPlan(
  grounding: GroundingDeclaration,
  plan: VisualPlanState | null,
  target: "show_widget" | "show_canvas",
): void {
  if (!plan || plan.target !== target || grounding.status === "grounded") return;
  if (plan.research === "required") {
    throw new Error("This routed visual requires factual retrieval, so grounding.status must be grounded with concrete provenance sources.");
  }
  if (plan.route && !NON_FACTUAL_ROUTE_IDS.has(plan.route)) {
    throw new Error(`Visual route ${plan.route} is evidence/structure-bearing; use grounded provenance (conversation/file/code/web/data) instead of not_applicable.`);
  }
}
