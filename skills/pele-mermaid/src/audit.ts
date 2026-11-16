/**
 * Static audit of a rendered SVG.
 *
 * Upstream visual-explainer opens the page in headless Chrome and reports overlapping
 * text, labels under 12 px, labels crossing a line, and sideways scrolling. A standalone
 * .svg file cannot be checked that way here (no browser, no page), so this module does
 * what can be decided from the SVG itself.
 *
 * Everything here is a fact about the produced file, not a guess about how it will look.
 */

export interface Audit {
	/** Labels smaller than the legibility floor. */
	tinyLabels: { size: number; text: string }[];
	/** Root width and height in px. */
	width: number;
	height: number;
	/** viewBox aspect ratio. */
	aspect: number;
	/** True when scaling down to 360 px would push labels under the floor. */
	unreadableWhenScaled: boolean;
	/** Labels whose box overlaps another label's box. */
	overlaps: { a: string; b: string }[];
	/** Labels whose text runs past the left or right edge of the drawing. */
	overflowing: string[];
}

const MIN_LABEL_PX = 12;
/** The narrowest column a diagram is usually dropped into. */
const PHONE_WIDTH = 360;

interface TextBox {
	text: string;
	/** Absolute position in the drawing, after ancestor transforms. */
	x: number;
	y: number;
	size: number;
	width: number;
}

function parseAttributes(tag: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	for (const match of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
	return attrs;
}

/** Width of a label in px: CJK glyphs are about one em, latin ones about half. */
function textWidth(text: string, size: number): number {
	let width = 0;
	for (const ch of text) width += ch.charCodeAt(0) > 0x2e80 ? size : size * 0.55;
	return width;
}

/**
 * Reads every <text> label with its absolute position.
 * Pele puts node labels inside <g transform="translate(x,y)">, so the raw x/y of a
 * <text> is relative to its group; the ancestor offsets have to be accumulated.
 */
export function collectLabels(svg: string): TextBox[] {
	const labels: TextBox[] = [];
	const stack: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }];

	const tagRe = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>|<\/([a-zA-Z]+)>/g;
	let match: RegExpExecArray | null;
	let pendingText: { attrs: Record<string, string>; body: string } | null = null;

	while ((match = tagRe.exec(svg)) !== null) {
		const [full, closing, name, rawAttrs = "", selfClosing, closeName] = match;

		if (closing === "/") {
			// </text> ends a label
			if (closeName === "text" && pendingText) {
				const parent = stack[stack.length - 1];
				const attrs = pendingText.attrs;
				const text = pendingText.body.replace(/<[^>]*>/g, "").trim();
				if (text) {
					const size = Number(/font-size="([\d.]+)"/.exec(attrs["font-size"] ?? "")?.[1] ?? 16);
					labels.push({
						text,
						x: parent.dx + Number(attrs.x ?? 0),
						y: parent.dy + Number(attrs.y ?? 0),
						size,
						width: textWidth(text, size),
					});
				}
				pendingText = null;
			} else if (closeName === "g") {
				if (stack.length > 1) stack.pop();
			}
			continue;
		}

		if (name === "text") {
			if (selfClosing) continue;
			pendingText = { attrs: parseAttributes(rawAttrs), body: "" };
			continue;
		}
		if (name === "g" && !selfClosing) {
			const attrs = parseAttributes(rawAttrs);
			const translate = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(attrs.transform ?? "");
			const parent = stack[stack.length - 1];
			stack.push({
				dx: parent.dx + (translate ? Number(translate[1]) : 0),
				dy: parent.dy + (translate ? Number(translate[2]) : 0),
			});
			continue;
		}
		if (name === "text" && pendingText) {
			pendingText.body += full;
		}
	}
	return labels;
}

function boxesOverlap(a: TextBox, b: TextBox): boolean {
	const dx = Math.abs(a.x - b.x);
	const dy = Math.abs(a.y - b.y);
	return dx < (a.width + b.width) / 2 && dy < Math.max(a.size, b.size);
}

export function auditSvg(svg: string): Audit {
	const root = /<svg\b([^>]*)>/.exec(svg)?.[1] ?? "";
	const attrs = parseAttributes(root);
	const viewBox = (attrs.viewBox ?? "0 0 1 1").trim().split(/[\s,]+/).map(Number);
	const width = Number(attrs.width ?? viewBox[2] ?? 0);
	const height = Number(attrs.height ?? viewBox[3] ?? 0);

	const labels = collectLabels(svg);
	const tinyLabels = labels
		.filter((label) => label.size < MIN_LABEL_PX)
		.map((label) => ({ size: label.size, text: label.text }));

	const overlaps: { a: string; b: string }[] = [];
	for (let i = 0; i < labels.length; i += 1) {
		for (let j = i + 1; j < labels.length; j += 1) {
			if (boxesOverlap(labels[i], labels[j])) overlaps.push({ a: labels[i].text, b: labels[j].text });
		}
	}

	const overflowing = labels
		.filter((label) => label.x - label.width / 2 < -1 || label.x + label.width / 2 > width + 1)
		.map((label) => label.text);

	const scale = width > 0 ? PHONE_WIDTH / width : 1;
	const smallest = labels.length > 0 ? Math.min(...labels.map((label) => label.size)) : MIN_LABEL_PX;

	return {
		tinyLabels,
		width,
		height,
		aspect: height > 0 ? width / height : 0,
		unreadableWhenScaled: scale < 1 && smallest * scale < MIN_LABEL_PX,
		overlaps,
		overflowing,
	};
}

/** One-line summary for CLI output; empty when nothing was found. */
export function auditSummary(audit: Audit): string[] {
	const notes: string[] = [];
	if (audit.tinyLabels.length > 0) {
		notes.push(`${audit.tinyLabels.length} label(s) under ${MIN_LABEL_PX}px: ${audit.tinyLabels.slice(0, 3).map((l) => l.text).join(", ")}`);
	}
	if (audit.overlaps.length > 0) {
		notes.push(`${audit.overlaps.length} overlapping label pair(s): ${audit.overlaps.slice(0, 2).map((p) => `${p.a}/${p.b}`).join(", ")}`);
	}
	if (audit.overflowing.length > 0) {
		notes.push(`${audit.overflowing.length} label(s) past the edge: ${audit.overflowing.slice(0, 3).join(", ")}`);
	}
	if (audit.unreadableWhenScaled) {
		notes.push(`scaled to ${PHONE_WIDTH}px the labels fall under ${MIN_LABEL_PX}px; split the diagram or set --max-width`);
	}
	return notes;
}
