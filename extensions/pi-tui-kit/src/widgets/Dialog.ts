/**
 * Dialog - Modal dialog with title, content, and action buttons
 */
import type { Component, Focusable } from "@earendil-works/pi-tui";
import { Container } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import { Borders, BorderStyle } from "../utils/border.js";
import { safeLine, center, leftAlign } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";
import { Button } from "./Button.js";

export interface DialogAction {
	id: string;
	label: string;
	primary?: boolean;
	danger?: boolean;
	onClick?: () => void;
}

export interface DialogOptions {
	title: string;
	content?: string | Component;
	actions: DialogAction[];
	width?: number;
	maxHeight?: number;
	border?: BorderStyle;
	theme?: Theme;
	center?: boolean;
}

export class Dialog extends Container implements Component, Focusable {
	private title: string;
	private content: string | Component;
	private actions: DialogAction[];
	private width: number;
	private maxHeight: number;
	private border: BorderStyle;
	private theme: Theme;
	private center: boolean;
	private actionButtons: Button[] = [];
	private focusedIndex = 0;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.updateFocus();
	}

	constructor(options: DialogOptions) {
		super();
		this.title = options.title;
		this.content = options.content ?? "";
		this.actions = options.actions;
		this.width = Math.max(40, options.width ?? 60);
		this.maxHeight = options.maxHeight ?? 20;
		this.border = options.border ?? Borders.single;
		this.theme = options.theme ?? DefaultTheme;
		this.center = options.center ?? true;

		// Create buttons
		this.actionButtons = this.actions.map((action, index) => {
			return new Button({
				label: action.label,
				onClick: () => {
					action.onClick?.();
				},
				theme: this.theme,
				accentColor: action.danger ? this.theme.error : action.primary ? this.theme.accent : undefined,
			});
		});

		this.updateFocus();
	}

	private updateFocus(): void {
		for (let i = 0; i < this.actionButtons.length; i++) {
			this.actionButtons[i].focused = this._focused && i === this.focusedIndex;
		}
	}

	nextButton(): void {
		this.focusedIndex = (this.focusedIndex + 1) % this.actionButtons.length;
		this.updateFocus();
	}

	previousButton(): void {
		this.focusedIndex = (this.focusedIndex - 1 + this.actionButtons.length) % this.actionButtons.length;
		this.updateFocus();
	}

	activate(): void {
		const action = this.actions[this.focusedIndex];
		if (action) {
			action.onClick?.();
		}
	}

	handleInput(data: string): void {
		switch (data) {
			case "left":
				this.previousButton();
				break;
			case "right":
				this.nextButton();
				break;
			case "\t": // Tab
				this.nextButton();
				break;
			case "\r": // Enter
			case " ": // Space
				this.activate();
				break;
			default:
				// Forward to focused button
				const button = this.actionButtons[this.focusedIndex];
				if (button) {
					button.handleInput(data);
				}
		}
	}

	render(width: number): string[] {
		// Use requested width or available width
		const dialogWidth = Math.min(this.width, width - 4);
		const inner = dialogWidth - 2;
		const B = this.theme.border;

		const lines: string[] = [];

		// Top border with title
		const titleWidth = Math.min(visibleWidth(this.title), inner - 2);
		const titleText = truncateToWidth(this.title, titleWidth);
		const pad = inner - titleWidth;
		const left = Math.floor(pad / 2);
		const right = pad - left;

		lines.push(
			safeLine(
				B(this.border.tl) +
				B(this.border.h.repeat(left)) +
				" " +
				this.theme.bold(titleText) +
				" " +
				B(this.border.h.repeat(right)) +
				B(this.border.tr),
				dialogWidth
			)
		);

		// Content separator
		lines.push(
			safeLine(
				B(this.border.lj ?? this.border.v) +
				this.border.h.repeat(inner) +
				B(this.border.rj ?? this.border.v),
				dialogWidth
			)
		);

		// Content
		let contentLines: string[] = [];
		if (typeof this.content === "string") {
			// Simple text content - wrap to fit
			const words = this.content.split(/\s+/);
			let currentLine = "";
			for (const word of words) {
				const test = currentLine ? currentLine + " " + word : word;
				if (visibleWidth(test) > inner - 2) {
					if (currentLine) {
						contentLines.push(currentLine);
					}
					currentLine = visibleWidth(word) > inner - 2 ? truncateToWidth(word, inner - 2) : word;
				} else {
					currentLine = test;
				}
			}
			if (currentLine) {
				contentLines.push(currentLine);
			}
		} else {
			// Component content
			contentLines = this.content.render(inner - 2);
		}

		// Pad content and add borders
		const maxContentHeight = this.maxHeight - 6; // Space for borders and buttons
		const visibleContent = contentLines.slice(0, maxContentHeight);

		for (const line of visibleContent) {
			const padded = leftAlign(line, inner - 2);
			lines.push(
				safeLine(
					B(this.border.v) + " " + padded + " " + B(this.border.v),
					dialogWidth
				)
			);
		}

		// Fill remaining content space
		const contentHeight = Math.min(visibleContent.length, maxContentHeight);
		for (let i = contentHeight; i < maxContentHeight; i++) {
			lines.push(
				safeLine(
					B(this.border.v) + " ".repeat(inner) + B(this.border.v),
					dialogWidth
				)
			);
		}

		// Separator before buttons
		lines.push(
			safeLine(
				B(this.border.lj ?? this.border.v) +
				this.border.h.repeat(inner) +
				B(this.border.rj ?? this.border.v),
				dialogWidth
			)
		);

		// Buttons row
		const buttonWidth = Math.floor((inner - 2) / this.actionButtons.length);
		let buttonRow = B(this.border.v) + " ";
		let buttonRowWidth = 1; // Start after left border

		for (let i = 0; i < this.actionButtons.length; i++) {
			const btn = this.actionButtons[i];
			const btnLines = btn.render(buttonWidth - 2);
			const btnLine = btnLines[0] ?? "";
			const alignedBtn = leftAlign(btnLine, buttonWidth - 2);
			buttonRow += alignedBtn;
			buttonRowWidth += visibleWidth(alignedBtn);
			if (i < this.actionButtons.length - 1) {
				buttonRow += "  ";
				buttonRowWidth += 2;
			}
		}

		// Pad to fill inner width and add right border
		const remainingPad = Math.max(0, inner - buttonRowWidth);
		buttonRow += " ".repeat(remainingPad) + " " + B(this.border.v);
		lines.push(safeLine(buttonRow, dialogWidth));

		// Bottom border
		lines.push(
			safeLine(
				B(this.border.bl) +
				B(this.border.h.repeat(inner)) +
				B(this.border.br),
				dialogWidth
			)
		);

		// Center in available width if requested
		if (this.center && dialogWidth < width) {
			const pad = Math.floor((width - dialogWidth) / 2);
			const leftPad = " ".repeat(pad);
			return lines.map((line) => leftPad + line);
		}

		return lines.map((line) => safeLine(line, width));
	}

	invalidate(): void {
		if (typeof this.content !== "string") {
			this.content.invalidate();
		}
		for (const btn of this.actionButtons) {
			btn.invalidate();
		}
	}
}
