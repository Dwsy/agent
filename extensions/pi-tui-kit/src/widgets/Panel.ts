/**
 * Panel - Bordered container with optional title
 * Simplified API for common use cases
 */
import type { Component } from "@mariozechner/pi-tui";
import { Container } from "@mariozechner/pi-tui";
import { Borders, BorderStyle } from "../utils/border.js";
import { safeLine, buildLine } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";

export interface PanelOptions {
	title?: string;
	border?: BorderStyle;
	padding?: number;
	theme?: Theme;
	borderColor?: ColorFunction;
}

export class Panel extends Container implements Component {
	private title?: string;
	private border: BorderStyle;
	private padding: number;
	private theme: Theme;
	private borderColor: ColorFunction;

	constructor(options: PanelOptions = {}) {
		super();
		this.title = options.title;
		this.border = options.border ?? Borders.single;
		this.padding = options.padding ?? 1;
		this.theme = options.theme ?? DefaultTheme;
		this.borderColor = options.borderColor ?? this.theme.dim;
	}

	render(width: number): string[] {
		const B = this.borderColor;
		// Total inner width (inside borders) - borders are 2 chars
		const innerWidth = Math.max(0, width - 2);
		// Content width (inside padding)
		const contentWidth = Math.max(0, innerWidth - this.padding * 2);

		// Render children - they get content width
		let contentLines: string[] = [];
		for (const child of this.children) {
			contentLines.push(...child.render(contentWidth));
		}

		// Apply padding - add empty lines with padding spaces
		if (this.padding > 0) {
			const emptyLine = " ".repeat(contentWidth);
			const paddedEmpty = " ".repeat(this.padding) + emptyLine + " ".repeat(this.padding);
			for (let i = 0; i < this.padding; i++) {
				contentLines.unshift(paddedEmpty);
				contentLines.push(paddedEmpty);
			}
		}

		const lines: string[] = [];

		// Top border with title
		if (this.title && visibleWidth(this.title) > 0) {
			const titleWidth = Math.min(visibleWidth(this.title), innerWidth - 2);
			const titleText = truncateToWidth(this.title, titleWidth);
			const pad = innerWidth - titleWidth;
			const left = Math.floor(pad / 2);
			const right = pad - left;
			
			// Build manually to ensure exact width
			const topBorder = 
				B(this.border.tl) +
				B(this.border.h.repeat(left)) +
				" " + titleText + " " +
				B(this.border.h.repeat(right)) +
				B(this.border.tr);
			lines.push(safeLine(topBorder, width));
		} else {
			const topBorder = 
				B(this.border.tl) +
				B(this.border.h.repeat(innerWidth)) +
				B(this.border.tr);
			lines.push(safeLine(topBorder, width));
		}

		// Content with side borders
		for (const line of contentLines) {
			// Ensure line is exactly innerWidth chars
			const paddedContent = safeLine(line, innerWidth);
			const contentLine = 
				B(this.border.v) +
				paddedContent +
				B(this.border.v);
			lines.push(safeLine(contentLine, width));
		}

		// Bottom border
		const bottomBorder = 
			B(this.border.bl) +
			B(this.border.h.repeat(innerWidth)) +
			B(this.border.br);
		lines.push(safeLine(bottomBorder, width));

		return lines;
	}
}
