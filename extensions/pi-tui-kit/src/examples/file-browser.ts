/**
 * Example: File Browser using pi-tui-kit
 * Demonstrates Tree, Modal, Toast, Panel components
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import { matchesKey, CURSOR_MARKER } from "@earendil-works/pi-tui";
import {
	Panel,
	Tree,
	List,
	Toast,
	Text,
	Flex,
	Box,
	Spacer,
	Button,
	Modal,
	DefaultTheme,
	Borders,
	Segment,
	Powerline,
	type TreeNode,
	useFocus,
	useState,
	useSelect,
	useInput,
} from "../index.js";
import { bash } from "@earendil-works/pi-coding-agent";

interface FileEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size?: number;
	modified?: Date;
}

class FileBrowserComponent implements Component, Focusable {
	private currentPath: string;
	private files: FileEntry[] = [];
	private treeRoot: TreeNode;
	private tree: Tree;
	private previewPanel: Panel;
	private statusBar: Powerline;
	private modal: Modal | null = null;
	private toasts: Toast[] = [];
	
	private focusManager: ReturnType<typeof useFocus>;
	private _focused = false;
	private tui: TUI;
	private onClose: () => void;
	private theme = DefaultTheme;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.focusManager.focusedItem?.component.focused = value;
	}

	constructor(
		tui: TUI,
		startPath: string,
		onClose: () => void,
	) {
		this.tui = tui;
		this.currentPath = startPath;
		this.onClose = onClose;

		// Initialize tree
		this.treeRoot = {
			id: "/",
			label: startPath,
			expanded: true,
			icon: "🗂️",
			children: [],
		};

		this.tree = new Tree({
			roots: [this.treeRoot],
			maxVisible: 15,
			showLines: true,
			expandable: true,
			onToggle: (node) => this.onToggleNode(node),
			onSelect: (node) => this.onSelectNode(node),
			theme: this.theme,
		});

		// Preview panel
		this.previewPanel = new Panel({
			title: "Preview",
			border: Borders.single,
			padding: 1,
			theme: this.theme,
		});

		// Status bar (powerline style)
		this.statusBar = new Powerline({
			segments: [
				new Segment({
					content: "File Browser",
					icon: "📂",
					bgColor: this.theme.accent,
					fgColor: this.theme.bold,
					separator: "",
				}),
				new Segment({
					content: "0 items",
					separator: "│",
					separatorColor: this.theme.dim,
				}),
				new Segment({
					content: "j/k: navigate · Enter: select · q: quit",
					separator: "│",
					separatorColor: this.theme.dim,
					padding: 0,
				}),
			],
			align: "left",
		});

		// Focus management
		this.focusManager = useFocus({
			items: [
				{ id: "tree", component: this.tree },
			],
			wrap: true,
		});

		// Initial load
		this.loadFiles();
	}

	private async loadFiles(): Promise<void> {
		// In real implementation, this would use bash tool
		// Simulated for now
		this.files = [
			{ name: "src", path: `${this.currentPath}/src`, isDirectory: true },
			{ name: "package.json", path: `${this.currentPath}/package.json`, isDirectory: false, size: 1245 },
			{ name: "README.md", path: `${this.currentPath}/README.md`, isDirectory: false, size: 3420 },
			{ name: ".gitignore", path: `${this.currentPath}/.gitignore`, isDirectory: false, size: 156 },
		];

		// Update tree
		this.treeRoot.children = this.files.map((f) => ({
			id: f.path,
			label: f.name,
			expanded: false,
			icon: f.isDirectory ? "📁" : "📄",
			children: f.isDirectory ? [] : undefined,
			details: f.size ? this.formatSize(f.size) : undefined,
		}));

		this.tree.setRoots([this.treeRoot]);
		this.updateStatusBar();
	}

	private formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${Math.floor(bytes / 1024)}KB`;
		return `${Math.floor(bytes / (1024 * 1024))}MB`;
	}

	private onToggleNode(node: TreeNode): void {
		if (node.children) {
			node.expanded = !node.expanded;
			if (node.expanded && node.children.length === 0) {
				// Load children
				this.loadDirectory(node.id);
			}
		}
		this.tui.requestRender();
	}

	private async loadDirectory(path: string): Promise<void> {
		// Simulate loading directory contents
		const newChildren: TreeNode[] = [
			{ id: `${path}/file1.ts`, label: "file1.ts", icon: "📄" },
			{ id: `${path}/file2.ts`, label: "file2.ts", icon: "📄" },
		];
		
		const node = this.findNode(path, [this.treeRoot]);
		if (node) {
			node.children = newChildren;
			this.tree.setRoots([this.treeRoot]);
		}
	}

	private findNode(id: string, nodes: TreeNode[]): TreeNode | undefined {
		for (const node of nodes) {
			if (node.id === id) return node;
			if (node.children) {
				const found = this.findNode(id, node.children);
				if (found) return found;
			}
		}
		return undefined;
	}

	private onSelectNode(node: TreeNode): void {
		const isDirectory = node.icon === "📁" || node.icon === "📂";
		
		if (isDirectory) {
			// Navigate into directory
			this.currentPath = node.id;
			this.loadFiles();
			
			// Show toast
			this.showToast(`Opened: ${node.label}`, "info");
		} else {
			// Preview file
			this.previewFile(node.id, node.label);
		}
		
		this.tui.requestRender();
	}

	private previewFile(path: string, name: string): void {
		// Update preview panel
		const content = new Text({
			content: `File: ${name}\nPath: ${path}\n\n[Preview content would be shown here]`,
			align: "left",
			theme: this.theme,
		});
		
		this.previewPanel.clear();
		this.previewPanel.addChild(content);
		this.previewPanel = new Panel({
			title: `Preview: ${name}`,
			border: Borders.single,
			padding: 1,
			theme: this.theme,
		});
		this.previewPanel.addChild(content);
	}

	private showToast(message: string, type: "info" | "success" | "warning" | "error" = "info"): void {
		const toast = new Toast({
			message,
			type,
			duration: 3000,
			theme: this.theme,
		});
		
		this.toasts.push(toast);
		
		// Auto-dismiss
		setTimeout(() => {
			const idx = this.toasts.indexOf(toast);
			if (idx >= 0) {
				this.toasts.splice(idx, 1);
				this.tui.requestRender();
			}
		}, toast.getDuration());
		
		this.tui.requestRender();
	}

	private updateStatusBar(): void {
		// Update file count in status bar
		this.statusBar = new Powerline({
			segments: [
				new Segment({
					content: "File Browser",
					icon: "📂",
					bgColor: this.theme.accent,
					separator: "",
				}),
				new Segment({
					content: `${this.files.length} items`,
					separator: "│",
					separatorColor: this.theme.dim,
				}),
				new Segment({
					content: this.currentPath,
					separator: "│",
					separatorColor: this.theme.dim,
					padding: 0,
				}),
				new Segment({
					content: "j/k: navigate · Enter: select · q: quit",
					separator: "│",
					separatorColor: this.theme.dim,
					padding: 0,
				}),
			],
			align: "left",
		});
	}

	handleInput(data: string): void {
		// Global shortcuts
		if (matchesKey(data, "q") || matchesKey(data, "escape")) {
			this.onClose();
			return;
		}

		if (matchesKey(data, "h") || matchesKey(data, "left")) {
			// Navigate up
			const parentPath = this.currentPath.split("/").slice(0, -1).join("/") || "/";
			this.currentPath = parentPath;
			this.loadFiles();
			this.showToast(`Up to: ${parentPath}`, "info");
			return;
		}

		// Modal handling
		if (this.modal && matchesKey(data, "escape")) {
			this.modal = null;
			this.tui.requestRender();
			return;
		}

		// Forward to focus manager
		this.focusManager.focusedItem?.component.handleInput?.(data);
	}

	render(width: number): string[] {
		const lines: string[] = [];
		
		// Header
		const header = new Text({
			content: "╭──────────────────────────────────────────────────────────╮",
			align: "left",
		});
		lines.push(...header.render(width));
		
		// Main area: split into tree (left) and preview (right)
		const treeWidth = Math.floor(width * 0.4);
		const previewWidth = width - treeWidth - 1;
		
		const treePanel = new Panel({
			title: `Files - ${this.currentPath.slice(0, 30)}`,
			border: Borders.rounded,
			padding: 0,
			theme: this.theme,
		});
		treePanel.addChild(this.tree);
		
		const treeLines = treePanel.render(treeWidth);
		const previewLines = this.previewPanel.render(previewWidth);
		
		// Merge side by side
		const maxHeight = Math.max(treeLines.length, previewLines.length, 20);
		for (let i = 0; i < maxHeight; i++) {
			const left = treeLines[i] || " ".repeat(treeWidth);
			const right = previewLines[i] || " ".repeat(previewWidth);
			lines.push(left + "│" + right);
		}

		// Status bar
		const statusLine = this.statusBar.render(width);
		lines.push(...statusLine);

		// Toasts (overlay at bottom)
		if (this.toasts.length > 0) {
			const lastToast = this.toasts[this.toasts.length - 1];
			const toastLines = lastToast.render(Math.min(60, width));
			
			// Overlay toast at bottom right
			const remainingSpace = width - 60;
			const leftPad = " ".repeat(Math.max(0, remainingSpace - 2));
			
			for (const toastLine of toastLines) {
				// Replace last line with toast if we run out of space
				if (lines.length >= 24) {
					lines[lines.length - 3] = leftPad + toastLine;
				} else {
					lines.push(leftPad + toastLine);
				}
			}
		}

		// Modal overlay (if present)
		if (this.modal) {
			const modalLines = this.modal.render(width);
			// Replace lines with modal content
			for (let i = 0; i < modalLines.length && i < lines.length; i++) {
				lines[i] = modalLines[i];
			}
		}

		return lines.map((line) => line.slice(0, width).padEnd(width));
	}

	invalidate(): void {
		this.tree.invalidate();
		this.previewPanel.invalidate();
		this.statusBar.invalidate();
		this.modal?.invalidate();
		for (const toast of this.toasts) {
			toast.invalidate();
		}
	}
}

// Example usage
export async function showFileBrowser(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	startPath: string = "~",
): Promise<void> {
	await ctx.ui.custom<string | undefined>((tui, _theme, _kb, done) => {
		return new FileBrowserComponent(tui, startPath, () => done(undefined));
	}, {
		overlay: true,
		width: 100,
		maxHeight: "90%",
		anchor: "center",
	});
}

export { FileBrowserComponent };
