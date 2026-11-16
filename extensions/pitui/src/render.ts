/**
 * Desktop compositor: paints windows, dock and status bar onto a cell grid.
 * Output is exactly `state.height` lines of `state.width` display columns.
 */

import type { Palette } from "./ansi.ts";
import { clipWidth, strWidth } from "./ansi.ts";
import { Grid, offsetPainter, type Painter } from "./grid.ts";
import { APP_META, paintApp } from "./apps.ts";
import { contentRect, dockLayout, titleBarButtons, workspaceHeight, type WinState, type WmState } from "./wm.ts";

const BUTTON_GLYPHS = { min: "[─]", zoom: "[□]", close: "[✕]" } as const;

export function renderDesktop(state: WmState, pal: Palette, extra = ""): string[] {
	const g = new Grid(state.width, state.height);
	const focusedId = state.focusId;

	const windows = [...state.windows].filter((w) => !w.minimized).sort((a, b) => a.z - b.z);
	for (const win of windows) drawWindow(g, win, win.id === focusedId);

	drawDock(g, state);
	drawStatusBar(g, state, extra);

	return g.flatten(pal);
}

function drawWindow(g: Grid, win: WinState, focused: boolean): void {
	const { rect } = win;
	const border = focused ? "text" : "dim";
	const titleColor = focused ? "accent" : "muted";

	// 活动窗口的标题栏用底边双线区分,失去焦点时弱化。
	g.text(rect.x, rect.y, "┌" + "─".repeat(rect.w - 2) + "┐", border);
	g.text(rect.x, rect.y + rect.h - 1, "└" + "─".repeat(rect.w - 2) + "┘", border);
	for (let y = rect.y + 1; y < rect.y + rect.h - 1; y++) {
		g.text(rect.x, y, "│", border);
		g.text(rect.x + rect.w - 1, y, "│", border);
	}

	for (const btn of titleBarButtons(rect)) {
		g.text(btn.x, btn.y, BUTTON_GLYPHS[btn.action], focused ? "warning" : "dim");
	}

	const titleX = rect.x + (titleBarButtons(rect).length > 0 ? 11 : 1);
	const titleW = rect.x + rect.w - 1 - titleX;
	g.text(titleX, rect.y, clipWidth(win.title, titleW), titleColor);

	// Content area: opaque fill first, then the app paints into it.
	const content = contentRect(rect);
	g.fill(content.x, content.y, content.w, content.h, " ");
	paintApp(win.app, offsetPainter(g, content.x, content.y, content.w, content.h), content.w, content.h);
}

function drawDock(g: Grid, state: WmState): void {
	const y = state.height - 1;
	g.fill(0, y, state.width, 1, " ");
	for (const entry of dockLayout(state.width)) {
		const win = state.windows.find((w) => w.appId === entry.appId);
		const running = win !== undefined;
		const focused = running && win.id === state.focusId;
		const marker = running ? "●" : "○";
		const label = `${marker} ${APP_META[entry.appId].title}`;
		g.text(entry.x, y, label, focused ? "accent" : running ? "text" : "muted");
	}
}

function drawStatusBar(g: Grid, state: WmState, extra: string): void {
	const y = state.height - 2;
	g.fill(0, y, state.width, 1, " ");
	const focused = state.focusId ? state.windows.find((w) => w.id === state.focusId) : undefined;
	const right = extra || `${focused ? focused.title : "无焦点"} · ${state.drag ? state.drag.type : "就绪"}`;
	const rightClipped = clipWidth(right, Math.floor(state.width / 2));
	g.textRight(0, y, state.width, rightClipped, "muted");
	const help = "[Esc]退出 · [Alt+N]切换 [Alt+M]最小化 [Alt+Z]最大化 [Alt+W]关闭 [Alt+1/2/3]打开";
	g.text(0, y, clipWidth(help, state.width - strWidth(rightClipped) - 2), "dim");
}

/**
 * 悬浮面板:桌面帧 + 外边框。桌面坐标系比面板小一圈,
 * index.ts 负责鼠标坐标平移(ev.x-1 / ev.y-1)。
 */
export function renderPanel(state: WmState, pal: Palette, extra = ""): string[] {
	const desk = renderDesktop(state, pal, extra);
	const title = " pitui 桌面 ";
	const top = "┌" + title + "─".repeat(Math.max(0, state.width - strWidth(title))) + "┐";
	const bottom = "└" + "─".repeat(state.width) + "┘";
	return [
		pal.fg("dim", top),
		...desk.map((line) => pal.fg("dim", "│") + line + pal.fg("dim", "│")),
		pal.fg("dim", bottom),
	];
}

/** Human-readable desktop description — used by tests and debug dumps. */
export function desktopDebug(state: WmState): string {
	return state.windows
		.map((w) => `${w.title} @${w.rect.x},${w.rect.y} ${w.rect.w}x${w.rect.h}${w.minimized ? " (min)" : ""}${w.zoomed ? " (zoom)" : ""}`)
		.join("\n");
}

export function visibleWidth(line: string): number {
	return strWidth(line.replace(/\x1b\[[0-9;]*m/g, ""));
}
