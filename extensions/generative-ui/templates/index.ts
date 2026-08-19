// Fragment templates adapted from visual-explainer patterns.
// These are HTML fragments for show_widget (no DOCTYPE/html/body).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));

function load(name: string): string {
  return readFileSync(join(DIR, name), "utf-8").trim();
}

export interface TemplateMeta {
  id: string;
  file: string;
  title: string;
  useWhen: string;
  modules: readonly string[];
  /** Source format for the expanded body. Defaults to HTML for legacy widget templates. */
  format?: "html" | "tsx";
  /** Rendering tool this skeleton targets. Defaults to show_widget. */
  target?: "show_widget" | "show_canvas";
}

export const TEMPLATE_CATALOG: readonly TemplateMeta[] = [
  {
    id: "flow-steps",
    file: "flow-steps.html.frag",
    title: "HTML minimal steps",
    useWhen: "2–5 linear process steps, no branches. Quiet vertical rail.",
    modules: ["diagram"],
  },
  {
    id: "flow-mermaid",
    file: "flow-mermaid.html.frag",
    title: "Mermaid flowchart",
    useWhen: "Branches, pipelines, state-ish flows. Neutral theme:base palette.",
    modules: ["diagram"],
  },
  {
    id: "architecture-cards",
    file: "architecture-cards.html.frag",
    title: "Architecture cards",
    useWhen: "Module map / system layers. Hybrid with a tiny Mermaid overview if needed.",
    modules: ["diagram", "mockup"],
  },
  {
    id: "timeline-roadmap",
    file: "timeline-roadmap.html.frag",
    title: "Timeline / roadmap",
    useWhen: "Chronological milestones, phased roadmaps, release history, or implementation stages.",
    modules: ["diagram", "mockup"],
  },
  {
    id: "metric-chart",
    file: "metric-chart.html.frag",
    title: "Metrics + Chart.js",
    useWhen: "KPI strip above a single chart. Custom HTML legend, no Chart.js default legend.",
    modules: ["chart"],
  },
  {
    id: "compare-cards",
    file: "compare-cards.html.frag",
    title: "Compare options",
    useWhen: "Pricing / plan / approach comparison. One hot card max.",
    modules: ["mockup", "interactive"],
  },
  {
    id: "contact-card",
    file: "contact-card.html.frag",
    title: "Data record card",
    useWhen: "Bounded object: contact, receipt, profile. Sit on secondary pad.",
    modules: ["mockup"],
  },
  {
    id: "canvas-brief",
    file: "canvas-brief.tsx.frag",
    title: "Canvas evidence brief",
    useWhen: "Complete analytical brief with scope, takeaway, evidence, findings, caveat, and source/recency context.",
    modules: ["canvas"],
    format: "tsx",
    target: "show_canvas",
  },
  {
    id: "canvas-dashboard",
    file: "canvas-dashboard.tsx.frag",
    title: "Canvas analytical dashboard",
    useWhen: "Open analytical layout with headings, supporting stats, and a data table.",
    modules: ["canvas"],
    format: "tsx",
    target: "show_canvas",
  },
  {
    id: "canvas-charts",
    file: "canvas-charts.tsx.frag",
    title: "Canvas charts",
    useWhen: "Bar/line/pie charts with built-in SVG primitives and no external chart library.",
    modules: ["canvas"],
    format: "tsx",
    target: "show_canvas",
  },
  {
    id: "canvas-form-state",
    file: "canvas-form-state.tsx.frag",
    title: "Canvas form + persistent state",
    useWhen: "Interactive controls whose values should survive canvas reloads.",
    modules: ["canvas"],
    format: "tsx",
    target: "show_canvas",
  },
  {
    id: "canvas-diff",
    file: "canvas-diff.tsx.frag",
    title: "Canvas diff review",
    useWhen: "File-level diff review using Card, DiffStats, and DiffView.",
    modules: ["canvas"],
    format: "tsx",
    target: "show_canvas",
  },
  {
    id: "canvas-todo",
    file: "canvas-todo.tsx.frag",
    title: "Canvas todo + host action",
    useWhen: "Task/status UI with local state and structured host actions.",
    modules: ["canvas"],
    format: "tsx",
    target: "show_canvas",
  },
] as const;

export const TEMPLATE_IDS = TEMPLATE_CATALOG.map((t) => t.id);

const cache = new Map<string, string>();

export function loadTemplate(id: string): string {
  const meta = TEMPLATE_CATALOG.find((t) => t.id === id);
  if (!meta) throw new Error("Unknown template: " + id);
  let body = cache.get(id);
  if (body === undefined) {
    body = load(meta.file);
    cache.set(id, body);
  }
  return body;
}

export interface TemplatesSectionOptions {
  /** Template ids to expand with full HTML bodies. Empty/omit = catalog only. */
  includeBodies?: readonly string[];
}

function catalogForModules(modules: string[]): TemplateMeta[] {
  const wanted = new Set(modules);
  return TEMPLATE_CATALOG.filter((t) => t.modules.some((m) => wanted.has(m)));
}

/** Markdown section injected into visualize_read_me for selected modules. */
export function getTemplatesSection(
  modules: string[],
  options: TemplatesSectionOptions = {},
): string {
  const items = catalogForModules(modules);
  if (items.length === 0) return "";

  const include = new Set(
    (options.includeBodies ?? [])
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const expandAll = include.has("*") || include.has("all");
  const bodies = items.filter((t) => expandAll || include.has(t.id));

  let out = `## Ready-made fragments

Pick a catalog entry as the skeleton for its target rendering tool. Bodies are omitted by default and expanded only when requested.
Widget entries are HTML fragments (no DOCTYPE/\`<html>\`/\`<body>\`); Canvas entries are single-file TSX for \`show_canvas\`.

**Theme contract (required):**
- \`show_widget\`: use host CSS variables only for UI chrome; Chart.js/Mermaid resolve computed CSS vars at runtime.
- \`show_canvas\`: prefer \`@gen-ui/canvas\` primitives and \`useHostTheme()\`; do not hardcode a single light/dark palette.
- Outer container stays transparent; the host provides the page/window background.

| id | target | format | Use when |
|---|---|---|---|
`;

  for (const t of items) {
    out += `| \`${t.id}\` | \`${t.target ?? "show_widget"}\` | \`${t.format ?? "html"}\` | ${t.useWhen} |\n`;
  }

  out += `\n**How to use:** pick the closest id → call \`visualize_read_me\` again with \`templates: ["${items[0]?.id ?? "flow-steps"}"]\` (or multiple ids) → paste the expanded skeleton into its target tool → swap copy/data.\n`;
  out += `Default response is **catalog only** (token-light). Pass \`templates: ["all"]\` only when you truly need every body.\n`;

  if (bodies.length === 0) {
    out += `\n_No template bodies expanded. Re-call with \`templates: ["<id>"]\` to load a skeleton._\n`;
    return out;
  }

  for (const t of bodies) {
    const body = loadTemplate(t.id);
    out += `\n### ${t.title} (\`${t.id}\`)\n${t.useWhen}\n\n\`\`\`${t.format ?? "html"}\n${body}\n\`\`\`\n`;
  }

  return out;
}
