import { test, expect, beforeEach } from "bun:test";
import { installPiTuiMock, visibleWidth } from "./test-support.ts";

// Complete shared pi-tui mock: bun mock.module is process-global and the first
// instantiated mock wins across files, so every site installs the same union.
installPiTuiMock();

// Cache-busting import: role-panel.ts may already have been evaluated against
// another file's mock; ?fresh re-evaluates it against the mock installed above.
const { RolePanelComponent } = await import("./role-panel.ts?fresh=1");
type Panel = InstanceType<typeof RolePanelComponent>;

// -----------------------------------------------------------------------------
// Fixtures: ASCII + CJK roles across states (current/default/mapped/first-run).
// -----------------------------------------------------------------------------

const entries = [
	{
		name: "zero",
		displayName: "π-zero",
		emoji: "🧠",
		learnings: 28,
		preferences: 6,
		events: 12,
		pending: 3,
		firstRun: false,
		isDefault: true,
		isCurrent: true,
		mappedToCwd: true,
	},
	{
		name: "architect",
		displayName: "",
		emoji: "",
		learnings: 0,
		preferences: 0,
		events: 0,
		pending: 0,
		firstRun: true,
		isDefault: false,
		isCurrent: false,
		mappedToCwd: false,
	},
	{
		name: "mao-niang",
		displayName: "猫娘风格",
		emoji: "🐱",
		learnings: 2,
		preferences: 9,
		events: 1,
		pending: 0,
		firstRun: false,
		isDefault: false,
		isCurrent: false,
		mappedToCwd: false,
	},
];

const details: Record<string, { mappings: string[]; corePrompt: string }> = {
	zero: {
		mappings: ["/Users/dengwenyu/.pi", "/Users/dengwenyu/Dev/AI"],
		corePrompt: "# IDENTITY\n\nπ-zero，AI 编程助手。\n核心信条：記憶が人を形作る。",
	},
	architect: { mappings: [], corePrompt: "" },
	"mao-niang": {
		mappings: ["/tmp/pet"],
		corePrompt: "活泼傲娇的猫娘，有灵魂有脾气。\n".repeat(20),
	},
};

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

function makePanel(mode: "control" | "select" = "control"): {
	panel: Panel;
	doneCalls: Array<string | undefined>;
	renderLines: (width: number) => string[];
} {
	const doneCalls: Array<string | undefined> = [];
	const panel = new RolePanelComponent({
		tui: { requestRender: () => {} } as any,
		theme,
		entries: entries as any,
		detail: (name: string) => details[name],
		scopeLine: "目录 /Users/dengwenyu/.pi → zero (mapped)",
		mode,
		done: (result?: string) => doneCalls.push(result),
	});
	panel.focused = true;
	return { panel, doneCalls, renderLines: (w) => panel.render(w) };
}

function typeQuery(panel: Panel, query: string): void {
	for (const ch of query) panel.handleInput(ch);
}

beforeEach(() => {});

// -----------------------------------------------------------------------------
// Render invariants
// -----------------------------------------------------------------------------

test("every rendered line is exactly the requested width (wide, medium, narrow)", () => {
	const { renderLines } = makePanel();
	for (const width of [120, 80, 56, 40]) {
		for (const line of renderLines(width)) {
			expect(visibleWidth(line)).toBe(width);
		}
	}
});

test("width invariant holds while filtered with a CJK query", () => {
	const { panel, renderLines } = makePanel();
	typeQuery(panel, "猫娘");
	for (const width of [120, 72, 56]) {
		for (const line of renderLines(width)) {
			expect(visibleWidth(line)).toBe(width);
		}
	}
});

test("badges never render 'undefined' and markers show role state", () => {
	const out = makePanel().renderLines(120).join("\n");
	expect(out).not.toContain("undefined");
	expect(out).toContain("●当前");
	expect(out).toContain("★默认");
	expect(out).toContain("→本目录");
	expect(out).toContain("⚠初始化");
});

test("narrow layout stays single-column with inline identity and closed border", () => {
	const out = makePanel().renderLines(56);
	const text = out.join("\n");
	expect(text).toContain("π-zero");
	expect(out[out.length - 1].endsWith("╯")).toBe(true);
});

// -----------------------------------------------------------------------------
// Detail pane
// -----------------------------------------------------------------------------

test("detail pane shows memory stats, mappings and core prompt preview", () => {
	const text = makePanel().renderLines(120).join("\n");
	expect(text).toContain("记忆: L28 · P6 · E12 · pending 3");
	expect(text).toContain("/Users/dengwenyu/.pi");
	expect(text).toContain("記憶が人を形作る");
});

test("first-run roles surface the init warning in the detail pane", () => {
	const { panel, renderLines } = makePanel();
	panel.handleInput("\x1b[B"); // down -> architect
	const text = renderLines(120).join("\n");
	expect(text).toContain("⚠ 首次运行 - 需要初始化");
	expect(text).toContain("(core prompt 为空)");
});

test("long core prompts report remaining lines", () => {
	const { panel, renderLines } = makePanel();
	panel.handleInput("\x1b[6~"); // pagedown -> mao-niang
	const text = renderLines(120).join("\n");
	expect(text).toMatch(/\+\d+ more/);
});

// -----------------------------------------------------------------------------
// Filtering
// -----------------------------------------------------------------------------

test("filter matches name and displayName, keeping the cursor on the same role", () => {
	const { panel, renderLines } = makePanel();
	typeQuery(panel, "arch");
	let text = renderLines(120).join("\n");
	expect(text).toContain('"arch" (1)');
	expect(text).not.toContain("mao-niang");

	typeQuery(panel, "itect"); // refine -> still architect, cursor preserved
	text = renderLines(120).join("\n");
	expect(text).toContain("architect");

	panel.handleInput("\x1b"); // Esc clears the query
	text = renderLines(120).join("\n");
	expect(text).toContain("角色 (3/3)");
});

test("CJK displayName search finds roles", () => {
	const { panel, renderLines } = makePanel();
	typeQuery(panel, "猫娘");
	const text = renderLines(120).join("\n");
	expect(text).toContain("mao-niang");
	expect(text).not.toContain("architect");
});

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------

test("Enter resolves with map:<role>", () => {
	const { panel, doneCalls } = makePanel();
	panel.handleInput("\r");
	expect(doneCalls).toEqual(["map:zero"]);
});

test("initial cursor prefers the live role over an earlier default role", () => {
	const doneCalls: Array<string | undefined> = [];
	const panel = new RolePanelComponent({
		tui: { requestRender: () => {} } as any,
		theme,
		// default role listed FIRST, live role second: cursor must still land on live.
		entries: [entries[1], { ...entries[0], isDefault: false, mappedToCwd: false }, entries[2]] as any,
		detail: (name: string) => details[name],
		scopeLine: "",
		mode: "control",
		done: (result?: string) => doneCalls.push(result),
	});
	panel.handleInput("\r");
	expect(doneCalls).toEqual(["map:zero"]);
});

test("control chords dispatch their tokens", () => {
	const { panel, doneCalls } = makePanel();
	panel.handleInput("\x04"); // ^D default
	expect(doneCalls).toEqual(["default:zero"]);

	const second = makePanel();
	second.panel.handleInput("\x0e"); // ^N create
	second.panel.handleInput("\x18"); // ^X disable
	second.panel.handleInput("\x10"); // ^P injection
	second.panel.handleInput("\x16"); // ^V memories
	second.panel.handleInput("\x12"); // ^R status
	second.panel.handleInput("\x07"); // ^G config
	expect(second.doneCalls).toEqual(["create", "disable", "injection", "memories", "status", "config"]);
});

test("select mode keeps Enter/^N but ignores control actions", () => {
	const { panel, doneCalls } = makePanel("select");
	panel.handleInput("\x04"); // ^D must be inert in select mode
	panel.handleInput("\x07"); // ^G must be inert in select mode
	expect(doneCalls).toEqual([]);
	panel.handleInput("\r");
	expect(doneCalls).toEqual(["map:zero"]);
});

test("Esc closes, or clears the filter first when one is active", () => {
	const { panel, doneCalls } = makePanel();
	typeQuery(panel, "zzz-no-match");
	panel.handleInput("\x1b");
	expect(doneCalls).toEqual([]);
	panel.handleInput("\x1b");
	expect(doneCalls).toEqual([undefined]);
});
