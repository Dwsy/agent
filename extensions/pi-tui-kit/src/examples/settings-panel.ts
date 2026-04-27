/**
 * Example: Settings Panel using pi-tui-kit
 * Demonstrates Panel, List, Tabs, Input, Button components
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Component, Focusable, KeybindingsManager, TUI } from "@mariozechner/pi-tui";
import { matchesKey, CURSOR_MARKER } from "@mariozechner/pi-tui";
import {
	Panel,
	List,
	Tabs,
	Input,
	Button,
	ProgressBar,
	Text,
	Flex,
	Box,
	Spacer,
	DefaultTheme,
	Borders,
	useFocus,
	type ListItem,
	type TabItem,
} from "../index.js";

// Settings data model
interface Setting {
	id: string;
	label: string;
	type: "toggle" | "select" | "text" | "number";
	value: unknown;
	options?: string[];
	description?: string;
}

class SettingsPanelComponent implements Component, Focusable {
	private settings: Setting[];
	private categories: TabItem[];
	private activeCategory: string;

	private tabs: Tabs;
	private settingList: List;
	private detailPanel: Panel;
	private saveButton: Button;
	private cancelButton: Button;

	private focusManager: ReturnType<typeof useFocus>;
	private _focused = false;

	constructor(
		private tui: TUI,
		private theme = DefaultTheme,
		private onSave: () => void,
		private onCancel: () => void,
	) {
		// Initialize settings
		this.settings = [
			{ id: "theme", label: "Theme", type: "select", value: "dark", options: ["dark", "light", "auto"], description: "Application color scheme" },
			{ id: "fontSize", label: "Font Size", type: "number", value: 14, description: "Editor font size in pixels" },
			{ id: "wordWrap", label: "Word Wrap", type: "toggle", value: true, description: "Wrap long lines in editor" },
			{ id: "lineNumbers", label: "Line Numbers", type: "toggle", value: true, description: "Show line numbers" },
			{ id: "tabSize", label: "Tab Size", type: "select", value: "2", options: ["2", "4", "8"], description: "Number of spaces per tab" },
			{ id: "formatOnSave", label: "Format on Save", type: "toggle", value: false, description: "Auto-format code when saving" },
			{ id: "autosave", label: "Auto Save", type: "select", value: "off", options: ["off", "afterDelay", "onFocusChange"], description: "When to automatically save files" },
		];

		this.categories = [
			{ id: "editor", label: "Editor" },
			{ id: "appearance", label: "Appearance" },
			{ id: "files", label: "Files" },
			{ id: "terminal", label: "Terminal" },
		];
		this.activeCategory = "editor";

		// Initialize components
		this.tabs = new Tabs({
			tabs: this.categories,
			activeTab: this.activeCategory,
			onChange: (id) => {
				this.activeCategory = id;
				this.refreshSettingsList();
			},
			variant: "underline",
			theme: this.theme,
		});

		this.settingList = new List({
			items: this.getSettingsForCategory(this.activeCategory),
			maxVisible: 8,
			onSelect: (item) => {
				this.showSettingDetail(item.id);
			},
			theme: this.theme,
		});

		this.detailPanel = new Panel({
			border: Borders.rounded,
			padding: 1,
			theme: this.theme,
		});

		this.saveButton = new Button({
			label: "Save",
			width: 12,
			onClick: () => this.onSave(),
			theme: this.theme,
			accentColor: this.theme.success,
		});

		this.cancelButton = new Button({
			label: "Cancel",
			width: 12,
			onClick: () => this.onCancel(),
			theme: this.theme,
		});

		// Initialize focus management
		this.focusManager = useFocus({
			items: [
				{ id: "tabs", component: this.tabs },
				{ id: "list", component: this.settingList },
				{ id: "save", component: this.saveButton },
				{ id: "cancel", component: this.cancelButton },
			],
			wrap: true,
		});
	}

	private getSettingsForCategory(category: string): ListItem[] {
		// Map categories to setting IDs (simplified)
		const categoryMap: Record<string, string[]> = {
			editor: ["wordWrap", "lineNumbers", "tabSize", "formatOnSave"],
			appearance: ["theme"],
			files: ["autosave"],
			terminal: [],
		};

		const ids = categoryMap[category] ?? [];
		return this.settings
			.filter((s) => ids.includes(s.id))
			.map((s) => ({
				id: s.id,
				label: s.label,
				description: s.description,
			}));
	}

	private refreshSettingsList(): void {
		this.settingList.setItems(this.getSettingsForCategory(this.activeCategory));
	}

	private showSettingDetail(settingId: string): void {
		const setting = this.settings.find((s) => s.id === settingId);
		if (!setting) return;

		// Add text to detail panel showing setting info
		const info = new Text({
			content: `${setting.label}\n${setting.description ?? ""}\n\nCurrent: ${String(setting.value)}`,
			align: "left",
			theme: this.theme,
		});

		this.detailPanel.clear();
		this.detailPanel.addChild(info);
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		const focusedItem = this.focusManager.focusedItem;
		if (focusedItem && focusedItem.component) {
			focusedItem.component.focused = value;
		}
	}

	handleInput(data: string): void {
		// Navigation between focusable areas
		if (matchesKey(data, "tab")) {
			this.focusManager.focusNext();
			this.tui.requestRender();
			return;
		}

		if (matchesKey(data, "shift+tab")) {
			this.focusManager.focusPrevious();
			this.tui.requestRender();
			return;
		}

		// Forward to focused component
		const focusedItem = this.focusManager.focusedItem;
		if (focusedItem) {
			(focusedItem.component as unknown as { handleInput?(d: string): void })?.handleInput?.(data);
		}
	}

	render(width: number): string[] {
		const lines: string[] = [];

		// Header
		const header = new Text({
			content: "⚙️  Settings",
			align: "center",
			color: this.theme.bold,
		});
		lines.push(...header.render(width));
		lines.push("".padEnd(width));

		// Tabs
		lines.push(...this.tabs.render(width));
		lines.push("".padEnd(width));

		// Main area: split into list and detail
		const mainHeight = 12;
		const listWidth = Math.floor(width * 0.4);
		const detailWidth = width - listWidth - 1;

		const listPanel = new Panel({
			title: "Settings",
			border: Borders.single,
			padding: 0,
			theme: this.theme,
		});
		listPanel.addChild(this.settingList);

		const detailPanel = new Panel({
			title: "Detail",
			border: Borders.single,
			padding: 1,
			theme: this.theme,
		});

		// Render both panels side by side
		const listLines = listPanel.render(listWidth);
		const detailLines = this.detailPanel.render(detailWidth);

		const maxHeight = Math.max(listLines.length, detailLines.length, mainHeight);
		for (let i = 0; i < maxHeight; i++) {
			const left = listLines[i] ?? " ".repeat(listWidth);
			const right = detailLines[i] ?? " ".repeat(detailWidth);
			lines.push(left + " " + right);
		}

		// Footer with buttons
		lines.push("".padEnd(width));
		const footerLines = this.renderFooter(width);
		lines.push(...footerLines);

		return lines.map((line) => line.slice(0, width).padEnd(width));
	}

	private renderFooter(width: number): string[] {
		const saveLines = this.saveButton.render(12);
		const cancelLines = this.cancelButton.render(12);

		// Place buttons on right side
		const totalButtons = 12 + 3 + 12; // save + gap + cancel
		const padding = width - totalButtons;

		return [
			" ".repeat(padding) + saveLines[0] + "   " + cancelLines[0],
		];
	}

	invalidate(): void {
		this.tabs.invalidate();
		this.settingList.invalidate();
		this.detailPanel.invalidate();
		this.saveButton.invalidate();
		this.cancelButton.invalidate();
	}
}

// Example usage in extension
export async function showSettingsPanel(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<void> {
	await ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
		return new SettingsPanelComponent(
			tui,
			DefaultTheme,
			() => {
				ctx.ui.notify("Settings saved!", "info");
				done("saved");
			},
			() => {
				done(undefined);
			},
		);
	}, {
		overlay: true,
		// Note: width not supported, use overlayOptions for sizing
		overlayOptions: {
			maxHeight: "80%",
			anchor: "center",
		},
	});
}

// Export for testing
export { SettingsPanelComponent };
