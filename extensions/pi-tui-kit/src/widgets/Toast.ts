/**
 * Toast - Lightweight notification component
 * Inspired by pi-powerline-footer's notify
 */
import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";
import { safeLine, leftAlign } from "../utils/text.js";
import type { Theme, ColorFunction } from "../utils/style.js";
import { DefaultTheme } from "../utils/style.js";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastOptions {
	message: string;
	type?: ToastType;
	duration?: number;  // Auto-dismiss in ms
	icon?: string;
	closable?: boolean;
	theme?: Theme;
}

const TYPE_ICONS: Record<ToastType, string> = {
	info: "ℹ️",
	success: "✓",
	warning: "⚠️",
	error: "✗",
};

const TYPE_COLORS: Record<ToastType, (theme: Theme) => ColorFunction> = {
	info: (t) => t.accent,
	success: (t) => t.success,
	warning: (t) => t.warning,
	error: (t) => t.error,
};

export class Toast implements Component {
	private message: string;
	private type: ToastType;
	private duration: number;
	private icon?: string;
	private closable: boolean;
	private theme: Theme;
	private colorFn: ColorFunction;

	constructor(options: ToastOptions) {
		this.message = options.message;
		this.type = options.type ?? "info";
		this.duration = options.duration ?? 5000;
		this.icon = options.icon ?? TYPE_ICONS[this.type];
		this.closable = options.closable ?? true;
		this.theme = options.theme ?? DefaultTheme;
		this.colorFn = TYPE_COLORS[this.type](this.theme);
	}

	render(width: number): string[] {
		const icon = this.icon ? `${this.icon} ` : "";
		const message = `${icon}${this.message}`;
		const closeBtn = this.closable ? " [x]" : "";
		
		const totalWidth = visibleWidth(message) + visibleWidth(closeBtn);
		const available = width - 4; // 2 chars padding + borders

		let displayMessage = message;
		if (totalWidth > available) {
			displayMessage = message.slice(0, available - 3) + "...";
		}

		const paddedMessage = leftAlign(displayMessage, available - visibleWidth(closeBtn));
		const content = `  ${this.colorFn(paddedMessage + closeBtn)}  `;

		// Rounded border style
		const line = safeLine("╭" + "─".repeat(available + 2) + "╮", width);
		const contentLine = safeLine("│" + content + "│", width);
		const bottomLine = safeLine("╰" + "─".repeat(available + 2) + "╯", width);

		return [line, contentLine, bottomLine];
	}

	getDuration(): number {
		return this.duration;
	}

	invalidate(): void {
		// No cache
	}
}
