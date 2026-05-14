/**
 * Box - Container with padding and optional border
 */
import type { Component, Container } from "@earendil-works/pi-tui";
import { Container as TuiContainer } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import { Borders, BorderStyle, renderBox } from "../utils/border.js";
import { safeLine } from "../utils/text.js";
import type { Theme } from "../utils/style.js";

export interface BoxOptions {
	paddingX?: number;
	paddingY?: number;
	border?: boolean;
	borderStyle?: BorderStyle;
	title?: string;
	theme?: Theme;
}

export class Box extends TuiContainer implements Component {
	private paddingX: number;
	private paddingY: number;
	private border: boolean;
	private borderStyle: BorderStyle;
	private title?: string;
	private theme: Theme;

	constructor(options: BoxOptions = {}) {
		super();
		this.paddingX = options.paddingX ?? 0;
		this.paddingY = options.paddingY ?? 0;
		this.border = options.border ?? false;
		this.borderStyle = options.borderStyle ?? Borders.single;
		this.title = options.title;
		this.theme = options.theme ?? ({} as Theme);
	}

	render(width: number): string[] {
		const borderChars = this.border ? 2 : 0;
		const contentWidth = Math.max(0, width - borderChars - this.paddingX * 2);

		let lines: string[] = [];

		// Render children
		for (const child of this.children) {
			lines.push(...child.render(contentWidth));
		}

		// Apply padding Y
		const emptyLine = " ".repeat(contentWidth);
		for (let i = 0; i < this.paddingY; i++) {
			lines.unshift(emptyLine);
			lines.push(emptyLine);
		}

		// Apply padding X
		const padding = " ".repeat(this.paddingX);
		lines = lines.map((line) => {
			const lineWidth = visibleWidth(line);
			if (lineWidth > contentWidth) {
				return padding + truncateToWidth(line, contentWidth) + padding;
			}
			return padding + line + " ".repeat(contentWidth - lineWidth) + padding;
		});

		// Apply border
		if (this.border) {
			const totalWidth = width;
			const contentHeight = lines.length;
			
			// Build box manually to merge content
			const result: string[] = [];
			const inner = totalWidth - 2;

			// Top border with optional title
			if (this.title) {
				const titleWidth = Math.min(visibleWidth(this.title), inner - 2);
				const titleText = truncateToWidth(this.title, titleWidth);
				const pad = inner - titleWidth;
				const left = Math.floor(pad / 2);
				const right = pad - left;
				result.push(
					this.borderStyle.tl + 
					this.borderStyle.h.repeat(left) + 
					" " + titleText + " " + 
					this.borderStyle.h.repeat(right) + 
					this.borderStyle.tr
				);
			} else {
				result.push(this.borderStyle.tl + this.borderStyle.h.repeat(inner) + this.borderStyle.tr);
			}

			// Content lines with side borders
			for (const line of lines) {
				const paddedLine = safeLine(line, inner);
				result.push(this.borderStyle.v + paddedLine + this.borderStyle.v);
			}

			// Bottom border
			result.push(this.borderStyle.bl + this.borderStyle.h.repeat(inner) + this.borderStyle.br);
			return result;
		}

		return lines.map((line) => safeLine(line, width));
	}
}
