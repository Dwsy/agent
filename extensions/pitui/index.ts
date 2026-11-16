/**
 * pitui — Pi 扩展:终端内的迷你桌面。
 *
 * 测试目标:窗口鼠标拖拽 / 边框 resize / 最小化 / 最大化(还原) / dock 栏,
 * 内置三个 app:计算器、记事本、绘图。
 *
 * 用法:/pitui 打开,Esc 退出。鼠标依赖 fullscreen TUI 模式 (settings.tuiMode),
 * 每个窗口操作都有 Alt 键盘兜底路径(见底部状态栏)。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Palette } from "./src/ansi.ts";
import { parseKeys } from "./src/keys.ts";
import { renderPanel } from "./src/render.ts";
import {
	createWm,
	hitTest,
	mouseClick,
	mouseDown,
	mouseDrag,
	mouseUp,
	resizeWm,
	wmKey,
	type MouseOutcome,
	type WmState,
} from "./src/wm.ts";

interface TuiLike {
	requestRender(): void;
	terminal?: { columns?: number; rows?: number };
}

interface MouseEvLike {
	type: string;
	x: number;
	y: number;
	clickCount?: number;
}

interface MouseResultLike {
	handled?: boolean;
	capture?: boolean;
	focus?: boolean;
	render?: boolean;
}

interface ThemeLike {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

function paletteOf(theme: ThemeLike): Palette {
	return {
		fg: (color, text) => theme.fg(color, text),
		bold: (text) => theme.bold(text),
		inverse: (text) => `\x1b[7m${text}\x1b[0m`,
	};
}

class PituiDesktop {
	private state: WmState;
	private closed = false;
	private mouseNote = "";

	constructor(
		private readonly tui: TuiLike,
		private readonly pal: Palette,
		private readonly onExit: () => void,
	) {
		// 桌面比面板小一圈(外边框),鼠标坐标在 handleMouse 里平移。
		const size = this.panelSize(80);
		this.state = createWm(size.w, size.h);
	}

	/** 面板目标尺寸:约终端 78% 宽、74% 高,居中悬浮,pi 聊天露在四周。 */
	private panelSize(panelWidth: number): { w: number; h: number } {
		const rows = this.tui.terminal?.rows ?? 24;
		const panelH = Math.max(12, Math.min(Math.floor(rows * 0.74) + 2, rows));
		return { w: Math.max(20, panelWidth - 2), h: Math.max(8, panelH - 2) };
	}

	render(width: number): string[] {
		const size = this.panelSize(width);
		if (size.w !== this.state.width || size.h !== this.state.height) {
			this.state = resizeWm(this.state, size.w, size.h);
		}
		return renderPanel(this.state, this.pal, this.mouseNote);
	}

	invalidate(): void {
		// 无缓存渲染,无需失效。
	}

	handleInput(data: string): void {
		if (this.closed) return;
		for (const key of parseKeys(data)) {
			const outcome = wmKey(this.state, key);
			this.state = outcome.state;
			if (outcome.exit) {
				this.closed = true;
				this.onExit();
				return;
			}
		}
		this.tui.requestRender();
	}

	handleMouse(ev: MouseEvLike): MouseResultLike | undefined {
		if (this.closed) return undefined;
		// 面板坐标 → 桌面坐标(剥掉外边框一圈)。
		const x = ev.x - 1;
		const y = ev.y - 1;
		let outcome: MouseOutcome | undefined;
		switch (ev.type) {
			case "press":
				outcome = mouseDown(this.state, x, y);
				break;
			case "drag":
				outcome = mouseDrag(this.state, x, y);
				break;
			case "release":
				outcome = mouseUp(this.state);
				break;
			case "click":
				outcome = mouseClick(this.state, x, y, ev.clickCount ?? 1);
				break;
			default:
				return undefined;
		}
		// 状态栏实时回显坐标与命中结果,方便肉眼验收鼠标行为。
		this.mouseNote = `${ev.type}@${x},${y} ${hitTest(this.state, x, y).kind}`;
		if (!outcome.handled) {
			// 桌面背景的点击也吞掉:窗口管理器语义下事件属于桌面,不属于聊天区。
			return { handled: true, render: true };
		}
		this.state = outcome.state;
		return {
			handled: true,
			capture: outcome.capture,
			focus: outcome.focus,
			render: true,
		};
	}
}

export default function pituiExtension(pi: ExtensionAPI): void {
	pi.registerCommand("pitui", {
		description: "打开 pitui 桌面(窗口拖拽/缩放/最小化/最大化 + dock + 计算器/记事本/绘图)",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("pitui 需要交互式 TUI 会话", "error");
				return;
			}
			await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
				return new PituiDesktop(tui, paletteOf(theme as unknown as ThemeLike), () => done(undefined));
			}, {
				overlay: true,
				overlayOptions: () => ({ width: "78%", maxHeight: "82%", margin: 1 }),
			});
		},
	});
}
