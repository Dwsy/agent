/**
 * ProgressBar - Progress indicator with multiple styles
 */
import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import { safeLine, leftAlign } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";

export type ProgressStyle = "bar" | "blocks" | "dots" | "spinner";

export interface ProgressBarOptions {
	value: number; // 0-100
	max?: number;
	label?: string;
	showValue?: boolean;
	style?: ProgressStyle;
	theme?: Theme;
	fillColor?: ColorFunction;
	emptyColor?: ColorFunction;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class ProgressBar implements Component {
	private value: number;
	private max: number;
	private label?: string;
	private showValue: boolean;
	private style: ProgressStyle;
	private theme: Theme;
	private fillColor: ColorFunction;
	private emptyColor: ColorFunction;
	private spinnerFrame = 0;

	constructor(options: ProgressBarOptions) {
		this.value = Math.max(0, Math.min(options.value, options.max ?? 100));
		this.max = options.max ?? 100;
		this.label = options.label;
		this.showValue = options.showValue ?? true;
		this.style = options.style ?? "bar";
		this.theme = options.theme ?? DefaultTheme;
		this.fillColor = options.fillColor ?? this.theme.success;
		this.emptyColor = options.emptyColor ?? this.theme.dim;
	}

	setValue(value: number): void {
		this.value = Math.max(0, Math.min(value, this.max));
	}

	getValue(): number {
		return this.value;
	}

	increment(amount = 1): void {
		this.value = Math.min(this.value + amount, this.max);
	}

	setProgress(percent: number): void {
		this.value = Math.max(0, Math.min(percent, 100)) / 100 * this.max;
	}

	render(width: number): string[] {
		// Label takes space if present
		const labelWidth = this.label ? this.label.length + 2 : 0;
		const valueWidth = this.showValue ? 6 : 0; // " 100% " or " 50/100"
		const barWidth = Math.max(10, width - labelWidth - valueWidth);

		let line = "";

		// Label
		if (this.label) {
			line += this.theme.bold(this.label) + ": ";
		}

		// Progress bar
		const percent = this.value / this.max;

		switch (this.style) {
			case "bar":
				line += this.renderBar(percent, barWidth);
				break;
			case "blocks":
				line += this.renderBlocks(percent, barWidth);
				break;
			case "dots":
				line += this.renderDots(percent, barWidth);
				break;
			case "spinner":
				line += this.renderSpinner(barWidth);
				break;
		}

		// Value
		if (this.showValue) {
			const percentage = Math.round(percent * 100);
			const valueStr = ` ${percentage}%`;
			line += valueStr;
		}

		return [safeLine(line, width)];
	}

	private renderBar(percent: number, width: number): string {
		const filled = Math.floor(percent * width);
		const empty = width - filled;

		const filledChar = "█";
		const emptyChar = "░";

		return this.fillColor(filledChar.repeat(filled)) + this.emptyColor(emptyChar.repeat(empty));
	}

	private renderBlocks(percent: number, width: number): string {
		const blocks = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];
		const scaled = percent * width * 8; // 8 sub-blocks per character
		const fullBlocks = Math.floor(scaled / 8);
		const partial = Math.floor(scaled % 8);

		let result = this.fillColor("█".repeat(fullBlocks));

		if (partial > 0 && fullBlocks < width) {
			result += this.fillColor(blocks[partial - 1]);
		}

		const remaining = width - fullBlocks - (partial > 0 ? 1 : 0);
		if (remaining > 0) {
			result += this.emptyColor("░".repeat(remaining));
		}

		return result;
	}

	private renderDots(percent: number, width: number): string {
		const totalDots = width;
		const filledDots = Math.floor(percent * totalDots);
		const emptyDots = totalDots - filledDots;

		return this.fillColor("●".repeat(filledDots)) + this.emptyColor("○".repeat(emptyDots));
	}

	private renderSpinner(width: number): string {
		const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];
		this.spinnerFrame++;

		const percent = this.value / this.max;
		const filled = Math.floor(percent * (width - 2));
		const bar = "█".repeat(filled) + "░".repeat(width - 2 - filled);

		return this.fillColor(frame) + " " + this.fillColor(bar);
	}

	invalidate(): void {
		// No cache
	}
}

/**
 * Multi-step progress indicator
 */
export interface StepProgressOptions {
	steps: string[];
	currentStep: number;
	completed?: boolean[];
	theme?: Theme;
}

export class StepProgress implements Component {
	private steps: string[];
	private currentStep: number;
	private completed: boolean[];
	private theme: Theme;

	constructor(options: StepProgressOptions) {
		this.steps = options.steps;
		this.currentStep = options.currentStep;
		this.completed = options.completed ?? new Array(options.steps.length).fill(false);
		this.theme = options.theme ?? DefaultTheme;
	}

	setCurrentStep(step: number): void {
		this.currentStep = Math.max(0, Math.min(step, this.steps.length - 1));
	}

	completeStep(step?: number): void {
		const idx = step ?? this.currentStep;
		this.completed[idx] = true;
		if (idx < this.steps.length - 1) {
			this.currentStep = idx + 1;
		}
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const S = this.theme.success;
		const A = this.theme.accent;
		const D = this.theme.dim;
		const N = (s: string) => s; // No color

		// Build step indicators
		let line = "";
		for (let i = 0; i < this.steps.length; i++) {
			const isCompleted = this.completed[i];
			const isCurrent = i === this.currentStep;
			const isPending = i > this.currentStep;

			let indicator: string;
			if (isCompleted) {
				indicator = S("✓");
			} else if (isCurrent) {
				indicator = A("▶");
			} else {
				indicator = D("○");
			}

			line += indicator + " ";
			line += isCompleted ? S(this.steps[i]) : isCurrent ? A(this.theme.bold(this.steps[i])) : D(this.steps[i]);

			if (i < this.steps.length - 1) {
				line += isCompleted ? S(" → ") : D(" → ");
			}
		}

		lines.push(safeLine(line, width));

		// Alternative: vertical layout if width is tight
		if (visibleWidth(line) > width && width < 60) {
			lines.length = 0;
			for (let i = 0; i < this.steps.length; i++) {
				const isCompleted = this.completed[i];
				const isCurrent = i === this.currentStep;

				let prefix: string;
				if (isCompleted) {
					prefix = S("  ✓  ");
				} else if (isCurrent) {
					prefix = A("  ▶  ");
				} else {
					prefix = D("  ○  ");
				}

				const stepLine = prefix + (isCurrent ? A(this.steps[i]) : isCompleted ? S(this.steps[i]) : D(this.steps[i]));
				lines.push(safeLine(stepLine, width));

				// Connector line
				if (i < this.steps.length - 1) {
					if (isCompleted) {
						lines.push(safeLine(S("  │  ") + " ".repeat(this.steps[i].length), width));
					} else {
						lines.push(safeLine(D("  │  ") + " ".repeat(this.steps[i].length), width));
					}
				}
			}
		}

		return lines;
	}

	invalidate(): void {
		// No cache
	}
}
