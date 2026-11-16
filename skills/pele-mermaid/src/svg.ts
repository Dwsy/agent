/**
 * SVG production for `pele-mermaid`: Pele render, theme, and standalone-file dressing.
 *
 * Pele emits an SVG that leans on inherited CSS variables, so a bare `render()` result
 * changes colour depending on which page opens it. Everything here exists to make one
 * file carry its own theme, stay legible at small sizes, and say what it shows.
 */

import { PeleError, render } from "../vendor/pele.mjs";

export type Theme = "light" | "dark";

export interface RenderInput {
	source: string;
	theme: Theme;
	font?: string;
	maxWidth: number;
	transparent: boolean;
	/** Accessible name written to the root `<svg aria-label>`. */
	label?: string;
}

export interface RenderOutput {
	svg: string;
	type: string;
	mermaidType: string;
	width: number;
	height: number;
}

/** Pele's own dark palette: https://pele.run/theming#setting-variables */
const DARK_VARS = [
	"--pele-bg:#100f0f",
	"--pele-fg:#cecdc3",
	"--pele-fg-on-light:#100f0f",
	"--pele-fg-on-dark:#cecdc3",
	"--pele-muted:#878580",
	"--pele-line:#cecdc3",
	"--pele-surface:#1c1b1a",
	"--pele-surface-alt:#282726",
	"--pele-border:#403e3c",
	"--pele-accent:#4385be",
	"--pele-critical:#d14d41",
	"--pele-error:#d14d41",
];

/** Pele sometimes draws a label below this size, which is unreadable on a phone. */
const MIN_LABEL_PX = 12;
const MAX_FONT_PX = 24;

function smallestLabel(svg: string): number {
	const sizes = [...svg.matchAll(/font-size(?:="|:\s*)([\d.]+)/g)].map((m) => Number(m[1]));
	return sizes.length > 0 ? Math.min(...sizes) : Number.POSITIVE_INFINITY;
}

/** Grows the base font until Pele's smallest label clears the legibility floor. */
function renderLegible(source: string, options: Record<string, unknown>, baseFontSize: number): ReturnType<typeof render> {
	for (let fontSize = baseFontSize; ; fontSize += 1) {
		const result = render(source, { ...options, fontSize });
		if (fontSize >= MAX_FONT_PX || smallestLabel(result.svg) >= MIN_LABEL_PX) return result;
	}
}

/** Narrow-layout width. Pele flips LR to TB below 640 px on its own; 280 px is the phone case. */
const NARROW_WIDTH = 280;

export { NARROW_WIDTH };

/**
 * Sets theme variables on the root `<svg>` and adds an opaque background.
 * Without the variables a saved file takes the colours of whatever app opens it;
 * without the background, dark-theme text lands on a transparent (often dark) page.
 */
function dress(svg: string, theme: Theme, font: string | undefined, transparent: boolean, label: string | undefined): string {
	const css = theme === "dark" ? [...DARK_VARS] : [];
	if (font) css.push(`--pele-font:${font}`);

	const rootEnd = svg.indexOf(">");
	if (rootEnd < 0) return svg;
	let root = svg.slice(0, rootEnd);
	const body = svg.slice(rootEnd + 1);

	if (label) {
		root = root
			.replace(' role="graphics-document document"', ' role="img"')
			.replace(/^<svg/, `<svg aria-label="${escapeAttr(label)}"`);
	}
	if (css.length > 0) {
		const styleAt = root.indexOf(' style="');
		root =
			styleAt >= 0
				? `${root.slice(0, styleAt + 8)}${css.join(";")};${root.slice(styleAt + 8)}`
				: `${root} style="${css.join(";")}"`;
	}

	const background = transparent ? "" : '<rect class="pele-bg" x="0" y="0" width="100%" height="100%" fill="var(--_bg)"/>';
	return `${root}>${background}${body}`;
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderDiagram(input: RenderInput): RenderOutput {
	const options = {
		...(input.maxWidth > 0 ? { maxWidth: input.maxWidth } : {}),
		...(input.font ? { fontFamily: input.font } : {}),
		padding: 8,
	};
	const result = renderLegible(input.source, options, 16);
	return {
		svg: dress(result.svg, input.theme, input.font, input.transparent, input.label),
		type: result.type,
		mermaidType: result.mermaidType,
		width: Math.round(result.width),
		height: Math.round(result.height),
	};
}

export interface DiagramError {
	n: number;
	code: string;
	message: string;
	line?: number;
	column?: number;
	snippet?: string;
}

/** Narrows a thrown value into the JSON shape callers see; `PeleError` carries position data. */
export function describeError(error: unknown, n: number): DiagramError {
	if (error instanceof PeleError) {
		return { n, code: error.code, message: error.message, line: error.line, column: error.column, snippet: error.snippet };
	}
	return { n, code: "render", message: error instanceof Error ? error.message : String(error) };
}
