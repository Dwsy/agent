/**
 * pitui demo apps: 计算器 / 记事本 / 绘图.
 * All app state is immutable-ish: handlers return the next state object.
 * Painters receive content-local coordinates (window inner area).
 */

import type { ColorKey } from "./ansi.ts";
import { charWidth, clipWidth, isPrintable, strWidth } from "./ansi.ts";
import type { KeyEvent } from "./keys.ts";
import type { Painter } from "./grid.ts";

export type AppId = "calc" | "notes" | "draw";

export interface AppMeta {
	title: string;
	minW: number;
	minH: number;
}

export const APP_META: Record<AppId, AppMeta> = {
	calc: { title: "计算器", minW: 26, minH: 11 },
	notes: { title: "记事本", minW: 22, minH: 8 },
	draw: { title: "绘图", minW: 22, minH: 8 },
};

export type AppMouseEventType = "press" | "drag" | "release" | "click";

export interface AppMouseEvent {
	type: AppMouseEventType;
	x: number;
	y: number;
	clickCount?: number;
}

// ===========================================================================
// 计算器
// ===========================================================================

export type CalcOp = "+" | "-" | "*" | "/";

export type CalcAction =
	| { t: "digit"; d: string }
	| { t: "dot" }
	| { t: "op"; op: CalcOp }
	| { t: "equals" }
	| { t: "clear" }
	| { t: "back" }
	| { t: "neg" };

export interface CalcState {
	kind: "calc";
	display: string;
	acc: number | null;
	op: CalcOp | null;
	waiting: boolean;
}

interface CalcButtonSpec {
	label: string;
	action: CalcAction;
	span: number;
}

const CALC_GRID: readonly (readonly CalcButtonSpec[])[] = [
	[
		{ label: "C", action: { t: "clear" }, span: 1 },
		{ label: "⌫", action: { t: "back" }, span: 1 },
		{ label: "±", action: { t: "neg" }, span: 1 },
		{ label: "÷", action: { t: "op", op: "/" }, span: 1 },
	],
	[
		{ label: "7", action: { t: "digit", d: "7" }, span: 1 },
		{ label: "8", action: { t: "digit", d: "8" }, span: 1 },
		{ label: "9", action: { t: "digit", d: "9" }, span: 1 },
		{ label: "×", action: { t: "op", op: "*" }, span: 1 },
	],
	[
		{ label: "4", action: { t: "digit", d: "4" }, span: 1 },
		{ label: "5", action: { t: "digit", d: "5" }, span: 1 },
		{ label: "6", action: { t: "digit", d: "6" }, span: 1 },
		{ label: "−", action: { t: "op", op: "-" }, span: 1 },
	],
	[
		{ label: "1", action: { t: "digit", d: "1" }, span: 1 },
		{ label: "2", action: { t: "digit", d: "2" }, span: 1 },
		{ label: "3", action: { t: "digit", d: "3" }, span: 1 },
		{ label: "+", action: { t: "op", op: "+" }, span: 1 },
	],
	[
		{ label: "0", action: { t: "digit", d: "0" }, span: 2 },
		{ label: ".", action: { t: "dot" }, span: 1 },
		{ label: "=", action: { t: "equals" }, span: 1 },
	],
];

export interface CalcButtonHit {
	action: CalcAction;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Deterministic button geometry — shared by paint and hit-testing. */
export function calcLayout(w: number, h: number): CalcButtonHit[] {
	const rows = CALC_GRID.length;
	const ch = Math.max(1, Math.min(3, Math.floor((h - 2) / rows)));
	const cw = Math.max(3, Math.floor((w - 3) / 4));
	const hits: CalcButtonHit[] = [];
	for (let r = 0; r < rows; r++) {
		let c = 0;
		for (const spec of CALC_GRID[r]!) {
			const bw = spec.span * cw + (spec.span - 1);
			hits.push({ action: spec.action, x: c * (cw + 1), y: 2 + r * ch, w: bw, h: ch });
			c += spec.span;
		}
	}
	return hits;
}

function calcApply(state: CalcState, action: CalcAction): CalcState {
	switch (action.t) {
		case "digit": {
			if (state.waiting) return { ...state, display: action.d, waiting: false };
			if (state.display.replace(/[-.]/g, "").length >= 14) return state;
			return { ...state, display: state.display === "0" ? action.d : state.display + action.d };
		}
		case "dot": {
			if (state.waiting) return { ...state, display: "0.", waiting: false };
			return state.display.includes(".") ? state : { ...state, display: state.display + "." };
		}
		case "neg": {
			const d = state.display.startsWith("-") ? state.display.slice(1) : `-${state.display}`;
			return { ...state, display: d === "-" ? "0" : d };
		}
		case "back": {
			if (state.waiting) return state;
			const d = state.display.slice(0, -1);
			return { ...state, display: d === "" || d === "-" ? "0" : d };
		}
		case "clear":
			return { kind: "calc", display: "0", acc: null, op: null, waiting: true };
		case "op": {
			const cur = Number(state.display);
			if (state.acc !== null && state.op && !state.waiting) {
				const result = calcCompute(state.acc, state.op, cur);
				if (result === null) return { kind: "calc", display: "错误", acc: null, op: null, waiting: true };
				return { ...state, display: formatNumber(result), acc: result, op: action.op, waiting: true };
			}
			return { ...state, acc: cur, op: action.op, waiting: true };
		}
		case "equals": {
			if (state.acc === null || !state.op) return { ...state, waiting: true };
			const result = calcCompute(state.acc, state.op, Number(state.display));
			if (result === null) return { kind: "calc", display: "错误", acc: null, op: null, waiting: true };
			return { ...state, display: formatNumber(result), acc: null, op: null, waiting: true };
		}
	}
}

function calcCompute(a: number, op: CalcOp, b: number): number | null {
	switch (op) {
		case "+":
			return a + b;
		case "-":
			return a - b;
		case "*":
			return a * b;
		case "/":
			return b === 0 ? null : a / b;
	}
}

function formatNumber(n: number): string {
	return String(parseFloat(n.toPrecision(12)));
}

function paintCalc(state: CalcState, p: Painter, w: number, h: number): void {
	p.textRight(0, 0, w, state.display.slice(-16), "accent");
	const hint = state.op ? `${formatNumber(state.acc ?? 0)} ${state.op}` : "";
	p.text(0, 1, hint, "muted");

	for (const hit of calcLayout(w, h)) {
		const spec = specOf(hit.action);
		const labelColor: ColorKey = isOpAction(hit.action) ? "warning" : "text";
		if (hit.h >= 2) {
			p.fill(hit.x, hit.y, hit.w, hit.h, " ");
			p.text(hit.x, hit.y, "┌" + "─".repeat(hit.w - 2) + "┐", "dim");
			p.text(hit.x, hit.y + hit.h - 1, "└" + "─".repeat(hit.w - 2) + "┘", "dim");
			for (let dy = 1; dy < hit.h - 1; dy++) {
				p.text(hit.x, hit.y + dy, "│", "dim");
				p.text(hit.x + hit.w - 1, hit.y + dy, "│", "dim");
			}
			p.text(hit.x + Math.floor((hit.w - strWidth(spec)) / 2), hit.y + Math.floor((hit.h - 1) / 2), spec, labelColor);
		} else {
			p.text(hit.x + Math.floor((hit.w - strWidth(spec)) / 2), hit.y, spec, labelColor);
		}
	}
}

function isOpAction(action: CalcAction): boolean {
	return action.t === "op" || action.t === "equals";
}

function specOf(action: CalcAction): string {
	switch (action.t) {
		case "digit":
			return action.d;
		case "dot":
			return ".";
		case "clear":
			return "C";
		case "back":
			return "⌫";
		case "neg":
			return "±";
		case "equals":
			return "=";
		case "op":
			return action.op === "+" ? "+" : action.op === "-" ? "−" : action.op === "*" ? "×" : "÷";
	}
}

// ===========================================================================
// 记事本
// ===========================================================================

export interface NotesState {
	kind: "notes";
	lines: string[];
	/** Caret position, indexed in code points. */
	cx: number;
	cy: number;
	/** First visible line (scroll). */
	top: number;
}

const NOTES_SEED = [
	"欢迎使用 pitui 记事本。",
	"",
	"窗口操作:",
	"  · 拖动标题栏移动窗口",
	"  · 拖动边框 / 右下角调整大小",
	"  · 点标题栏按钮:最小化 / 最大化 / 关闭",
	"  · 点 dock 图标恢复 / 最小化",
	"",
	"在这里随便打点什么。",
];

function caretCol(line: string, cx: number): number {
	let col = 0;
	let i = 0;
	for (const ch of line) {
		if (i >= cx) break;
		col += charWidth(ch);
		i += 1;
	}
	return col;
}

/** Map a display column to the nearest code point index. */
function indexAtCol(line: string, col: number): number {
	let acc = 0;
	let i = 0;
	for (const ch of line) {
		const w = charWidth(ch);
		if (acc + w > col) return i;
		acc += w;
		i += 1;
	}
	return i;
}

function paintNotes(state: NotesState, p: Painter, w: number, h: number): void {
	for (let r = 0; r < h; r++) {
		const line = state.lines[state.top + r] ?? "";
		p.text(0, r, line, "text");
	}
	const row = state.cy - state.top;
	if (row >= 0 && row < h) {
		const line = state.lines[state.cy] ?? "";
		const col = caretCol(line, state.cx);
		if (col < w) {
			// 🎯 Caret = the char under it, painted in accent color.
			p.text(col, row, [...line][state.cx] ?? " ", "accent");
		}
	}
}

function keepCaretVisible(state: NotesState, h: number): NotesState {
	let top = state.top;
	if (state.cy < top) top = state.cy;
	if (state.cy > top + h - 1) top = state.cy - h + 1;
	return top === state.top ? state : { ...state, top: Math.max(0, top) };
}

function notesKey(state: NotesState, key: KeyEvent, _w: number, h: number): NotesState {
	const chars = () => [...(state.lines[state.cy] ?? "")];
	const withLines = (lines: string[], cx: number, cy: number): NotesState =>
		keepCaretVisible({ ...state, lines, cx, cy }, h);

	switch (key.t) {
		case "char": {
			if (!key.ch || !isPrintable(key.ch) || key.alt) return state;
			const cs = chars();
			cs.splice(state.cx, 0, key.ch);
			const lines = [...state.lines];
			lines[state.cy] = cs.join("");
			return withLines(lines, state.cx + 1, state.cy);
		}
		case "enter": {
			const cs = chars();
			const head = cs.slice(0, state.cx).join("");
			const tail = cs.slice(state.cx).join("");
			const lines = [...state.lines];
			lines.splice(state.cy, 1, head, tail);
			return withLines(lines, 0, state.cy + 1);
		}
		case "backspace": {
			if (state.cx > 0) {
				const cs = chars();
				cs.splice(state.cx - 1, 1);
				const lines = [...state.lines];
				lines[state.cy] = cs.join("");
				return withLines(lines, state.cx - 1, state.cy);
			}
			if (state.cy === 0) return state;
			const prev = state.lines[state.cy - 1] ?? "";
			const lines = [...state.lines];
			lines.splice(state.cy - 1, 2, prev + (state.lines[state.cy] ?? ""));
			return withLines(lines, [...prev].length, state.cy - 1);
		}
		case "delete": {
			const cs = chars();
			if (state.cx < cs.length) {
				cs.splice(state.cx, 1);
				const lines = [...state.lines];
				lines[state.cy] = cs.join("");
				return withLines(lines, state.cx, state.cy);
			}
			const lines = [...state.lines];
			lines.splice(state.cy, 2, (state.lines[state.cy] ?? "") + (state.lines[state.cy + 1] ?? ""));
			return withLines(lines, state.cx, state.cy);
		}
		case "left": {
			if (state.cx > 0) return withLines(state.lines, state.cx - 1, state.cy);
			if (state.cy === 0) return state;
			return withLines(state.lines, [...(state.lines[state.cy - 1] ?? "")].length, state.cy - 1);
		}
		case "right": {
			const len = chars().length;
			if (state.cx < len) return withLines(state.lines, state.cx + 1, state.cy);
			if (state.cy >= state.lines.length - 1) return state;
			return withLines(state.lines, 0, state.cy + 1);
		}
		case "up":
			return state.cy === 0 ? state : withLines(state.lines, state.cx, state.cy - 1);
		case "down":
			return state.cy >= state.lines.length - 1 ? state : withLines(state.lines, state.cx, state.cy + 1);
		case "home":
			return withLines(state.lines, 0, state.cy);
		case "end":
			return withLines(state.lines, chars().length, state.cy);
		default:
			return state;
	}
}

function notesMouse(state: NotesState, ev: AppMouseEvent, w: number, h: number): NotesState {
	if (ev.type !== "click" && ev.type !== "press" && ev.type !== "drag") return state;
	const cy = Math.max(0, Math.min(state.lines.length - 1, state.top + ev.y));
	const line = state.lines[cy] ?? "";
	const cx = Math.max(0, Math.min([...line].length, indexAtCol(line, Math.max(0, Math.min(w - 1, ev.x)))));
	return keepCaretVisible({ ...state, cx, cy }, h);
}

// ===========================================================================
// 绘图
// ===========================================================================

const BRUSHES = ["█", "▓", "░", "*", "#"] as const;
const BRUSH_COLORS: readonly ColorKey[] = ["accent", "warning", "error", "text", "muted"];

export interface DrawState {
	kind: "draw";
	cells: Map<string, { ch: string; color: ColorKey }>;
	brush: string;
	color: ColorKey;
}

const cellKey = (x: number, y: number): string => `${x},${y}`;

function seedDrawing(): Map<string, { ch: string; color: ColorKey }> {
	const cells = new Map<string, { ch: string; color: ColorKey }>();
	// 🎯 Pre-drawn sine wave so the canvas is never an empty box in the demo.
	for (let x = 0; x < 28; x++) {
		const y = Math.round(3 + 2 * Math.sin(x / 3.2));
		cells.set(cellKey(x, y), { ch: "#", color: "accent" });
	}
	return cells;
}

function paintDraw(state: DrawState, p: Painter, w: number, h: number): void {
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const cell = state.cells.get(cellKey(x, y));
			if (cell) p.text(x, y, cell.ch, cell.color);
			else p.text(x, y, "·", "dim");
		}
	}
	const bar = `笔刷 ${state.brush} · 颜色 [1-5] · [e]橡皮 [c]清空 [ / ]换笔刷`;
	p.text(0, 0, clipWidth(bar, w), "muted");
}

function drawKey(state: DrawState, key: KeyEvent): DrawState {
	if (key.t !== "char" || !key.ch) return state;
	const ch = key.ch;
	const brushIdx = Math.max(0, BRUSHES.indexOf(state.brush as (typeof BRUSHES)[number]));
	if (ch === "[") return { ...state, brush: BRUSHES[(brushIdx + BRUSHES.length - 1) % BRUSHES.length]! };
	if (ch === "]") return { ...state, brush: BRUSHES[(brushIdx + 1) % BRUSHES.length]! };
	if (ch === "e") return { ...state, brush: " " };
	if (ch === "c") return { ...state, cells: new Map() };
	if (ch >= "1" && ch <= "5") return { ...state, color: BRUSH_COLORS[Number(ch) - 1]! };
	return state;
}

function drawMouse(state: DrawState, ev: AppMouseEvent, w: number, h: number): DrawState {
	if (ev.type !== "press" && ev.type !== "drag") return state;
	if (ev.x < 0 || ev.y < 0 || ev.x >= w || ev.y >= h) return state;
	// Keep the toolbar row (y=0) clean.
	if (ev.y === 0) return state;
	const cells = new Map(state.cells);
	if (state.brush === " ") cells.delete(cellKey(ev.x, ev.y));
	else cells.set(cellKey(ev.x, ev.y), { ch: state.brush, color: state.color });
	return { ...state, cells };
}

// ===========================================================================
// 统一分发
// ===========================================================================

export type AppState = CalcState | NotesState | DrawState;

export function initialAppState(appId: AppId): AppState {
	switch (appId) {
		case "calc":
			return { kind: "calc", display: "0", acc: null, op: null, waiting: true };
		case "notes":
			return { kind: "notes", lines: [...NOTES_SEED], cx: 0, cy: 0, top: 0 };
		case "draw":
			return { kind: "draw", cells: seedDrawing(), brush: "█", color: "accent" };
	}
}

export function paintApp(state: AppState, p: Painter, w: number, h: number): void {
	switch (state.kind) {
		case "calc":
			paintCalc(state, p, w, h);
			return;
		case "notes":
			paintNotes(state, p, w, h);
			return;
		case "draw":
			paintDraw(state, p, w, h);
			return;
	}
}

export function appKey(state: AppState, key: KeyEvent, w: number, h: number): AppState {
	switch (state.kind) {
		case "calc": {
			const action = calcKeyAction(key);
			return action ? calcApply(state, action) : state;
		}
		case "notes":
			return notesKey(state, key, w, h);
		case "draw":
			return drawKey(state, key);
		default:
			// 未知状态绝不放大成崩溃:原样返回,让渲染层画不出内容即可。
			return state;
	}
}

function calcKeyAction(key: KeyEvent): CalcAction | null {
	if (key.t === "char" && key.ch) {
		const ch = key.ch;
		if (ch >= "0" && ch <= "9") return { t: "digit", d: ch };
		if (ch === ".") return { t: "dot" };
		if (ch === "+") return { t: "op", op: "+" };
		if (ch === "-") return { t: "op", op: "-" };
		if (ch === "*" || ch === "x" || ch === "×") return { t: "op", op: "*" };
		if (ch === "/" || ch === "÷") return { t: "op", op: "/" };
		if (ch === "c" || ch === "C") return { t: "clear" };
	}
	if (key.t === "enter" || (key.t === "char" && key.ch === "=")) return { t: "equals" };
	if (key.t === "backspace") return { t: "back" };
	return null;
}

export function appMouse(state: AppState, ev: AppMouseEvent, w: number, h: number): AppState {
	switch (state.kind) {
		case "calc": {
			if (ev.type !== "click") return state;
			const hit = calcLayout(w, h).find(
				(b) => ev.x >= b.x && ev.x < b.x + b.w && ev.y >= b.y && ev.y < b.y + b.h,
			);
			return hit ? calcApply(state, hit.action) : state;
		}
		case "notes":
			return notesMouse(state, ev, w, h);
		case "draw":
			return drawMouse(state, ev, w, h);
		default:
			return state;
	}
}
