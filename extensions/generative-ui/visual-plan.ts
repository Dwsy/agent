import { getGuidelines } from "./guidelines.js";
import { formatVisualRoute, routeVisualRequest, type VisualTarget } from "./routing.js";
import { TEMPLATE_CATALOG } from "./templates/index.js";

export interface VisualPlanInput {
  request?: string;
  modules?: string[];
  templates?: string[];
}

export interface VisualPlanResult {
  content: string;
  details: {
    request: string;
    route: string | null;
    target: VisualTarget | "show_widget";
    style: string | null;
    research: string | null;
    grounding: "required";
    modules: string[];
    templates: string[];
  };
}

export function planVisualGuidance(input: VisualPlanInput): VisualPlanResult {
  const request = input.request?.trim() ?? "";
  const autoRoute = request ? routeVisualRequest(request) : null;
  const explicitModules = (input.modules ?? []).filter(Boolean);
  const explicitTemplates = (input.templates ?? []).filter(Boolean);
  const selectedTemplateMeta = TEMPLATE_CATALOG.filter((item) => explicitTemplates.includes(item.id));
  const inferredTemplateModules = Array.from(new Set(selectedTemplateMeta.flatMap((item) => [...item.modules])));
  const manualModules = explicitModules.length > 0 ? explicitModules : inferredTemplateModules;
  const modules = manualModules.length > 0 ? manualModules : (autoRoute?.modules ?? []);
  const templates = explicitTemplates.length > 0
    ? explicitTemplates
    : manualModules.length > 0
      ? []
      : (autoRoute?.templates ?? []);
  const hasManualOverride = explicitModules.length > 0 || explicitTemplates.length > 0;
  const templateTarget = selectedTemplateMeta.some((item) => item.target === "show_canvas") ? "show_canvas" : selectedTemplateMeta.length > 0 ? "show_widget" : null;
  const target: VisualTarget | "show_widget" = hasManualOverride
    ? (explicitModules.length > 0 ? (explicitModules.includes("canvas") ? "show_canvas" : "show_widget") : (templateTarget ?? autoRoute?.target ?? "show_widget"))
    : (autoRoute?.target ?? "show_widget");
  const effectiveRoute = autoRoute ? { ...autoRoute, target, modules, templates } : null;

  let content = effectiveRoute ? formatVisualRoute(effectiveRoute) : "";
  if (target !== "markdown") {
    const guidance = getGuidelines(modules, { templates });
    content += (content ? "\n\n" : "") + guidance;
  }
  if (!content) content = getGuidelines([], {});

  return {
    content,
    details: {
      request,
      route: autoRoute?.id ?? null,
      target,
      style: autoRoute?.style ?? null,
      research: autoRoute?.research ?? null,
      grounding: "required",
      modules,
      templates,
    },
  };
}
