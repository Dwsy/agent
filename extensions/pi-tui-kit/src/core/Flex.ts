/**
 * Flex - Flexbox-like layout container
 * Supports row and column directions with alignment
 */
import type { Component, Container } from "@mariozechner/pi-tui";
import { Container as TuiContainer } from "@mariozechner/pi-tui";
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";
import { safeLine } from "../utils/text.js";

export type FlexDirection = "row" | "column";
export type FlexAlign = "start" | "center" | "end" | "stretch";

export interface FlexChild {
	component: Component;
	flex?: number;      // Grow factor (0 = fixed size)
	fixed?: number;     // Fixed size in chars/lines
}

export interface FlexOptions {
	direction?: FlexDirection;
	align?: FlexAlign;
	gap?: number;
	padding?: number;
	maxHeight?: number; // Maximum height for column layout calculations
}

export class Flex implements Component {
	private direction: FlexDirection;
	private align: FlexAlign;
	private gap: number;
	private padding: number;
	private flexChildren: FlexChild[] = [];

	private maxHeight: number;

	constructor(options: FlexOptions = {}) {
		this.direction = options.direction ?? "column";
		this.align = options.align ?? "stretch";
		this.gap = options.gap ?? 0;
		this.padding = options.padding ?? 0;
		this.maxHeight = options.maxHeight ?? 100;
	}

	addChild(component: Component, flex?: number, fixed?: number): void {
		this.flexChildren.push({ component, flex, fixed });
	}

	removeChild(component: Component): void {
		const idx = this.flexChildren.findIndex((c) => c.component === component);
		if (idx >= 0) this.flexChildren.splice(idx, 1);
	}

	clear(): void {
		this.flexChildren = [];
	}

	render(width: number): string[] {
		const innerWidth = Math.max(0, width - this.padding * 2);

		if (this.direction === "column") {
			return this.renderColumn(innerWidth, width);
		} else {
			return this.renderRow(innerWidth, width);
		}
	}

	private renderColumn(contentWidth: number, totalWidth: number): string[] {
		let allLines: string[] = [];

		const availableHeight = this.maxHeight;
		const totalGap = Math.max(0, this.flexChildren.length - 1) * this.gap;

		let totalFlex = 0;
		let fixedHeight = totalGap;

		const measurements = this.flexChildren.map((child) => {
			if (child.fixed !== undefined) {
				fixedHeight += child.fixed;
				return { height: child.fixed, flex: 0 };
			}
			const lines = child.component.render(contentWidth);
			if (child.flex) {
				totalFlex += child.flex;
				return { height: lines.length, flex: child.flex };
			}
			fixedHeight += lines.length;
			return { height: lines.length, flex: 0 };
		});

		const remainingHeight = Math.max(0, availableHeight - fixedHeight);

		for (let i = 0; i < this.flexChildren.length; i++) {
			const child = this.flexChildren[i];
			const measure = measurements[i];

			let childHeight: number;
			if (measure.flex > 0 && totalFlex > 0) {
				childHeight = Math.floor((measure.flex / totalFlex) * remainingHeight);
			} else {
				childHeight = measure.height;
			}

			const lines = child.component.render(contentWidth);

			const aligned = this.alignLines(lines, contentWidth, totalWidth);

			if (aligned.length > childHeight) {
				allLines.push(...aligned.slice(0, childHeight));
			} else {
				allLines.push(...aligned);
				for (let j = aligned.length; j < childHeight; j++) {
					allLines.push(" ".repeat(totalWidth));
				}
			}

			if (i < this.flexChildren.length - 1 && this.gap > 0) {
				for (let g = 0; g < this.gap; g++) {
					allLines.push(" ".repeat(totalWidth));
				}
			}
		}

		if (this.padding > 0) {
			const padLine = " ".repeat(totalWidth);
			for (let i = 0; i < this.padding; i++) {
				allLines.unshift(padLine);
				allLines.push(padLine);
			}
		}

		return allLines;
	}

	private renderRow(contentWidth: number, totalWidth: number): string[] {
		let totalFlex = 0;
		let fixedWidth = Math.max(0, this.flexChildren.length - 1) * this.gap;

		const measurements = this.flexChildren.map((child) => {
			if (child.fixed !== undefined) {
				fixedWidth += child.fixed;
				return { width: child.fixed, flex: child.flex ?? 0 };
			}
			totalFlex += child.flex ?? 1;
			return { width: 0, flex: child.flex ?? 1 };
		});

		const remainingWidth = Math.max(0, contentWidth - fixedWidth);

		const widths = measurements.map((m) => {
			if (m.flex === 0) return m.width;
			return Math.max(1, Math.floor((m.flex / totalFlex) * remainingWidth));
		});

		const childLines: string[][] = [];
		let maxHeight = 0;

		for (let i = 0; i < this.flexChildren.length; i++) {
			const lines = this.flexChildren[i].component.render(widths[i]);
			childLines.push(lines);
			maxHeight = Math.max(maxHeight, lines.length);
		}

		const result: string[] = [];
		for (let row = 0; row < maxHeight; row++) {
			let merged = "";
			for (let i = 0; i < childLines.length; i++) {
				const line = childLines[i][row] ?? " ".repeat(widths[i]);
				// Ensure line width matches calculated width exactly using visibleWidth
				const visibleW = visibleWidth(line);
				const clampedLine = visibleW > widths[i] ? truncateToWidth(line, widths[i]) : line;
				const paddedLine = clampedLine + " ".repeat(Math.max(0, widths[i] - visibleWidth(clampedLine)));
				merged += paddedLine;
				if (i < childLines.length - 1) {
					merged += " ".repeat(this.gap);
				}
			}
			// Ensure total width matches
			const mergedWidth = visibleWidth(merged);
			if (mergedWidth < totalWidth) {
				merged += " ".repeat(totalWidth - mergedWidth);
			}
			result.push(safeLine(merged, totalWidth));
		}

		if (this.padding > 0) {
			const padLine = " ".repeat(totalWidth);
			for (let i = 0; i < this.padding; i++) {
				result.unshift(padLine);
				result.push(padLine);
			}
		}

		return result;
	}

	private alignLines(lines: string[], contentWidth: number, totalWidth: number): string[] {
		const pad = this.padding;
		const sidePad = " ".repeat(pad);

		return lines.map((line) => {
			const lineWidth = visibleWidth(line);
			let aligned: string;

			switch (this.align) {
				case "center":
					const space = contentWidth - lineWidth;
					aligned = " ".repeat(Math.floor(space / 2)) + line + " ".repeat(Math.ceil(space / 2));
					break;
				case "end":
					aligned = " ".repeat(contentWidth - lineWidth) + line;
					break;
				case "start":
				default:
					aligned = line + " ".repeat(contentWidth - lineWidth);
					break;
			}

			return sidePad + aligned + sidePad;
		});
	}

	invalidate(): void {
		for (const child of this.flexChildren) {
			child.component.invalidate();
		}
	}
}
