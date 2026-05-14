/**
 * Modal - Overlay modal with backdrop
 * Inspired by pi-btw's overlay system
 */
import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { safeLine, center } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";
import { Panel } from "./Panel.js";
import { Borders } from "../utils/border.js";

export interface ModalOptions {
	width: number;
	height?: number;
	terminalHeight?: number; // Terminal height for centering calculation
	title?: string;
	content: Component;
	backdrop?: boolean;
	backdropChar?: string;
	theme?: Theme;
	borderColor?: ColorFunction;
}

export class Modal implements Component {
	private width: number;
	private height: number;
	private terminalHeight: number;
	private title?: string;
	private content: Component;
	private backdrop: boolean;
	private backdropChar: string;
	private theme: Theme;
	private borderColor: ColorFunction;
	private panel: Panel;

	constructor(options: ModalOptions) {
		this.width = Math.min(options.width, 120);
		this.height = options.height ?? 20;
		this.terminalHeight = options.terminalHeight ?? 24;
		this.title = options.title;
		this.content = options.content;
		this.backdrop = options.backdrop ?? true;
		this.backdropChar = options.backdropChar ?? " ";
		this.theme = options.theme ?? DefaultTheme;
		this.borderColor = options.borderColor ?? this.theme.dim;

		this.panel = new Panel({
			title: this.title,
			border: Borders.rounded,
			padding: 1,
			theme: this.theme,
			borderColor: this.borderColor,
		});
		this.panel.addChild(this.content);
	}

	render(availableWidth: number): string[] {
		// Calculate centered position
		const modalLines = this.panel.render(this.width);
		const actualHeight = Math.min(modalLines.length, this.height);

		const lines: string[] = [];

		// Top margin - centered vertically using terminalHeight
		const topMargin = Math.floor((this.terminalHeight - actualHeight) / 2);
		const safeTopMargin = Math.max(0, topMargin); // Ensure non-negative
		
		for (let i = 0; i < safeTopMargin; i++) {
			lines.push(this.backdrop ? this.theme.dim(this.backdropChar.repeat(availableWidth)) : "");
		}

		// Modal content (centered horizontally)
		const leftMargin = Math.floor((availableWidth - this.width) / 2);
		const leftPad = " ".repeat(Math.max(0, leftMargin));

		for (let i = 0; i < actualHeight; i++) {
			const line = modalLines[i] ?? "";
			const centered = leftPad + line;
			const padded = safeLine(centered, availableWidth);
			
			if (this.backdrop && visibleWidth(padded) < availableWidth) {
				// Fill remaining with backdrop
				const remaining = availableWidth - visibleWidth(padded);
				lines.push(padded + this.theme.dim(this.backdropChar.repeat(remaining)));
			} else {
				lines.push(padded);
			}
		}

		// Bottom margin
		const bottomMargin = this.terminalHeight - safeTopMargin - actualHeight;
		const safeBottomMargin = Math.max(0, bottomMargin);
		for (let i = 0; i < safeBottomMargin; i++) {
			lines.push(this.backdrop ? this.theme.dim(this.backdropChar.repeat(availableWidth)) : "");
		}

		return lines;
	}

	invalidate(): void {
		this.panel.invalidate();
		this.content.invalidate();
	}
}
