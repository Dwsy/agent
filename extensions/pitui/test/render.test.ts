import { expect, test } from "bun:test";
import { charWidth, plainPalette } from "../src/ansi.ts";
import { renderDesktop, renderPanel, visibleWidth } from "../src/render.ts";
import {
	createWm,
	minimizeWindow,
	focusedWindow,
	mouseClick,
	titleBarButtons,
	toggleZoom,
	type WmState,
} from "../src/wm.ts";

const W = 80;
const H = 24;

function frame(state: WmState): string[] {
	return renderDesktop(state, plainPalette);
}

test("帧尺寸恒等于终端网格", () => {
	const lines = frame(createWm(W, H));
	expect(lines.length).toBe(H);
	for (const line of lines) expect(visibleWidth(line)).toBe(W);
});

test("CJK 宽字符不破坏列宽", () => {
	const lines = frame(createWm(40, 12));
	for (const line of lines) expect(visibleWidth(line)).toBe(40);
});

test("dock 与三个窗口标题都在帧里", () => {
	const out = frame(createWm(W, H)).join("\n");
	expect(out).toContain("计算器");
	expect(out).toContain("记事本");
	expect(out).toContain("绘图");
	expect(out).toContain("●"); // 运行中标记
});

test("最小化后窗口标题从帧里消失", () => {
	const state = createWm(W, H);
	const win = focusedWindow(state)!;
	const minimized = minimizeWindow(state, win.id);
	// 窗口标题栏里的标题后面跟着填充线,dock 里的标签没有。
	expect(frame(minimized).join("\n")).not.toContain(`${win.title}─`);
});

test("窗口边框与标题栏按钮可见", () => {
	const out = frame(createWm(W, H)).join("\n");
	expect(out).toContain("┌");
	expect(out).toContain("┘");
	expect(out).toContain("[─]");
	expect(out).toContain("[□]");
	expect(out).toContain("[✕]");
});

test("最大化铺满工作区,底部保留 dock 与状态栏", () => {
	const state = createWm(W, H);
	const win = focusedWindow(state)!;
	const zoomed = toggleZoom(state, win.id);
	const lines = frame(zoomed);
	// 工作区顶行是最大化窗口的标题栏
	expect(lines[0]!).toContain(win.title);
	// 最后两行分别是状态栏和 dock
	expect(lines[H - 1]!).toContain("绘图");
	expect(lines[H - 2]!).toContain("Esc");
});

test("点击最小化按钮后帧立即更新", () => {
	const state = createWm(W, H);
	const win = focusedWindow(state)!;
	const btn = titleBarButtons(win.rect)[0]!;
	expect(cols(frame(state)[btn.y]!, btn.x, 3)).toBe("[─]");
	const after = mouseClick(state, btn.x + 1, btn.y).state;
	expect(cols(frame(after)[btn.y]!, btn.x, 3)).not.toBe("[─]");
});

test("悬浮面板:外边框 + 桌面帧,列宽 = 桌面宽 + 2", () => {
	const state = createWm(W, H);
	const lines = renderPanel(state, plainPalette);
	expect(lines.length).toBe(H + 2);
	for (const line of lines) expect(visibleWidth(line)).toBe(W + 2);
	expect(lines[0]).toContain("pitui 桌面");
	expect(lines[0]!.startsWith("┌")).toBe(true);
	expect(lines.at(-1)!.startsWith("└")).toBe(true);
	// 中间行左右各一根竖边框
	expect(lines[5]!.startsWith("│")).toBe(true);
	expect(lines[5]!.endsWith("│")).toBe(true);
});

/** 按显示列切片(CJK 安全),用于断言帧上的精确位置。 */
function cols(line: string, x: number, n: number): string {
	let out = "";
	let col = 0;
	for (const ch of line) {
		const w = charWidth(ch);
		if (col >= x && col < x + n) out += ch;
		col += w;
		if (col >= x + n) break;
	}
	return out;
}
