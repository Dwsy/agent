/**
 * Text utilities for safe width calculations
 * Handles ANSI escape codes correctly
 */
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";

export { visibleWidth, truncateToWidth };

/**
 * Safely pad or truncate a line to exact width
 * Accounts for ANSI escape codes
 */
export function safeLine(line: string, width: number): string {
	const visWidth = visibleWidth(line);
	if (visWidth > width) {
		return truncateToWidth(line, width);
	}
	return line + " ".repeat(width - visWidth);
}

/**
 * Concatenate parts and ensure final width
 */
export function buildLine(parts: string[], width: number): string {
	return safeLine(parts.join(""), width);
}

/**
 * Center text within width
 */
export function center(text: string, width: number, padChar = " "): string {
	const textWidth = visibleWidth(text);
	if (textWidth >= width) return truncateToWidth(text, width);

	const pad = width - textWidth;
	const left = Math.floor(pad / 2);
	const right = pad - left;
	return padChar.repeat(left) + text + padChar.repeat(right);
}

/**
 * Right-align text
 */
export function rightAlign(text: string, width: number, padChar = " "): string {
	const textWidth = visibleWidth(text);
	if (textWidth >= width) return truncateToWidth(text, width);

	return padChar.repeat(width - textWidth) + text;
}

/**
 * Left-align text (with truncation)
 */
export function leftAlign(text: string, width: number, padChar = " "): string {
	const textWidth = visibleWidth(text);
	if (textWidth > width) return truncateToWidth(text, width);

	return text + padChar.repeat(width - textWidth);
}
