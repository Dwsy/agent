import { expect, test } from "bun:test";
import { APP_META, type CalcState } from "../src/apps.ts";
import {
	closeWindow,
	contentRect,
	createWm,
	dockLayout,
	focusedWindow,
	hitTest,
	minimizeWindow,
	mouseClick,
	mouseDown,
	mouseDrag,
	mouseUp,
	openApp,
	resizeWm,
	titleBarButtons,
	toggleZoom,
	wmKey,
	type WmState,
} from "../src/wm.ts";

const W = 120;
const H = 40;

function fresh(): WmState {
	return createWm(W, H);
}

function titleDragCell(state: WmState): { x: number; y: number; winId: string } {
	const win = focusedWindow(state)!;
	return { x: win.rect.x + 12, y: win.rect.y, winId: win.id };
}

test("初始:三个 app 窗口都在工作区内", () => {
	const state = fresh();
	expect(state.windows.map((w) => w.appId).sort()).toEqual(["calc", "draw", "notes"]);
	expect(state.focusId).toBe(state.windows.at(-1)!.id);
	for (const w of state.windows) {
		expect(w.rect.y + w.rect.h).toBeLessThanOrEqual(H - 2);
		expect(w.rect.x + w.rect.w).toBeLessThanOrEqual(W);
	}
});

test("拖拽标题栏移动窗口", () => {
	// 用计算器窗口(左上角,四周有移动空间)验证拖拽。
	const state = openApp(fresh(), "calc");
	const win = focusedWindow(state)!;
	const from = titleDragCell(state);
	const down = mouseDown(state, from.x, from.y);
	expect(down.handled).toBe(true);
	expect(down.capture).toBe(true);
	const dragged = mouseDrag(down.state, from.x + 6, from.y + 3);
	const done = mouseUp(dragged.state);
	const after = done.state.windows.find((w) => w.id === win.id)!;
	expect(after.rect.x).toBe(win.rect.x + 6);
	expect(after.rect.y).toBe(win.rect.y + 3);
	expect(done.state.drag).toBeNull();
});

test("拖拽越界时窗口被夹回工作区", () => {
	const state = openApp(fresh(), "calc");
	const from = titleDragCell(state);
	const down = mouseDown(state, from.x, from.y);
	const dragged = mouseDrag(down.state, from.x - 500, from.y - 500);
	const after = dragged.state.windows.find((w) => w.id === from.winId)!;
	expect(after.rect.x).toBe(0);
	expect(after.rect.y).toBe(0);
});

test("右边缘 resize 只改宽度", () => {
	const state = fresh();
	const win = focusedWindow(state)!;
	const x = win.rect.x + win.rect.w - 1;
	const y = win.rect.y + 2;
	const down = mouseDown(state, x, y);
	expect(hitTest(state, x, y).kind).toBe("resize");
	const dragged = mouseDrag(down.state, x + 10, y);
	const after = dragged.state.windows.find((w) => w.id === win.id)!;
	expect(after.rect.w).toBe(win.rect.w + 10);
	expect(after.rect.h).toBe(win.rect.h);
});

test("右下角同时改宽高", () => {
	const state = fresh();
	const win = focusedWindow(state)!;
	const x = win.rect.x + win.rect.w - 1;
	const y = win.rect.y + win.rect.h - 1;
	const down = mouseDown(state, x, y);
	const dragged = mouseDrag(down.state, x + 5, y + 4);
	const after = dragged.state.windows.find((w) => w.id === win.id)!;
	expect(after.rect.w).toBe(win.rect.w + 5);
	expect(after.rect.h).toBe(win.rect.h + 4);
});

test("resize 不会小于最小尺寸", () => {
	const state = fresh();
	const win = focusedWindow(state)!;
	const x = win.rect.x + win.rect.w - 1;
	const y = win.rect.y + win.rect.h - 1;
	const down = mouseDown(state, x, y);
	const dragged = mouseDrag(down.state, x - 500, y - 500);
	const after = dragged.state.windows.find((w) => w.id === win.id)!;
	expect(after.rect.w).toBe(APP_META[win.appId].minW);
	expect(after.rect.h).toBe(APP_META[win.appId].minH);
});

test("点 [─] 最小化,dock 图标恢复", () => {
	const state = fresh();
	const win = focusedWindow(state)!;
	const btn = titleBarButtons(win.rect)[0]!;
	const clicked = mouseClick(state, btn.x + 1, btn.y);
	expect(clicked.state.windows.find((w) => w.id === win.id)!.minimized).toBe(true);
	expect(clicked.state.focusId).not.toBe(win.id);

	const entry = dockLayout(W).find((e) => e.appId === win.appId)!;
	const restored = mouseClick(clicked.state, entry.x + 1, H - 1);
	const after = restored.state.windows.find((w) => w.id === win.id)!;
	expect(after.minimized).toBe(false);
	expect(restored.state.focusId).toBe(win.id);
});

test("dock 点击聚焦中的窗口 = 最小化", () => {
	const state = fresh();
	const win = focusedWindow(state)!;
	const entry = dockLayout(W).find((e) => e.appId === win.appId)!;
	const clicked = mouseClick(state, entry.x + 1, H - 1);
	expect(clicked.state.windows.find((w) => w.id === win.id)!.minimized).toBe(true);
});

test("点 [□] 最大化,再点还原到拖动前的几何", () => {
	const state = fresh();
	const win = focusedWindow(state)!;
	const zoomBtn = titleBarButtons(win.rect)[1]!;
	const zoomed = mouseClick(state, zoomBtn.x + 1, zoomBtn.y);
	const afterZoom = zoomed.state.windows.find((w) => w.id === win.id)!;
	expect(afterZoom.zoomed).toBe(true);
	expect(afterZoom.rect).toEqual({ x: 0, y: 0, w: W, h: H - 2 });

	// 最大化后按钮跟着标题栏走到了新位置,再点一次应还原。
	const zoomedBtn = titleBarButtons(afterZoom.rect)[1]!;
	const restored = mouseClick(zoomed.state, zoomedBtn.x + 1, zoomedBtn.y);
	const afterRestore = restored.state.windows.find((w) => w.id === win.id)!;
	expect(afterRestore.zoomed).toBe(false);
	expect(afterRestore.rect).toEqual(win.rect);
});

test("标题栏双击 = 最大化切换", () => {
	const state = fresh();
	const win = focusedWindow(state)!;
	const cell = titleDragCell(state);
	const clicked = mouseClick(state, cell.x, cell.y, 2);
	expect(clicked.state.windows.find((w) => w.id === win.id)!.zoomed).toBe(true);
});

test("点 [✕] 关闭窗口,dock 可重新打开", () => {
	const state = fresh();
	const win = focusedWindow(state)!;
	const closeBtn = titleBarButtons(win.rect)[2]!;
	const closed = mouseClick(state, closeBtn.x + 1, closeBtn.y);
	expect(closed.state.windows.find((w) => w.id === win.id)).toBeUndefined();

	const entry = dockLayout(W).find((e) => e.appId === win.appId)!;
	const reopened = mouseClick(closed.state, entry.x + 1, H - 1);
	expect(reopened.state.windows.some((w) => w.appId === win.appId)).toBe(true);
});

test("遮挡窗口:命中永远是最上层", () => {
	const state = fresh();
	const top = focusedWindow(state)!;
	// 把另一个窗口拖到焦点窗口上,焦点窗口位置应命中被拖动的窗口。
	const other = state.windows.find((w) => w.id !== top.id)!;
	const from = { x: other.rect.x + 12, y: other.rect.y };
	const to = { x: top.rect.x + 12, y: top.rect.y };
	const moved = mouseDrag(mouseDown(state, from.x, from.y).state, to.x, to.y);
	const draggedWin = moved.state.windows.find((w) => w.id === other.id)!;
	const hit = hitTest(moved.state, draggedWin.rect.x + 12, draggedWin.rect.y);
	expect(hit.kind).toBe("title");
	expect((hit as { winId: string }).winId).toBe(other.id);
});

test("Alt 组合键:最小化 / 最大化 / 切换 / 打开", () => {
	let state = fresh();
	const win = focusedWindow(state)!;
	state = wmKey(state, { t: "char", ch: "m", alt: true }).state;
	expect(state.windows.find((w) => w.id === win.id)!.minimized).toBe(true);

	state = wmKey(state, { t: "char", ch: "1", alt: true }).state;
	expect(focusedWindow(state)!.appId).toBe("calc");

	const before = focusedWindow(state)!;
	state = wmKey(state, { t: "char", ch: "z", alt: true }).state;
	expect(focusedWindow(state)!.zoomed).toBe(true);
	state = wmKey(state, { t: "char", ch: "z", alt: true }).state;
	expect(focusedWindow(state)!.rect).toEqual(before.rect);

	state = wmKey(state, { t: "char", ch: "n", alt: true }).state;
	expect(state.focusId).not.toBe(before.id);
});

test("Esc 退出桌面", () => {
	const out = wmKey(fresh(), { t: "esc" });
	expect(out.exit).toBe(true);
});

test("窗口尺寸变化后几何仍受约束", () => {
	const state = resizeWm(fresh(), 40, 12);
	for (const w of state.windows) {
		expect(w.rect.x + w.rect.w).toBeLessThanOrEqual(40);
		expect(w.rect.y + w.rect.h).toBeLessThanOrEqual(12 - 2);
	}
});

test("内容区点击转发给 app(计算器按钮)", () => {
	const state = createWm(120, 40);
	const calc = state.windows.find((w) => w.appId === "calc")!;
	// 标题栏下的第一格内容直接是计算器面板,点击不影响模型几何。
	const before = calc.rect;
	const content = contentRect(calc.rect);
	const clicked = mouseClick({ ...state, focusId: calc.id }, content.x + 1, content.y + 1);
	expect(clicked.state.windows.find((w) => w.id === calc.id)!.rect).toEqual(before);
	const app = clicked.state.windows.find((w) => w.id === calc.id)!.app as CalcState;
	expect(app.kind).toBe("calc");
});

test("minimizeWindow / toggleZoom / closeWindow 可组合", () => {
	let state = fresh();
	const win = focusedWindow(state)!;
	state = minimizeWindow(state, win.id);
	expect(state.windows.find((w) => w.id === win.id)!.minimized).toBe(true);
	state = toggleZoom(openApp(state, win.appId), win.id);
	expect(state.windows.find((w) => w.id === win.id)!.zoomed).toBe(true);
	state = closeWindow(state, win.id);
	expect(state.windows.find((w) => w.id === win.id)).toBeUndefined();
});
