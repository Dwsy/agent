/**
 * List - Scrollable list with selection
 * Similar to SelectList but with simpler API
 */
import type { Component, Focusable } from "@mariozechner/pi-tui";
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";
import { safeLine, leftAlign } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";

export interface ListItem {
	id: string;
	label: string;
	description?: string;
	disabled?: boolean;
}

export interface ListOptions {
	items: ListItem[];
	maxVisible?: number;
	selectedIndex?: number;
	onSelect?: (item: ListItem) => void;
	onChange?: (item: ListItem, index: number) => void;
	theme?: Theme;
	selectedPrefix?: string;
	unselectedPrefix?: string;
	selectedColor?: ColorFunction;
	mutedColor?: ColorFunction;
}

export class List implements Component, Focusable {
	private items: ListItem[];
	private maxVisible: number;
	private selectedIndex: number;
	private scrollOffset = 0;
	private onSelect?: (item: ListItem) => void;
	private onChange?: (item: ListItem, index: number) => void;
	private theme: Theme;
	private selectedPrefix: string;
	private unselectedPrefix: string;
	private selectedColor: ColorFunction;
	private mutedColor: ColorFunction;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
	}

	constructor(options: ListOptions) {
		this.items = options.items;
		this.maxVisible = options.maxVisible ?? 10;
		this.selectedIndex = Math.max(0, Math.min(options.selectedIndex ?? 0, this.items.length - 1));
		this.onSelect = options.onSelect;
		this.onChange = options.onChange;
		this.theme = options.theme ?? DefaultTheme;
		this.selectedPrefix = options.selectedPrefix ?? "❯ ";
		this.unselectedPrefix = options.unselectedPrefix ?? "  ";
		this.selectedColor = options.selectedColor ?? this.theme.accent;
		this.mutedColor = options.mutedColor ?? this.theme.dim;
	}

	setItems(items: ListItem[]): void {
		this.items = items;
		this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, items.length - 1));
		this.ensureScrollVisible();
	}

	setSelectedIndex(index: number): void {
		this.selectedIndex = Math.max(0, Math.min(index, this.items.length - 1));
		this.ensureScrollVisible();
		const item = this.items[this.selectedIndex];
		if (item) this.onChange?.(item, this.selectedIndex);
	}

	private ensureScrollVisible(): void {
		if (this.selectedIndex < this.scrollOffset) {
			this.scrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
			this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
		}
	}

	handleInput(data: string): void {
		switch (data) {
			case "up":
				if (this.selectedIndex > 0) {
					this.setSelectedIndex(this.selectedIndex - 1);
				}
				break;
			case "down":
				if (this.selectedIndex < this.items.length - 1) {
					this.setSelectedIndex(this.selectedIndex + 1);
				}
				break;
			case "home":
				this.setSelectedIndex(0);
				break;
			case "end":
				this.setSelectedIndex(this.items.length - 1);
				break;
			case "pageup": {
				const newIndex = Math.max(0, this.selectedIndex - this.maxVisible);
				this.setSelectedIndex(newIndex);
				break;
			}
			case "pagedown": {
				const newIndex = Math.min(this.items.length - 1, this.selectedIndex + this.maxVisible);
				this.setSelectedIndex(newIndex);
				break;
			}
			case "\r": // Enter
			case " ": // Space
			{
				const item = this.items[this.selectedIndex];
				if (item && !item.disabled) {
					this.onSelect?.(item);
				}
				break;
			}
		}
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const visible = this.items.slice(this.scrollOffset, this.scrollOffset + this.maxVisible);
		const innerWidth = Math.max(0, width - visibleWidth(this.selectedPrefix));

		for (let i = 0; i < this.maxVisible; i++) {
			const item = visible[i];
			if (!item) {
				lines.push(" ".repeat(width));
				continue;
			}

			const idx = this.scrollOffset + i;
			const selected = idx === this.selectedIndex;
			const prefix = selected ? this.selectedPrefix : this.unselectedPrefix;

			let label = item.label;
			if (item.disabled) {
				label = this.mutedColor(label);
			}

			// Truncate if needed
			if (visibleWidth(label) > innerWidth) {
				label = truncateToWidth(label, innerWidth - 3) + "...";
			}

			let line: string;
			if (selected) {
				line = this.selectedColor(prefix) + leftAlign(label, innerWidth);
			} else {
				line = prefix + leftAlign(label, innerWidth);
			}

			lines.push(safeLine(line, width));
		}

		return lines;
	}

	invalidate(): void {
		// No cache
	}
}
