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

Copy a fragment as the skeleton for \`show_widget\`. Replace labels/data; keep structure, spacing, and neutral borders.
These are **HTML fragments** (no DOCTYPE/\`<html>\`/\`<body>\`). Prefer them over inventing multi-color SVG flow boxes.

**Theme contract (required):**
- Surfaces/text/borders use host CSS variables only (\`--color-text-*\`, \`--color-background-*\`, \`--color-border-*\`).
- Never hardcode \`#fff\` / \`#333\` / light-only grays — both light and dark must work.
- Chart.js / Mermaid: resolve colors from \`getComputedStyle\` or \`window._themeVars()\` at runtime (\`text\`, \`textSecondary\`, \`textInfo\`, \`chartTick\`, \`chartGrid\`, …).
- Outer container stays transparent; host provides page background.

| id | Use when |
|---|---|
`;

  for (const t of items) {
    out += `| \`${t.id}\` | ${t.useWhen} |\n`;
  }

  out += `\n**How to use:** pick the closest id → call \`visualize_read_me\` again with \`templates: ["${items[0]?.id ?? "flow-steps"}"]\` (or multiple ids) to load full HTML → paste into \`show_widget\` → swap copy/data.\n`;
  out += `Default response is **catalog only** (token-light). Pass \`templates: ["all"]\` only when you need every body.\n`;

  if (bodies.length === 0) {
    out += `\n_No template bodies expanded. Re-call with \`templates: ["<id>"]\` to load a skeleton._\n`;
    return out;
  }

  for (const t of bodies) {
    const body = loadTemplate(t.id);
    out += `\n### ${t.title} (\`${t.id}\`)\n${t.useWhen}\n\n\`\`\`html\n${body}\n\`\`\`\n`;
  }

  return out;
}
