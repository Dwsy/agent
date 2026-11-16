import { expect, test } from "bun:test";
import {
	appKey,
	appMouse,
	calcLayout,
	initialAppState,
	paintApp,
	type CalcState,
	type DrawState,
	type NotesState,
} from "../src/apps.ts";
import { Grid } from "../src/grid.ts";
import { plainPalette } from "../src/ansi.ts";

function key(t: string, ch?: string, extra: Record<string, unknown> = {}) {
	return { t, ch, ...extra } as never;
}

function paintToText(state: Parameters<typeof paintApp>[0], w: number, h: number): string[] {
	const g = new Grid(w, h);
	paintApp(state, g, w, h);
	return g.flatten(plainPalette);
}

test("未知 app 状态不崩溃(宿主稳定性)", () => {
	const corrupt = { display: "0" } as never;
	expect(appKey(corrupt, key("enter"), 28, 15)).toBe(corrupt);
	expect(appMouse(corrupt, { type: "click", x: 1, y: 1 }, 28, 15)).toBe(corrupt);
	expect(() => paintToText(corrupt, 28, 15)).not.toThrow();
});

// ---------------------------------------------------------------- 计算器

test("计算器:12 + 3 = 15", () => {
	let s = initialAppState("calc");
	for (const k of ["1", "2", "+", "3", "="]) s = appKey(s, key("char", k), 28, 15);
	expect((s as CalcState).display).toBe("15");
	// 🎯 回归:运算后的状态必须保留 kind,否则渲染层会当作未知 app 直接画空白。
	expect(s.kind).toBe("calc");
	expect(paintToText(s, 28, 15).join("")).toContain("15");
});

test("计算器:除以零显示错误", () => {
	let s = initialAppState("calc");
	for (const k of ["8", "/", "0"]) s = appKey(s, key("char", k), 28, 15);
	s = appKey(s, key("enter"), 28, 15);
	expect((s as CalcState).display).toBe("错误");
});

test("计算器:退格与清零", () => {
	let s = initialAppState("calc");
	for (const k of ["1", "2", "3"]) s = appKey(s, key("char", k), 28, 15);
	s = appKey(s, key("backspace"), 28, 15);
	expect((s as CalcState).display).toBe("12");
	s = appKey(s, key("char", "c"), 28, 15);
	expect((s as CalcState).display).toBe("0");
});

test("计算器:鼠标点按钮等价于按键", () => {
	const w = 28;
	const h = 15;
	let s = initialAppState("calc");
	const btn7 = calcLayout(w, h).find((b) => b.action.t === "digit" && (b.action as { d: string }).d === "7")!;
	s = appMouse(s, { type: "click", x: btn7.x + 1, y: btn7.y }, w, h);
	expect((s as CalcState).display).toBe("7");
});

test("计算器:显示右对齐渲染", () => {
	const out = paintToText(initialAppState("calc"), 28, 15);
	expect(out[0]!.trimEnd().endsWith("0")).toBe(true);
});

// ---------------------------------------------------------------- 记事本

function notes(): NotesState {
	return initialAppState("notes") as NotesState;
}

test("记事本:输入插入光标处", () => {
	let s = notes();
	for (const ch of "abc") s = appKey(s, key("char", ch), 44, 15) as NotesState;
	expect(s.lines[0]!.startsWith("abc")).toBe(true);
	expect(s.cx).toBe(3);
});

test("记事本:回车分段,退格合并", () => {
	let s = appKey(notes(), key("enter"), 44, 15) as NotesState;
	expect(s.lines[0]).toBe("");
	expect(s.lines[1]!.startsWith("欢迎")).toBe(true);
	expect(s.cy).toBe(1);
	s = appKey(s, key("backspace"), 44, 15) as NotesState;
	expect(s.lines[0]!.startsWith("欢迎")).toBe(true);
	expect(s.cy).toBe(0);
});

test("记事本:方向键移动光标并可越过行边界", () => {
	let s = notes();
	s = appKey(s, key("right"), 44, 15) as NotesState;
	expect(s.cx).toBe(1);
	s = appKey(s, key("down"), 44, 15) as NotesState;
	expect(s.cy).toBe(1);
});

test("记事本:点击定位光标", () => {
	// 首行是 CJK(每字占 2 列),点第 4 列应落在第 2 个字上。
	const s = appMouse(notes(), { type: "click", x: 4, y: 0 }, 44, 15) as NotesState;
	expect(s.cx).toBe(2);
	expect(s.cy).toBe(0);
});

test("记事本:光标渲染为高亮字符", () => {
	const markPalette = {
		fg: (c: string, t: string) => `<${c}>${t}</${c}>`,
		bold: (t: string) => t,
		inverse: (t: string) => t,
	};
	const g = new Grid(44, 15);
	paintApp(notes(), g, 44, 15);
	const out = g.flatten(markPalette).join("\n");
	expect(out).toContain("<accent>");
});

// ---------------------------------------------------------------- 绘图

function draw(): DrawState {
	return initialAppState("draw") as DrawState;
}

test("绘图:拖拽画出笔刷轨迹", () => {
	let s = draw();
	s = appMouse(s, { type: "press", x: 5, y: 5 }, 40, 17) as DrawState;
	s = appMouse(s, { type: "drag", x: 6, y: 5 }, 40, 17) as DrawState;
	expect(s.cells.get("5,5")).toEqual({ ch: "█", color: "accent" });
	expect(s.cells.get("6,5")).toEqual({ ch: "█", color: "accent" });
});

test("绘图:工具栏行不可绘制", () => {
	const s = appMouse(draw(), { type: "press", x: 3, y: 0 }, 40, 17) as DrawState;
	expect(s.cells.get("3,0")).toBeUndefined();
});

test("绘图:换笔刷 / 换颜色 / 清空", () => {
	let s = draw();
	s = appKey(s, key("char", "]"), 40, 17) as DrawState;
	expect(s.brush).toBe("▓");
	s = appKey(s, key("char", "2"), 40, 17) as DrawState;
	expect(s.color).toBe("warning");
	s = appKey(s, key("char", "c"), 40, 17) as DrawState;
	expect(s.cells.size).toBe(0);
});

test("绘图:橡皮擦除单格", () => {
	let s = draw();
	s = appMouse(s, { type: "press", x: 5, y: 5 }, 40, 17) as DrawState;
	s = appKey(s, key("char", "e"), 40, 17) as DrawState;
	s = appMouse(s, { type: "press", x: 5, y: 5 }, 40, 17) as DrawState;
	expect(s.cells.get("5,5")).toBeUndefined();
});
