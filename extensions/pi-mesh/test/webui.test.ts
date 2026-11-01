/**
 * WebUI contract test — cheap static assertions that the public page honours
 * the pi-mesh HTTP API contract (see src/protocol.ts) and the WebUI stack rules:
 * Tailwind + Alpine + Lucide CDNs, esc() HTML-escaping, no inline handlers.
 */
import { test, expect } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const html = readFileSync(join(root, "src/hub/public/index.html"), "utf8");
const js = readFileSync(join(root, "src/hub/public/app.js"), "utf8");
const reviewJs = readFileSync(join(root, "src/hub/public/review.js"), "utf8");
const css = readFileSync(join(root, "src/hub/public/app.css"), "utf8");
const all = html + "\n" + js;

test("vendored stack: Tailwind + Alpine + Lucide pinned locally (no external CDN)", () => {
	// S5: the whole UI stack ships inside public/cdn/ — a proxied/offline browser
	// must still boot (the verifier hit exactly that blank-page failure mode)
	expect(html).not.toContain("https://cdn.tailwindcss.com");
	expect(html).not.toContain("unpkg.com");
	expect(html).not.toContain("cdn.jsdelivr.net");
	expect(html).toContain('src="/cdn/tailwindcss-3.4.16.js"');
	expect(html).toContain('src="/cdn/lucide-0.469.0.js"');
	expect(html).toContain('src="/cdn/alpinejs-3.14.9.js"');
	for (const f of [
		"src/hub/public/cdn/tailwindcss-3.4.16.js",
		"src/hub/public/cdn/alpinejs-3.14.9.js",
		"src/hub/public/cdn/lucide-0.469.0.js",
	]) {
		expect(statSync(join(root, f)).size).toBeGreaterThan(10000);
	}
	// app.js is local, loaded before Alpine so `mesh` registers on alpine:init
	expect(html).toContain('src="app.js"');
	expect(js).toContain("alpine:init");
	expect(js).toContain('Alpine.data("mesh"');
});

test("HTTP API paths match the protocol contract", () => {
	// GET /api/peers
	expect(js).toContain('"/api/peers"');
	// GET /api/peers/:sessionId/transcript?limit=50
	expect(js).toContain("/transcript?limit=");
	// POST /api/peers/:sessionId/message  {text, mode, fromSessionId?}
	expect(js).toContain("/message");
	expect(js).toContain("JSON.stringify({ text: text, mode: mode, fromSessionId: fromSessionId || undefined })");
	// POST /api/peers/:sessionId/cancel
	expect(js).toContain("/cancel");
	// POST /api/peers/:sessionId/resume {fork?} -> {ok, message, workspaceId?, paneId?} (always HTTP 200)
	expect(js).toContain("/resume");
	expect(js).toContain("JSON.stringify({ fork: !!fork })");
	// GET /api/events -> SSE stream of HubEvent
	expect(js).toContain('new EventSource("/api/events")');
	// both HubEvent variants handled
	expect(js).toContain('"peers"');
	expect(js).toContain('"file_activity"');
});

test("esc() helper is defined and used for all interpolated text", () => {
	expect(js).toContain("function esc(");
	const usages = (all.match(/\besc\(/g) || []).length;
	expect(usages).toBeGreaterThan(20);
	// every x-html interpolation goes through esc()
	const xhtmls = [...html.matchAll(/x-html="([^"]*)"/g)].map((m) => m[1]);
	expect(xhtmls.length).toBeGreaterThan(20);
	for (const expr of xhtmls) {
		// expressions must either call esc() directly or only build from esc()'d pieces
		expect(expr).toContain("esc(");
	}
});

test("no inline event handlers (Alpine only)", () => {
	expect(html).not.toContain("onclick=");
	expect(html).not.toContain("onchange=");
	expect(html).not.toContain("onsubmit=");
	expect(html).toContain('x-data="mesh"');
	expect(html).toContain("@keydown.escape.window");
});

test("UI copy: Chinese labels + states + empty state", () => {
	for (const label of ["在线", "离线", "已关闭"]) expect(html).toContain(label);
	for (const label of ["运行中", "等待", "离线", "已关闭"]) expect(js).toContain(label);
	expect(html).toContain("没有可用会话");
	// data-derived group/worktree labels live in app.js (grouped getter / wtLabel)
	expect(all).toContain("无 Git 仓库");
	expect(all).toContain("主工作树");
	expect(all).toContain("linked 工作树");
	expect(html).toContain("连接断开");
	expect(html).toContain("发消息");
	expect(html).toContain("历史");
});

test("feature surface: grouping, file activity, transcript roles", () => {
	expect(js).toContain("repoRoot"); // grouping by git.repoRoot
	expect(js).toContain("worktree");
	expect(js).toContain("lastHeartbeat");
	expect(js).toContain("file_activity");
	expect(js).toContain("toolResult");
	expect(js).toContain("stateMeta");
	expect(js).toContain("relTime");
});

test("follows feature: follow/unfollow endpoints + auto-follow via fromSessionId", () => {
	// POST /api/peers/:sessionId/follow   {targetSessionId} -> { ok }
	expect(js).toContain('"/follow"');
	expect(js).toContain("JSON.stringify({ targetSessionId: targetSessionId })");
	// POST /api/peers/:sessionId/unfollow {targetSessionId} -> { ok } (解绑关注)
	expect(js).toContain('"/unfollow"');
	expect(js).toContain("unfollow");
	// PeerView.following drives the toggle state + 粉丝/关注 counts
	expect(js).toContain("following");
	expect(js).toContain("followerCount");
	expect(js).toContain("followingCount");
	// 发消息 carries the viewer as sender so the server auto-adds a follow edge
	expect(js).toContain("fromSessionId");
	expect(js).toContain("fromSessionId: String(viewerId || \"\") || undefined");
	expect(js).toContain("createComposerSnapshot(target, current, this.viewerId)");
	// follow toggle moved to RowOverflowMenu + DetailPane toolbar: handler takes the sessionId
	expect(html).toContain('@click="toggleFollow(p.sessionId)"');
});

test("viewer selector (当前视角): fully custom dropdown, persistence, follow toggle copy", () => {
	expect(html).toContain("当前视角");
	// de-native: NO native form controls anywhere — custom menu-button + popup list
	expect(html).not.toContain("<select");
	expect(html).toContain("viewer-btn");
	expect(html).toContain("viewer-menu");
	expect(html).toContain('role="listbox"');
	expect(html).toContain('role="option"');
	expect(html).toContain("toggleViewerMenu");
	expect(js).toContain("onViewerKey"); // ↑↓/Enter/Esc
	expect(js).toContain("setViewer");
	// follow buttons are disabled with guidance when no viewer is picked
	expect(html).toContain("先选择当前视角");
	expect(html).toContain(":disabled=\"!canFollow()\"");
	// toggle copy: 关注 (outline) / 已关注 (filled) + 粉丝 · 关注 counts
	expect(html).toContain("已关注");
	expect(html).toContain("粉丝");
	// viewer choice persists; preserve an existing selection and only auto-pick a live peer when it disappeared
	expect(js).toContain("localStorage");
	expect(js).toContain("getItem");
	expect(js).toContain("setItem");
	expect(js).toContain("syncViewer");
	expect(js).toContain("resolveViewerId");
	expect(js).toContain("isMessageablePeer");
	expect(js).toContain("if (!this.peers.length) return;");
});

test("resume feature: 恢复 via ConfirmPopover (offline/closed only) + --fork checkbox", () => {
	// 恢复 lives in the row overflow menu + detail toolbar, gated to offline/closed peers
	expect(html).toContain('x-show="canResume(p)"');
	expect(js).toContain('p.state === "offline" || p.state === "closed"'); // canResume gate
	expect(html).toContain("<span>恢复</span>");
	expect(html).toContain('data-lucide="rotate-ccw"');
	expect(html).toContain('@click="openResume(p.sessionId, $event)"');
	// anchored ConfirmPopover state replaces the old inline confirm (confirmSid/resumeSid)
	expect(html).toContain("在独立 herdr 工作区恢复");
	expect(html).toContain("confirmAction");
	expect(html).toContain("resumeFor");
	expect(js).toContain("closeConfirm");
	expect(html).toContain('@click="doResume()"');
	expect(html).toContain('@click="closeConfirm()"');
	// --fork checkbox: 分叉新对话，不续写原会话
	expect(html).toContain('type="checkbox"');
	expect(html).toContain("resumeFork");
	expect(html).toContain("--fork");
	expect(html).toContain("分叉新对话，不续写原会话");
	// confirm -> POST {fork} -> toast returned message (success green / ok:false red) -> refreshPeers(true)
	expect(js).toContain("API.resume");
	expect(js).toContain('ok ? "success" : "error"');
	expect(js).toContain("this.refreshPeers(true)");
});

test("resume badge (↻N): PeerView.resumptions chip + newest-resumption tooltip", () => {
	// compact resume chip on the peer row when resumptions exist — Lucide rotate-ccw + N
	// (emoji/icon glyphs are Lucide-only per UI hard requirement; ↻ char dropped)
	expect(html).toContain("chip-resume");
	expect(html).toContain("resumeCount");
	expect(html).toContain('data-lucide="rotate-ccw"');
	expect(js).toContain("resumptions");
	// tooltip lists herdrWorkspaceId + time of the newest resumption, rendered via esc()
	expect(html).toContain('title="esc(resumeTip(p))"');
	expect(js).toContain("resumeTip");
	expect(js).toContain("herdrWorkspaceId");
	expect(js).toContain("newest.at");
});

/** Pull a top-level `function name(...)` source out of app.js for behavioural checks. */
function extractFn(name: string): string {
	const start = js.indexOf(`function ${name}(`);
	expect(start).toBeGreaterThanOrEqual(0);
	const open = js.indexOf("{", start);
	let depth = 0;
	for (let i = open; i < js.length; i++) {
		if (js[i] === "{") depth++;
		else if (js[i] === "}") {
			depth--;
			if (depth === 0) return js.slice(start, i + 1);
		}
	}
	throw new Error(`unbalanced braces extracting ${name}`);
}
const fns = new Function(
	`${extractFn("buildHistory")}\n${extractFn("resolveHerdrHost")}\nreturn { buildHistory, resolveHerdrHost };`,
)() as {
	buildHistory: (entries: any[]) => any[];
	resolveHerdrHost: (peer: any, agents: any[]) => any;
};

/** Terminal helpers extracted for behavioural checks (base64 / envelopes / theme). */
const termFns = new Function(
	[
		"clampInt",
		"utf8ToBase64",
		"base64ToBytes",
		"base64ToUtf8",
		"terminalInputLine",
		"terminalResizeLine",
		"terminalWsUrl",
		"cssColorToRgb",
		"buildTerminalTheme",
		"bytesToBase64",
		"terminalInputBytesLine",
		"terminalScrollLine",
		"terminalReleaseLine",
		"encodeMouseReport",
		"termModeActivity",
		"termClickAction",
		"termWheelAction",
	].map(extractFn).join("\n") + "\nreturn { clampInt, utf8ToBase64, base64ToBytes, base64ToUtf8, terminalInputLine, terminalResizeLine, terminalWsUrl, cssColorToRgb, buildTerminalTheme, bytesToBase64, terminalInputBytesLine, terminalScrollLine, terminalReleaseLine, encodeMouseReport, termModeActivity, termClickAction, termWheelAction };",
)() as {
	clampInt: (v: number, min: number, max: number) => number;
	utf8ToBase64: (s: string) => string;
	base64ToBytes: (s: string) => Uint8Array;
	base64ToUtf8: (s: string) => string;
	terminalInputLine: (s: string) => string;
	terminalResizeLine: (cols: number, rows: number) => string;
	terminalWsUrl: (target: string, mode: string, cols: number, rows: number, loc?: any) => string;
	cssColorToRgb: (v: string) => number | null;
	buildTerminalTheme: (pal: Record<string, string>) => { foreground: number; background: number; cursor: number; palette: number[] };
	bytesToBase64: (bytes: Uint8Array) => string;
	terminalInputBytesLine: (bytes: Uint8Array) => string;
	terminalScrollLine: (direction: string, lines: number) => string;
	terminalReleaseLine: () => string;
	encodeMouseReport: (r: any) => Uint8Array | null;
	termModeActivity: (bytes: Uint8Array) => boolean;
	termClickAction: (state: any) => string;
	termWheelAction: (state: any) => string;
};

test("history rendering: conversation blocks + collapsed tool chains (⋯ 工具调用 ×N)", () => {
	// user/assistant blocks: role chips + timestamps, text keeps line breaks at a readable measure
	expect(html).toContain("entry-text");
	expect(html).toContain("roleMeta(item.e.role).chip");
	// entry text renders sanitized markdown HTML when present, esc() text otherwise
	expect(html).toContain('x-html="item.e.htmlSafe ?? esc(item.e.text)"');
	// one compact row per consecutive toolResult run: ⋯ 工具调用 ×N + up to 3 tool names (+K) + Lucide-x error count
	expect(html).toContain("⋯ 工具调用 ×");
	expect(html).toContain("item.count");
	expect(html).toContain("item.toolNames");
	expect(html).toContain("esc('+' + item.extraTools)");
	// zero-emoji rule: the error counter is a Lucide x icon + count, never a glyph
	expect(html).toContain('data-lucide="x"');
	expect(html).not.toContain("esc('✗'");
	expect(html).toContain("item.errorCount");
	expect(html).toContain("item.errorCount ? 'entry-error'");
	// click toggles the run inline via Alpine state (item.open), caret rotates
	expect(html).toContain('@click="toggleRun(item)"');
	expect(html).toContain(`:aria-expanded="item.open ? 'true' : 'false'"`);
	expect(html).toContain('x-show="item.open"');
	expect(html).toContain("toolrun-open");
	// expanded run: each tool result monospace, ~6-line clamp + per-item 展开 toggle when longer
	expect(html).toContain("pre-clamp");
	expect(html).toContain("isLongText(te.text)");
	expect(html).toContain("toggleText(te.id)");
	expect(html).toContain("textOpen(te.id) ? '收起' : '展开'");
	// grouping + collapse defaults live in app.js
	expect(js).toContain("buildHistory");
	expect(js).toContain('e.role === "toolResult"');
	expect(js).toContain("it.open = it.count < 2");
	expect(js).toContain("toggleRun(item) { item.open = !item.open; }");
});

test("tool-chain collapse logic: runs group + default open state", () => {
	const t = "2024-05-01T10:00:00.000Z";
	const entries = [
		{ id: "1", timestamp: t, role: "user", text: "hi" },
		{ id: "2", timestamp: t, role: "toolResult", text: "a", toolName: "bash" },
		{ id: "3", timestamp: t, role: "toolResult", text: "b", toolName: "bash" },
		{ id: "4", timestamp: t, role: "toolResult", text: "c", toolName: "read", isError: true },
		{ id: "5", timestamp: t, role: "assistant", text: "done" },
		{ id: "6", timestamp: t, role: "toolResult", text: "solo", toolName: "grep" },
	];
	const items = fns.buildHistory(entries);
	expect(items.length).toBe(4); // user | tool-run | assistant | solo tool
	expect(items[0].kind).toBe("entry");
	const run = items[1];
	expect(run.kind).toBe("tools");
	expect(run.count).toBe(3); // ×N over the whole run
	expect(run.toolNames).toEqual(["bash", "read"]); // distinct names, capped at 3
	expect(run.extraTools).toBe(0);
	expect(run.errorCount).toBe(1); // red ✗N
	expect(run.open).toBe(false); // N ≥ 2 starts collapsed
	expect(items[2].kind).toBe("entry"); // assistant breaks the run
	const solo = items[3];
	expect(solo.kind).toBe("tools");
	expect(solo.count).toBe(1);
	expect(solo.open).toBe(true); // single tool result stays expanded
	// 5 distinct tool names -> top 3 + "+2"
	const wide = fns.buildHistory(
		["bash", "read", "edit", "grep", "web"].map((toolName, i) => ({ id: "x" + i, timestamp: t, role: "toolResult", text: "x", toolName })),
	);
	expect(wide[0].toolNames).toEqual(["bash", "read", "edit"]);
	expect(wide[0].extraTools).toBe(2);
	expect(wide[0].errorCount).toBe(0);
});

test("herdr feature: /api/herdr join + 🖥 herdr chip + 进入 + copy command", () => {
	// GET /api/herdr fetched on load and after every refreshPeers()
	expect(js).toContain('"/api/herdr"');
	expect(js).toContain("API.herdr");
	expect(js).toContain("refreshHerdr");
	expect(js).toMatch(/async refreshPeers\(silent\) \{[\s\S]{0,600}this\.refreshHerdr\(true\);/);
	// join rule: resumptions[].herdrWorkspaceId OR sessionFile === agent.sessionPath
	expect(js).toContain("resolveHerdrHost");
	expect(js).toContain("herdrWorkspaceId");
	expect(js).toContain("sessionFile");
	expect(js).toContain("sessionPath");
	expect(js).toContain("herdrAgents");
	// chip rendered only for herdr peers, tooltip carries workspaceId + status
	// (Lucide monitor icon + "herdr" label — emoji glyphs banned)
	expect(html).toContain("chip-herdr");
	expect(html).toContain('data-lucide="monitor"');
	expect(html).toContain("<span>herdr</span>");
	expect(html).toContain('title="esc(herdrTip(p))"');
	expect(js).toContain("herdrTip");
	expect(js).toContain('"herdr 工作区 "');
	// 进入 button -> POST /api/peers/:sessionId/focus -> toast message green/red
	expect(html).toContain('@click="enterHerdr(p)"');
	expect(html).toContain("<span>进入</span>");
	expect(js).toContain('"/focus"');
	expect(js).toContain("enterHerdr");
	expect(js).toContain("API.focus");
	expect(js).toContain('ok ? "success" : "error"');
	// copy button (Lucide copy) copies the exact focus command, toast 已复制命令
	expect(html).toContain('@click="copyHerdrCmd(p)"');
	expect(html).toContain('data-lucide="copy"');
	expect(js).toContain("copyHerdrCmd");
	expect(js).toContain('"herdr workspace focus "');
	expect(js).toContain('"herdr agent focus "');
	expect(js).toContain('"已复制命令"');
	// clipboard fallback reused from the copySid pattern
	expect(js).toContain("navigator.clipboard");
	expect(js).toContain("document.execCommand");
	expect(js).toContain("copyText");
});

test("herdr resolution order: resume link first, live agent match as fallback", () => {
	const t = "2024-05-01T10:00:00.000Z";
	const agents = [{ paneId: "pane-1", workspaceId: "ws-agent", sessionPath: "/tmp/s.jsonl", status: "running" }];
	// (a) resumptions[] with herdrWorkspaceId -> `herdr workspace focus <ws>` (newest link wins)
	const viaResume = fns.resolveHerdrHost(
		{
			sessionFile: "/tmp/s.jsonl",
			resumptions: [
				{ at: t, via: "manual", herdrWorkspaceId: "ws-old" },
				{ at: t, via: "mesh-cli", herdrWorkspaceId: "ws-new", herdrPaneId: "pane-9" },
			],
		},
		agents,
	);
	expect(viaResume.via).toBe("resume");
	expect(viaResume.workspaceId).toBe("ws-new");
	expect(viaResume.command).toBe("herdr workspace focus ws-new");
	// (b) no resume link -> sessionFile === agent.sessionPath -> `herdr agent focus <paneId>`
	const viaAgent = fns.resolveHerdrHost({ sessionFile: "/tmp/s.jsonl", resumptions: [] }, agents);
	expect(viaAgent.via).toBe("agent");
	expect(viaAgent.workspaceId).toBe("ws-agent");
	expect(viaAgent.paneId).toBe("pane-1");
	expect(viaAgent.command).toBe("herdr agent focus pane-1");
	// (c) neither -> not in herdr (no chip, no 进入 / copy actions)
	expect(fns.resolveHerdrHost({ sessionFile: "/tmp/other.jsonl", resumptions: [] }, agents)).toBeNull();
	expect(fns.resolveHerdrHost({ sessionFile: "/tmp/s.jsonl", resumptions: [] }, [])).toBeNull();
	expect(fns.resolveHerdrHost({ sessionFile: "/tmp/s.jsonl" }, agents)).toBeTruthy(); // sessionFile match alone is enough
});

test("theme toggle: sun/moon header button (Alpine handler only)", () => {
	// dedicated header button with sun + moon Lucide icons, swapped per theme via CSS
	expect(html).toContain('id="theme-toggle"');
	expect(html).toContain('@click="toggleTheme()"');
	expect(html).toContain('data-lucide="sun"');
	expect(html).toContain('data-lucide="moon"');
	expect(html).toContain("icon-sun");
	expect(html).toContain("icon-moon");
	expect(html).toContain("切换深色/浅色主题");
	// still no inline handlers
	expect(html).not.toContain("onclick=");
	// toggle implemented in app.js and applied via the single data-theme mechanism
	expect(js).toContain("toggleTheme");
	expect(js).toContain('localStorage.setItem(THEME_KEY');
	expect(all).toContain('"data-theme"');
});

test("theme persistence: localStorage key pi-mesh.theme", () => {
	expect(js).toContain('const THEME_KEY = "pi-mesh.theme"');
	expect(js).toContain("localStorage.getItem(THEME_KEY)");
	// pre-paint bootstrap in index.html reads the same key and sets data-theme pre-paint
	expect(html).toContain('localStorage.getItem("pi-mesh.theme")');
	expect(html).toContain('setAttribute("data-theme"');
});

test("theme defaults: light default + prefers-color-scheme on first visit", () => {
	// stored choice wins, else prefers-color-scheme, else light
	expect(js).toContain('if (t === "light" || t === "dark") return t;');
	expect(js).toContain("return systemTheme();");
	// unknown/absent values are coerced to light (light is the default)
	expect(js).toContain('const next = t === "dark" ? "dark" : "light";');
	// first visit respects prefers-color-scheme, in both the pre-paint script and app.js
	expect(html).toContain("prefers-color-scheme");
	expect(js).toContain("prefers-color-scheme");
	expect(js).toContain("systemTheme");
	expect(js).toContain("loadTheme");
	expect(js).toContain("applyTheme");
});

test("CSS variables: light + dark palettes cover every semantic state colour", () => {
	const light = (css.match(/:root,\s*\[data-theme="light"\]\s*{([^}]*)}/s) || [])[1] || "";
	const dark = (css.match(/\[data-theme="dark"\]\s*{([^}]*)}/s) || [])[1] || "";
	expect(light.length).toBeGreaterThan(0);
	expect(dark.length).toBeGreaterThan(0);
	for (const block of [light, dark]) {
		for (const v of [
			"--bg:",
			"--panel:",
			"--border:",
			"--text:",
			"--muted:",
			"--accent:",
			"--running:",
			"--waiting:",
			"--offline:",
			"--closed:",
		]) {
			expect(block).toContain(v);
		}
	}
	// the two palettes are actually distinct
	const val = (block, name) => (block.match(new RegExp(name + "\\s*([^;]+);")) || [])[1] || "";
	expect(val(light, "--bg")).not.toBe(val(dark, "--bg"));
	expect(val(light, "--accent")).not.toBe(val(dark, "--accent"));
	const rgb = (block: string, name: string) => {
		const hex = (block.match(new RegExp(name + ":\\s*(#[0-9a-f]{6})", "i")) || [])[1];
		expect(hex).toBeTruthy();
		return hex.slice(1).match(/../g)!.map((v) => parseInt(v, 16) / 255);
	};
	const luminance = (c: number[]) => c.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
		.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
	const contrast = (a: number[], b: number[]) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi + 0.05) / (lo + 0.05);
	};
	for (const block of [light, dark]) {
		// Neutral chrome must not drift back to purple/blue when individual surfaces change.
		for (const name of ["--bg", "--panel", "--panel-2", "--panel-3", "--header-bg", "--sidebar", "--control-bg", "--control-selected", "--sel-soft", "--selection-edge", "--menu-bg", "--menu-selection"]) {
			const c = rgb(block, name);
			expect(c).toEqual([c[0], c[0], c[0]]);
		}
		for (const text of ["--text", "--muted", "--faint"]) {
			for (const surface of ["--bg", "--panel", "--panel-2", "--sidebar", "--sel-soft", "--menu-bg", "--menu-selection"]) {
				expect(contrast(rgb(block, text), rgb(block, surface))).toBeGreaterThanOrEqual(4.5);
			}
		}
		expect(contrast(rgb(block, "--sel-soft"), rgb(block, "--sidebar"))).toBeGreaterThan(1.1);
		expect(contrast(rgb(block, "--accent"), rgb(block, "--panel"))).toBeGreaterThanOrEqual(4.5);
	}
	// component layer consumes the variables (badges/toasts/drawer themed through them)
	for (const sel of [".badge-running", ".badge-waiting", ".badge-offline", ".badge-closed", ".toast", ".drawer", ".btn", ".chip"]) {
		expect(css).toContain(sel);
	}
	expect(css).toContain("var(--running)");
	expect(css).toContain("var(--waiting)");
	expect(css).toContain("var(--offline)");
	expect(css).toContain("var(--closed)");
});

test("retheme: no hard-coded palette left in markup / app.js", () => {
	// no hex colours inline in the page
	expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
	// no raw Tailwind palette utilities (colours route through app.css custom properties)
	const paletteUtil = /(bg|text|border|from|to|ring)-(zinc|stone|slate|gray|neutral|emerald|amber|red|sky|green|blue|indigo|violet)-\d/;
	expect(html).not.toMatch(paletteUtil);
	expect(js).not.toMatch(paletteUtil);
});

test("terminal: import map wires @wterm packages to /vendor/ ESM, loaded lazily", () => {
	// bare cross-package specifiers resolve through the import map (hub serves node_modules at /vendor/)
	expect(html).toContain('<script type="importmap">');
	expect(html).toContain('"@wterm/core": "/vendor/@wterm/core/dist/index.js"');
	expect(html).toContain('"@wterm/core/worker": "/vendor/@wterm/core/dist/worker-core.js"');
	expect(html).toContain('"@wterm/dom": "/vendor/@wterm/dom/dist/index.js"');
	expect(html).toContain('"@wterm/ghostty": "/vendor/@wterm/ghostty/dist/index.js"');
	// terminal stylesheet + ghostty WASM also served from /vendor/
	expect(html).toContain('/vendor/@wterm/dom/src/terminal.css');
	expect(js).toContain('"/vendor/@wterm/ghostty/wasm/ghostty-vt.wasm"');
	// terminal module imported dynamically only when a terminal opens
	expect(js).toContain('import("@wterm/dom")');
	expect(js).toContain('import("@wterm/ghostty")');
	expect(js).toContain("loadTermModules");
	expect(js).toContain("GhosttyCore.load");
	expect(js).toContain("new mods.WTerm(");
	expect(js).toContain("await wterm.init()");
	expect(js).toContain("wterm.setThemeColors(");
	expect(js).toContain("wterm.destroy()");
	expect(js).toContain("core.dispose()");
});

test("terminal bridge: WS URL + JSONL envelope builders are exact", () => {
	const f = termFns;
	// UTF-8-safe base64 (TextEncoder bytes, not Latin-1) and its exact inverse
	expect(f.utf8ToBase64("hi")).toBe("aGk=");
	expect(f.utf8ToBase64("中")).toBe("5Lit");
	expect(f.base64ToUtf8("aGk=")).toBe("hi");
	const mixed = "中文 · π ✓ émoji 🎉";
	expect(f.base64ToUtf8(f.utf8ToBase64(mixed))).toBe(mixed);
	expect(Array.from(f.base64ToBytes("aGk="))).toEqual([104, 105]);
	// envelopes match src/hub/terminal.ts sanitizeClientLine contract verbatim
	expect(f.terminalInputLine("hi")).toBe('{"type":"terminal.input","bytes":"aGk="}');
	expect(f.terminalResizeLine(120, 40)).toBe('{"type":"terminal.resize","cols":120,"rows":40}');
	// sizes clamp into the herdr bounds (cols 20..400, rows 5..200)
	expect(f.terminalResizeLine(5000, 1)).toBe('{"type":"terminal.resize","cols":400,"rows":5}');
	// WS URL: same host, /api/terminal, target/mode/cols/rows per protocol.ts
	const url = f.terminalWsUrl("pane-1", "control", 120, 40, { protocol: "http:", host: "127.0.0.1:8765" });
	expect(url).toBe("ws://127.0.0.1:8765/api/terminal?target=pane-1&mode=control&cols=120&rows=40");
	const secure = f.terminalWsUrl("pane 1/x", "observe", 80, 24, { protocol: "https:", host: "mesh.local" });
	expect(secure).toBe("wss://mesh.local/api/terminal?target=pane%201%2Fx&mode=observe&cols=80&rows=24");
});

test("terminal panel: open/reconnect/close wiring (Alpine only, esc() everywhere)", () => {
	// 终端 button on herdr-hosted peers (Lucide square-terminal); 进入 stays alongside
	expect(html).toContain('data-lucide="square-terminal"');
	expect(html).toContain('aria-label="终端"'); // row action is icon-only (label in tooltip/aria)
	expect(html).toContain('@click.stop="openTerminal(p)"');
	expect(html).toContain('@click="enterHerdr(p)"');
	// TerminalPanel tab (no modal drawer): panel region + fullscreen overlay reuses .drawer
	expect(html).toContain('aria-label="终端面板"');
	expect(html).toContain('class="term-panel"');
	expect(html).toContain("term-full"); // ⛶ 全屏浮层挂 .drawer 类于同一元素
	expect(html).toContain('@click="toggleTermFull()"');
	expect(html).toContain('x-ref="termHost"');
	expect(html).toContain('class="term-host"');
	// tab label 终端 lives in DetailTabs (概览/历史/Review/终端/文件)
	expect(html).toContain('@click="setTab(\'terminal\')"');
	// toolbar: herdr target chip + 控制/观察 seg + 重连/⛶/✕ right on one 36px row
	// (duplicated title dropped — it lives in the detail head)
	expect(html).not.toContain("term-title");
	expect(html).toContain('x-html="esc(term.target)"');
	expect(html).toContain("term-toolbar-right");
	expect(html).not.toContain("chip-term-control");
	expect(html).not.toContain("chip-term-observe");
	expect(html).toContain('@click="setTermMode(\'control\')"');
	expect(html).toContain('@click="setTermMode(\'observe\')"');
	// 鼠标 toggle: stale-zone forwarding vs local selection/scrolling
	expect(html).toContain('@click="setTermMouse(');
	expect(html).toContain("鼠标·自动");
	expect(html).toContain("鼠标·本地");
	expect(js).toContain("setTermMouse");
	expect(html).toContain('@click="termReconnect()"');
	expect(html).toContain('@click="closeTerminal()"');
	expect(html).toContain("@keydown.escape.window");
	// lifecycle: connect on open, dispose on close, one auto-reconnect, toast errors
	expect(js).toContain("new WebSocket(terminalWsUrl(");
	expect(js).toContain("termSendInput");
	expect(js).toContain("scheduleTermResize");
	expect(js).toContain('msg.type === "terminal.closed"');
	expect(js).toContain("连接已断开");
	expect(js).toContain("this._termRetried = true");
	expect(js).toContain("this._wterm.destroy()");
	expect(js).toContain("this._termCore.dispose()");
	// observe mode is a read-only viewer: input never reaches the bridge
	expect(js).toContain('if (this.term.mode === "observe") return;');
	expect(js).toContain("mode === \"observe\" ? \"observe\" : \"control\"");
	// escape unwinds the terminal first (⛶ fullscreen one level, then the panel)
	expect(js).toMatch(/onEscape\(\) \{\s*if \(this\.term\.open\) \{[\s\S]{0,120}if \(this\.term\.fullscreen\) this\.term\.fullscreen = false;/);
	// …then transient popups, then the 900–1179px detail overlay, then search
	expect(js).toContain('this.mobileView === "detail"');
	expect(js).toMatch(/onEscape\(\)[\s\S]{0,600}else if \(this\.mobileView === "detail"\) this\.mobileView = "list";/);
});

test("terminal mount contract: tab switch + laid-out host + bounded loads (B1)", () => {
	// openTerminal must land on the terminal tab before mounting: a hidden mount
	// measures 0×0 and WTerm falls back to an 80×24 grid (the blank-terminal bug)
	expect(js).toMatch(/openTerminal\(p\) \{[\s\S]{0,700}if \(this\.detailTab !== "terminal"\) \{\s*this\.detailTab = "terminal";/);
	// startTerminal waits for real host bounds before constructing WTerm
	expect(js).toContain("termHostReady");
	expect(js).toMatch(/startTerminal\(\) \{[\s\S]{0,400}await this\.termHostReady\(gen\)/);
	// module + wasm loads are bounded: a stalled fetch surfaces as 终端出错
	expect(js).toContain("function withTimeout(");
	expect(js).toMatch(/withTimeout\(this\.loadTermModules\(\), 10000/);
	expect(js).toMatch(/withTimeout\(\s*mods\.GhosttyCore\.load/);
	// rAF painting stalls while hidden: a backgrounded attach repaints on return
	expect(js).toContain('document.addEventListener("visibilitychange", this._termVisibilityHandler)');
	expect(js).toMatch(/_termVisibilityHandler = \(\) =>[\s\S]{0,240}if \(document\.visibilityState !== "visible"/);
	expect(js).toMatch(/if \(document\.visibilityState !== "visible"[\s\S]{0,160}w\.fit\(\)/);
	expect(js).toContain('document.removeEventListener("visibilitychange", this._termVisibilityHandler)');
});

test("terminal theme: colors from CSS custom properties + refresh on toggle", () => {
	const f = termFns;
	// cssColorToRgb understands the token forms used in app.css palettes
	expect(f.cssColorToRgb("#fff")).toBe(0xffffff);
	expect(f.cssColorToRgb("#0369a1")).toBe(0x0369a1);
	expect(f.cssColorToRgb("rgb(2, 132, 199)")).toBe(0x0284c7);
	expect(f.cssColorToRgb("rgba(2, 132, 199, 0.09)")).toBe(0x0284c7);
	expect(f.cssColorToRgb("garbage")).toBeNull();
	expect(f.cssColorToRgb("")).toBeNull();
	// background=--panel, foreground=--text, cursor=--accent; 16 palette entries
	const theme = f.buildTerminalTheme({ panel: "#ffffff", text: "#27272a", muted: "#71717a", accent: "#0369a1" });
	expect(theme.background).toBe(0xffffff);
	expect(theme.foreground).toBe(0x27272a);
	expect(theme.cursor).toBe(0x0369a1);
	expect(theme.palette.length).toBe(16);
	for (const entry of theme.palette) expect(typeof entry).toBe("number");
	// app.js reads the tokens off the root element and feeds WTerm.setThemeColors()
	expect(js).toContain("getComputedStyle");
	for (const token of ['"--panel"', '"--text"', '"--muted"', '"--accent"']) expect(js).toContain(token);
	expect(js).toContain("termThemeColors");
	expect(js).toContain("setThemeColors");
	// theme toggle refreshes the live terminal palette
	expect(js).toMatch(/toggleTheme\(\) \{[\s\S]{0,400}this\.refreshTermTheme\(\);/);
	// terminal surface styles stay on the theme tokens (no hard-coded colors)
	expect(css).toContain(".term-host");
	expect(css).toContain("--term-fg: var(--text)");
	expect(css).toContain("--term-bg: var(--panel)");
	expect(css).toContain("--term-cursor: var(--accent)");
	expect(css).toContain(".term-body");
	expect(css).toContain(".term-status");
});

/* ---------------- mouse encoders + scroll/release envelopes (herdr wire) ---------------- */
const u8 = (...n: number[]) => n;

test("mouse encoders: exact wire bytes per core encoding (press/release/move/wheel)", () => {
	const f = termFns;
	const enc = (r: any) => Array.from(f.encodeMouseReport(r) ?? []);
	// SGR (1006) — ASCII CSI < code;x;y M/m
	expect(enc({ encoding: "sgr", kind: "press", button: 0, x: 5, y: 3 })).toEqual(u8(27, 91, 60, 48, 59, 53, 59, 51, 77));
	expect(enc({ encoding: "sgr", kind: "release", button: 0, x: 5, y: 3 })).toEqual(u8(27, 91, 60, 48, 59, 53, 59, 51, 109));
	expect(enc({ encoding: "sgr", kind: "press", button: 1, x: 1, y: 1, shift: true })).toEqual(u8(27, 91, 60, 53, 59, 49, 59, 49, 77));
	expect(enc({ encoding: "sgr", kind: "release", button: 1, x: 5, y: 3 })).toEqual(u8(27, 91, 60, 49, 59, 53, 59, 51, 109));
	// drag (buttons bit0) vs hover motion (no buttons -> code 35)
	expect(enc({ encoding: "sgr", kind: "move", buttons: 1, x: 10, y: 20 })).toEqual(u8(27, 91, 60, 51, 50, 59, 49, 48, 59, 50, 48, 77));
	expect(enc({ encoding: "sgr", kind: "move", buttons: 2, x: 10, y: 20 })).toEqual(u8(27, 91, 60, 51, 52, 59, 49, 48, 59, 50, 48, 77));
	expect(enc({ encoding: "sgr", kind: "move", buttons: 0, x: 10, y: 20 })).toEqual(u8(27, 91, 60, 51, 53, 59, 49, 48, 59, 50, 48, 77));
	// wheel up / down / left / right at x=4,y=7
	expect(enc({ encoding: "sgr", kind: "wheel", deltaY: -3, x: 4, y: 7 })).toEqual(u8(27, 91, 60, 54, 52, 59, 52, 59, 55, 77));
	expect(enc({ encoding: "sgr", kind: "wheel", deltaY: 3, x: 4, y: 7 })).toEqual(u8(27, 91, 60, 54, 53, 59, 52, 59, 55, 77));
	expect(enc({ encoding: "sgr", kind: "wheel", deltaX: -3, x: 4, y: 7 })).toEqual(u8(27, 91, 60, 54, 54, 59, 52, 59, 55, 77));
	expect(enc({ encoding: "sgr", kind: "wheel", deltaX: 3, x: 4, y: 7 })).toEqual(u8(27, 91, 60, 54, 55, 59, 52, 59, 55, 77));
	// SGR pixel (1016): same wire as SGR, pixel coordinates pass through
	expect(enc({ encoding: "sgr-pixels", kind: "press", button: 2, x: 123, y: 45 })).toEqual(u8(27, 91, 60, 50, 59, 49, 50, 51, 59, 52, 53, 77));
	// urxvt (1015): CSI code+32;x;yM — release reuses button code 3
	expect(enc({ encoding: "urxvt", kind: "release", button: 0, x: 5, y: 3 })).toEqual(u8(27, 91, 51, 53, 59, 53, 59, 51, 77));
	expect(enc({ encoding: "urxvt", kind: "wheel", deltaY: 3, x: 2, y: 9 })).toEqual(u8(27, 91, 57, 55, 59, 50, 59, 57, 77));
	// X10 legacy: raw 6 bytes ESC [ M cb cx cy (send via terminalInputBytesLine)
	expect(enc({ encoding: "x10", kind: "press", button: 0, x: 5, y: 3 })).toEqual(u8(27, 91, 77, 32, 37, 35));
	expect(enc({ encoding: "x10", kind: "release", button: 0, x: 5, y: 3 })).toEqual(u8(27, 91, 77, 35, 37, 35));
	expect(enc({ encoding: "x10", kind: "move", buttons: 0, x: 10, y: 20 })).toEqual(u8(27, 91, 77, 67, 42, 52));
	expect(enc({ encoding: "x10", kind: "wheel", deltaY: -3, x: 4, y: 7 })).toEqual(u8(27, 91, 77, 96, 36, 39));
	expect(enc({ encoding: "x10", kind: "press", button: 0, x: 1, y: 1, ctrl: true })).toEqual(u8(27, 91, 77, 48, 33, 33));
	// UTF-8 extended (1005): coordinate code points are UTF-8 on the wire
	expect(enc({ encoding: "utf8", kind: "press", button: 0, x: 1000, y: 300 })).toEqual(u8(27, 91, 77, 32, 0xd0, 0x88, 0xc5, 0x8c));
});

test("mouse encoders: range caps, modifiers and degenerate events return null", () => {
	const f = termFns;
	// X10 caps coordinates at 223 (6-bit + 32 offset)
	expect(f.encodeMouseReport({ encoding: "x10", kind: "press", button: 0, x: 223, y: 223 })).toBeTruthy();
	expect(f.encodeMouseReport({ encoding: "x10", kind: "press", button: 0, x: 224, y: 5 })).toBeNull();
	// UTF-8 (1005) caps coordinates at 2015 (3-byte sequences)
	expect(f.encodeMouseReport({ encoding: "utf8", kind: "press", button: 0, x: 2015, y: 5 })).toBeTruthy();
	expect(f.encodeMouseReport({ encoding: "utf8", kind: "press", button: 0, x: 2016, y: 5 })).toBeNull();
	// unknown encoding / unknown kind / zero wheel delta cannot be encoded
	expect(f.encodeMouseReport({ encoding: "nope", kind: "press", button: 0, x: 1, y: 1 })).toBeNull();
	expect(f.encodeMouseReport({ encoding: "sgr", kind: "explode", button: 0, x: 1, y: 1 })).toBeNull();
	expect(f.encodeMouseReport({ encoding: "sgr", kind: "wheel", deltaX: 0, deltaY: 0, x: 1, y: 1 })).toBeNull();
});

test("scroll/release envelopes match the probed herdr wire shapes", () => {
	const f = termFns;
	// probed: {"type":"terminal.scroll","direction":"up"|"down","lines":<u16>}
	expect(f.terminalScrollLine("up", 5)).toBe('{"type":"terminal.scroll","direction":"up","lines":5}');
	expect(f.terminalScrollLine("down", 1)).toBe('{"type":"terminal.scroll","direction":"down","lines":1}');
	expect(JSON.parse(f.terminalScrollLine("up", 5))).toEqual({ type: "terminal.scroll", direction: "up", lines: 5 });
	// lines is u16: clamp into 0..65535, direction coerces to up/down
	expect(f.terminalScrollLine("up", 99999)).toBe('{"type":"terminal.scroll","direction":"up","lines":65535}');
	expect(f.terminalScrollLine("up", -2)).toBe('{"type":"terminal.scroll","direction":"up","lines":0}');
	expect(f.terminalScrollLine("sideways", 3)).toBe('{"type":"terminal.scroll","direction":"down","lines":3}');
	// probed: {"type":"terminal.release"} — no fields, detaches the controller
	expect(f.terminalReleaseLine()).toBe('{"type":"terminal.release"}');
	// binary terminal.input frames carry raw bytes (X10 mouse reports)
	expect(f.bytesToBase64(new Uint8Array([0x1b, 0x5b, 0x4d]))).toBe("G1tN");
	expect(f.bytesToBase64(new Uint8Array([1, 2, 3]))).toBe("AQID");
	expect(f.terminalInputBytesLine(new Uint8Array([1, 2, 3]))).toBe('{"type":"terminal.input","bytes":"AQID"}');
	// byte-exact for bytes >= 128: latin1 btoa, never a UTF-8 encoder (landmine 1)
	expect(f.bytesToBase64(new Uint8Array([0x1b, 0x5b, 0x4d, 0x9b, 0xff]))).toBe("G1tNm/8=");
	expect(f.bytesToBase64(new Uint8Array([0x80, 0x84, 0x7f]))).toBe("gIR/");
	// the UTF-8 path would corrupt the same bytes (G1tNwpvDvw==) — mouse dies
	expect(f.bytesToBase64(new Uint8Array([0x9b]))).not.toBe(f.utf8ToBase64(String.fromCharCode(0x9b)));
	expect(Array.from(f.base64ToBytes(f.bytesToBase64(new Uint8Array([0x1b, 0x5b, 0x4d, 0x9b, 0xff]))))).toEqual([0x1b, 0x5b, 0x4d, 0x9b, 0xff]);
	// X10 press at x=100,y=100 (coord bytes > 127) survives the envelope byte-for-byte
	const x10 = f.encodeMouseReport({ encoding: "x10", kind: "press", button: 0, x: 100, y: 100 });
	expect(Array.from(x10 ?? [])).toEqual([0x1b, 0x5b, 0x4d, 0x20, 0x84, 0x84]);
	expect(JSON.parse(f.terminalInputBytesLine(x10!)).bytes).toBe("G1tNIISE");
	// binary input + resize + scroll + release are exactly the bridge whitelist
	for (const line of [
		f.terminalInputBytesLine(new Uint8Array([27])),
		f.terminalResizeLine(80, 24),
		f.terminalScrollLine("up", 1),
		f.terminalReleaseLine(),
	]) {
		expect(["terminal.input", "terminal.resize", "terminal.scroll", "terminal.release"]).toContain(JSON.parse(line).type);
	}
});

test("terminal wiring: mouse binary bridge + stale-zone forwarding + scoped wheel fallback", () => {
	// the option gap: X10 mouse reports arrive as raw bytes via WTerm.onBinary
	expect(js).toContain("onBinary:");
	expect(js).toContain("termSendBytes");
	// pure encoders are wired through the DOM mouse fallback for the stale zone
	// (mid-stream attach: the core never parsed the app's DECSETs)
	expect(js).toContain("encodeMouseReport");
	expect(js).toContain("attachTermMouseFallback");
	expect(js).toContain("mouseTracking");
	expect(js).toContain("termModeActivity");
	// wheel routing is owned by _termWheelHandler (termWheelAction policy);
	// PageUp/PageDown injection is scoped to the "page" action (fullscreen app
	// without mouse capture) — never a blanket wheel hack; "scroll" goes to the
	// herdr pane history via terminal.scroll
	expect(js).toContain("_termWheelHandler");
	expect(js).toContain("termWheelAction");
	expect(js).toContain("termClickAction");
	expect(js).toContain("this.termScroll(");
	expect(js).toContain("terminalScrollLine(direction");
	expect(js).toContain("\\x1b[5~");
	expect(js).toContain("\\x1b[6~");
	// keyboard scrolling: Shift+PageUp/PageDown pages, Shift+Up/Down moves lines
	expect(js).toContain("termScrollBy");
	expect(js).toContain('e.key === "PageUp"');
	expect(js).toContain('e.key === "PageDown"');
	expect(js).toContain("ArrowUp");
	expect(js).toContain("shiftKey");
	// scroll/release envelope builders live next to the other terminal envelopes
	expect(js).toContain("function terminalScrollLine(");
	expect(js).toContain("function terminalReleaseLine(");
});

test("stale-zone detection: mode activity on the byte stream marks the core state trustworthy", () => {
	const f = termFns;
	const act = (s: string) => f.termModeActivity(new TextEncoder().encode(s));
	// live DECSET/DECRST (incl. multi-mode forms) end the stale zone
	expect(act("\x1b[?1000h")).toBe(true);
	expect(act("\x1b[?1000;1002;1003;1006h")).toBe(true);
	expect(act("\x1b[?1006l")).toBe(true);
	expect(act("\x1b[?1049h")).toBe(true);
	// the attach replay is a bare screen paint (verified against herdr 0.9.1):
	// no mode sequences, so the core's state stays unknown
	expect(act("\x1b[?2026h\x1b[?25l\x1b[2J\x1b[1;1Hhello\x1b[?25h")).toBe(false);
	expect(act("plain output\n")).toBe(false);
	// unrelated private modes are not mouse/alt-screen activity
	expect(act("\x1b[?25l\x1b[?2004h\x1b[?7l")).toBe(false);
	// scans raw bytes, including payloads with bytes >= 128 around the marker
	expect(f.termModeActivity(new Uint8Array([0x9b, 0x80, 0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x30, 0x30, 0x68]))).toBe(true);
	// regression guard: escape-looking TEXT painted on screen (code diffs,
	// terminal docs) is cell content — only the frame's state prologue counts
	expect(act("\x1b[?2026h\x1b[?25l\x1b[1;1Hnotes about \x1b[?1049h alt screen\x1b[0m\x1b[?25h")).toBe(false);
	expect(act("\x1b[1;1H\x1b[?1000h\x1b[?1006h shown as text")).toBe(false);
	expect(act("\x1b[2J\x1b[1;1H\x1b[38;2;254;84;98m\x1b[?1006l\x1b[0m")).toBe(false);
	// a real state prologue still counts, even when a paint follows it
	expect(act("\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h\x1b[2J\x1b[1;1Hcells")).toBe(true);
});

test("click policy: stale zone forwards SGR reports, live state defers to wterm or selection", () => {
	const f = termFns;
	const click = (o: any) => f.termClickAction(o);
	// core state says the app captures the mouse: WTerm's InputHandler owns it
	expect(click({ tracking: 1003, modesSeen: true })).toBe("wterm");
	expect(click({ tracking: 1000, modesSeen: true })).toBe("wterm");
	// stale zone (no mode activity since attach): forward as SGR — pi captures.
	// Untrusted core tracking (painted DECSET text poisons it) stays stale-zone.
	expect(click({ tracking: 0, modesSeen: false })).toBe("report");
	expect(click({ tracking: 1003, modesSeen: false })).toBe("report");
	expect(click({ tracking: 1000, modesSeen: false })).toBe("report");
	// the app's own DECSET/DECRST said "off": native selection
	expect(click({ tracking: 0, modesSeen: true })).toBe("select");
	// 鼠标·本地 never forwards; shift always keeps the event for selection
	expect(click({ tracking: 0, modesSeen: false, mouse: "local" })).toBe("select");
	expect(click({ tracking: 1003, modesSeen: true, shift: true })).toBe("select");
	expect(click({ tracking: 0, modesSeen: false, shift: true })).toBe("select");
});

test("wheel policy: pane history first for local mode/shift, reports for the app by default", () => {
	const f = termFns;
	const wheel = (o: any) => f.termWheelAction(o);
	const base = { tracking: 0, modesSeen: false, mouse: "auto", altScreen: false, deltaY: -1, canScrollLocal: true };
	// trusted mode activity: mouse-capturing apps get reports from WTerm's handler
	expect(wheel({ ...base, tracking: 1003, modesSeen: true, canScrollLocal: true })).toBe("wterm");
	// a local DOM scrollback wins whenever it can still move (raw-byte transports)
	expect(wheel(base)).toBe("native");
	// no local history (herdr rendered frames): SGR reports so pi's viewport moves
	expect(wheel({ ...base, canScrollLocal: false })).toBe("report");
	// untrusted core tracking (painted DECSET text) never hijacks the wheel
	expect(wheel({ ...base, tracking: 1003, canScrollLocal: false })).toBe("report");
	expect(wheel({ ...base, tracking: 1003, canScrollLocal: true })).toBe("native");
	// shift+wheel and 鼠标·本地 scroll the herdr pane history (terminal.scroll)
	expect(wheel({ ...base, shift: true, tracking: 1003, canScrollLocal: false })).toBe("scroll");
	expect(wheel({ ...base, mouse: "local", canScrollLocal: true })).toBe("native");
	expect(wheel({ ...base, mouse: "local", canScrollLocal: false })).toBe("scroll");
	// if live mode state ever proves the app is idle: page keys only for fullscreen
	expect(wheel({ ...base, modesSeen: true, canScrollLocal: false, altScreen: true })).toBe("page");
	expect(wheel({ ...base, modesSeen: true, canScrollLocal: false, altScreen: false })).toBe("scroll");
});

/* ---------------- Session Workbench: tabs / CommandBar / keyboard / persistence ---------------- */

test("detail views: 会话 / 变更 / 终端 + legacy tab migration + lazy loading", () => {
	for (const label of ["会话", "变更", "终端"]) expect(html).toContain(label);
	expect((html.match(/class="detail-tab"/g) || []).length).toBe(3);
	expect(html).toContain("detail-tabs");
	expect(html).toContain('@click="setTab(\'session\')"');
	expect(html).toContain('@click="setTab(\'changes\')"');
	expect(html).toContain('@click="setTab(\'terminal\')"');
	expect(js).toContain("normalizeDetailTab");
	expect(js).toContain('if (value === "overview" || value === "history" || value === "session") return "session"');
	expect(js).toContain('if (value === "review" || value === "files" || value === "changes") return "changes"');
	// lazy content: loadTab dispatches per tab; focus moves to the panel title, never the terminal
	expect(js).toContain("setTab(tab)");
	expect(js).toContain("loadTab()");
	expect(js).toContain('this.detailTab === "session"');
	expect(js).toContain('this.detailTab === "changes"');
	expect(js).toContain("detailTitle");
	// Session inspector: metadata / recovery / file activity stay collapsed by default
	expect(html).toContain("恢复记录");
	expect(html).toContain("未关联 Git");
	expect(html).toContain('<details class="session-inspector">');
	// File activity is a lightweight route into Changes; tree rows focus the exact diff
	expect(js).toContain("fileTreeRows");
	expect(js).toContain("toggleFileTree");
	expect(js).toContain("openReviewFile");
	expect(html).toContain('@click="toggleFileTree(r.path)"');
	expect(html).toContain('@click="openReviewFile(r.path)"');
	expect(html).toContain("尚无文件改动");
});

test("file activity tree: directories collapse, file rows focus the Review diff", () => {
	// the activity path is resolved against canonical identity/source aliases before rendering
	expect(js).toContain("reviewFocus");
	expect(js).toContain("this.reviewFocus || this.reviewSelectedFile");
	expect(js).toContain("let host = this.$refs.reviewHost");
	expect(js).toContain("if (!host) {");
	expect(js).toContain("focusPath: focusPath || undefined");
	expect(reviewJs).toContain("fileKeyOf(file)");
	expect(reviewJs).toContain("file.sourcePaths");
	expect(reviewJs).toContain("options.focusPath");
	expect(reviewJs).toContain("data-path\", fileKey");
	// tree rows: dir rows carry depth indentation + aria-expanded state
	expect(html).toContain(":aria-expanded=");
	expect(js).toContain("fileTreeCollapsed");
	// repeated edits to one file collapse to a single row (unique x-for keys)
	expect(js).toContain("if (seen.has(path)) continue;");
});

test("CommandBar (⌘K): fuzzy commands + recent sessions groups", () => {
	expect(html).toContain('@click="openCommand()"');
	expect(html).toContain('aria-label="命令面板"');
	expect(js).toContain("openCommand");
	expect(js).toContain("closeCommand");
	expect(js).toContain("runCommand");
	expect(js).toContain("cmdItems");
	expect(js).toContain("fuzzyHit");
	// command set: 聚焦会话 / 发消息 / 打开终端 / Review / 历史 / 恢复 / 进入 herdr / 切换主题 / 过滤状态 / 暂停实时
	for (const label of ["聚焦会话", "发消息", "打开终端", "查看 Review", "恢复会话", "进入 herdr", "切换主题", "过滤状态", "暂停实时"]) {
		expect(js).toContain(label);
	}
	expect(js).toContain("最近会话");
	// ⌘K / Ctrl+K global shortcut
	expect(js).toContain('e.key === "k"');
	// arrow + enter navigation inside the palette
	expect(js).toContain("onCmdKey");
});

test("keyboard model: onListKey ↑↓ wrap · Enter · 1–4 · / · t/r/h/m/f/e", () => {
	expect(html).toContain('@keydown.window="onListKey($event)"');
	expect(js).toContain("onListKey");
	expect(js).toContain('key === "ArrowDown"');
	expect(js).toContain('key === "ArrowUp"');
	// wrap-around selection (环绕)
	expect(js).toContain("% rows.length");
	expect(js).toContain('key === "Enter"');
	expect(js).toContain('key === "/"');
	expect(js).toContain("focusSearch");
	expect(js).toContain("focusComposer");
	// roving tabindex on rows
	expect(html).toContain(":tabindex=");
});

test("selection persistence: localStorage + URL hash #p=<sid>&tab=<t>", () => {
	expect(js).toContain("persistSelection");
	expect(js).toContain("restoreSelection");
	expect(js).toContain('localStorage.setItem("pi-mesh.selected"');
	expect(js).toContain('localStorage.getItem("pi-mesh.selected")');
	expect(js).toContain("#p=");
	expect(js).toContain("&tab=");
	// SSE 刷新不动选择；peer 消失→最近行 + toast
	expect(js).toContain("syncSelected");
	expect(js).toContain("该会话已不存在");
});

test("mobile layer: bottom tab bar 会话/发现/设置 + push-in detail + SkeletonRows", () => {
	// bottom tab bar (49px + safe-area)
	expect(html).toContain('class="mobile-bar');
	expect(html).toContain("<span>会话</span>");
	expect(html).toContain("<span>发现</span>");
	expect(html).toContain("<span>设置</span>");
	expect(js).toContain("mobileTab");
	expect(js).toContain("mobileView");
	expect(js).not.toContain("railOpen");
	// drill-in detail keeps the .drawer surface + ‹ 返回
	expect(html).toContain("mobile-push");
	expect(html).toContain('aria-label="返回"');
	expect(html).toContain('@click="mobileView = \'list\'"');
	// 发现 surfaces (跨会话文件时间线 / 关注图) + repo chips (600–899px)
	expect(js).toContain("activityFeed");
	expect(js).toContain("followEdges");
	expect(html).toContain("repo-chips");
	// SkeletonRows: 5×PeerRow geometry blocks (static placeholders, no shimmer)
	expect(html).toContain("skeleton-rows");
	expect(html).toContain("skeleton-row");
	expect(js).toContain("booting");
	expect(css).toContain(".skeleton");
	expect(css).not.toContain("skeleton-shimmer");
});

test("polish layer: native motion discipline + no emoji icons (Lucide only)", () => {
	// decorative motion is gone: no scale/translate/bounce/pulse/shimmer/slide anywhere
	expect(css).not.toContain("scale(");
	expect(css).not.toContain("skeleton-shimmer");
	expect(css).not.toContain("state-pulse");
	expect(css).not.toMatch(/@keyframes toast-in|animation: toast-in/);
	expect(css).not.toContain("sel-bar");
	expect(css).not.toContain("conn-pulse");
	expect(css).not.toMatch(/:active\s*{[^}]*transform/);
	expect(css).not.toMatch(/@keyframes[^{]*{[^}]*transform/);
	expect(css).not.toContain("cubic-bezier");
	// what remains: 100ms background/opacity hover feedback + panel fade + focus rings
	expect(css).toContain("@keyframes menu-in");
	expect(css).toContain("@keyframes cmdk-in");
	expect(css).toMatch(/@keyframes menu-in\s*{[^}]*opacity/);
	expect(css).toContain(":focus-visible");
	expect(css).toContain("outline: 2px solid var(--accent)");
	// no emoji used as icons in rendered markup (Lucide data-lucide icons only)
	const rendered = html.replace(/<!--[\s\S]*?-->/g, "");
	for (const emoji of ["🖥", "↻", "⎇", "●", "◌", "☾", "🔍", "≡", "⛶", "‹", "⋯"]) {
		// ⋯ survives only inside the pinned history label text (⋯ 工具调用 ×N)
		if (emoji === "⋯") {
			const stripped = rendered.split("⋯ 工具调用 ×").join("");
			expect(stripped).not.toContain("⋯");
			continue;
		}
		expect(rendered).not.toContain(emoji);
	}
	// icon discipline: 14/16px sizing + optical offset
	expect(css).toContain("[data-lucide]");
});

/* ---------------- rework loop 1: verification-gap fixes ---------------- */

test("motion system: opacity-only fades, no x-transition fights (cmdk centering is static)", () => {
	// cmdk centers via a STATIC translateX(-50%); its keyframes fade opacity only
	expect(css).toContain("transform: translateX(-50%)");
	expect(css).toContain("animation: cmdk-in");
	expect(css).toMatch(/@keyframes cmdk-in\s*{[^}]*opacity/);
	expect(css).not.toMatch(/@keyframes cmdk-in[^{]*{[^}]*scale/);
	// no Alpine transition on the elements animated by CSS keyframes
	expect(html).not.toMatch(/class="cmdk[^>]*x-transition/);
	expect(html).not.toMatch(/class="confirm-popover[^>]*x-transition/);
	// .menu / .confirm-popover likewise fade via CSS only
	expect(css).toContain("@keyframes menu-in");
	expect(css).not.toMatch(/@keyframes menu-in[^{]*{[^}]*scale/);
});

test("breakpoints: 900-1179 list full width + overlay detail, <=600 mobile fit", () => {
	// B2: intermediate layout has no icon rail — the list takes the full width and
	// the detail becomes a right overlay (scrim covers the whole viewport)
	expect(css).toContain("@media (min-width: 900px) and (max-width: 1179px)");
	expect(css).toMatch(/@media \(min-width: 900px\) and \(max-width: 1179px\)\s*{[\s\S]{0,160}\.workbench\s*{\s*grid-template-columns: minmax\(0, 1fr\)/);
	expect(css).not.toContain("48px minmax(0, 1fr)");
	expect(css).toContain("min(560px, 92vw)"); // spec's detail overlay width
	expect(css).toContain(".detail-scrim");
	expect(css).toMatch(/\.detail-scrim\s*{[^}]*inset: 44px 0 0 0/);
	// B3: mobile topbar compaction + rows fit 390px
	expect(css).toContain("@media (max-width: 599px)");
	expect(html).toContain('class="conn-text"');
	expect(css).toContain(".row-act span");
	// touch rows are width-driven, not just hover:none
	expect(css).toMatch(/@media \(max-width: 599px\)\s*{[\s\S]*?\.peer-row\s*{\s*height: 48px/);
	// Compact detail headers hide redundant id/viewer chips so the session title remains readable.
	expect(css).toMatch(/@media \(max-width: 899px\)\s*{[\s\S]*?\.detail-id > \.linkish\.t-caption,\s*\.detail-id > \.chip-viewer\s*{\s*display: none/);
});

test("review pane: constant DetailPane width + roomy tree/diff split", () => {
	// the review-wide width-shifting hack is gone: DetailPane never changes width per tab
	expect(html).not.toContain("review-wide");
	expect(css).not.toContain("review-wide");
	expect(css).toContain(
		"grid-template-columns: minmax(360px, var(--pane-list-w, 480px)) 1px minmax(0, 1fr)",
	);
	// review split: tree clamp(180–240px) + diff takes the rest (≥360 at 600px detail)
	expect(css).toContain(".detail-pane .pm-review .pm-tree");
	expect(css).toContain("flex: 0 0 clamp(180px, 30%, 240px)");
	expect(css).toMatch(/\.detail-pane \.pm-review\s*{[^}]*padding: 8px/);
	// diff lines never wrap per character: white-space:pre + horizontal scroll
	expect(css).toContain(".detail-pane .pm-review .pm-diff [data-line]");
	expect(css).toMatch(/\.detail-pane \.pm-review \.pm-diff \[data-line\]\s*{[^}]*white-space: pre/);
	// review stat chips → quiet muted text; M/A marks letter-only; twin empties deduped
	expect(css).toContain(".pm-review-stats .pm-chip");
	expect(css).toContain(".pm-chip-label");
	expect(css).toContain(":has(.pm-tree .pm-empty)");
});

test("empty + status-color rules: 无匹配结果 CTA and no error fill on panels", () => {
	// S3: no-match EmptyState with a clear-filter CTA
	expect(html).toContain("无匹配结果");
	expect(html).toContain("清空过滤");
	expect(js).toContain("clearFilters");
	// restrained empty-state padding (loop-1 nit: 160px vertical whitespace)
	expect(css).toMatch(/\.empty\s*{[^}]*padding: 2rem 1rem/);
	// S4: .entry-error is an indicator (border), never a status-colour panel fill
	expect(css).toMatch(/\.entry-error\s*{[^}]*background: transparent/);
	expect(css).not.toMatch(/\.entry-error\s*{[^}]*var\(--danger-soft\)/);
});

test("withTimeout: bounded loads pass through and surface stalls as errors", async () => {
	const src = extractFn("withTimeout");
	const withTimeout = new Function(`${src}\nreturn withTimeout;`)() as <T>(p: Promise<T>, ms: number, label?: string) => Promise<T>;
	await expect(withTimeout(Promise.resolve(42), 50, "ok")).resolves.toBe(42);
	await expect(withTimeout(Promise.reject(new Error("boom")), 50, "ok")).rejects.toThrow("boom");
	await expect(withTimeout(new Promise(() => {}), 20, "终端内核加载")).rejects.toThrow("终端内核加载 超时");
});

test("nits: contrast >= 4.5 on meta (page + selected row), focus offset 2px", () => {
	const light = (css.match(/:root,\s*\[data-theme="light"\]\s*{([^}]*)}/s) || [])[1] || "";
	const dark = (css.match(/\[data-theme="dark"\]\s*{([^}]*)}/s) || [])[1] || "";
	const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const lum = (rgb: number[]) =>
		rgb
			.map((v) => {
				const c = v / 255;
				return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			})
			.reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
	const ratio = (a: number[], b: number[]) => {
		const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
		return (hi! + 0.05) / (lo! + 0.05);
	};
	const token = (block: string, name: string) =>
		(block.match(new RegExp(name + ":\\s*(#[0-9a-fA-F]{6})")) || [])[1] || "";
	for (const block of [light, dark]) {
		const fg = hex(token(block, "--faint"));
		const bg = hex(token(block, "--bg"));
		const selBg = hex(token(block, "--sel-soft"));
		expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
		expect(ratio(fg, selBg)).toBeGreaterThanOrEqual(4.5);
	}
	// focus ring offset is 2px everywhere (spec)
	expect(css).toContain("outline-offset: 2px");
	expect(css).not.toContain("outline-offset: 1px");
	// banner is in-flow so it cannot overlap the brand
	expect(css).not.toMatch(/\.banner-offline\s*{[^}]*position: fixed/);
});

test("repo names: duplicate basenames get a parent segment, unique ones stay short", () => {
	const src = extractFn("disambiguateNames");
	const f = new Function(`${src}\nreturn disambiguateNames;`)() as (groups: any[]) => any[];
	const out = f([
		{ name: "1", key: "/tmp/20261031/1" },
		{ name: "1", key: "/tmp/20261030/1" },
		{ name: "agentdock", key: "/Users/x/Dev/AI/agentdock" },
	]);
	expect(out.map((g) => g.name)).toEqual(["20261031/1", "20261030/1", "agentdock"]);
});

test("merged list: mobile repo chips stay a scrollable block-level flex strip", () => {
	// inline-flex sizes the strip to max-content (~1198px) and .session-list's
	// overflow clips it: the scoped override is the fix, not a style detail.
	expect(css).toMatch(/@media \(max-width: 899px\)\s*{[\s\S]*?\.repo-chips\.mobile-only\s*{\s*display: flex/);
	expect(css).toMatch(/\.repo-chips\s*{[^}]*overflow-x: auto/);
	// The strip scrolls; chips must not shrink/wrap into clipped lines on 390px.
	expect(css).toMatch(/\.filter-chip\s*{[^}]*flex: 0 0 auto/);
	expect(css).toMatch(/\.filter-chip\s*{[^}]*white-space: nowrap/);
	const branchStart = html.indexOf('class="branch-head"');
	const branch = html.slice(branchStart, html.indexOf("</header>", branchStart));
	expect(branch).toContain('<span class="section-dot"');
});

/* ---------------- UI polish round: composer / dedup / grouping / ephemeral ---------------- */

test("composer: one unified rounded field with inline mode + send icon button", () => {
	// a single composed field — not assembled from three floating parts
	expect(html).toContain("composer-field");
	expect(html).toContain("composer-send");
	expect(html).toContain('x-ref="composerInput"');
	// mode switch is a small inline control INSIDE the field
	expect(html).toContain('@click="setMode(selectedId, \'steer\')"');
	expect(html).toContain('@click="setMode(selectedId, \'followUp\')"');
	// send icon-button on the field's right edge: accent, disabled until non-empty
	expect(html).toContain(":disabled=\"!(cstate(selectedId).text || '').trim() || cstate(selectedId).sending || !canSendMessage(selectedId)\"");
	expect(html).toContain('aria-label="发送"');
	expect(css).toContain(".composer-send");
	expect(css).toContain("background: var(--accent)");
	// the long hint line is removed from the UI; semantics live in placeholder/tooltip
	expect(html).not.toContain("composer-hint");
	expect(html).not.toContain("composer-row");
	expect(html).toContain("Enter 发送 · Shift+Enter 换行"); // tooltip only
	expect(js).toContain("onComposerKey"); // Enter 发送 / Shift+Enter 换行 behaviour kept
});

test("status filters: one neutral segmented control with tabular counts and pressed states", () => {
	// the left rail is gone; the SessionList head is the single count/filter surface
	expect(html).not.toContain("group-rail");
	expect(html).not.toContain('class="rail-filter"');
	const head = html.indexOf('class="list-head');
	const filtersAt = html.indexOf('class="list-filters"', head);
	const chipsAt = html.indexOf('class="repo-chips mobile-only"', head);
	const searchAt = html.indexOf('class="list-search"', head);
	expect(head).toBeGreaterThan(-1);
	expect(filtersAt).toBeGreaterThan(head); // first row of .list-head
	expect(chipsAt).toBeGreaterThan(filtersAt);
	expect(searchAt).toBeGreaterThan(chipsAt);
	// every label + count lives between .list-filters and the search row
	for (const label of ["全部", "在线", "离线", "已关闭"]) {
		const at = html.indexOf(">" + label + "<", filtersAt);
		expect(at).toBeGreaterThan(filtersAt);
		expect(at).toBeLessThan(chipsAt);
	}
	for (const count of ["counts.total", "counts.online", "counts.offline", "counts.closed"]) {
		const at = html.indexOf(`x-html="esc(${count})"`, filtersAt);
		expect(at).toBeGreaterThan(filtersAt);
		expect(at).toBeLessThan(chipsAt);
	}
	// one visible filter for online sessions; running/waiting remain state labels in row metadata
	for (const label of ["在线", "离线", "已关闭"]) {
		expect(html.split(label).length - 1).toBe(1);
	}
	expect((html.match(/class="list-filter"/g) || []).length).toBe(4);
	const filters = html.slice(filtersAt, chipsAt);
	expect(filters).not.toContain('class="dot');
	for (const key of ["all", "online", "offline", "closed"]) {
		expect(filters).toContain(`:aria-pressed="stateFilter === '${key}' ? 'true' : 'false'"`);
	}
	for (const count of ["total", "online", "offline", "closed"]) {
		expect(filters).toContain(`x-show="counts.${count} > 0"`);
	}
	// colored pill counters stay dead
	expect(html).not.toContain("stat stat-");
	expect(css).not.toContain(".stat-running");
	expect(css).not.toContain(".stat-on");
	// Selection remains legible in both themes without competing with session state colours.
	expect(css).toMatch(/\.list-filter\s*{[^}]*height: 26px/);
	expect(css).toMatch(/\.list-filter\s*{[^}]*border-radius: 6px/);
	expect(css).toMatch(/\.list-filter:hover\s*{[^}]*var\(--control-bg\)/);
	expect(css).toMatch(/\.list-filter-on\s*{[^}]*var\(--control-selected\)[^}]*var\(--text\)/);
	expect(css).toMatch(/\.list-filter \.list-count\s*{[^}]*tabular-nums/);
	// mobile: one horizontal scrolling row, no wrap, hidden scrollbar
	expect(css).toMatch(/\.list-filters\s*{[^}]*overflow-x: auto/);
	expect(css).toMatch(/\.list-filters\s*{[^}]*flex-wrap: nowrap/);
	expect(css).toMatch(/\.list-filters::-webkit-scrollbar\s*{\s*display: none/);
	// rows ARE the filters (clickable + active state)
	expect(html).toContain('@click="setStateFilter(\'all\')"');
	expect(html).toContain('@click="setStateFilter(\'online\')"');
	expect(js).toContain("stateFilter");
});

test("heartbeat age hidden: lastHeartbeat stays internal state logic only", () => {
	// no heartbeat-age display anywhere user-facing
	expect(html).not.toContain("心跳");
	expect(html).not.toContain("lastHeartbeat");
	expect(html).not.toContain("row-time");
	// the data is still used for staleness; it never participates in row ordering
	expect(js).toContain("lastHeartbeat");
	expect(js).toContain("stale(p)");
	expect(js).toContain("comparePeersByStartedAt");
	expect(js).not.toMatch(/relT\(p\.lastHeartbeat\)/);
});

test("grouping: git repo or folder (cwd) + single-chain header collapse", () => {
	// auto grouping: git repoRoot when detected, otherwise the session's folder
	expect(js).toContain('(p.git && p.git.repoRoot) || String(p.cwd || "")');
	// single worktree+branch chain collapses in the section header (wt/branch hidden)
	expect(js).toContain("g.single = worktrees.length === 1 && worktrees[0].branches.length === 1;");
	expect(js).toContain("single: !!g.single");
	expect(js).not.toContain("singleLabel"); // rail-row label died with the rail
	expect(html).toContain("s.single");
	// the no-git bucket dissolves into per-folder groups (fallback label kept)
	expect(js).toContain("无 Git 仓库");
});

test("context menu: 新建对话到 herdr on repo heads + list background", () => {
	expect(html).toContain("新建对话到 herdr");
	expect(html).toContain("ctx-menu");
	// repo heads keep the repo cwd the old rail rows used to carry
	expect(html).toContain('@contextmenu.prevent.stop="openCtx($event, g.root)"');
	expect(html).toContain('@contextmenu.prevent="openCtx($event, \'\')"');
	// row right-click keeps RowOverflowMenu and does not bubble to the list background
	expect(html).toContain("$event.stopPropagation()");
	// fetch contract: POST /api/herdr/new-session {cwd?, label?} -> {ok, message, ...}
	expect(js).toContain("openCtx");
	expect(js).toContain("newHerdrSession");
	expect(js).toContain('"/api/herdr/new-session"');
	expect(js).toContain("API.newSession");
	expect(js).toContain("JSON.stringify({ cwd: cwd || undefined, label: label || undefined })");
});

test("临时会话（--no-session）: 临时 chip + hidden history/review/resume/file actions", () => {
	// distinct row/detail chip (Lucide + label, native style)
	expect(html).toContain("chip-ephemeral");
	expect(html).toContain('data-lucide="zap"');
	expect(html).toContain("<span>临时</span>");
	// truth source: PeerView.persistence === "memory" (legacy ephemeral fallback)
	expect(js).toContain('p.persistence === "memory"');
	expect(js).toContain("ephemeral(p)");
	// quiet hint where persisted records would show (历史/Review/文件活动)
	expect(html).toContain("临时会话，不保存记录");
	expect(js).toMatch(/openHistory\(p\)[\s\S]{0,900}this\.ephemeral\(peer\)/);
	expect(js).toMatch(/openReview\(p\)[\s\S]{0,900}this\.ephemeral\(peer\)/);
	expect(html).toContain('x-show="selected && ephemeral(selected)"');
	expect(html).toContain('x-show="!ephemeral(p)"');
	// 恢复 is gated off for ephemeral peers
	expect(js).toMatch(/canResume\(pOrSid\)[\s\S]{0,240}this\.ephemeral\(p\)/);
	// live-only actions stay available
	expect(html).toContain('@click.stop="focusComposer(p.sessionId)"');
	expect(html).toContain('@click.stop="openTerminal(p)"');
});

test("history markdown: entry.htmlSafe (DOMPurify) renders; theme re-requests ?theme=", () => {
	// the HistoryPanel consumes the hub's rendered markdown html via DOMPurify
	expect(js).toContain("mdHtml");
	expect(js).toContain("loadSanitizer");
	expect(js).toContain("DOMPurify.sanitize");
	expect(js).toContain("applyEcTheme");
	expect(html).toContain('x-html="item.e.htmlSafe ?? esc(item.e.text)"');
	expect(html).toContain("entry-md");
	// rendered markdown keeps normal whitespace (source newlines stay invisible)
	expect(css).toContain(".entry-text.entry-md");
	expect(css).toMatch(/\.entry-text\.entry-md\s*{[^}]*white-space: normal/);
	// theme toggle re-fetches the transcript with ?theme= (mermaid + EC follow the theme)
	expect(js).toContain("&theme=");
	expect(js).toMatch(/toggleTheme\(\)[\s\S]{0,800}this\.openHistory\(/);
	expect(js).toMatch(/toggleTheme\(\)[\s\S]{0,900}this\.openReview\(/);
});

test("history width: entries fill the pane; wide tables/code scroll, never clip", () => {
	// the 62ch measure squeezed markdown into ~half the pane and clipped wide
	// tables/code at the column edge ("渲染了一半剩下是空白"). Entries now use the
	// full pane width; anything wider (markdown table / code line) scrolls
	// horizontally instead of being cut or blanking the column.
	expect(css).not.toContain("max-width: 62ch");
	expect(css).toMatch(/\.entry-text\s*{[^}]*max-width: 100%/);
	expect(css).toMatch(/\.entry-text\s*{[^}]*overflow-x: auto/);
	// rendered markdown: long tokens (paths/URLs) wrap, never overflow the column
	expect(css).toMatch(/\.entry-text\.entry-md\s*{[^}]*overflow-wrap: break-word/);
	// code blocks keep horizontal scroll (never clipped)
	expect(css).toMatch(/\.entry-text pre\s*{[^}]*overflow-x: auto/);
	// the DetailPane width stays constant across tabs (pinned grid column)
	expect(css).toContain("grid-template-columns: minmax(360px, var(--pane-list-w, 480px)) 1px minmax(0, 1fr)");
	expect(css).not.toContain("--pane-detail-w");
});

test("boot restore: F5 with #p=&tab=… loads the restored tab content (no blank panel)", () => {
	// regression: restoreSelection() sets selectedId+detailTab but never fetched —
	// the history panel showed 「没有历史记录」 until a manual tab click
	expect(js).toContain("ensureTab");
	expect(js).toMatch(/restoreSelection\(\) \{[\s\S]{0,1400}this\.ensureTab\(\)/);
	// boot path: peers arrive after restoreSelection → syncSelected ensures the tab
	expect(js).toMatch(/syncSelected\(\) \{[\s\S]{0,500}this\.ensureTab\(\)/);
	// ensureTab dispatches per tab, loading only what is missing (sessionId guards)
	expect(js).toMatch(/ensureTab\(\) \{[\s\S]{0,700}this\.openHistory\(p\)/);
	expect(js).toMatch(/ensureTab\(\) \{[\s\S]{0,900}this\.openReview\(p\)/);
	expect(js).toContain("if (this.drawer.sessionId !== this.selectedId) this.openHistory(p);");
	expect(js).toContain("if (this.review.sessionId !== this.selectedId) this.openReview(p);");
	// SSE refreshes reuse the same path: already-loaded tabs are no-ops
	expect(js).toMatch(/ensureTab\(\) \{[\s\S]{0,300}const p = this\.selected;\s*if \(!p\) return;/);
});

test("history pagination: 加载更早 prepends older pages via beforeEntryId", () => {
	// wire: API.transcript gains an optional beforeEntryId cursor (backward paging)
	expect(js).toContain("&beforeEntryId=");
	expect(js).toContain("const HISTORY_PAGE = 50;");
	// button at the head of the list (history is oldest-first: older = above)
	expect(html).toContain("加载更早");
	expect(html).toContain('x-show="!drawer.loading && !drawer.error && drawer.hasMore"');
	// loading cue: two skeleton blocks replace the button while the page prepends
	expect(html).toContain("older-cue");
	expect(html).toContain('x-show="drawer.loadingOlder"');
	expect(html).toContain('@click="loadOlder()"');
	// scroll-near-top auto-fill on the detail body
	expect(html).toContain('@scroll.passive="onHistoryScroll($event)"');
	expect(js).toContain("onHistoryScroll");
	expect(js).toContain("el.scrollTop < 120");
	// behaviour: cursor = head entry id; older page prepends; keys stay unique;
	// reading position anchored; full page ⇒ maybe older, short page ⇒ done
	expect(js).toMatch(/async loadOlder\(\) \{[\s\S]{0,1600}API\.transcript\(sid, HISTORY_PAGE, this\.theme, before\)/);
	expect(js).toContain("this.drawer.hasMore = page.length >= HISTORY_PAGE;");
	expect(js).toContain("this.drawer.hasMore = entries.length >= HISTORY_PAGE;");
	expect(js).toContain("host.scrollTop += host.scrollHeight - prevH");
	// ephemeral peers never paginate (no history at all)
	expect(js).toMatch(/async loadOlder\(\) \{[\s\S]{0,900}this\.ephemeral\(peer\)/);
	const merge = new Function(`${extractFn("mergeOlderEntries")}\nreturn { mergeOlderEntries };`)() as {
		mergeOlderEntries: (cur: any[], older: any[]) => any[];
	};
	const a = { id: "a", role: "user", text: "1" };
	const b = { id: "b", role: "assistant", text: "2" };
	const c = { id: "c", role: "user", text: "3" };
	// older page in front, chronological order preserved
	expect(merge.mergeOlderEntries([b, c], [a]).map((e) => e.id)).toEqual(["a", "b", "c"]);
	// cursor overlap / duplicates drop out — every buildHistory :key stays unique
	expect(merge.mergeOlderEntries([b, c], [a, b]).map((e) => e.id)).toEqual(["a", "b", "c"]);
	expect(merge.mergeOlderEntries([c], []).map((e) => e.id)).toEqual(["c"]);
	expect(merge.mergeOlderEntries([], [a]).map((e) => e.id)).toEqual(["a"]);
	expect(merge.mergeOlderEntries(null as any, undefined as any)).toEqual([]);
	// key uniqueness holds even for empty-id entries (positional fallback)
	const t = "2024-05-01T10:00:00.000Z";
	const items = fns.buildHistory([
		{ id: "", timestamp: t, role: "user", text: "x" },
		{ id: "", timestamp: t, role: "assistant", text: "y" },
	]);
	const keys = items.map((i: any) => i.key);
	expect(new Set(keys).size).toBe(keys.length);
});

test("file activity SSE uses one deduped 50-row window like the registry snapshot", () => {
	expect(js).toContain("const FILE_ACTIVITY_LIMIT = 50;");
	expect(js).toContain("mergeFileActivities(p.files, evt.files, FILE_ACTIVITY_LIMIT)");
	const merge = new Function(extractFn("mergeFileActivities") + "\nreturn mergeFileActivities;")() as (
		current: any[], incoming: any[], limit?: number,
	) => any[];
	const row = (n: number) => ({
		path: "/repo/file-" + n + ".ts",
		op: "edit",
		ts: new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString(),
	});
	const current = Array.from({ length: 33 }, (_, i) => row(i + 1));
	const added = row(34);
	expect(merge(current, [added])).toHaveLength(34);
	expect(merge(current, [added])[0]).toEqual(added);
	// SSE may replay the newest event already present in the snapshot; it is deduped.
	expect(merge([added, ...current], [added])).toHaveLength(34);
	const full = Array.from({ length: 60 }, (_, i) => row(i + 1));
	const capped = merge(full, [row(61)]);
	expect(capped).toHaveLength(50);
	expect(capped[0]).toEqual(row(61));
	expect(capped[49]).toEqual(row(12));
});

test("composer: IME Enter is ignored and send receipts cannot erase a newer draft", () => {
	const helpers = new Function(
		[
			"isImeEnter",
			"defaultComposerDraft",
			"nextComposerDraft",
			"createComposerSnapshot",
			"settleComposerDraft",
			"classifyMessageFailure",
			"isMessageablePeer",
			"resolveViewerId",
			"messageAvailabilityLabel",
			"messageSourceLabel",
			"messageSourceTitle",
		].map(extractFn).join("\n") +
			"\nreturn { isImeEnter, defaultComposerDraft, nextComposerDraft, createComposerSnapshot, settleComposerDraft, classifyMessageFailure, isMessageablePeer, resolveViewerId, messageAvailabilityLabel, messageSourceLabel, messageSourceTitle };",
	)() as {
		isImeEnter: (event: any, composing?: boolean) => boolean;
		defaultComposerDraft: () => any;
		nextComposerDraft: (current: any, patch: any) => any;
		createComposerSnapshot: (sid: string, draft: any, viewerId: string) => any;
		settleComposerDraft: (current: any, snapshot: any, receipt: any) => any;
		classifyMessageFailure: (error: any) => string;
		isMessageablePeer: (peer: any) => boolean;
		resolveViewerId: (peers: any[], currentId: string) => string;
		messageAvailabilityLabel: (peer: any) => string;
		messageSourceLabel: (peer: any) => string;
		messageSourceTitle: (peer: any) => string;
	};
	expect(helpers.isImeEnter({ key: "Enter", isComposing: true })).toBe(true);
	expect(helpers.isImeEnter({ key: "Enter", keyCode: 229 })).toBe(true);
	expect(helpers.isImeEnter({ key: "Enter" }, true)).toBe(true);
	expect(helpers.isImeEnter({ key: "Enter" })).toBe(false);

	const base = helpers.nextComposerDraft(helpers.defaultComposerDraft(), {
		text: "first request",
		mode: "followUp",
	});
	const snapshot = helpers.createComposerSnapshot("target-A", base, "viewer-B");
	expect(snapshot).toEqual({
		sessionId: "target-A",
		text: "first request",
		mode: "followUp",
		fromSessionId: "viewer-B",
		version: base.version,
	});
	const newer = helpers.nextComposerDraft({ ...base, sending: true }, { text: "new draft" });
	const acceptedAfterEdit = helpers.settleComposerDraft(newer, snapshot, {
		state: "accepted",
		disposition: "queued",
	});
	expect(acceptedAfterEdit.text).toBe("new draft");
	expect(acceptedAfterEdit.mode).toBe("followUp");
	expect(acceptedAfterEdit.sending).toBe(false);
	const acceptedUnchanged = helpers.settleComposerDraft({ ...base, sending: true }, snapshot, {
		state: "accepted",
		disposition: "handled",
	});
	expect(acceptedUnchanged.text).toBe("");
	expect(acceptedUnchanged.mode).toBe("followUp");
	const rejected = helpers.settleComposerDraft({ ...base, sending: true }, snapshot, { state: "rejected" });
	expect(rejected.text).toBe("first request");
	const unknown = helpers.settleComposerDraft({ ...base, sending: true }, snapshot, { state: "unknown" });
	expect(unknown.text).toBe("first request");
	expect(helpers.classifyMessageFailure(new Error("网络错误: Failed to fetch"))).toBe("unknown");
	expect(helpers.classifyMessageFailure(Object.assign(new Error("HTTP 503"), { status: 503 }))).toBe("unknown");
	expect(helpers.classifyMessageFailure(new Error("peer offline"))).toBe("rejected");
	expect(helpers.isMessageablePeer({ state: "running" })).toBe(true);
	expect(helpers.isMessageablePeer({ state: "waiting" })).toBe(true);
	expect(helpers.isMessageablePeer({ state: "offline" })).toBe(false);
	expect(helpers.isMessageablePeer({ state: "closed" })).toBe(false);
	expect(helpers.messageAvailabilityLabel({ state: "waiting" })).toContain("在线 · 空闲");
	expect(helpers.messageAvailabilityLabel({ state: "offline" })).toContain("草稿保留");
	const viewerPeers = [
		{ sessionId: "old-offline", state: "offline", title: "离线来源" },
		{ sessionId: "new-waiting", state: "waiting", title: "在线来源" },
		{ sessionId: "closed", state: "closed", title: "已结束来源" },
	];
	expect(helpers.resolveViewerId(viewerPeers, "old-offline")).toBe("old-offline");
	expect(helpers.resolveViewerId(viewerPeers, "missing")).toBe("new-waiting");
	expect(helpers.resolveViewerId([viewerPeers[0], viewerPeers[2]], "missing")).toBe("");
	expect(helpers.messageSourceLabel(null)).toContain("网页直发");
	expect(helpers.messageSourceLabel(null)).toContain("不建立会话关注");
	expect(helpers.messageSourceLabel(viewerPeers[0])).toContain("离线");
	expect(helpers.messageSourceTitle(viewerPeers[0])).toContain("关注关系");

	// The wire call uses a frozen snapshot, not mutable draft/viewer state.
	expect(js).toContain("API.message(snapshot.sessionId, snapshot.text, snapshot.mode, snapshot.fromSessionId)");
	expect(js).toContain("if (current.sending) return");
	expect(html).toContain("@compositionstart=\"onComposerCompositionStart()\"");
	expect(html).toContain("@compositionend=\"onComposerCompositionEnd()\"");
	expect(html).toContain("cstate(selectedId).sending");
	expect(html).toContain("发送至");
	expect(html).toContain("协作来源");
	expect(html).toContain("messageSourceLabel(viewer)");
	expect(html).toContain("messageSourceTitle(viewer)");
	expect(css).toContain(".composer-context-status::before");
	expect(css).toContain(".composer-context-status.availability-running::before");
	expect(css).toContain(".composer-context-status.availability-offline::before");
	expect(html).toContain("!canSendMessage(selectedId)");
	expect(js).toContain("if (!this.canSendMessage(target)) return this.toast");
	expect(js).toContain('waiting: { label: "在线·空闲"');
	expect(js).toContain('started: "已交给目标扩展"');
});

test("pane resize: one list handle + clamps + pi-mesh.panes (desktop two-pane)", () => {
	// exactly one hairline handle: list | 1px | detail
	expect((html.match(/class="pane-handle"/g) || []).length).toBe(1);
	expect(html).toContain('@mousedown.prevent="startPaneDrag(\'list\', $event)"');
	expect(html).not.toContain("startPaneDrag('detail'");
	expect(html).toContain('@dblclick="resetPane(\'list\')"');
	expect(html).not.toContain("resetPane('detail'");
	expect(html).toContain(':style="paneStyle"');
	expect(html).toContain('role="separator"');
	// grid: the list owns the draggable width (480 default), detail takes the rest
	expect(css).toContain(
		"grid-template-columns: minmax(360px, var(--pane-list-w, 480px)) 1px minmax(0, 1fr)",
	);
	// drag wiring + persistence
	expect(js).toContain("startPaneDrag");
	expect(js).toContain("endPaneDrag");
	expect(js).toContain("persistPanes");
	expect(js).toContain("loadPanes");
	expect(js).toContain('const PANE_KEY = "pi-mesh.panes"');
	expect(js).toContain("const PANE_DEFAULTS = { list: 480 };");
	// paneStyle only carries the list width
	expect(js).toContain('"--pane-list-w:" + (this.panes.list || PANE_DEFAULTS.list) + "px;"');
	expect(js).not.toContain("--pane-detail-w");
	// native feel: col-resize cursor, 6px hit area, no selection mid-drag
	expect(css).toContain(".pane-handle");
	expect(css).toContain("cursor: col-resize");
	expect(css).toMatch(/\.pane-dragging\s*{[^}]*user-select: none/);
	// handle exists only in the desktop two-pane layout
	expect(css).toMatch(/@media \(max-width: 899px\)\s*{[\s\S]{0,600}\.pane-handle\s*{\s*display: none/);
	expect(css).toMatch(/@media \(min-width: 900px\) and \(max-width: 1179px\)\s*{[\s\S]{0,600}\.pane-handle\s*{\s*display: none/);
	// clamp helper (pure): list 360–720, detail keeps ≥600, garbage → 0
	const lim = js.match(/const PANE_LIMITS = \{[^}]*\};/);
	expect(lim).toBeTruthy();
	const f = new Function(`${lim![0]}\n${extractFn("clampPaneWidth")}\nreturn { clampPaneWidth, PANE_LIMITS };`)() as {
		clampPaneWidth: (kind: string, px: unknown, viewport?: unknown) => number;
		PANE_LIMITS: Record<string, number>;
	};
	expect(f.PANE_LIMITS.listMin).toBe(360);
	expect(f.PANE_LIMITS.listMax).toBe(720);
	expect(f.PANE_LIMITS.detailMin).toBe(600);
	expect(f.clampPaneWidth("list", 100, 1440)).toBe(360);
	expect(f.clampPaneWidth("list", 9999, 1440)).toBe(720);
	expect(f.clampPaneWidth("list", 500, 1440)).toBe(500);
	// at 1180 the detail keeps ≥600: list max = 1180 - 600 - 1 = 579
	expect(f.clampPaneWidth("list", 700, 1180)).toBe(579);
	// sub-desktop sanity: never collapse below listMin
	expect(f.clampPaneWidth("list", 700, 900)).toBe(360);
	expect(f.clampPaneWidth("detail", 500, 1440)).toBe(0); // old kind no longer drags
	// unusable input → 0, never NaN
	expect(f.clampPaneWidth("list", "junk")).toBe(0);
	expect(f.clampPaneWidth("list", undefined)).toBe(0);
});

test("pi-mesh.panes: persists the list width; legacy {detail} migrates; reset 480", () => {
	const lim = js.match(/const PANE_LIMITS = \{[^}]*\};/)![0];
	const def = js.match(/const PANE_DEFAULTS = \{[^}]*\};/)![0];
	const loader = new Function(
		`${lim}\n${def}\n${extractFn("clampPaneWidth")}\n${extractFn("readPaneState")}\nreturn { readPaneState };`,
	)() as { readPaneState: (saved: unknown, viewport: number) => { list: number } };
	// current format
	expect(loader.readPaneState({ list: 500 }, 1440)).toEqual({ list: 500 });
	expect(loader.readPaneState({ list: 9999 }, 1440)).toEqual({ list: 720 });
	// legacy detail: list = viewport - detail - 1, then clamp (1440-664-1=775 → 720)
	expect(loader.readPaneState({ detail: 664 }, 1440)).toEqual({ list: 720 });
	expect(loader.readPaneState({ rail: 240, detail: 658 }, 1440)).toEqual({ list: 720 });
	// nothing saved → 480
	expect(loader.readPaneState(null, 1440)).toEqual({ list: 480 });
	expect(loader.readPaneState({}, 1440)).toEqual({ list: 480 });
	// writes only {list}
	expect(js).toContain('JSON.stringify({ list: this.panes.list })');
	expect(js).not.toContain("panes.detail");
	expect(js).toMatch(/panes: \{ list: 0 \}/);
	// double-click restores the 480 default
	expect(js).toMatch(/resetPane\(kind\) \{[\s\S]{0,200}this\.panes\.list = PANE_DEFAULTS\.list;/);
});

/* ---------------- craft review #2: status rows / inspector / toolbar / menus ---------------- */

test("connection status: quiet 连接中 boot, banner only after established-then-lost grace", () => {
	const f = new Function(`${extractFn("connNextState")}\n${extractFn("connBannerOn")}\nreturn { connNextState, connBannerOn };`)() as {
		connNextState: (event: string, ever: boolean) => string;
		connBannerOn: (ever: boolean, state: string) => boolean;
	};
	// boot: 连接中 — the red banner never flashes on first paint
	expect(f.connNextState("lost", false)).toBe("connecting");
	expect(f.connBannerOn(false, "connecting")).toBe(false);
	expect(f.connBannerOn(false, "retrying")).toBe(false);
	// established then lost → 重连中; the banner arms behind a ~1.8s grace
	expect(f.connNextState("lost", true)).toBe("retrying");
	expect(f.connBannerOn(true, "retrying")).toBe(true);
	// quick blip: open lands within the grace → silent
	expect(f.connNextState("open", true)).toBe("connected");
	expect(f.connBannerOn(true, "connected")).toBe(false);
	// paused stays quiet
	expect(f.connNextState("pause", true)).toBe("paused");
	expect(f.connBannerOn(true, "paused")).toBe(false);
	// statics: initial state, banner gating, grace window 1.5–2s
	expect(js).toContain('connState: "connecting"');
	expect(js).toContain("connBanner");
	expect(js).toMatch(/armConnBanner\(\) \{\s*if \(!this\.connEver \|\| this\._connBannerTimer\) return;/);
	expect(js).toMatch(/setTimeout\(\(\) => \{[\s\S]{0,240}1800\)/);
	expect(html).toContain('x-show="connBanner"');
	expect(html).not.toContain('x-show="!connected && !paused"');
	expect(html).toContain("连接断开 · 正在自动重连…");
	// pill states: 连接中 / 已连接 / 重连中 (+ 已暂停) — no protocol jargon
	expect(html).toContain("连接中");
	expect(html).toContain("已连接");
	expect(html).toContain("重连中");
	expect(html).not.toContain("SSE 已连接");
});

test("popupPos: menus anchor flush at the cursor with edge flip + clamp", () => {
	const f = new Function(`${extractFn("popupPos")}\nreturn { popupPos };`)() as {
		popupPos: (x: number, y: number, w: number, h: number, vw: number, vh: number) => { x: number; y: number };
	};
	// flush at the click point
	expect(f.popupPos(400, 500, 216, 200, 1440, 900)).toEqual({ x: 400, y: 500 });
	// near the right edge: flips left of the cursor
	expect(f.popupPos(1400, 300, 216, 200, 1440, 900)).toEqual({ x: 1184, y: 300 });
	// near the bottom edge: flips above the cursor
	expect(f.popupPos(300, 850, 216, 200, 1440, 900)).toEqual({ x: 300, y: 650 });
	// corner: flips both and clamps to an 8px margin
	expect(f.popupPos(1435, 895, 216, 200, 1440, 900)).toEqual({ x: 1216, y: 692 });
	// garbage → 8px margin, never NaN
	expect(f.popupPos(NaN, NaN, 216, 200, 1440, 900)).toEqual({ x: 8, y: 8 });
	// row menus re-clamp with the rendered size (no stale 0-size measurement)
	expect(js).toContain("placeMenu");
	expect(js).toContain("anchorPopup");
	expect(css).toContain(".menu-at");
	expect(css).toContain("var(--menu-x");
});

test("menuPopupPos: button edges survive actual-size placement and bottom flipping", () => {
	const f = new Function(`${extractFn("popupPos")}\n${extractFn("menuPopupPos")}\nreturn menuPopupPos;`)() as (
		anchor: { rect?: { left: number; right: number; top: number; bottom: number }; align?: string; x?: number; y?: number },
		w: number, h: number, vw: number, vh: number,
	) => { x: number; y: number };
	const row = { rect: { left: 440, right: 468, top: 219, bottom: 247 }, align: "end" };
	// Screenshot regression: the menu must end at 468, rather than start at 440.
	expect(f(row, 200, 112, 1440, 900)).toEqual({ x: 268, y: 251 });
	expect(f({ ...row, align: "start" }, 288, 320, 1440, 900)).toEqual({ x: 440, y: 251 });
	// Estimated height flips upward; the shorter rendered menu fits below the original trigger.
	const lower = { rect: { left: 440, right: 468, top: 650, bottom: 678 }, align: "end" };
	expect(f(lower, 216, 248, 1440, 900)).toEqual({ x: 252, y: 398 });
	expect(f(lower, 200, 112, 1440, 900)).toEqual({ x: 268, y: 682 });
	const bottom = { rect: { left: 440, right: 468, top: 850, bottom: 878 }, align: "end" };
	expect(f(bottom, 200, 112, 1440, 900)).toEqual({ x: 268, y: 734 });
	// Both horizontal edges clamp inside the viewport without changing the button's vertical anchor.
	expect(f({ rect: { left: 2, right: 30, top: 100, bottom: 128 } }, 200, 112, 390, 844)).toEqual({ x: 8, y: 132 });
	expect(f({ rect: { left: 350, right: 378, top: 100, bottom: 128 }, align: "start" }, 288, 112, 390, 844)).toEqual({ x: 94, y: 132 });
	// Context menus retain cursor-based edge flipping.
	expect(f({ x: 1435, y: 895 }, 216, 200, 1440, 900)).toEqual({ x: 1216, y: 692 });
	expect(js).toContain('this.anchorPopup(ev, 288, Math.min(320, this.viewerOptions.length * 24 + 16), "start")');
	expect(js).toContain("menuPopupPos(anchor, r.width, r.height, W, H)");
	expect(js).not.toContain("popupPos(this.menuPos.x, this.menuPos.y");
});

test("left rail is gone: no group-rail markup, no rail state, no hamburger", () => {
	// structure merged into SessionList: one list, one detail
	expect(html).not.toContain("group-rail");
	expect(html).not.toContain("rail-filter");
	expect(html).not.toContain("rail-single");
	expect(html).not.toContain("railOpen");
	expect(html).not.toContain("rail-open");
	expect(html).not.toContain('data-lucide="menu"'); // mobile hamburger
	expect(html).not.toContain("仓库导航");
	expect(js).not.toContain("railOpen");
	expect(css).not.toContain(".group-rail");
	expect(css).not.toContain(".rail-");
	// `rail` survives only in the legacy localStorage compatibility comment
	expect(js.match(/rail/g) || []).toHaveLength(1);
	expect(js).toMatch(/legacy entries also carried `rail`/);
});

test("repo groups: fold header + 14px icon filter entries; mobile chips stay", () => {
	// repo header folds; the icon buttons are the filter entries (no click fight)
	expect(html).toContain('@click="toggleRepo(g.root)"');
	expect(html).toContain('@click.stop="toggleGroupFilter(g.root)"');
	expect(html).toContain('@click.stop="toggleBranchFilter(g.root, s.branch)"');
	expect(html).toMatch(/class="repo-head"[\s\S]{0,900}toggleRepo\(g\.root\)/);
	expect(html).toMatch(/class="branch-head"[\s\S]{0,900}toggleBranchFilter\(g\.root, s\.branch\)/);
	expect(html).not.toContain('@click="toggleBranchFilter');
	expect(js).toContain("toggleRepo");
	expect(js).toContain("toggleBranchFilter");
	expect(js).toContain("branchFilter");
	// one grouping tree only: repoGroups → branches
	expect(html.split('x-for="g in repoGroups"').length - 1).toBe(1);
	expect(html.split('x-for="s in g.branches"').length - 1).toBe(1);
	expect(html).not.toContain('x-for="s in sections"');
	// repo filter key matches the folder-or-repo grouping
	expect(js).toMatch(/filteredPeers[\s\S]{0,600}\(p\.git && p\.git\.repoRoot\) \|\| String\(p\.cwd \|\| ""\)/);
	// Sticky repo heads share the continuous sidebar surface; branch labels remain.
	expect(css).toMatch(/\.repo-head\s*{[^}]*position: sticky/);
	expect(css).toMatch(/\.repo-head\s*{[^}]*background: var\(--sidebar\)/);
	expect(css).not.toMatch(/\.repo-head[^{]*{[^}]*linear-gradient/);
	expect(html).toContain('x-html="esc(g.repo)"');
	expect(html).toContain('x-html="esc(s.wt)"');
	expect(html).toContain('x-html="esc(s.branch)"');
	expect(html).toContain('x-html="esc(s.peers.length)"');
	// 14px Lucide filter glyphs, revealed on hover or while that level is filtered
	expect(html.match(/data-lucide="list-filter"/g) || []).toHaveLength(2);
	expect(css).toMatch(/\.group-filter\s*{[^}]*opacity: 0/);
	expect(css).toMatch(/\.group-filter\.is-on\s*{[^}]*var\(--accent\)/);
	// mobile repo chips remain the repo-level filter there
	expect(html).toContain("repo-chips");
	expect(html).toContain('@click="toggleGroupFilter(g.key)"');
	expect(css).toMatch(/\.repo-chips\s*{[^}]*overflow-x: auto/);
	expect(css).toMatch(/\.repo-chips::-webkit-scrollbar\s*{\s*display: none/);
	// 900–1179 detail scrim covers the full viewport (no icon rail to protect)
	expect(css).toMatch(/\.detail-scrim\s*{[^}]*inset: 44px 0 0 0/);
});

test("repoGroups: same-root sections merge into one foldable group", () => {
	const groupByRepo = new Function(`${extractFn("groupByRepo")}\nreturn groupByRepo;`)() as (
		sections: Array<Record<string, any>>,
	) => Array<Record<string, any>>;
	const p = (id: string) => ({ sessionId: id });
	const groups = groupByRepo([
		{ key: "a|main|main", root: "/r/a", repo: "agentdock", wt: "主工作树", branch: "main", peers: [p("1"), p("2")], single: false },
		{ key: "a|main|feat", root: "/r/a", repo: "agentdock", wt: "主工作树", branch: "feat/x", peers: [p("3")], single: false },
		{ key: "b|main|main", root: "/r/b", repo: "other", wt: "主工作树", branch: "main", peers: [p("4")], single: true },
	]);
	expect(groups).toHaveLength(2);
	expect(groups[0]!.root).toBe("/r/a");
	expect(groups[0]!.repo).toBe("agentdock");
	expect(groups[0]!.count).toBe(3);
	expect(groups[0]!.branches.map((s: any) => s.key)).toEqual(["a|main|main", "a|main|feat"]);
	expect(groups[1]!.root).toBe("/r/b");
	expect(groups[1]!.count).toBe(1);
});

test("repo fold: persisted map, search force-expands, rows leave the DOM", () => {
	const helpers = new Function(
		`${extractFn("readCollapsed")}\n${extractFn("isRepoCollapsed")}\n${extractFn("nextCollapsed")}\n${extractFn("visiblePeersOf")}\nreturn { readCollapsed, isRepoCollapsed, nextCollapsed, visiblePeersOf };`,
	)() as {
		readCollapsed: (saved: unknown) => Record<string, boolean>;
		isRepoCollapsed: (collapsed: Record<string, boolean>, root: string, search: string) => boolean;
		nextCollapsed: (collapsed: Record<string, boolean>, root: string, search: string) => Record<string, boolean>;
		visiblePeersOf: (groups: any[], collapsed: Record<string, boolean>, search: string) => any[];
	};
	// persisted map only keeps explicit true entries
	expect(helpers.readCollapsed({ "/r/a": true, "/r/b": false })).toEqual({ "/r/a": true });
	expect(helpers.readCollapsed(null)).toEqual({});
	// fold toggles on/off; searching is a no-op and forces expansion
	expect(helpers.isRepoCollapsed({ "/r/a": true }, "/r/a", "")).toBe(true);
	expect(helpers.isRepoCollapsed({ "/r/a": true }, "/r/a", "query")).toBe(false);
	let folded = helpers.nextCollapsed({}, "/r/a", "");
	expect(folded).toEqual({ "/r/a": true });
	folded = helpers.nextCollapsed(folded, "/r/a", "");
	expect(folded).toEqual({});
	expect(helpers.nextCollapsed({ "/r/a": true }, "/r/a", "query")).toEqual({ "/r/a": true });
	// collapsed groups contribute no rows → keyboard order / empty state skip them
	const groups = [
		{ root: "/r/a", branches: [{ peers: [{ sessionId: "1" }, { sessionId: "2" }] }] },
		{ root: "/r/b", branches: [{ peers: [{ sessionId: "3" }] }] },
	];
	expect(helpers.visiblePeersOf(groups, {}, "").map((x: any) => x.sessionId)).toEqual(["1", "2", "3"]);
	expect(helpers.visiblePeersOf(groups, { "/r/a": true }, "").map((x: any) => x.sessionId)).toEqual(["3"]);
	expect(helpers.visiblePeersOf(groups, { "/r/a": true }, "q").map((x: any) => x.sessionId)).toEqual(["1", "2", "3"]);
	// repo-head click → rows gone; second click → rows back
	let map = helpers.nextCollapsed({}, "/r/a", "");
	expect(helpers.visiblePeersOf(groups, map, "").map((x: any) => x.sessionId)).toEqual(["3"]);
	map = helpers.nextCollapsed(map, "/r/a", "");
	expect(helpers.visiblePeersOf(groups, map, "").map((x: any) => x.sessionId)).toEqual(["1", "2", "3"]);
	// rows are removed with x-if (not hidden by CSS); repo count stays outside it
	expect(html).toContain('x-if="!isCollapsed(g.root)"');
	const repoHeadAt = html.indexOf('class="repo-head"');
	const repoCountAt = html.indexOf('class="repo-count"', repoHeadAt);
	const ifAt = html.indexOf('x-if="!isCollapsed(g.root)"', repoHeadAt);
	expect(repoCountAt).toBeGreaterThan(repoHeadAt);
	expect(repoCountAt).toBeLessThan(ifAt);
	expect(html).toContain(':class="isCollapsed(g.root) ? \'is-collapsed\' : \'\'"');
	expect(html).toContain('data-lucide="chevron-down"');
	expect(html).toContain('data-lucide="chevron-right"');
	expect(css).toMatch(/\.repo-head\.is-collapsed \.chev-open\s*{\s*display: none/);
	expect(css).toMatch(/\.repo-head\.is-collapsed \.chev-closed\s*{[^}]*display: inline/);
	// persistence + restore on boot
	expect(js).toContain('const COLLAPSED_KEY = "pi-mesh.collapsed"');
	expect(js).toContain("localStorage.getItem(COLLAPSED_KEY)");
	expect(js).toContain("localStorage.setItem(COLLAPSED_KEY");
	expect(js).toContain("this.loadCollapsed()");
	expect(js).toContain("persistCollapsed");
});

test("selected session remains bound while filtered out and can be located without losing its draft", () => {
	const isSelectedHidden = new Function(extractFn("isSelectedHidden") + "\nreturn isSelectedHidden;")() as any;
	expect(isSelectedHidden("offline-A", [{ sessionId: "online-B" }])).toBe(true);
	expect(isSelectedHidden("online-B", [{ sessionId: "online-B" }])).toBe(false);
	expect(isSelectedHidden("", [{ sessionId: "online-B" }])).toBe(false);
	expect(js).toContain("get selectedHidden()");
	expect(js).toContain("locateSelected()");
	expect(js).toContain("this.clearFilters()");
	expect(js).toContain("this.$nextTick(() => this.focusRow(sid))");
	expect(html).toContain('x-show="selected && selectedHidden"');
	expect(html).toContain('@click="locateSelected()"');
	expect(html).toContain("详情与草稿仍保留");
});

test("three workbench views migrate old tab hashes without losing deep links", () => {
	const normalize = new Function(extractFn("normalizeDetailTab") + "\nreturn normalizeDetailTab;")() as any;
	const parseHash = new Function(extractFn("parseSelectionHash") + "\nreturn parseSelectionHash;")() as any;
	expect(normalize("overview")).toBe("session");
	expect(normalize("history")).toBe("session");
	expect(normalize("session")).toBe("session");
	expect(normalize("review")).toBe("changes");
	expect(normalize("files")).toBe("changes");
	expect(normalize("changes")).toBe("changes");
	expect(normalize("terminal")).toBe("terminal");
	expect(normalize("unknown")).toBe("session");
	expect(parseHash("#p=demo-running&tab=review&file=%2Frepo%2Fpackages%2Fa%2Fsrc%2Findex.ts")).toEqual({
		sessionId: "demo-running",
		tab: "review",
		file: "/repo/packages/a/src/index.ts",
	});
	expect(js).toContain('fileParam = this.detailTab === "changes" && this.reviewSelectedFile');
	expect(js).toContain("localStorage.setItem(\"pi-mesh.review-file\", this.reviewSelectedFile || \"\")");
	expect(js).toContain("onSelectFile: (file) =>");
	expect(reviewJs).toContain("options.onSelectFile(focusedFile)");
	expect(reviewJs).toContain("options.onSelectFile(selectedFile)");
	expect(reviewJs).toContain("onSelectFile: options.onSelectFile");
	expect((html.match(/class="detail-tab"/g) || []).length).toBe(3);
	expect(html).toContain("会话");
	expect(html).toContain("变更");
	expect(html).toContain("终端");
	expect(html).toContain("detailTab === 'session'");
	expect(html).toContain("detailTab === 'changes'");
	expect(js).toContain("this.detailTab = normalizeDetailTab(tab)");
	expect(js).toContain('localStorage.setItem("pi-mesh.tab", this.detailTab || "session")');
	expect(html).toContain('<details class="session-inspector">');
	expect(html).toContain('class="panel-view session-history"');
});

test("session list defaults to persisted online scope, searches all states, and keeps stable chronology", () => {
	const helpers = new Function(
		"localStorage",
		'const STATE_FILTER_KEY = "pi-mesh.state-filter";\n' +
			[
				"normalizeStateFilter",
				"readStateFilter",
				"matchesStateFilter",
				"comparePeersByStartedAt",
			].map(extractFn).join("\n") +
			"\nreturn { normalizeStateFilter, readStateFilter, matchesStateFilter, comparePeersByStartedAt };",
	);
	const defaulted = helpers({ getItem: () => null });
	expect(defaulted.readStateFilter()).toBe("online");
	expect(helpers({ getItem: () => "closed" }).readStateFilter()).toBe("closed");
	expect(helpers({ getItem: () => "invalid" }).readStateFilter()).toBe("online");
	let migratedRunning = "";
	let migratedWaiting = "";
	expect(helpers({ getItem: () => "running", setItem: (_key: string, value: string) => { migratedRunning = value; } }).readStateFilter()).toBe("online");
	expect(helpers({ getItem: () => "waiting", setItem: (_key: string, value: string) => { migratedWaiting = value; } }).readStateFilter()).toBe("online");
	expect(migratedRunning).toBe("online");
	expect(migratedWaiting).toBe("online");
	expect(defaulted.normalizeStateFilter("running")).toBe("online");
	expect(defaulted.normalizeStateFilter("waiting")).toBe("online");

	const match = defaulted.matchesStateFilter;
	expect(match({ state: "running" }, "online")).toBe(true);
	expect(match({ state: "waiting" }, "online")).toBe(true);
	expect(match({ state: "running" }, "running")).toBe(true);
	expect(match({ state: "waiting" }, "waiting")).toBe(true);
	expect(match({ state: "offline" }, "online")).toBe(false);
	expect(match({ state: "closed" }, "online", true)).toBe(true);
	expect(match({ state: "offline" }, "offline")).toBe(true);

	const peers = [
		{ sessionId: "z", state: "running", startedAt: "2026-10-01T10:00:00Z" },
		{ sessionId: "b", state: "closed", startedAt: "2026-10-01T10:00:00Z" },
		{ sessionId: "a", state: "offline", startedAt: "2026-10-01T10:00:00Z" },
		{ sessionId: "old", state: "running", startedAt: "2026-09-30T10:00:00Z" },
	];
	expect(peers.sort(defaulted.comparePeersByStartedAt).map(peer => peer.sessionId)).toEqual(["a", "b", "z", "old"]);
	expect(html).toContain("@click=\"setStateFilter('online')\"");
	expect(js).toContain('stateFilter: readStateFilter()');
	expect(js).toContain("normalizeStateFilter(value)");
	expect(js).toContain("localStorage.setItem(STATE_FILTER_KEY, next)");
	expect(js).toContain("matchesStateFilter(p, this.stateFilter, !!q)");
	expect(html).toContain("搜索全部会话");
});

test("list polish: hierarchy rhythm + row de-duplication + hover actions", () => {
	// repo header: 30px sticky band, branch rows indented 12px under it
	expect(css).toMatch(/\.repo-head\s*{[^}]*height: 30px/);
	expect(css).toMatch(/\.repo-head\s*{[^}]*padding: 0 12px/);
	expect(css).toMatch(/\.repo-name\s*{[^}]*font-size: 12px[^}]*font-weight: 600/);
	expect(css).toMatch(/\.repo-count\s*{[^}]*font-variant-numeric: tabular-nums/);
	expect(css).toMatch(/\.branch-head\s*{[^}]*padding: 0 12px 0 24px/);
	expect(css).toMatch(/\.section-branch\s*{[^}]*font-size: 11px[^}]*color: var\(--muted\)/);
	expect(css).toMatch(/\.list-section \+ \.list-section\s*{[^}]*margin-top: 10px/);
	// rhythm: 6px filter→search, 4px scroll top, 8px list scrollbar with stable gutter
	expect(css).toMatch(/\.list-filters\s*{[^}]*margin-bottom: 6px/);
	expect(css).toMatch(/\.list-scroll\s*{[^}]*padding: 4px 0 24px/);
	expect(css).toMatch(/\.list-scroll\s*{[^}]*scrollbar-gutter: stable/);
	expect(css).toMatch(/\.list-scroll::-webkit-scrollbar\s*{\s*width: 8px/);
	expect(css).toMatch(/\.list-scroll::-webkit-scrollbar-thumb\s*{[^}]*var\(--scroll-thumb\)/);
	// rows: 10px gap, 12px/500 title, 6px dot, 10px right-aligned file count
	expect(css).toMatch(/\.peer-row\s*{[^}]*gap: 10px/);
	expect(css).toMatch(/\.row-title\s*{[^}]*font-size: 12px[^}]*font-weight: 500/);
	expect(css).toMatch(/\.row-dot\s*{[^}]*width: 6px/);
	expect(css).toMatch(/\.row-meta\s*{[^}]*margin-left: auto[^}]*font-size: 10px/);
	// branch chip died in the row; the model chip is capped at 150px with ellipsis
	expect(html).not.toContain('x-show="p.git && p.git.branch"');
	expect(html).toContain('<span class="chip-text" x-html="esc(p.model)"></span>');
	expect(css).toMatch(/\.row-chips \.chip-strong\s*{[^}]*max-width: 150px/);
	expect(css).toMatch(/\.row-chips \.chip-text\s*{[^}]*text-overflow: ellipsis/);
	// actions hidden at rest, revealed by hover / selection / focus, always on touch
	expect(css).toMatch(/\.row-actions\s*{[^}]*opacity: 0/);
	expect(css).toMatch(/\.peer-row:hover \.row-actions[\s\S]{0,120}opacity: 1/);
	expect(css).toMatch(/\.peer-row\.row-sel \.row-actions/);
	expect(css).toMatch(/\.peer-row:focus-within \.row-actions/);
	expect(css).toMatch(/@media \(hover: none\) \{[\s\S]{0,500}\.row-actions[\s\S]{0,80}opacity: 1/);
});

test("native chrome: aligned sidebar, labelled command shortcut, unified session search", () => {
	expect(html).toContain('<header class="topbar" :style="paneStyle">');
	expect(css).toMatch(/\.toolbar-sidebar\s*{[^}]*var\(--pane-list-w, 480px\)/);
	expect(css).toMatch(/\.session-list\s*{[^}]*background: var\(--sidebar\)/);
	expect(css).toMatch(/\.list-head\s*{[^}]*background: var\(--sidebar\)/);
	expect(css).toMatch(/\.cmd-trigger\s*{[^}]*border-radius: 6px/);
	expect(css).toMatch(/\.cmd-trigger\s*{[^}]*background: var\(--control-bg\)/);
	expect(html).toContain('<span class="cmd-label">搜索与命令</span>');
	// At 600px, the command label must not collapse to a vertical stack.
	expect(css).toMatch(/\.cmd-trigger\s*{[^}]*flex: 0 0 auto[^}]*white-space: nowrap/);
	expect(html).not.toContain("搜索/命令</span>");
	const toolbar = html.slice(html.indexOf('<header class="topbar"'), html.indexOf('</header>'));
	expect(toolbar).toContain('class="viewer-label">协作来源');
	expect(toolbar).not.toContain('class="viewer-sid');
	expect(toolbar).toContain(':aria-pressed="paused ? \'true\' : \'false\'"');
	expect(css).toMatch(/\.conn-text\s*{[^}]*color: var\(--muted\)/);
	// Icon, input, shortcut and clear action share one search field and focus ring.
	expect(css).toMatch(/\.list-search\s*{[^}]*border: 1px solid var\(--hairline\)/);
	expect(css).toContain(".list-search:focus-within");
	expect(css).toMatch(/\.search-input\s*{[^}]*border: none[^}]*background: transparent/);
	expect(html).toContain('aria-label="清空会话搜索"');
	expect(html).toContain('@click="search = \'\'; $refs.searchInput.focus()"');
	// viewer remains the same keyboard-operable menu-button.
	expect(html).toContain("viewer-btn");
	expect(html).toContain("viewer-sid");
	expect(css).toContain(".viewer-title");
	expect(html).not.toContain("<select");
	expect(html).toContain("viewer-menu");
	expect(html).not.toContain("<span>当前视角</span>");
	// uniform 28px toolbar buttons
	expect(css).toMatch(/\.icon-btn\s*{[^}]*width: 28px/);
	expect(css).toContain(".toasts-layer"); // toasts above the composer, never over 发送
});

test("icons: no placeholder flash (hidden until hydrated, microtask hydration)", () => {
	expect(css).toMatch(/\[data-lucide\]:not\(svg\)\s*{[^}]*visibility: hidden/);
	expect(js).toContain("queueMicrotask");
	expect(js).toMatch(/refreshIcons\(\);\s*\/\/ eager first pass/);
	// every data-lucide name must exist in the vendored lucide — an unknown name
	// leaves an unhydrated `<i>` forever and the hydration guard spins forever
	const lucide = readFileSync(join(root, "src/hub/public/cdn/lucide-0.469.0.js"), "utf8");
	const pascal = (kebab: string) => kebab.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
	const names = new Set([...html.matchAll(/data-lucide=\"([a-z0-9-]+)\"/g)].map((m) => m[1]));
	for (const name of names) {
		expect(lucide).toContain(pascal(name));
	}
});

test("selection + history timing: empty snapshots keep selection, timestamps only on gaps", () => {
	// transient empty SSE peers arrays must not clear selectedId (row-1 revert bug)
	expect(js).toMatch(/syncSelected\(\) \{\s*if \(!this\.peers\.length\) \{[\s\S]{0,160}return;/);
	// repeated 「1小时前」 timestamps collapse to gap markers (>30min)
	expect(js).toContain("showTimeGap");
	expect(html).toContain('x-show="showTimeGap(drawer.items, itemIdx)"');
});

test("de-labeling: secondary captions/descriptions removed (content explains itself)", () => {
	for (const gone of [
		">身份<", ">Git<", ">关注关系<", ">操作<", ">标题<",
		"查看全部", "跨会话文件时间线", ">关注图<",
		"个实例", "左侧点击会话行", "实例会自动出现在这里", "当前过滤条件没有匹配", "herdr 中的会话可通过",
		"切换深色/浅色主题</span>", "<span>当前视角</span>",
		"搜索/命令</span>", "<span>发消息</span>", "<span>终端</span>", "· 关注", "term-title",
	]) {
		expect(html).not.toContain(gone);
	}
	// CommandBar hint column died (qualifiers like herdr peer / offline/closed stay)
	expect(js).not.toContain("选中当前行");
	expect(js).not.toContain("选中并聚焦输入框");
	expect(js).toContain("herdr peer");
	expect(js).toContain("offline/closed");
	// kv names survive where values are ambiguous (System-Information grammar)
	for (const kept of ["cwd", "model", "pid", "启动于", "恢复记录", "未关联 Git"]) expect(html).toContain(kept);
	// role chips 用户/助手 kept, tree M/A marks are letter-only (CSS hides the word)
	expect(js).toContain("用户");
	expect(css).toContain(".pm-chip-label");
});

/* ---------------- de-native controls + flow review batch ---------------- */

test("de-native controls: custom dropdown + checkbox, zero native chrome", () => {
	// no native selects/radios anywhere; text entry keeps the element but not the chrome
	expect(html).not.toContain("<select");
	expect(html).not.toMatch(/<input[^>]*type="(radio|date|range)"/);
	expect(css).toMatch(/button,[\s\S]{0,80}appearance: none/);
	expect(css).toContain("-webkit-appearance: none");
	// resume-fork checkbox: hidden real input + styled box with Lucide check + accent fill
	expect(html).toContain('class="check-input" type="checkbox"');
	expect(html).toContain("check-box");
	expect(html).toContain("check-on");
	expect(css).toContain(".check-box.check-on");
	expect(css).toContain(".check-input:focus-visible + .check-box");
	// <summary> (review.js 外部命令) de-natived with a custom chevron
	expect(css).toContain("summary::-webkit-details-marker");
	expect(css).toContain(".pm-shell-summary::before");
	// custom dropdown grammar: 24px items, focus row, accent check, keyboard
	expect(css).toContain(".viewer-menu");
	expect(css).toContain(".menu-focus");
	expect(html).toContain("viewer-check");
	expect(js).toMatch(/onViewerKey\(e\)[\s\S]{0,400}ArrowDown/);
});

test("menu exclusivity (P1-2): row/detail/context/viewer menus never stack", () => {
	// shared menuSid was the bug — the detail menu has its own state
	expect(html).not.toContain("menuSid === selectedId");
	expect(html).toContain('x-show="detailMenu && selected"');
	expect(js).toContain("toggleDetailMenu");
	expect(js).toContain("detailMenu: false");
	// opening one popup closes the others
	expect(js).toContain("closePopups");
	expect(js).toMatch(/toggleMenu\(sid, ev\) \{[\s\S]{0,300}this\.detailMenu = false;/);
	// ⋯ click stops bubbling (touch taps open the menu, not the detail push)
	expect(html).toContain('@click.stop="toggleMenu(p.sessionId, $event)"');
	expect(html).toContain('@click.stop="focusComposer(p.sessionId)"');
});

test("flow batch: mobile tabs exit detail, window-scope keys with guards, dead-link toast", () => {
	// P1-1: bottom tab taps push out of the detail overlay first
	for (const tab of ['sessions', 'discover', 'settings']) {
		expect(html).toContain(`mobileTab = '${tab}'; mobileView = 'list'`);
	}
	// P1-3: keyboard model is window-scoped and never hijacks typing/controls/terminal
	expect(js).toMatch(/onListKey\(e\) \{\s*if \(!e \|\| e\.metaKey[\s\S]{0,700}isContentEditable/);
	expect(js).toMatch(/this\.cmd\.open \|\| this\.confirmAction \|\| this\.ctx\.open \|\| this\.menuSid \|\| this\.detailMenu \|\| this\.viewerOpen/);
	expect(js).toContain('t.closest(".term-panel")');
	// P2: mobile 发消息 pushes + focuses the composer; dead deep links normalize + toast
	expect(js).toMatch(/focusComposer\(sid\) \{[\s\S]{0,200}this\.mobileView = "detail";/);
	expect(js).toContain("该会话已不存在");
	// P2: bare-basename rows carry a quiet parent-dir disambiguator
	expect(js).toContain("parentDirLabel");
	expect(html).toContain("row-sub");
	expect(html).toContain("parentDirLabel(p)");
	// P2: 加载更早 shows two skeleton blocks while the older page prepends
	expect(html).toContain("older-cue");
	expect(html).toContain("加载更早");
});

test("de-label remnants: tool-run chevron toggle, cmdk prefixes, review header", () => {
	// tool-run expand is a chevron (aria keeps 展开/收起); the head title no longer explains clicks
	expect(html).toContain("toolrun-expand");
	expect(html).toContain("textOpen(te.id) ? '收起' : '展开'"); // aria-label/title only
	expect(html).not.toContain('x-html="esc(textOpen(te.id)');
	expect(html).not.toContain("点击展开");
	expect(html).not.toContain("点击收起");
	// cmdk filter items no longer repeat the 过滤状态 group header
	expect(js).not.toContain("过滤状态: ");
	// review.js header restates the Review tab — hidden, stats stay
	expect(css).toContain(".pm-review-title");
	expect(css).toMatch(/\.detail-pane \.pm-review-title\s*{[^}]*display: none/);
});
