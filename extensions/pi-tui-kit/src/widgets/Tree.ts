/**
 * Tree - Hierarchical tree view component
 * For file browsers, JSON explorers, etc.
 */
import type { Component, Focusable } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import { safeLine, leftAlign } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";

export interface TreeNode {
	id: string;
	label: string;
	children?: TreeNode[];
	expanded?: boolean;
	icon?: string;
	selected?: boolean;
	disabled?: boolean;
	details?: string;
}

export interface TreeOptions {
	roots: TreeNode[];
	maxVisible?: number;
	indentSize?: number;
	showLines?: boolean;
	expandable?: boolean;
	selectable?: boolean;
	onToggle?: (node: TreeNode) => void;
	onSelect?: (node: TreeNode) => void;
	theme?: Theme;
	folderColor?: ColorFunction;
	fileColor?: ColorFunction;
	selectedColor?: ColorFunction;
	mutedColor?: ColorFunction;
}

const TREE_LINE = "│";
const TREE_BRANCH = "├──";
const TREE_LAST = "└──";
const TREE_SPACE = "   ";

export class Tree implements Component, Focusable {
	private roots: TreeNode[];
	private maxVisible: number;
	private indentSize: number;
	private showLines: boolean;
	private expandable: boolean;
	private selectable: boolean;
	private onToggle?: (node: TreeNode) => void;
	private onSelect?: (node: TreeNode) => void;
	private theme: Theme;
	private folderColor: ColorFunction;
	private fileColor: ColorFunction;
	private selectedColor: ColorFunction;
	private mutedColor: ColorFunction;

	private flatNodes: TreeNode[] = [];
	private selectedIndex = 0;
	private scrollOffset = 0;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
	}

	constructor(options: TreeOptions) {
		this.roots = options.roots;
		this.maxVisible = options.maxVisible ?? 10;
		this.indentSize = options.indentSize ?? 2;
		this.showLines = options.showLines ?? true;
		this.expandable = options.expandable ?? true;
		this.selectable = options.selectable ?? true;
		this.onToggle = options.onToggle;
		this.onSelect = options.onSelect;
		this.theme = options.theme ?? DefaultTheme;
		this.folderColor = options.folderColor ?? this.theme.accent;
		this.fileColor = options.fileColor ?? this.theme.dim;
		this.selectedColor = options.selectedColor ?? this.theme.success;
		this.mutedColor = options.mutedColor ?? this.theme.dim;

		this.rebuildFlatNodes();
	}

	setRoots(roots: TreeNode[]): void {
		this.roots = roots;
		this.rebuildFlatNodes();
		this.selectedIndex = 0;
		this.scrollOffset = 0;
	}

	private rebuildFlatNodes(): void {
		this.flatNodes = [];
		for (const root of this.roots) {
			this.flattenNode(root, 0, true);
		}
	}

	private flattenNode(node: TreeNode, depth: number, isLast: boolean): void {
		this.flatNodes.push(node);

		if (node.expanded && node.children) {
			for (let i = 0; i < node.children.length; i++) {
				const child = node.children[i];
				const childIsLast = i === node.children.length - 1;
				this.flattenNode(child, depth + 1, childIsLast);
			}
		}
	}

	getSelectedNode(): TreeNode | undefined {
		return this.flatNodes[this.selectedIndex];
	}

	handleInput(data: string): void {
		switch (data) {
			case "up":
				if (this.selectedIndex > 0) {
					this.selectedIndex--;
					this.ensureScrollVisible();
				}
				break;
			case "down":
				if (this.selectedIndex < this.flatNodes.length - 1) {
					this.selectedIndex++;
					this.ensureScrollVisible();
				}
				break;
			case "right":
				this.expandCurrent();
				break;
			case "left":
				this.collapseCurrent();
				break;
			case "space":
				this.toggleCurrent();
				break;
			case "\r":
				this.selectCurrent();
				break;
			case "home":
				this.selectedIndex = 0;
				this.scrollOffset = 0;
				break;
			case "end":
				this.selectedIndex = this.flatNodes.length - 1;
				this.ensureScrollVisible();
				break;
			case "pageup": {
				const newIndex = Math.max(0, this.selectedIndex - this.maxVisible);
				this.selectedIndex = newIndex;
				this.scrollOffset = Math.max(0, this.scrollOffset - this.maxVisible);
				break;
			}
			case "pagedown": {
				const newIndex = Math.min(this.flatNodes.length - 1, this.selectedIndex + this.maxVisible);
				this.selectedIndex = newIndex;
				this.scrollOffset = Math.min(
					this.flatNodes.length - this.maxVisible,
					this.scrollOffset + this.maxVisible
				);
				break;
			}
		}
	}

	private expandCurrent(): void {
		const node = this.flatNodes[this.selectedIndex];
		if (node && this.expandable && node.children && node.children.length > 0 && !node.expanded) {
			node.expanded = true;
			this.rebuildFlatNodes();
			this.onToggle?.(node);
		}
	}

	private collapseCurrent(): void {
		const node = this.flatNodes[this.selectedIndex];
		if (node && this.expandable && node.expanded) {
			node.expanded = false;
			this.rebuildFlatNodes();
			this.onToggle?.(node);
		}
	}

	private toggleCurrent(): void {
		const node = this.flatNodes[this.selectedIndex];
		if (node && this.expandable && node.children) {
			node.expanded = !node.expanded;
			this.rebuildFlatNodes();
			this.onToggle?.(node);
		}
	}

	private selectCurrent(): void {
		const node = this.flatNodes[this.selectedIndex];
		if (node && this.selectable) {
			// Clear previous selection
			for (const n of this.flatNodes) {
				n.selected = false;
			}
			node.selected = true;
			this.onSelect?.(node);
		}
	}

	private ensureScrollVisible(): void {
		if (this.selectedIndex < this.scrollOffset) {
			this.scrollOffset = this.selectedIndex;
		} else if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
			this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
		}
	}

	private getIndentString(depth: number, isLast: boolean): string {
		if (!this.showLines) {
			return " ".repeat(depth * this.indentSize);
		}

		// Build tree line prefix
		const prefix = isLast ? TREE_LAST : TREE_BRANCH;
		const space = " ".repeat(Math.max(0, this.indentSize - prefix.length));
		
		if (depth === 0) {
			return prefix + space;
		}

		// For nested items, add continuation lines
		const continuation = TREE_LINE + " ".repeat(Math.max(0, this.indentSize - 1));
		return continuation.repeat(depth - 1) + prefix + space;
	}

	private getNodeIcon(node: TreeNode): string {
		if (node.icon) return node.icon;
		if (node.children) {
			return node.expanded ? "📂" : "📁";
		}
		return "📄";
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const visible = this.flatNodes.slice(this.scrollOffset, this.scrollOffset + this.maxVisible);
		
		// Calculate max label width
		const availableWidth = width - 4; // Padding for tree lines

		for (let i = 0; i < this.maxVisible; i++) {
			const node = visible[i];
			if (!node) {
				lines.push(" ".repeat(width));
				continue;
			}

			const idx = this.scrollOffset + i;
			const isSelected = idx === this.selectedIndex;
			const isLast = i === visible.length - 1 && this.scrollOffset + i >= this.flatNodes.length - 1;
			
			const depth = this.calculateDepth(node);
			const indent = this.getIndentString(depth, isLast);
			const icon = this.getNodeIcon(node);
			const color = node.children ? this.folderColor : this.fileColor;

			let label = node.label;
			if (visibleWidth(label) > availableWidth - visibleWidth(indent) - 2) {
				label = label.slice(0, availableWidth - visibleWidth(indent) - 5) + "...";
			}

			let line = indent + icon + " " + color(label);
			
			if (isSelected && this._focused) {
				line = this.selectedColor("> ") + line;
			} else {
				line = "  " + line;
			}

			// Add details if present
			if (node.details) {
				const remaining = availableWidth - visibleWidth(line);
				if (remaining > 5) {
					const detailText = node.details.slice(0, remaining - 3);
					line += this.mutedColor(" " + detailText);
				}
			}

			lines.push(safeLine(line, width));
		}

		return lines;
	}

	private calculateDepth(node: TreeNode): number {
		// Find depth by looking up the tree
		let depth = 0;
		let found = false;
		
		const search = (nodes: TreeNode[], currentDepth: number): boolean => {
			for (const n of nodes) {
				if (n === node) {
					depth = currentDepth;
					return true;
				}
				if (n.children && n.expanded) {
					if (search(n.children, currentDepth + 1)) {
						return true;
					}
				}
			}
			return false;
		};

		search(this.roots, 0);
		return depth;
	}

	invalidate(): void {
		// No cache
	}
}
