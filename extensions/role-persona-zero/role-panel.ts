/**
 * Role panel - master-detail overlay picker for roles.
 *
 * Left: filterable role list with L/P/E counts and status markers.
 * Right: live preview of the cursor role (identity, memory stats, directory
 * mappings, core prompt). Narrow terminals (< 72 inner cols) fall back to a
 * single list column with inline identity.
 *
 * Rendering contract: every returned line is exactly `width` visible columns.
 * Printable keys are reserved for type-to-filter; actions live on chords.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Input, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component, Focusable, TUI, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";

interface ThemeLike {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

export interface RolePanelEntry {
	name: string;
	displayName: string;
	emoji?: string;
	learnings: number;
	preferences: number;
	events: number;
	pending: number;
	firstRun: boolean;
	isDefault: boolean;
	isCurrent: boolean;
	mappedToCwd: boolean;
}

export interface RolePanelDetail {
	/** Directories mapped to this role. */
	mappings: string[];
	/** Core prompt body - previewed in the detail pane. */
	corePrompt: string;
}

export interface RolePanelOptions {
	tui: TUI;
	theme: ThemeLike;
	entries: RolePanelEntry[];
	/** Lazy detail provider - only the cursor role is requested per render. */
	detail: (roleName: string) => RolePanelDetail;
	/** Status line content, e.g. "目录: ~/x → zero (mapped)". */
	scopeLine: string;
	/** "control" exposes mapping/config actions; "select" is Enter/Esc only. */
	mode?: "control" | "select";
	done: (result?: string) => void;
}

/** Action tokens returned through done(). */
// "map:<role>" | "create" | "default:<role>" | "disable" | "injection" | "memories" | "status" | "config"

const CONTROL_HINTS = [
	"Enter 映射并激活 · ^N 新建 · ^D 默认 · ^X 禁用 · ^P 注入 · ^V 记忆 · ^R 状态 · ^G 配置 · Esc",
	"Enter 映射并激活 · ^N 新建 · ^P 注入 · Esc",
	"Enter · Esc",
];
const SELECT_HINTS = ["Enter 选择 · ^N 新建 · Esc", "Enter · Esc"];

// -----------------------------------------------------------------------------
// Width helpers (render contract: segments are exactly `w` visible columns)
// -----------------------------------------------------------------------------

function seg(text: string, w: number): string {
	const fitted = truncateToWidth(text, w);
	const pad = w - visibleWidth(fitted);
	return pad > 0 ? fitted + " ".repeat(pad) : fitted;
}

function wrapToWidth(text: string, w: number): string[] {
	if (w <= 0) return [];
	const out: string[] = [];
	for (const raw of text.split("\n")) {
		let line = "";
		let lineW = 0;
		for (const ch of raw) {
			const cw = visibleWidth(ch);
			if (lineW + cw > w) {
				out.push(line);
				line = "";
				lineW = 0;
			}
			line += ch;
			lineW += cw;
		}
		out.push(line);
	}
	return out;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export class RolePanelComponent implements Component, Focusable {
	private query = "";
	private filtered: RolePanelEntry[] = [];
	private cursor = 0;
	private scrollOffset = 0;
	private previewOffset = 0;
	private bodyRows = 12;
	private rowMap: number[] = [];
	private rowRegion: Array<"list" | "detail"> = [];
	private pressedIndex: number | undefined;
	private hoveredIndex: number | undefined;
	private _focused = false;
	private detailLines: string[] = [];

	private readonly input: Input;
	private readonly mode: "control" | "select";

	get focused(): boolean { return this._focused; }
	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	constructor(private opts: RolePanelOptions) {
		this.mode = opts.mode ?? "control";
		this.applyFilter();

		// Prefer the live role, then the cwd mapping, then the default role.
		const initialIdx = [
			this.filtered.findIndex((e) => e.isCurrent),
			this.filtered.findIndex((e) => e.mappedToCwd),
			this.filtered.findIndex((e) => e.isDefault),
		].find((idx) => idx !== undefined && idx >= 0);
		this.cursor = initialIdx ?? 0;

		this.input = new Input();
		this.input.onSubmit = () => this.activate();
		this.input.onEscape = () => this.opts.done(undefined);
	}

	// -------------------------------------------------------------------------
	// Filtering / navigation
	// -------------------------------------------------------------------------

	private applyFilter(): void {
		const q = this.query.trim().toLowerCase();
		const current = this.filtered[this.cursor]?.name;
		this.filtered = !q
			? [...this.opts.entries]
			: this.opts.entries.filter((e) =>
				e.name.toLowerCase().includes(q) || e.displayName.toLowerCase().includes(q));
		const kept = current ? this.filtered.findIndex((e) => e.name === current) : -1;
		this.cursor = kept >= 0 ? kept : 0;
		this.hoveredIndex = undefined;
		this.previewOffset = 0;
		this.clampScroll();
	}

	private moveCursor(delta: number): void {
		if (!this.filtered.length) return;
		this.cursor = Math.max(0, Math.min(this.filtered.length - 1, this.cursor + delta));
		this.previewOffset = 0;
		this.clampScroll();
		this.opts.tui.requestRender();
	}

	private clampScroll(): void {
		const maxScroll = Math.max(0, this.filtered.length - this.bodyRows);
		if (this.cursor < this.scrollOffset) this.scrollOffset = this.cursor;
		else if (this.cursor >= this.scrollOffset + this.bodyRows) this.scrollOffset = this.cursor - this.bodyRows + 1;
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
	}

	// -------------------------------------------------------------------------
	// Actions
	// -------------------------------------------------------------------------

	private activate(): void {
		const entry = this.filtered[this.cursor];
		if (entry) this.opts.done(`map:${entry.name}`);
	}

	private action(token: string): void {
		if (this.mode !== "control") return;
		this.opts.done(token);
	}

	// -------------------------------------------------------------------------
	// Render
	// -------------------------------------------------------------------------

	invalidate(): void {}

	private renderListRow(index: number, w: number, wide: boolean): string {
		const entry = this.filtered[index];
		if (!entry) return " ".repeat(w);
		const A = (t: string) => this.opts.theme.fg("accent", t);
		const D = (t: string) => this.opts.theme.fg("dim", t);
		const selected = index === this.cursor;
		const hovered = index === this.hoveredIndex;
		const prefix = selected ? "> " : hovered ? "- " : "  ";
		const decorate = selected ? A : hovered ? (t: string) => this.opts.theme.bold(t) : (t: string) => t;

		const markers = [
			entry.isCurrent ? "●当前" : "",
			entry.isDefault ? "★默认" : "",
			entry.mappedToCwd ? "→本目录" : "",
			entry.firstRun ? "⚠初始化" : "",
		].filter(Boolean).join(" ");

		if (wide) {
			const badge = markers || `${entry.learnings}/${entry.preferences}/${entry.events}`;
			const badgeW = visibleWidth(badge);
			const label = `${entry.emoji ? entry.emoji + " " : ""}${entry.name}${entry.displayName ? ` · ${entry.displayName}` : ""}`;
			const left = seg(prefix + label, w - badgeW - 1);
			return decorate(left) + " " + D(seg(badge, badgeW));
		}

		const label = `${entry.emoji ? entry.emoji + " " : ""}${entry.name}${entry.displayName ? ` · ${entry.displayName}` : ""}${markers ? `  ${markers}` : ""}`;
		return decorate(seg(prefix + label, w));
	}

	private buildDetail(rw: number): string[] {
		const entry = this.filtered[this.cursor];
		if (!entry || rw <= 8) return [];
		const A = (t: string) => this.opts.theme.fg("accent", t);
		const D = (t: string) => this.opts.theme.fg("dim", t);
		const out: string[] = [];

		const head = `${entry.emoji ? entry.emoji + " " : ""}${entry.name}${entry.displayName ? ` · ${entry.displayName}` : ""}`;
		out.push(A(truncateToWidth(head, rw)));

		const markers = [
			entry.isCurrent ? "● 当前生效" : "",
			entry.isDefault ? "★ 默认角色" : "",
			entry.mappedToCwd ? "→ 映射到本目录" : "",
		].filter(Boolean).join(" · ");
		if (markers) out.push(D(seg(markers, rw)));
		if (entry.firstRun) out.push(this.opts.theme.fg("warning", seg("⚠ 首次运行 - 需要初始化", rw)));

		out.push(D(seg(
			`记忆: L${entry.learnings} · P${entry.preferences} · E${entry.events} · pending ${entry.pending}`,
			rw
		)));

		const detail = this.opts.detail(entry.name);
		out.push(D(seg("映射目录:", rw)));
		if (!detail.mappings.length) {
			out.push(D(seg("  （无）", rw)));
		} else {
			for (const dir of detail.mappings.slice(0, 4)) out.push(D(seg(`  ${dir}`, rw)));
			if (detail.mappings.length > 4) out.push(D(seg(`  … +${detail.mappings.length - 4} more`, rw)));
		}

		out.push(D("─".repeat(rw)));
		const promptLines = wrapToWidth(detail.corePrompt.trim(), rw)
			.filter((line, i, arr) => !(i === arr.length - 1 && line === ""));
		if (!promptLines.length) {
			out.push(D("(core prompt 为空)"));
		} else {
			for (const line of promptLines) out.push(seg(line, rw));
		}
		return out;
	}

	render(width: number): string[] {
		const W = Math.max(24, width);
		const inner = W - 2;
		const wide = inner >= 72;
		const lw = wide ? Math.min(62, Math.max(30, Math.floor(inner * 0.42))) : inner;
		const rw = wide ? inner - lw - 1 : 0;
		this.bodyRows = Math.max(10, Math.min(45, Math.floor((process.stdout.rows ?? 30) * 0.94) - 8));

		const B = (t: string) => this.opts.theme.fg("border", t);
		const A = (t: string) => this.opts.theme.fg("accent", t);
		const D = (t: string) => this.opts.theme.fg("dim", t);

		this.clampScroll();
		this.detailLines = this.buildDetail(rw);
		this.previewOffset = Math.max(0, Math.min(this.previewOffset, Math.max(0, this.detailLines.length - this.bodyRows)));

		const lines: string[] = [];
		this.rowMap = [];
		this.rowRegion = [];
		const push = (line: string, rowIndex = -1, region: "list" | "detail" = "list") => {
			lines.push(line);
			this.rowMap.push(rowIndex);
			this.rowRegion.push(region);
		};

		const total = this.opts.entries.length;
		const title = this.query.trim() ? ` "${this.query.trim()}" (${this.filtered.length}) ` : ` 角色 (${this.filtered.length}/${total}) `;
		const tPad = Math.max(0, inner - visibleWidth(title));
		const tL = Math.floor(tPad / 2);
		const tR = tPad - tL;
		push(B("╭" + "─".repeat(tL)) + A(title) + B("─".repeat(tR) + "╮"));

		const search = ` > ${this.input.getValue()}${this._focused ? "█" : ""}`;
		const scopeW = wide ? Math.min(visibleWidth(this.opts.scopeLine), inner - 20) : 0;
		push(B("│") + seg(search, inner - scopeW) + (wide ? D(seg(this.opts.scopeLine, scopeW)) : "") + B("│"));

		push(B("├" + "─".repeat(lw)) + (wide ? B("┼" + "─".repeat(rw)) : "") + B("┤"));

		const detailWindow = this.detailLines.slice(this.previewOffset, this.previewOffset + this.bodyRows);
		const previewRemaining = Math.max(0, this.detailLines.length - (this.previewOffset + this.bodyRows));
		for (let i = 0; i < this.bodyRows; i++) {
			const index = this.scrollOffset + i;
			const left = this.renderListRow(index, lw, wide);
			if (!wide) {
				push(B("│") + left + B("│"), index);
				continue;
			}
			let detailText = detailWindow[i] ?? "";
			if (i === this.bodyRows - 1 && previewRemaining > 0) {
				detailText = D(seg(`… +${previewRemaining} more`, rw));
			}
			push(B("│") + left + B("│") + seg(detailText, rw) + B("│"), index);
		}

		const hints = this.mode === "control" ? CONTROL_HINTS : SELECT_HINTS;
		const footerBase = ` [${Math.max(1, this.cursor + 1)}/${Math.max(1, this.filtered.length)}] `;
		let footer = footerBase + hints[hints.length - 1];
		for (const hint of hints) {
			const candidate = footerBase + hint;
			if (visibleWidth(candidate) <= inner) {
				footer = candidate;
				break;
			}
		}
		const fText = truncateToWidth(footer, inner);
		const fPad = Math.max(0, inner - visibleWidth(fText));
		const fL = Math.floor(fPad / 2);
		const fR = fPad - fL;
		push(B("├" + "─".repeat(lw)) + (wide ? B("┼" + "─".repeat(rw)) : "") + B("┤"));
		push(B("╰" + "─".repeat(fL)) + D(fText) + B("─".repeat(fR) + "╯"));

		return lines.map((line) => truncateToWidth(line, W));
	}

	// -------------------------------------------------------------------------
	// Input
	// -------------------------------------------------------------------------

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			if (this.input.getValue()) {
				this.input.setValue("");
				this.query = "";
				this.applyFilter();
				this.opts.tui.requestRender();
			} else {
				this.opts.done(undefined);
			}
			return;
		}
		if (matchesKey(data, "ctrl+c")) { this.opts.done(undefined); return; }
		if (matchesKey(data, "return")) { this.activate(); return; }
		if (matchesKey(data, "up")) { this.moveCursor(-1); return; }
		if (matchesKey(data, "down")) { this.moveCursor(1); return; }
		if (matchesKey(data, "pageup")) { this.moveCursor(-this.bodyRows); return; }
		if (matchesKey(data, "pagedown")) { this.moveCursor(this.bodyRows); return; }
		if (matchesKey(data, "home")) { this.moveCursor(-this.filtered.length); return; }
		if (matchesKey(data, "end")) { this.moveCursor(this.filtered.length); return; }

		if (this.mode === "control") {
			if (matchesKey(data, "ctrl+n")) { this.opts.done("create"); return; }
			const entry = this.filtered[this.cursor];
			if (matchesKey(data, "ctrl+d")) {
				if (entry) this.opts.done(`default:${entry.name}`);
				return;
			}
			if (matchesKey(data, "ctrl+x")) { this.action("disable"); return; }
			if (matchesKey(data, "ctrl+p")) { this.action("injection"); return; }
			if (matchesKey(data, "ctrl+v")) { this.action("memories"); return; }
			if (matchesKey(data, "ctrl+r")) { this.action("status"); return; }
			if (matchesKey(data, "ctrl+g")) { this.action("config"); return; }
		} else if (matchesKey(data, "ctrl+n")) {
			this.opts.done("create");
			return;
		}

		const prev = this.input.getValue();
		this.input.handleInput(data);
		if (this.input.getValue() !== prev) {
			this.query = this.input.getValue();
			this.applyFilter();
		}
		this.opts.tui.requestRender();
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		const region = this.rowRegion[event.y];
		const index = this.rowMap[event.y];

		if (event.type === "wheel" && event.wheelDelta) {
			if (region === "detail") {
				this.previewOffset = Math.max(0, this.previewOffset + event.wheelDelta);
				this.opts.tui.requestRender();
			} else {
				this.moveCursor(event.wheelDelta);
			}
			return { handled: true, render: false };
		}
		if (event.type === "move" && event.button === "none") {
			const next = region === "list" && index !== undefined && index >= 0 ? index : undefined;
			if (next === this.hoveredIndex) return { handled: true, render: false };
			this.hoveredIndex = next;
			return { handled: true, render: true };
		}
		if (event.button !== "left" || (event.type !== "press" && event.type !== "click")) return undefined;
		if (region !== "list" || index === undefined || index < 0) return undefined;

		if (event.type === "press") {
			this.pressedIndex = index;
			this.cursor = index;
			this.previewOffset = 0;
			this.clampScroll();
			this.opts.tui.requestRender();
			return { handled: true, focus: true };
		}
		const target = this.pressedIndex ?? index;
		this.pressedIndex = undefined;
		// Clicking the already-selected row activates it; otherwise just select.
		if (target === this.cursor) this.activate();
		else {
			this.cursor = target;
			this.previewOffset = 0;
			this.clampScroll();
			this.opts.tui.requestRender();
		}
		return { handled: true };
	}
}

// =============================================================================
// Public API
// =============================================================================

export async function showRolePanel(
	ctx: ExtensionContext,
	options: Omit<RolePanelOptions, "tui" | "theme" | "done">
): Promise<string | undefined> {
	return await ctx.ui.custom<string | undefined>(
		(tui, theme, _kb, done) => {
			const component = new RolePanelComponent({
				...options,
				tui,
				theme: theme as unknown as ThemeLike,
				done,
			});
			component.focused = true;

			return {
				render: (w: number) => component.render(w),
				invalidate: () => component.invalidate(),
				handleInput: (d: string) => component.handleInput(d),
				handleMouse: (event: TuiMouseEvent) => component.handleMouse(event),
			};
		},
		{
			overlay: true,
			overlayOptions: { anchor: "center", width: "94%", minWidth: 88, maxHeight: "96%" },
		}
	);
}
