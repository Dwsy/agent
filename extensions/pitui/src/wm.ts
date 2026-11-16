/**
 * pitui window manager model.
 * Pure state + geometry: no terminal, no ANSI — everything here is unit-testable.
 * Mouse contract mirrors pi-tui's two-phase model: press focuses/captures,
 * click activates (buttons, dock), drag mutates geometry.
 */

import { APP_META, appKey, appMouse, initialAppState, type AppId, type AppState } from "./apps.ts";
import type { KeyEvent } from "./keys.ts";
import { strWidth } from "./ansi.ts";

/** Status bar + dock occupy the bottom two rows of the desktop. */
export const DOCK_ROWS = 2;

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface WinState {
	id: string;
	appId: AppId;
	title: string;
	rect: Rect;
	/** Geometry before zoom, restored when zoom toggles off. */
	savedRect: Rect | null;
	zoomed: boolean;
	minimized: boolean;
	z: number;
	app: AppState;
}

export interface Edges {
	left: boolean;
	right: boolean;
	top: boolean;
	bottom: boolean;
}

export type DragState =
	| { type: "move"; winId: string; startX: number; startY: number; orig: Rect }
	| { type: "resize"; winId: string; edges: Edges; startX: number; startY: number; orig: Rect }
	| { type: "content"; winId: string; x: number; y: number };

export interface WmState {
	width: number;
	height: number;
	windows: WinState[];
	focusId: string | null;
	nextZ: number;
	drag: DragState | null;
}

export type Hit =
	| { kind: "none" }
	| { kind: "button"; winId: string; action: "min" | "zoom" | "close" }
	| { kind: "title"; winId: string }
	| { kind: "resize"; winId: string; edges: Edges }
	| { kind: "content"; winId: string; x: number; y: number }
	| { kind: "dock"; appId: AppId };

export interface MouseOutcome {
	state: WmState;
	handled: boolean;
	capture: boolean;
	focus: boolean;
}

// ===========================================================================
// 基础几何
// ===========================================================================

export function workspaceHeight(state: WmState): number {
	return Math.max(1, state.height - DOCK_ROWS);
}

export function contentRect(rect: Rect): Rect {
	return { x: rect.x + 1, y: rect.y + 1, w: Math.max(0, rect.w - 2), h: Math.max(0, rect.h - 2) };
}

/** Click targets on the title row: [─] [□] [✕] at the top-left of the window. */
export function titleBarButtons(rect: Rect): Array<{ action: "min" | "zoom" | "close"; x: number; y: number; w: number }> {
	if (rect.w < 14) return [];
	return [
		{ action: "min", x: rect.x + 1, y: rect.y, w: 3 },
		{ action: "zoom", x: rect.x + 4, y: rect.y, w: 3 },
		{ action: "close", x: rect.x + 7, y: rect.y, w: 3 },
	];
}

export interface DockEntry {
	appId: AppId;
	x: number;
	w: number;
}

/** Deterministic dock geometry (bottom row), shared by paint and hit-testing. */
export function dockLayout(width: number): DockEntry[] {
	const entries: DockEntry[] = [];
	let x = 1;
	for (const appId of ["calc", "notes", "draw"] as const) {
		const w = 2 + strWidth(APP_META[appId].title);
		if (x + w > width - 1) break;
		entries.push({ appId, x, w });
		x += w + 2;
	}
	return entries;
}

// ===========================================================================
// 状态操作
// ===========================================================================

interface Sizer {
	minW: number;
	minH: number;
}

function sizerOf(appId: AppId): Sizer {
	const meta = APP_META[appId];
	return { minW: meta.minW, minH: meta.minH };
}

function clampRect(state: WmState, rect: Rect, sizer: Sizer): Rect {
	const wsH = workspaceHeight(state);
	const w = Math.max(Math.min(sizer.minW, state.width), Math.min(rect.w, state.width));
	const h = Math.max(Math.min(sizer.minH, wsH), Math.min(rect.h, wsH));
	return {
		w,
		h,
		x: Math.max(0, Math.min(rect.x, state.width - w)),
		y: Math.max(0, Math.min(rect.y, wsH - h)),
	};
}

function zoomRect(state: WmState): Rect {
	return { x: 0, y: 0, w: state.width, h: workspaceHeight(state) };
}

export function createWm(width: number, height: number): WmState {
	let state: WmState = { width, height, windows: [], focusId: null, nextZ: 1, drag: null };
	for (const appId of ["calc", "notes", "draw"] as const) state = openApp(state, appId);
	return state;
}

export function findWindow(state: WmState, winId: string): WinState | undefined {
	return state.windows.find((w) => w.id === winId);
}

export function focusedWindow(state: WmState): WinState | undefined {
	return state.focusId ? findWindow(state, state.focusId) : undefined;
}

function mapWindow(state: WmState, winId: string, fn: (w: WinState) => WinState): WmState {
	return { ...state, windows: state.windows.map((w) => (w.id === winId ? fn(w) : w)) };
}

function raise(state: WmState, winId: string): WmState {
	const nextZ = state.nextZ + 1;
	return { ...mapWindow(state, winId, (w) => ({ ...w, z: nextZ })), nextZ, focusId: winId };
}

export function openApp(state: WmState, appId: AppId): WmState {
	const existing = state.windows.find((w) => w.appId === appId);
	if (existing) {
		const restored = existing.minimized
			? mapWindow(state, existing.id, (w) => ({ ...w, minimized: false }))
			: state;
		return raise(restored, existing.id);
	}
	const rect = clampRect(state, { ...anchorFor(appId, state), ...defaultSize(appId) }, sizerOf(appId));
	const win: WinState = {
		id: `${appId}-${state.nextZ}`,
		appId,
		title: APP_META[appId].title,
		rect,
		savedRect: null,
		zoomed: false,
		minimized: false,
		z: state.nextZ,
		app: initialAppState(appId),
	};
	return {
		...state,
		windows: [...state.windows, win],
		nextZ: state.nextZ + 1,
		focusId: win.id,
	};
}

function defaultSize(appId: AppId): { w: number; h: number } {
	switch (appId) {
		case "calc":
			return { w: 30, h: 17 };
		case "notes":
			return { w: 40, h: 15 };
		case "draw":
			return { w: 38, h: 16 };
	}
}

/** 初始落位:计算器左上、记事本右上、绘图中下,错开摆放避免完全遮挡。 */
function anchorFor(appId: AppId, state: WmState): { x: number; y: number } {
	const wsH = workspaceHeight(state);
	switch (appId) {
		case "calc":
			return { x: 1, y: 1 };
		case "notes":
			return { x: Math.max(2, state.width - 42), y: 1 };
		case "draw":
			return { x: Math.max(2, Math.floor(state.width / 2) - 19), y: Math.max(2, wsH - 16) };
	}
}

export function closeWindow(state: WmState, winId: string): WmState {
	const windows = state.windows.filter((w) => w.id !== winId);
	const focusId = state.focusId === winId ? (windows.at(-1)?.id ?? null) : state.focusId;
	return { ...state, windows, focusId };
}

export function minimizeWindow(state: WmState, winId: string): WmState {
	const next = mapWindow(state, winId, (w) => ({ ...w, minimized: true }));
	const windows = next.windows.filter((w) => !w.minimized);
	return { ...next, focusId: state.focusId === winId ? (windows.at(-1)?.id ?? null) : state.focusId };
}

export function toggleZoom(state: WmState, winId: string): WmState {
	return mapWindow(state, winId, (w) => {
		if (w.zoomed) return { ...w, zoomed: false, rect: w.savedRect ?? w.rect, savedRect: null };
		return { ...w, zoomed: true, savedRect: w.rect, rect: zoomRect(state) };
	});
}

export function focusNext(state: WmState): WmState {
	const visible = [...state.windows].filter((w) => !w.minimized).sort((a, b) => a.z - b.z);
	if (visible.length === 0) return state;
	const idx = visible.findIndex((w) => w.id === state.focusId);
	const target = visible[(idx + 1) % visible.length]!;
	return raise(state, target.id);
}

export function resizeWm(state: WmState, width: number, height: number): WmState {
	const next: WmState = { ...state, width, height };
	return {
		...next,
		windows: next.windows.map((w) => ({
			...w,
			rect: w.zoomed ? zoomRect(next) : clampRect(next, w.rect, sizerOf(w.appId)),
		})),
	};
}

// ===========================================================================
// 命中测试
// ===========================================================================

export function hitTest(state: WmState, x: number, y: number): Hit {
	if (y === state.height - 1) {
		for (const entry of dockLayout(state.width)) {
			if (x >= entry.x && x < entry.x + entry.w) return { kind: "dock", appId: entry.appId };
		}
		return { kind: "none" };
	}

	const top = topmostAt(state, x, y);
	if (!top) return { kind: "none" };
	const { rect, id } = top;

	if (y === rect.y) {
		for (const btn of titleBarButtons(rect)) {
			if (x >= btn.x && x < btn.x + btn.w) return { kind: "button", winId: id, action: btn.action };
		}
		return { kind: "title", winId: id };
	}
	const edges = resizeEdgesAt(rect, x, y);
	if (edges) return { kind: "resize", winId: id, edges };

	const content = contentRect(rect);
	return {
		kind: "content",
		winId: id,
		x: x - content.x,
		y: y - content.y,
	};
}

function topmostAt(state: WmState, x: number, y: number): WinState | undefined {
	const sorted = [...state.windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z);
	return sorted.find((w) => x >= w.rect.x && x < w.rect.x + w.rect.w && y >= w.rect.y && y < w.rect.y + w.rect.h);
}

/** Window borders are resize handles; the title row is not (it drags the window). */
function resizeEdgesAt(rect: Rect, x: number, y: number): Edges | null {
	const onBottom = y === rect.y + rect.h - 1;
	const onLeft = x === rect.x;
	const onRight = x === rect.x + rect.w - 1;
	if (!onBottom && !onLeft && !onRight) return null;
	return { left: onLeft, right: onRight, top: false, bottom: onBottom };
}

// ===========================================================================
// 鼠标交互
// ===========================================================================

function forwardApp(state: WmState, winId: string, ev: Parameters<typeof appMouse>[1]): WmState {
	return mapWindow(state, winId, (w) => {
		const content = contentRect(w.rect);
		return { ...w, app: appMouse(w.app, ev, content.w, content.h) };
	});
}

export function mouseDown(state: WmState, x: number, y: number): MouseOutcome {
	const hit = hitTest(state, x, y);
	const idle: MouseOutcome = { state, handled: false, capture: false, focus: false };

	switch (hit.kind) {
		case "none":
			return idle;
		case "dock":
			// Activation happens on click (two-phase contract).
			return { ...idle, handled: true };
		case "button":
			return { ...idle, state: raise(state, hit.winId), handled: true, focus: true };
		case "title": {
			const win = findWindow(state, hit.winId)!;
			const drag: DragState = { type: "move", winId: hit.winId, startX: x, startY: y, orig: win.rect };
			return { state: { ...raise(state, hit.winId), drag }, handled: true, capture: true, focus: true };
		}
		case "resize": {
			const win = findWindow(state, hit.winId)!;
			const drag: DragState = {
				type: "resize",
				winId: hit.winId,
				edges: hit.edges,
				startX: x,
				startY: y,
				orig: win.rect,
			};
			return { state: { ...raise(state, hit.winId), drag }, handled: true, capture: true, focus: true };
		}
		case "content": {
			const next = forwardApp(raise(state, hit.winId), hit.winId, { type: "press", x: hit.x, y: hit.y });
			const drag: DragState = { type: "content", winId: hit.winId, x: hit.x, y: hit.y };
			return { state: { ...next, drag }, handled: true, capture: true, focus: true };
		}
	}
}

export function mouseDrag(state: WmState, x: number, y: number): MouseOutcome {
	const drag = state.drag;
	if (!drag) return { state, handled: false, capture: false, focus: false };

	if (drag.type === "move") {
		const rect = clampRect(
			state,
			{ ...drag.orig, x: drag.orig.x + (x - drag.startX), y: drag.orig.y + (y - drag.startY) },
			sizerOf(findWindow(state, drag.winId)!.appId),
		);
		return {
			state: mapWindow({ ...state, drag }, drag.winId, (w) => ({ ...w, rect, zoomed: false, savedRect: null })),
			handled: true,
			capture: true,
			focus: false,
		};
	}

	if (drag.type === "resize") {
		const { orig, edges } = drag;
		// 基于按下点的位移调整边界,拖一格动一格(无 off-by-one)。
		const dx = x - drag.startX;
		const dy = y - drag.startY;
		let x1 = orig.x;
		let y1 = orig.y;
		let x2 = orig.x + orig.w;
		let y2 = orig.y + orig.h;
		if (edges.left) x1 += dx;
		if (edges.right) x2 += dx;
		if (edges.top) y1 += dy;
		if (edges.bottom) y2 += dy;
		const sizer = sizerOf(findWindow(state, drag.winId)!.appId);
		const minW = Math.min(sizer.minW, state.width);
		const minH = Math.min(sizer.minH, workspaceHeight(state));
		if (x2 - x1 < minW) {
			if (edges.left) x1 = x2 - minW;
			else x2 = x1 + minW;
		}
		if (y2 - y1 < minH) {
			if (edges.top) y1 = y2 - minH;
			else y2 = y1 + minH;
		}
		const rect = clampRect(state, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, sizer);
		return {
			state: mapWindow({ ...state, drag }, drag.winId, (w) => ({ ...w, rect, zoomed: false, savedRect: null })),
			handled: true,
			capture: true,
			focus: false,
		};
	}

	const win = findWindow(state, drag.winId);
	if (!win) return { state, handled: false, capture: false, focus: false };
	const content = contentRect(win.rect);
	const ev = { type: "drag" as const, x: x - content.x, y: y - content.y };
	return {
		state: forwardApp({ ...state, drag: { ...drag, x: ev.x, y: ev.y } }, drag.winId, ev),
		handled: true,
		capture: true,
		focus: false,
	};
}

export function mouseUp(state: WmState): MouseOutcome {
	const drag = state.drag;
	if (!drag) return { state, handled: false, capture: false, focus: false };
	let next: WmState = { ...state, drag: null };
	if (drag.type === "content") {
		next = forwardApp(next, drag.winId, { type: "release", x: drag.x, y: drag.y });
	}
	return { state: next, handled: true, capture: false, focus: false };
}

export function mouseClick(state: WmState, x: number, y: number, clickCount = 1): MouseOutcome {
	const hit = hitTest(state, x, y);
	const idle: MouseOutcome = { state, handled: false, capture: false, focus: false };

	switch (hit.kind) {
		case "none":
			return idle;
		case "dock": {
			const existing = state.windows.find((w) => w.appId === hit.appId);
			let next: WmState;
			if (!existing) next = openApp(state, hit.appId);
			else if (existing.minimized) next = raise(mapWindow(state, existing.id, (w) => ({ ...w, minimized: false })), existing.id);
			else if (state.focusId === existing.id) next = minimizeWindow(state, existing.id);
			else next = raise(state, existing.id);
			return { state: next, handled: true, capture: false, focus: false };
		}
		case "button": {
			let next = state;
			if (hit.action === "min") next = minimizeWindow(state, hit.winId);
			else if (hit.action === "zoom") next = toggleZoom(state, hit.winId);
			else next = closeWindow(state, hit.winId);
			return { state: next, handled: true, capture: false, focus: false };
		}
		case "title":
			if (clickCount >= 2) return { state: toggleZoom(state, hit.winId), handled: true, capture: false, focus: false };
			return { ...idle, handled: true };
		case "resize":
			return { ...idle, handled: true };
		case "content": {
			const next = forwardApp(state, hit.winId, {
				type: "click",
				x: hit.x,
				y: hit.y,
				clickCount,
			});
			return { state: next, handled: true, capture: false, focus: false };
		}
	}
}

// ===========================================================================
// 键盘交互
// ===========================================================================

export interface KeyOutcome {
	state: WmState;
	exit?: boolean;
}

/**
 * Global keys are Alt combos (so they never collide with app typing).
 * Esc always exits the desktop.
 */
export function wmKey(state: WmState, key: KeyEvent): KeyOutcome {
	const focused = focusedWindow(state);
	const moveFocused = (dx: number, dy: number): WmState => {
		if (!focused || focused.zoomed) return state;
		return mapWindow(state, focused.id, (w) => ({
			...w,
			rect: clampRect(state, { ...w.rect, x: w.rect.x + dx, y: w.rect.y + dy }, sizerOf(w.appId)),
		}));
	};

	if (key.t === "esc") return { state, exit: true };
	if (key.t === "char" && key.alt && key.ch) {
		switch (key.ch) {
			case "q":
				return { state, exit: true };
			case "n":
				return { state: focusNext(state) };
			case "m":
				return focused ? { state: minimizeWindow(state, focused.id) } : { state };
			case "z":
				return focused ? { state: toggleZoom(state, focused.id) } : { state };
			case "w":
				return focused ? { state: closeWindow(state, focused.id) } : { state };
			case "1":
				return { state: openApp(state, "calc") };
			case "2":
				return { state: openApp(state, "notes") };
			case "3":
				return { state: openApp(state, "draw") };
		}
	}
	if (key.t === "up" || key.t === "down" || key.t === "left" || key.t === "right") {
		if (key.alt) {
			const step = key.shift ? 4 : 1;
			const dx = key.t === "left" ? -step : key.t === "right" ? step : 0;
			const dy = key.t === "up" ? -step : key.t === "down" ? step : 0;
			return { state: moveFocused(dx, dy) };
		}
	}
	if (!focused) return { state };
	const content = contentRect(focused.rect);
	const nextApp = appKey(focused.app, key, content.w, content.h);
	if (nextApp === focused.app) return { state };
	return { state: mapWindow(state, focused.id, (w) => ({ ...w, app: nextApp })) };
}
