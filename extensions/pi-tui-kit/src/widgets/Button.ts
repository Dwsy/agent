/**
 * Button - Interactive button component
 * Supports focus state and click handling
 */
import type { Component, Focusable } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { safeLine, center } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";

export interface ButtonOptions {
	label: string;
	onClick?: () => void;
	width?: number;     // Auto if not specified
	theme?: Theme;
	accentColor?: ColorFunction;
	mutedColor?: ColorFunction;
}

export class Button implements Component, Focusable {
	private label: string;
	private onClick?: () => void;
	private fixedWidth?: number;
	private theme: Theme;
	private accentColor: ColorFunction;
	private mutedColor: ColorFunction;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
	}

	constructor(options: ButtonOptions) {
		this.label = options.label;
		this.onClick = options.onClick;
		this.fixedWidth = options.width;
		this.theme = options.theme ?? DefaultTheme;
		this.accentColor = options.accentColor ?? this.theme.accent;
		this.mutedColor = options.mutedColor ?? this.theme.dim;
	}

	render(width: number): string[] {
		const w = this.fixedWidth ?? Math.max(10, visibleWidth(this.label) + 4);
		const labelWidth = visibleWidth(this.label);

		let content: string;
		if (this._focused) {
			// Focused: [ < Label > ]
			const inner = w - 4;
			const pad = inner - labelWidth;
			const left = Math.floor(pad / 2);
			const right = pad - left;
			content = this.accentColor("< ") +
				this.label +
				this.accentColor(" ".repeat(left) + " >");
		} else {
			// Unfocused: [   Label   ]
			content = center(this.label, w - 2);
		}

		const line = this.mutedColor("[") + content + this.mutedColor("]");
		return [safeLine(line, width)];
	}

	handleInput(data: string): void {
		if (this._focused && (data === "\r" || data === " ")) {
			this.onClick?.();
		}
	}

	invalidate(): void {
		// No cache
	}
}
