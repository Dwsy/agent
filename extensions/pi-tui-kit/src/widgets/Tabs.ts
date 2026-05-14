/**
 * Tabs - Tab navigation component
 */
import type { Component, Focusable } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { safeLine, leftAlign, center } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";

export interface TabItem {
	id: string;
	label: string;
	content?: Component;
	disabled?: boolean;
}

export interface TabsOptions {
	tabs: TabItem[];
	activeTab?: string;
	onChange?: (tabId: string) => void;
	variant?: "border" | "underline" | "pills";
	theme?: Theme;
	accentColor?: ColorFunction;
	mutedColor?: ColorFunction;
}

export class Tabs implements Component, Focusable {
	private tabs: TabItem[];
	private activeTab: string;
	private onChange?: (tabId: string) => void;
	private variant: "border" | "underline" | "pills";
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

	constructor(options: TabsOptions) {
		this.tabs = options.tabs;
		this.activeTab = options.activeTab ?? (options.tabs[0]?.id || "");
		this.onChange = options.onChange;
		this.variant = options.variant ?? "border";
		this.theme = options.theme ?? DefaultTheme;
		this.accentColor = options.accentColor ?? this.theme.accent;
		this.mutedColor = options.mutedColor ?? this.theme.dim;
	}

	setActiveTab(tabId: string): void {
		if (this.tabs.find((t) => t.id === tabId && !t.disabled)) {
			this.activeTab = tabId;
			this.onChange?.(tabId);
		}
	}

	getActiveTab(): TabItem | undefined {
		return this.tabs.find((t) => t.id === this.activeTab);
	}

	nextTab(): void {
		const currentIndex = this.tabs.findIndex((t) => t.id === this.activeTab);
		for (let i = 1; i <= this.tabs.length; i++) {
			const nextIndex = (currentIndex + i) % this.tabs.length;
			const nextTab = this.tabs[nextIndex];
			if (!nextTab.disabled) {
				this.setActiveTab(nextTab.id);
				break;
			}
		}
	}

	previousTab(): void {
		const currentIndex = this.tabs.findIndex((t) => t.id === this.activeTab);
		for (let i = 1; i <= this.tabs.length; i++) {
			const prevIndex = (currentIndex - i + this.tabs.length) % this.tabs.length;
			const prevTab = this.tabs[prevIndex];
			if (!prevTab.disabled) {
				this.setActiveTab(prevTab.id);
				break;
			}
		}
	}

	handleInput(data: string): void {
		switch (data) {
			case "left":
				this.previousTab();
				break;
			case "right":
				this.nextTab();
				break;
			case "\t":
				this.nextTab();
				break;
			case "\r":
			case " ":
				// Tab already active, maybe scroll content
				break;
		}
	}

	render(width: number): string[] {
		const lines: string[] = [];

		switch (this.variant) {
			case "border":
				lines.push(...this.renderBorderTabs(width));
				break;
			case "underline":
				lines.push(...this.renderUnderlineTabs(width));
				break;
			case "pills":
				lines.push(...this.renderPillsTabs(width));
				break;
		}

		return lines;
	}

	private renderBorderTabs(width: number): string[] {
		const lines: string[] = [];
		const B = this.mutedColor;
		const A = this.accentColor;

		// Tab bar: │ Tab1 │ Tab2 │ Tab3 │
		let tabBar = B("│");
		let totalWidth = 1;

		for (const tab of this.tabs) {
			const isActive = tab.id === this.activeTab;
			const label = isActive ? A(this.theme.bold(tab.label)) : tab.disabled ? B(tab.label) : tab.label;
			const tabStr = ` ${label} │`;
			const tabWidth = visibleWidth(tabStr);

			if (totalWidth + tabWidth > width) {
				break;
			}

			tabBar += tabStr;
			totalWidth += tabWidth;
		}

		// Fill remaining width
		const remaining = width - totalWidth;
		if (remaining > 0) {
			tabBar += B("─".repeat(remaining - 1) + "│");
		}

		lines.push(safeLine(tabBar, width));

		// Content indicator
		const activeTabIndex = this.tabs.findIndex((t) => t.id === this.activeTab);
		if (activeTabIndex >= 0) {
			let indicator = B("│");
			for (let i = 0; i <= activeTabIndex; i++) {
				const tab = this.tabs[i];
				const isActive = tab.id === this.activeTab;
				const tabWidth = visibleWidth(tab.label) + 2; // padding

				if (isActive) {
					indicator += A(this.theme.bold("▲")) + B("─".repeat(tabWidth - 2) + "│");
				} else {
					indicator += " ".repeat(tabWidth - 1) + B("│");
				}
			}
			// Fill rest
			const indicatorWidth = visibleWidth(indicator);
			if (indicatorWidth < width) {
				indicator += B("─".repeat(width - indicatorWidth - 1) + "│");
			}
			lines.push(safeLine(indicator.slice(0, width), width));
		}

		return lines;
	}

	private renderUnderlineTabs(width: number): string[] {
		const lines: string[] = [];
		const M = this.mutedColor;
		const A = this.accentColor;

		let tabLine = "";
		let underline = "";

		for (const tab of this.tabs) {
			const isActive = tab.id === this.activeTab;
			const label = tab.label;
			const separator = " │ ";

			if (visibleWidth(tabLine) + visibleWidth(label) + visibleWidth(separator) > width - 3) {
				break;
			}

			if (tabLine.length > 0) {
				tabLine += separator;
				underline += M("─┼─");
			}

			if (isActive) {
				tabLine += A(this.theme.bold(label));
				underline += A("─".repeat(label.length));
			} else if (tab.disabled) {
				tabLine += M(label);
				underline += M("─".repeat(label.length));
			} else {
				tabLine += label;
				underline += M("─".repeat(label.length));
			}
		}

		lines.push(safeLine(tabLine, width));
		lines.push(safeLine(underline, width));

		return lines;
	}

	private renderPillsTabs(width: number): string[] {
		const lines: string[] = [];
		const A = this.accentColor;
		const M = this.mutedColor;

		let tabLine = "";
		const spacing = "  ";

		for (const tab of this.tabs) {
			const isActive = tab.id === this.activeTab;
			const label = tab.label;
			const pill = isActive ? `[ ${A(this.theme.bold(label))} ]` : tab.disabled ? `[ ${M(label)} ]` : `[ ${label} ]`;

			if (visibleWidth(tabLine) + visibleWidth(pill) + visibleWidth(spacing) > width) {
				break;
			}

			if (tabLine.length > 0) {
				tabLine += spacing;
			}
			tabLine += pill;
		}

		lines.push(safeLine(tabLine, width));
		return lines;
	}

	invalidate(): void {
		for (const tab of this.tabs) {
			tab.content?.invalidate();
		}
	}
}
