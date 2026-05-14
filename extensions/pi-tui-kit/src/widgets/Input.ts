/**
 * Input - Single line text input with cursor
 * Wrapper around pi-tui Input with simplified API
 */
import type { Component, Focusable } from "@earendil-works/pi-tui";
import { Input as TuiInput, CURSOR_MARKER, visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import type { Theme } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";

export interface InputOptions {
	placeholder?: string;
	initialValue?: string;
	onChange?: (value: string) => void;
	onSubmit?: (value: string) => void;
	password?: boolean;
	theme?: Theme;
	prefix?: string;
}

export class Input implements Component, Focusable {
	private input: TuiInput;
	private onChange?: (value: string) => void;
	private onSubmit?: (value: string) => void;
	private password: boolean;
	private theme: Theme;
	private prefix: string;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	constructor(options: InputOptions = {}) {
		this.input = new TuiInput();
		this.onChange = options.onChange;
		this.onSubmit = options.onSubmit;
		this.password = options.password ?? false;
		this.theme = options.theme ?? DefaultTheme;
		this.prefix = options.prefix ?? "> ";

		if (options.initialValue) {
			this.input.setValue(options.initialValue);
		}
		// Note: TuiInput doesn't have setPlaceholder in type definitions
		// Placeholder must be set via initial value pattern if needed

		// Bind input events - onChange is not in type definition, use defensively
		// @ts-ignore - onChange may exist at runtime but not in type definitions
		if (this.input.onChange !== undefined || 'onChange' in this.input) {
			// @ts-ignore
			this.input.onChange = (value: string) => {
				this.onChange?.(value);
			};
		}
	}

	getValue(): string {
		return this.input.getValue();
	}

	setValue(value: string): void {
		this.input.setValue(value);
	}

	clear(): void {
		this.input.setValue("");
	}

	handleInput(data: string): void {
		if (data === "\r") {
			this.onSubmit?.(this.input.getValue());
			return;
		}
		this.input.handleInput(data);
	}

	render(width: number): string[] {
		const availableWidth = Math.max(0, width - visibleWidth(this.prefix));
		const lines = this.input.render(availableWidth);
		const value = this.getValue();
		
		// For password, we need to handle cursor position correctly
		const masked = this.password
			? lines.map((line) => {
				// Extract cursor if present and reposition after masked text
				const hasCursor = line.includes(CURSOR_MARKER);
				const cleanLine = line.replace(CURSOR_MARKER, "");
				// Only show asterisks for actual content (not cursor), then cursor if focused
				const stars = "*".repeat(Math.min(value.length, availableWidth));
				const cursor = (hasCursor || this._focused) && value.length < availableWidth ? CURSOR_MARKER : "";
				return this.prefix + stars + cursor;
			})
			: lines.map((line) => this.prefix + line);

		return masked.map((line) => {
			const lineWidth = visibleWidth(line);
			if (lineWidth > width) {
				return truncateToWidth(line, width);
			}
			return line + " ".repeat(Math.max(0, width - lineWidth));
		});
	}

	invalidate(): void {
		this.input.invalidate();
	}
}
