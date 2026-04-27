/**
 * Table - Data table with column alignment
 */
import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";
import { safeLine, leftAlign, center, rightAlign } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";
import { Borders, renderLine } from "../utils/border.js";

export type ColumnAlign = "left" | "center" | "right";

export interface TableColumn {
	key: string;
	header: string;
	width: number | "auto" | "fill";
	align?: ColumnAlign;
	color?: ColorFunction;
}

export interface TableOptions {
	columns: TableColumn[];
	data: Record<string, string>[];
	showHeader?: boolean;
	showBorders?: boolean;
	borderStyle?: "single" | "double" | "none";
	maxRows?: number;
	rowColor?: ColorFunction;
	altRowColor?: ColorFunction;
	headerColor?: ColorFunction;
	theme?: Theme;
}

export class Table implements Component {
	private columns: TableColumn[];
	private data: Record<string, string>[];
	private showHeader: boolean;
	private showBorders: boolean;
	private borderStyle: "single" | "double" | "none";
	private maxRows: number;
	private rowColor?: ColorFunction;
	private altRowColor?: ColorFunction;
	private headerColor: ColorFunction;
	private theme: Theme;

	constructor(options: TableOptions) {
		this.columns = options.columns;
		this.data = options.data;
		this.showHeader = options.showHeader ?? true;
		this.showBorders = options.showBorders ?? true;
		this.borderStyle = options.borderStyle ?? "single";
		this.maxRows = options.maxRows ?? 100;
		this.rowColor = options.rowColor;
		this.altRowColor = options.altRowColor;
		this.headerColor = options.headerColor ?? ((t: string) => t);
		this.theme = options.theme ?? DefaultTheme;
	}

	setData(data: Record<string, string>[]): void {
		this.data = data;
	}

	private calculateColumnWidths(totalWidth: number): number[] {
		let autoCount = 0;
		let fixedWidth = 0;
		let fillColumn: number | null = null;

		// Count auto and fill columns
		for (let i = 0; i < this.columns.length; i++) {
			const w = this.columns[i].width;
			if (w === "auto") {
				autoCount++;
			} else if (w === "fill") {
				if (fillColumn === null) {
					fillColumn = i;
				}
			} else {
				fixedWidth += w as number;
			}
		}

		// Calculate border overhead
		const borderOverhead = this.showBorders ? this.columns.length + 1 : 0;
		const availableWidth = totalWidth - fixedWidth - borderOverhead;

		// Distribute remaining width
		const widths: number[] = [];
		const autoWidth = autoCount > 0 ? Math.floor(availableWidth / (autoCount + (fillColumn !== null ? 1 : 0))) : 0;

		for (let i = 0; i < this.columns.length; i++) {
			const w = this.columns[i].width;
			if (w === "auto") {
				widths.push(Math.max(3, autoWidth));
			} else if (w === "fill") {
				// Fill column takes all remaining
				if (i === fillColumn) {
					const used = widths.reduce((a, b) => a + b, 0);
					const remaining = availableWidth - used;
					widths.push(Math.max(3, remaining));
				} else {
					widths.push(3);
				}
			} else {
				widths.push(w as number);
			}
		}

		return widths;
	}

	private renderCell(text: string, width: number, align: ColumnAlign, color?: ColorFunction): string {
		const content = truncateToWidth(text, width);
		let aligned: string;
		switch (align) {
			case "center":
				aligned = center(content, width);
				break;
			case "right":
				aligned = rightAlign(content, width);
				break;
			case "left":
			default:
				aligned = leftAlign(content, width);
				break;
		}
		return color ? color(aligned) : aligned;
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const colWidths = this.calculateColumnWidths(width);
		const B = this.theme.dim;

		const border = this.showBorders ? "\u2502" : " ";

		// Header
		if (this.showHeader) {
			let headerLine = this.showBorders ? B("\u250C") : "";
			
			for (let i = 0; i < this.columns.length; i++) {
				if (i > 0 && this.showBorders) {
					headerLine += B("\u252C");
				}
				const cell = this.renderCell(
					this.columns[i].header,
					colWidths[i],
					this.columns[i].align ?? "left",
					this.headerColor
				);
				headerLine += cell;
			}

			if (this.showBorders) {
				headerLine += B("\u2510");
			}

			lines.push(safeLine(headerLine, width));

			// Separator line
			if (this.showBorders) {
				let sep = B("\u251C");
				for (let i = 0; i < this.columns.length; i++) {
					sep += B("\u2500".repeat(colWidths[i]));
					if (i < this.columns.length - 1) {
						sep += B("\u253C");
					}
				}
				sep += B("\u2524");
				lines.push(safeLine(sep, width));
			}
		}

		// Data rows
		const visibleRows = this.data.slice(0, this.maxRows);
		
		for (let rowIdx = 0; rowIdx < visibleRows.length; rowIdx++) {
			const row = visibleRows[rowIdx];
			const rowColor = rowIdx % 2 === 0 ? this.rowColor : this.altRowColor;

			let line = this.showBorders ? B("\u2502") : "";
			
			for (let colIdx = 0; colIdx < this.columns.length; colIdx++) {
				const col = this.columns[colIdx];
				const value = row[col.key] ?? "";
				const cellColor = col.color ?? rowColor;
				const cell = this.renderCell(value, colWidths[colIdx], col.align ?? "left", cellColor);

				if (colIdx > 0) {
					line += (this.showBorders ? B("\u2502") : " ") + cell;
				} else {
					line += cell;
				}
			}

			if (this.showBorders) {
				line += B("\u2502");
			}

			lines.push(safeLine(line, width));
		}

		// Bottom border
		if (this.showBorders) {
			let bottom = B("\u2514");
			for (let i = 0; i < this.columns.length; i++) {
				bottom += B("\u2500".repeat(colWidths[i]));
				if (i < this.columns.length - 1) {
					bottom += B("\u2534");
				}
			}
			bottom += B("\u2518");
			lines.push(safeLine(bottom, width));
		}

		return lines;
	}

	invalidate(): void {
		// No cache
	}
}
