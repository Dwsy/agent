import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";
import type { GameColors } from "./types.js";

export const DEFAULT_COLORS: GameColors = {
	dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
};

export function padLine(line: string, width: number): string {
	const visibleLen = visibleWidth(line);
	const padding = Math.max(0, width - visibleLen);
	return line + " ".repeat(padding);
}

export function createBoxLine(content: string, boxWidth: number, colors: GameColors = DEFAULT_COLORS): string {
	const contentLen = visibleWidth(content);
	const padding = Math.max(0, boxWidth - contentLen);
	return colors.dim(" │") + content + " ".repeat(padding) + colors.dim("│");
}

export function createBoxBorder(char: string, width: number, colors: GameColors = DEFAULT_COLORS): string {
	return colors.dim(` ${char}${"─".repeat(width)}${char}`);
}

export function renderTitle(title: string, width: number, colors: GameColors = DEFAULT_COLORS): string[] {
	const lines: string[] = [];
	lines.push(padLine(createBoxBorder("╭", width, colors), width));
	lines.push(padLine(createBoxLine(colors.bold(colors.green(title)), width, colors), width));
	lines.push(padLine(createBoxBorder("├", width, colors), width));
	return lines;
}

export function renderFooter(footer: string, width: number, colors: GameColors = DEFAULT_COLORS): string[] {
	const lines: string[] = [];
	lines.push(padLine(createBoxLine(footer, width, colors), width));
	lines.push(padLine(createBoxBorder("╰", width, colors), width));
	return lines;
}