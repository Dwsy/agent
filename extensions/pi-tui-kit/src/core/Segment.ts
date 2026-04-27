/**
 * Segment - Powerline-style status bar segment
 * Inspired by pi-powerline-footer
 */
import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import { safeLine, leftAlign } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";

export interface SegmentOptions {
	content: string;
	icon?: string;
	bgColor?: ColorFunction;
	fgColor?: ColorFunction;
	separator?: string;
	separatorColor?: ColorFunction;
	bold?: boolean;
	padding?: number;
}

export class Segment implements Component {
	private content: string;
	private icon?: string;
	private bgColor: ColorFunction;
	private fgColor: ColorFunction;
	private separator: string;
	private separatorColor: ColorFunction;
	private bold: boolean;
	private padding: number;

	constructor(options: SegmentOptions) {
		this.content = options.content;
		this.icon = options.icon;
		this.bgColor = options.bgColor ?? ((t: string) => t);
		this.fgColor = options.fgColor ?? ((t: string) => t);
		this.separator = options.separator ?? "";
		this.separatorColor = options.separatorColor ?? ((t: string) => t);
		this.bold = options.bold ?? false;
		this.padding = options.padding ?? 1;
	}

	render(width: number): string[] {
		let text = this.content;
		if (this.icon) {
			text = `${this.icon} ${text}`;
		}
		if (this.bold) {
			text = `\x1b[1m${text}\x1b[22m`;
		}

		// Add padding
		const pad = " ".repeat(this.padding);
		text = `${pad}${text}${pad}`;

		const contentWidth = visibleWidth(text);

		// Apply colors
		const styled = this.bgColor(this.fgColor(text));

		// Add separator
		const fullContent = this.separator
			? styled + this.separatorColor(this.separator)
			: styled;

		return [safeLine(fullContent, width)];
	}

	getWidth(): number {
		let text = this.content;
		if (this.icon) {
			text = `${this.icon} ${text}`;
		}
		const pad = " ".repeat(this.padding);
		return visibleWidth(`${pad}${text}${pad}`) + (this.separator ? visibleWidth(this.separator) : 0);
	}

	invalidate(): void {
		// No cache
	}
}

/**
 * Powerline - Combines multiple segments into a status bar
 */
export interface PowerlineOptions {
	segments: Segment[];
	align?: "left" | "right" | "center";
	fillChar?: string;
	fillColor?: ColorFunction;
}

export class Powerline implements Component {
	private segments: Segment[];
	private align: "left" | "right" | "center";
	private fillChar: string;
	private fillColor: ColorFunction;

	constructor(options: PowerlineOptions) {
		this.segments = options.segments;
		this.align = options.align ?? "left";
		this.fillChar = options.fillChar ?? " ";
		this.fillColor = options.fillColor ?? ((t: string) => t);
	}

	render(width: number): string[] {
		const totalWidth = this.segments.reduce((sum, seg) => sum + seg.getWidth(), 0);
		let line = "";

		// Build segment content
		for (const segment of this.segments) {
			const segLines = segment.render(width);
			if (segLines.length > 0) {
				line += segLines[0];
			}
		}

		// Fill remaining space
		const lineWidth = visibleWidth(line);
		if (lineWidth < width) {
			const fill = this.fillChar.repeat(width - lineWidth);
			switch (this.align) {
				case "right":
					line = this.fillColor(fill) + line;
					break;
				case "center": {
					const left = Math.floor((width - lineWidth) / 2);
					const right = width - lineWidth - left;
					line = this.fillColor(this.fillChar.repeat(left)) + line + this.fillColor(this.fillChar.repeat(right));
					break;
				}
			case "left":
			default:
				line += this.fillColor(fill);
			}
		}

		return [safeLine(line, width)];
	}

	invalidate(): void {
		for (const seg of this.segments) {
			seg.invalidate();
		}
	}
}
