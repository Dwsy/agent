/**
 * Stack - Z-index layered container for overlays
 */
import type { Component } from "@earendil-works/pi-tui";
import { Container } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { safeLine } from "../utils/text.js";

interface StackedItem {
	component: Component;
	zIndex: number;
	transparent: boolean;
}

export interface StackOptions {
	background?: string;  // Background char
}

export class Stack extends Container implements Component {
	private items: StackedItem[] = [];
	private background: string;

	constructor(options: StackOptions = {}) {
		super();
		this.background = options.background ?? " ";
	}

	push(component: Component, zIndex = 0, transparent = false): void {
		this.items.push({ component, zIndex, transparent });
		this.items.sort((a, b) => a.zIndex - b.zIndex);
	}

	pop(): Component | undefined {
		return this.items.pop()?.component;
	}

	remove(component: Component): void {
		const idx = this.items.findIndex((i) => i.component === component);
		if (idx >= 0) this.items.splice(idx, 1);
	}

	clear(): void {
		this.items = [];
	}

	render(width: number): string[] {
		if (this.items.length === 0) {
			return [];
		}

		// Start with bottom layer
		let result = this.items[0].component.render(width);

		// Overlay subsequent layers
		for (let i = 1; i < this.items.length; i++) {
			const { component, transparent } = this.items[i];
			const overlay = component.render(width);

			result = this.mergeLayers(result, overlay, transparent, width);
		}

		return result.map((line) => safeLine(line, width));
	}

	private mergeLayers(
		base: string[],
		overlay: string[],
		transparent: boolean,
		width: number
	): string[] {
		const maxHeight = Math.max(base.length, overlay.length);
		const result: string[] = [];

		for (let row = 0; row < maxHeight; row++) {
			const baseLine = base[row] ?? " ".repeat(width);
			const overlayLine = overlay[row] ?? "";

			if (transparent) {
				// Merge non-space characters
				result.push(this.mergeLinesTransparent(baseLine, overlayLine, width));
			} else {
				// Overlay replaces base (padded to width)
				const padded = overlayLine + " ".repeat(Math.max(0, width - visibleWidth(overlayLine)));
				result.push(padded.slice(0, width));
			}
		}

		return result;
	}

	private mergeLinesTransparent(base: string, overlay: string, width: number): string {
		// Collect ANSI codes from both base and overlay
		const baseAnsiRanges: Array<{start: number; end: number; code: string}> = [];
		const overlayAnsiRanges: Array<{start: number; end: number; code: string}> = [];
		
		// Parse ANSI sequences from base
		let i = 0;
		while (i < base.length) {
			if (base[i] === "\x1b" && base[i + 1] === "[") {
				const start = i;
				i += 2;
				while (i < base.length && base[i] !== "m") i++;
				if (i < base.length) i++; // include 'm'
				baseAnsiRanges.push({ start, end: i, code: base.slice(start, i) });
			} else {
				i++;
			}
		}
		
		// Parse ANSI sequences from overlay
		i = 0;
		while (i < overlay.length) {
			if (overlay[i] === "\x1b" && overlay[i + 1] === "[") {
				const start = i;
				i += 2;
				while (i < overlay.length && overlay[i] !== "m") i++;
				if (i < overlay.length) i++;
				overlayAnsiRanges.push({ start, end: i, code: overlay.slice(start, i) });
			} else {
				i++;
			}
		}

		// Get visible content (without ANSI codes)
		const getVisibleChar = (str: string, idx: number, ansiRanges: typeof baseAnsiRanges): {char: string; nextIdx: number} | null => {
			// Check if idx is within an ANSI range
			for (const range of ansiRanges) {
				if (idx >= range.start && idx < range.end) {
					return { char: range.code, nextIdx: range.end };
				}
			}
			if (idx < str.length) {
				return { char: str[idx] || " ", nextIdx: idx + 1 };
			}
			return null;
		};

		// Merge visible characters
		let result = "";
		let basePos = 0;
		let overlayPos = 0;
		let visibleCount = 0;

		while (visibleCount < width) {
			const overlayItem = getVisibleChar(overlay, overlayPos, overlayAnsiRanges);
			const baseItem = getVisibleChar(base, basePos, baseAnsiRanges);

			if (!overlayItem && !baseItem) break;

			if (overlayItem) {
				const isAnsi = overlayItem.char.startsWith("\x1b");
				if (isAnsi) {
					result += overlayItem.char;
					overlayPos = overlayItem.nextIdx;
					continue;
				}
				if (overlayItem.char !== " ") {
					// Overlay has visible char - use it
					result += overlayItem.char;
					overlayPos = overlayItem.nextIdx;
					// Skip base char at same position
					if (baseItem) basePos = baseItem.nextIdx;
					visibleCount++;
					continue;
				}
			}

			if (baseItem) {
				const isAnsi = baseItem.char.startsWith("\x1b");
				if (isAnsi) {
					result += baseItem.char;
					basePos = baseItem.nextIdx;
					continue;
				}
				// Use base char
				result += baseItem.char === " " && overlayItem ? overlayItem.char : baseItem.char;
				basePos = baseItem.nextIdx;
				if (overlayItem) overlayPos = overlayItem.nextIdx;
				visibleCount++;
			} else if (overlayItem) {
				overlayPos = overlayItem.nextIdx;
			}
		}

		return result;
	}

	invalidate(): void {
		for (const item of this.items) {
			item.component.invalidate();
		}
	}
}
