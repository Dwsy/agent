/**
 * Spacer - Empty space that expands or has fixed size
 */
import type { Component } from "@earendil-works/pi-tui";

export interface SpacerOptions {
	fixed?: number;
}

export class Spacer implements Component {
	private fixed?: number;

	constructor(options: SpacerOptions = {}) {
		this.fixed = options.fixed;
	}

	render(width: number): string[] {
		const height = this.fixed ?? 1;
		return Array(height).fill(" ".repeat(width));
	}

	invalidate(): void {
		// No cache
	}

	/**
	 * Create a flexible spacer that takes available space
	 * (Note: requires layout manager to determine size)
	 */
	static flex(): Spacer {
		return new Spacer();
	}

	/**
	 * Create a fixed-height spacer
	 */
	static fixed(height: number): Spacer {
		return new Spacer({ fixed: height });
	}
}
