/**
 * ANSI-safe text metrics + the minimal palette contract used by pitui.
 * Structural rendering is cell-based (see grid.ts); these helpers handle
 * the few places where we measure whole strings (titles, dock labels).
 */

export type ColorKey = "text" | "muted" | "dim" | "accent" | "warning" | "error";

export interface Palette {
	fg(color: ColorKey, text: string): string;
	bold(text: string): string;
	inverse(text: string): string;
}

export const plainPalette: Palette = {
	fg: (_color, text) => text,
	bold: (text) => text,
	inverse: (text) => text,
};

/** East Asian Wide / Fullwidth + common emoji blocks → 2 columns. */
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
	[0x1100, 0x115f],
	[0x2e80, 0x303e],
	[0x3041, 0x33ff],
	[0x3400, 0x4dbf],
	[0x4e00, 0x9fff],
	[0xa000, 0xa4cf],
	[0xac00, 0xd7a3],
	[0xf900, 0xfaff],
	[0xfe10, 0xfe19],
	[0xfe30, 0xfe6f],
	[0xff00, 0xff60],
	[0xffe0, 0xffe6],
	[0x1f300, 0x1f64f],
	[0x1f900, 0x1f9ff],
	[0x1fa70, 0x1faff],
];

export function charWidth(ch: string): number {
	const cp = ch.codePointAt(0) ?? 0;
	// ZWJ and combining marks take no column of their own.
	if (cp === 0x200d || (cp >= 0x0300 && cp <= 0x036f)) return 0;
	for (const [lo, hi] of WIDE_RANGES) {
		if (cp >= lo && cp <= hi) return 2;
	}
	return 1;
}

export function strWidth(s: string): number {
	let w = 0;
	for (const ch of s) w += charWidth(ch);
	return w;
}

/** Slice `s` to at most `max` display columns (wide-char safe). */
export function clipWidth(s: string, max: number): string {
	let w = 0;
	let out = "";
	for (const ch of s) {
		const cw = charWidth(ch);
		if (w + cw > max) break;
		out += ch;
		w += cw;
	}
	return out;
}

export function isPrintable(ch: string): boolean {
	const cp = ch.codePointAt(0) ?? 0;
	return cp >= 32 && cp !== 0x7f;
}
