/**
 * Text - Simple text display with wrapping and alignment
 */
import type { Component } from "@mariozechner/pi-tui";
import { wrapTextWithAnsi, visibleWidth } from "@mariozechner/pi-tui";
import { safeLine, leftAlign, rightAlign, center } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";

export type TextAlign = "left" | "center" | "right";

export interface TextOptions {
	content: string;
	align?: TextAlign;
	color?: ColorFunction;
	wrap?: boolean;
	theme?: Theme;
}

export class Text implements Component {
	private content: string;
	private align: TextAlign;
	private color?: ColorFunction;
	private wrap: boolean;

	constructor(options: TextOptions) {
		this.content = options.content;
		this.align = options.align ?? "left";
		this.color = options.color;
		this.wrap = options.wrap ?? false;
	}

	render(width: number): string[] {
		let lines: string[];

		if (this.wrap) {
			lines = wrapTextWithAnsi(this.content, width);
		} else {
			// Split by newlines but don't wrap
			lines = this.content.split("\n").map((line) => {
				if (visibleWidth(line) > width) {
					return line.slice(0, width);
				}
				return line;
			});
		}

		return lines.map((line) => {
			let styled = this.color ? this.color(line) : line;

			switch (this.align) {
				case "center":
					return center(styled, width);
				case "right":
					return rightAlign(styled, width);
				case "left":
				default:
					return leftAlign(styled, width);
			}
		});
	}

	invalidate(): void {
		// No cache to invalidate
	}
}
