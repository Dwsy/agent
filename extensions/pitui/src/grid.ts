/**
 * Cell grid compositor. Every cell is one display column; wide (CJK/emoji)
 * chars write into one cell and mark the next as a continuation, so flattened
 * output is always exactly `width` display columns wide — the invariant
 * pi-tui needs to avoid "line exceeds terminal width" crashes.
 */

import { charWidth, clipWidth, strWidth, type ColorKey, type Palette } from "./ansi.ts";

interface Cell {
	ch: string;
	color: ColorKey | undefined;
}

export interface Painter {
	text(x: number, y: number, s: string, color?: ColorKey): void;
	textRight(x: number, y: number, width: number, s: string, color?: ColorKey): void;
	fill(x: number, y: number, w: number, h: number, ch: string, color?: ColorKey): void;
}

const EMPTY: Cell = { ch: " ", color: undefined };

export class Grid implements Painter {
	readonly width: number;
	readonly height: number;
	private readonly rows: Cell[][];

	constructor(width: number, height: number) {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.rows = Array.from({ length: this.height }, () =>
			Array.from({ length: this.width }, () => ({ ...EMPTY })),
		);
	}

	text(x: number, y: number, s: string, color?: ColorKey): void {
		if (y < 0 || y >= this.height) return;
		const row = this.rows[y]!;
		let cx = x;
		for (const ch of s) {
			const w = charWidth(ch);
			if (w === 0) continue;
			if (cx < 0) {
				cx += w;
				continue;
			}
			if (cx + w > this.width) return;
			this.detach(row, cx);
			if (w === 2) this.detach(row, cx + 1);
			row[cx] = { ch, color };
			for (let k = 1; k < w; k++) row[cx + k] = { ch: "", color };
			cx += w;
		}
	}

	/**
	 * 拆除占两列的宽字符:被覆盖半列时补齐另一半为空格,
	 * 保证行的显示宽度恒等于网格宽度。
	 */
	private detach(row: Cell[], x: number): void {
		if (x < 0 || x >= this.width) return;
		const cell = row[x]!;
		if (cell.ch === "") {
			if (x > 0) row[x - 1] = { ...EMPTY };
		} else if (charWidth(cell.ch) === 2) {
			if (x + 1 < this.width) row[x + 1] = { ...EMPTY };
		}
	}

	textRight(x: number, y: number, width: number, s: string, color?: ColorKey): void {
		const clipped = strWidth(s) > width ? clipFromLeft(s, width) : s;
		this.text(x + (width - strWidth(clipped)), y, clipped, color);
	}

	fill(x: number, y: number, w: number, h: number, ch: string, color?: ColorKey): void {
		for (let dy = 0; dy < h; dy++) {
			for (let dx = 0; dx < w; dx++) this.text(x + dx, y + dy, ch, color);
		}
	}

	/** Rounded-ish box: ┌─┐ │ └─┘, only used for window chrome and buttons. */
	box(x: number, y: number, w: number, h: number, color?: ColorKey): void {
		if (w < 2 || h < 2) return;
		this.text(x, y, "┌" + "─".repeat(w - 2) + "┐", color);
		this.text(x, y + h - 1, "└" + "─".repeat(w - 2) + "┘", color);
		for (let dy = 1; dy < h - 1; dy++) {
			this.text(x, y + dy, "│", color);
			this.text(x + w - 1, y + dy, "│", color);
		}
	}

	flatten(pal: Palette): string[] {
		return this.rows.map((row) => {
			let out = "";
			let run = "";
			let runColor: ColorKey | undefined;
			const flush = () => {
				if (run === "") return;
				out += runColor ? pal.fg(runColor, run) : run;
				run = "";
			};
			for (const cell of row) {
				if (cell.ch === "") continue;
				if (cell.color !== runColor) {
					flush();
					runColor = cell.color;
				}
				run += cell.ch;
			}
			flush();
			return out;
		});
	}
}

/** Drop leading code points until the remainder fits in `max` display columns. */
function clipFromLeft(s: string, max: number): string {
	const chars = [...s];
	let w = strWidth(s);
	while (chars.length > 0 && w > max) {
		w -= charWidth(chars.shift()!);
	}
	return chars.join("");
}

/**
 * Painter that offsets every coordinate — used for window content areas.
 * When w/h are given, painting is clipped to that content rect so app output
 * can never overwrite the window border.
 */
export function offsetPainter(p: Painter, ox: number, oy: number, w?: number, h?: number): Painter {
	const clipX = (x: number) => (w === undefined ? x : Math.max(0, Math.min(x, w)));
	return {
		text: (x, y, s, color) => {
			if (h !== undefined && (y < 0 || y >= h)) return;
			if (w !== undefined) {
				if (x < 0 || x >= w) return;
				s = clipWidth(s, w - x);
			}
			p.text(ox + x, oy + y, s, color);
		},
		textRight: (x, y, width, s, color) => {
			if (h !== undefined && (y < 0 || y >= h)) return;
			const avail = w === undefined ? width : Math.max(0, Math.min(width, w - x));
			p.textRight(ox + clipX(x), oy + y, avail, s, color);
		},
		fill: (x, y, fw, fh, ch, color) => {
			const x2 = w === undefined ? x + fw : Math.min(x + fw, w);
			const y2 = h === undefined ? y + fh : Math.min(y + fh, h);
			for (let yy = Math.max(0, y); yy < y2; yy++) {
				for (let xx = Math.max(0, x); xx < x2; xx++) p.text(ox + xx, oy + yy, ch, color);
			}
		},
	};
}
