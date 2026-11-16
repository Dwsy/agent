/**
 * Shared test mocks for the @earendil-works packages.
 *
 * bun's mock.module is process-global and the FIRST instantiation of a mocked
 * module wins for later importers in the same `bun test` run. Every mock site
 * must therefore provide the complete union of what production code imports -
 * otherwise whichever test file binds first starves the others of named
 * exports (historically: "Export named 'Input'/'getMarkdownTheme' not found").
 */
import { mock } from "bun:test";

// -----------------------------------------------------------------------------
// Width math: double-width CJK/emoji aware, ANSI-stripping. Mirrors what the
// components rely on for their "every line is exactly `width` columns" contract.
// -----------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function charWidth(ch: string): number {
	const cp = ch.codePointAt(0) ?? 0;
	if (cp === 0x200b || cp === 0xfe0f || cp === 0x200d) return 0;
	if (cp >= 0x1100 && (cp <= 0x115f || cp === 0x2329 || cp === 0x232a
		|| (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
		|| (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f)
		|| (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6)
		|| (cp >= 0x1f300 && cp <= 0x1f64f) || (cp >= 0x1f900 && cp <= 0x1f9ff)
		|| (cp >= 0x20000 && cp <= 0x3fffd))) return 2;
	return 1;
}

export function visibleWidth(s: string): number {
	let w = 0;
	for (const ch of s.replace(ANSI_RE, "")) w += charWidth(ch);
	return w;
}

export function truncateToWidth(s: string, w: number): string {
	let out = "";
	let used = 0;
	for (const ch of s) {
		const cw = charWidth(ch);
		if (used + cw > w) break;
		out += ch;
		used += cw;
	}
	return out;
}

// -----------------------------------------------------------------------------
// Input: minimal editable single-line query input.
// -----------------------------------------------------------------------------

export class Input {
	value = "";
	focused = false;
	onSubmit?: (value: string) => void;
	onEscape?: () => void;
	getValue(): string { return this.value; }
	setValue(v: string): void { this.value = v; }
	handleInput(data: string): void {
		if (data === "\x7f" || data === "\b") this.value = this.value.slice(0, -1);
		else if ([...data].length === 1 && data >= " ") this.value += data;
	}
}

// -----------------------------------------------------------------------------
// Key decoding: raw terminal bytes -> canonical key ids used by matchesKey.
// -----------------------------------------------------------------------------

const KEY_IDS: Record<string, string> = {
	"\x1b": "escape",
	"\x03": "ctrl+c",
	"\x04": "ctrl+d",
	"\x05": "ctrl+e",
	"\x07": "ctrl+g",
	"\x0e": "ctrl+n",
	"\x0f": "ctrl+o",
	"\x10": "ctrl+p",
	"\x12": "ctrl+r",
	"\x15": "ctrl+u",
	"\x16": "ctrl+v",
	"\x18": "ctrl+x",
	"\r": "return",
	"\t": "tab",
	"\x7f": "backspace",
	"\x1b[A": "up",
	"\x1b[B": "down",
	"\x1b[5~": "pageup",
	"\x1b[6~": "pagedown",
	"\x1b[H": "home",
	"\x1b[F": "end",
};

const Key = {
	escape: "escape",
	enter: "return",
	up: "up",
	down: "down",
	pageUp: "pageup",
	pageDown: "pagedown",
	home: "home",
	end: "end",
	backspace: "backspace",
	ctrl: (c: string) => `ctrl+${c}`,
};

function matchesKey(data: string, id: string): boolean {
	return KEY_IDS[data] === id;
}

// -----------------------------------------------------------------------------
// Installers
// -----------------------------------------------------------------------------

export function installPiTuiMock(): void {
	mock.module("@earendil-works/pi-tui", () => ({
		Box: class { addChild() {} },
		Container: class {},
		SelectList: class {},
		Text: class {},
		Spacer: class {},
		Markdown: class {
			constructor(..._args: unknown[]) {}
			render(): string[] { return []; }
			invalidate(): void {}
		},
		Input,
		Key,
		matchesKey,
		truncateToWidth,
		visibleWidth,
	}));
}

export function installPiCodingAgentMock(): void {
	mock.module("@earendil-works/pi-coding-agent", () => ({
		convertToLlm: (m: unknown[]) => m,
		serializeConversation: (m: unknown[]) => JSON.stringify(m),
		getMarkdownTheme: () => ({}),
		getLanguageFromPath: () => "text",
		highlightCode: (code: string) => code,
		compact: async () => ({}),
	}));
}

export function installPiAiMock(): void {
	mock.module("@earendil-works/pi-ai/compat", () => ({
		complete: async () => ({ stopReason: "end", content: [] }),
		completeSimple: async () => ({ stopReason: "end", content: [] }),
	}));
	mock.module("@earendil-works/pi-ai", () => ({
		StringEnum: (x: unknown) => x,
	}));
}

/**
 * Local-module mock: runtime/ui.ts imports the panel data builders from
 * role-control-center.ts. Any test that mocks role-control-center must install
 * the same complete union (same first-instantiation-wins rule as above).
 */
export function installRoleControlCenterMock(): void {
	mock.module(new URL("./role-control-center.ts", import.meta.url).pathname, () => ({
		openRoleControlCenter: async () => {},
		buildPanelEntries: () => [],
		buildPanelDetail: () => ({ mappings: [], corePrompt: "" }),
		scopeLineFor: () => "",
	}));
}
