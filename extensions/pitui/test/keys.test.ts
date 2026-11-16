import { expect, test } from "bun:test";
import { parseKeys } from "../src/keys.ts";

test("普通字符逐个解码", () => {
	expect(parseKeys("ab")).toEqual([
		{ t: "char", ch: "a" },
		{ t: "char", ch: "b" },
	]);
});

test("回车 / 退格 / Esc", () => {
	expect(parseKeys("\r")).toEqual([{ t: "enter" }]);
	expect(parseKeys("\x7f")).toEqual([{ t: "backspace" }]);
	expect(parseKeys("\x1b")).toEqual([{ t: "esc" }]);
});

test("方向键与 Home/End", () => {
	expect(parseKeys("\x1b[A")[0]).toMatchObject({ t: "up" });
	expect(parseKeys("\x1b[D")[0]).toMatchObject({ t: "left" });
	expect(parseKeys("\x1b[H")[0]).toMatchObject({ t: "home" });
	expect(parseKeys("\x1b[F")[0]).toMatchObject({ t: "end" });
	expect(parseKeys("\x1b[3~")[0]).toMatchObject({ t: "delete" });
});

test("带修饰键的方向键", () => {
	expect(parseKeys("\x1b[1;3A")[0]).toMatchObject({ t: "up", alt: true });
	expect(parseKeys("\x1b[1;2C")[0]).toMatchObject({ t: "right", shift: true });
});

test("ESC + 字符 = Alt 组合", () => {
	expect(parseKeys("\x1bn")).toEqual([{ t: "char", ch: "n", alt: true }]);
});

test("一次输入块包含多个按键", () => {
	const keys = parseKeys("7\r");
	expect(keys.map((k) => k.t)).toEqual(["char", "enter"]);
});
