/**
 * Interactive pi-mesh status panel for the pi TUI, opened by `/mesh`.
 *
 * All lines are fitted to the viewport width (CJK-aware), never wrapped by the
 * terminal. Colors come from Pi's active theme (see paletteFromTheme).
 */

import os from "node:os";
import type { TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import type { PeerView, TranscriptEntry } from "./protocol.ts";

// ── ANSI + width helpers ─────────────────────────────────────────────────

export type MeshThemeColor =
	| "accent" | "dim" | "border" | "text" | "muted" | "success" | "warning" | "error";

/** Minimal structural contract for Pi's active theme. */
export interface MeshTheme {
	fg(color: MeshThemeColor, text: string): string;
	bold(text: string): string;
}

interface MeshPalette {
	reset: string;
	bold: string;
	dim: string;
	border: string;
	text: string;
	accent: string;
	muted: string;
	success: string;
	warning: string;
	error: string;
}

const PALETTE_MARKER = "\u0001";

/**
 * The panel builds lines by concatenating style prefixes, while Theme.fg wraps
 * a whole string. Derive the prefixes once from the active theme so every call
 * site keeps its geometry and gains theme-aware colors.
 */
function paletteFromTheme(theme: MeshTheme): MeshPalette {
	const open = (wrapped: string): string => {
		const at = wrapped.indexOf(PALETTE_MARKER);
		return at < 0 ? "" : wrapped.slice(0, at);
	};
	return {
		// SGR reset is theme-independent; only colors come from the theme.
		reset: "\x1b[0m",
		bold: open(theme.bold(PALETTE_MARKER)),
		dim: open(theme.fg("dim", PALETTE_MARKER)),
		border: open(theme.fg("border", PALETTE_MARKER)),
		text: open(theme.fg("text", PALETTE_MARKER)),
		accent: open(theme.fg("accent", PALETTE_MARKER)),
		muted: open(theme.fg("muted", PALETTE_MARKER)),
		success: open(theme.fg("success", PALETTE_MARKER)),
		warning: open(theme.fg("warning", PALETTE_MARKER)),
		error: open(theme.fg("error", PALETTE_MARKER)),
	};
}

const ESCAPE = /\x1b\[[0-9;]*m/g;

/** Display width: ANSI-free, CJK/wide chars count 2. */
export function displayWidth(text: string): number {
	const plain = text.replace(ESCAPE, "");
	let w = 0;
	for (const ch of plain) {
		const cp = ch.codePointAt(0) ?? 0;
		w += (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) ? 2 : 1;
	}
	return w;
}

/** Fit a (possibly colored) line to width, preserving ANSI styling on truncation. */
export function fit(line: string, width: number): string {
	if (width <= 0) return "";
	const visible = displayWidth(line);
	if (visible <= width) return line + " ".repeat(width - visible);

	let out = "";
	let used = 0;
	let index = 0;
	let openStyles = 0;
	while (index < line.length) {
		if (line[index] === "\x1b" && line[index + 1] === "[") {
			const sgr = /^\x1b\[[0-9;]*m/.exec(line.slice(index));
			if (sgr) {
				out += sgr[0];
				index += sgr[0].length;
				if (sgr[0] === "\x1b[0m") openStyles = 0;
				else openStyles++;
				continue;
			}
		}
		const ch = line[index]!;
		const cw = displayWidth(ch);
		if (used + cw > width - 1) break;
		out += ch;
		used += cw;
		index++;
	}
	// Close any style still open before the ellipsis so it stays neutral.
	return out + (openStyles > 0 ? "\x1b[0m" : "") + "…" + " ".repeat(Math.max(0, width - used - 1));
}

const B = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };

/** Peer-provided strings can contain newlines/control bytes; keep rows single-line. */
function cleanText(value: string): string {
	return value
		.replace(ESCAPE, "")
		.replace(/[\x00-\x1f\x7f]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tildePath(cwd: string): string {
	const home = process.env.HOME ?? os.homedir();
	if (!home) return cwd;
	if (cwd === home) return "~";
	if (cwd.startsWith(`${home}/`) || cwd.startsWith(`${home}\\`)) return `~${cwd.slice(home.length)}`;
	return cwd;
}

// ── row model (pure; unit-tested) ────────────────────────────────────────

export type MeshFilter = "active" | "all" | "closed";

export interface BuildRowsOptions {
	filter?: MeshFilter;
	expandedClosed?: boolean;
	/** Alias for callers that mirror the collapsed row's field name. */
	expanded?: boolean;
	query?: string;
}

export type MeshRow =
	| { kind: "group"; label: string }
	| { kind: "collapsed"; label: string; count: number; expanded: boolean }
	| { kind: "peer"; peer: PeerView };

const FILTER_LABEL: Record<MeshFilter, string> = {
	active: "活跃",
	all: "全部",
	closed: "已关闭",
};

const STATE_STYLE: Record<string, { sym: string; color: MeshThemeColor; label: string }> = {
	running: { sym: "▶", color: "success", label: "运行中" },
	waiting: { sym: "•", color: "warning", label: "等待" },
	offline: { sym: "○", color: "error", label: "离线" },
	closed: { sym: "✕", color: "muted", label: "已关闭" },
};

const STATE_RANK: Record<string, number> = { running: 0, waiting: 1, offline: 2, closed: 3 };

const COLLAPSED_ID = "\u0000closed";

function isSelectableRow(row: MeshRow): boolean {
	return row.kind === "peer" || row.kind === "collapsed";
}

function rowKey(row: MeshRow): string {
	if (row.kind === "peer") return row.peer.sessionId;
	if (row.kind === "collapsed") return COLLAPSED_ID;
	return "";
}

/** Last two path segments: absolute repo paths are noise in a narrow column. */
export function repoLabel(repoRoot: string | null | undefined): string {
	if (!repoRoot) return "(无仓库)";
	const parts = repoRoot.split(/[\\/]+/).filter(Boolean);
	return parts.length === 0 ? repoRoot : parts.slice(-2).join("/");
}

function branchLabel(peer: PeerView): string {
	const branch = peer.git?.branch ?? "(无分支)";
	return peer.git?.worktree === "linked" ? `${branch} [linked]` : branch;
}

function searchText(peer: PeerView): string {
	return [peer.title ?? "", peer.sessionId.slice(-8), peer.git?.branch ?? "", repoLabel(peer.git?.repoRoot), peer.cwd]
		.join("\n")
		.toLowerCase();
}

function matchesQuery(peer: PeerView, query: string): boolean {
	const q = query.trim().toLowerCase();
	return q.length === 0 || searchText(peer).includes(q);
}

function byState(a: PeerView, b: PeerView): number {
	return (
		(STATE_RANK[a.state] ?? 4) - (STATE_RANK[b.state] ?? 4) ||
		Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
		a.sessionId.localeCompare(b.sessionId)
	);
}

function bestStateRank(peers: PeerView[]): number {
	let best = 4;
	for (const peer of peers) best = Math.min(best, STATE_RANK[peer.state] ?? 4);
	return best;
}

function groupPeers(peers: PeerView[]): MeshRow[] {
	if (peers.length === 0) return [];
	const byRepo = new Map<string, PeerView[]>();
	for (const peer of peers) {
		const root = peer.git?.repoRoot ?? "";
		const list = byRepo.get(root);
		if (list) list.push(peer);
		else byRepo.set(root, [peer]);
	}
	const roots = [...byRepo.keys()].sort((a, b) => {
		if (a === b) return 0;
		if (!a) return 1;
		if (!b) return -1;
		return (
			bestStateRank(byRepo.get(a)!) - bestStateRank(byRepo.get(b)!) ||
			repoLabel(a).localeCompare(repoLabel(b)) ||
			a.localeCompare(b)
		);
	});
	const rows: MeshRow[] = [];
	for (const root of roots) {
		const list = byRepo.get(root)!;
		if (!root) {
			rows.push({ kind: "group", label: "(无仓库)" });
			for (const peer of list.sort(byState)) rows.push({ kind: "peer", peer });
			continue;
		}
		const byBranch = new Map<string, PeerView[]>();
		for (const peer of list) {
			const branch = branchLabel(peer);
			const bucket = byBranch.get(branch);
			if (bucket) bucket.push(peer);
			else byBranch.set(branch, [peer]);
		}
		const branches = [...byBranch.entries()].sort(
			(a, b) => bestStateRank(a[1]) - bestStateRank(b[1]) || a[0].localeCompare(b[0]),
		);
		const repo = repoLabel(root);
		if (branches.length === 1) {
			const [branch, branchPeers] = branches[0]!;
			rows.push({ kind: "group", label: `${repo} / ${branch} · ${branchPeers.length}` });
			for (const peer of branchPeers.sort(byState)) rows.push({ kind: "peer", peer });
			continue;
		}
		rows.push({ kind: "group", label: repo });
		for (const [branch, branchPeers] of branches) {
			rows.push({ kind: "group", label: `  ── ${branch} · ${branchPeers.length}` });
			for (const peer of branchPeers.sort(byState)) rows.push({ kind: "peer", peer });
		}
	}
	return rows;
}

/**
 * Build the visible row model. Closed peers are summarized under `active` (so
 * they stay discoverable) and grouped only when `all` is expanded or `closed`
 * is selected. A query narrows the current filter; closed matches remain a
 * summary under `active`.
 */
export function buildRows(peers: PeerView[], opts: BuildRowsOptions = {}): MeshRow[] {
	const filter = opts.filter ?? "active";
	const expandedClosed = opts.expandedClosed ?? opts.expanded ?? false;
	const query = (opts.query ?? "").trim();
	const activePeers = peers.filter((peer) => peer.state !== "closed");
	const closedPeers = peers.filter((peer) => peer.state === "closed");
	const rows: MeshRow[] = [];

	if (filter === "active" || filter === "all") {
		rows.push(...groupPeers(activePeers.filter((peer) => matchesQuery(peer, query))));
	}

	const matchedClosed = closedPeers.filter((peer) => matchesQuery(peer, query));

	if (filter === "active") {
		// The summary is not a closed peer row; it keeps the count visible without
		// letting 25 dead sessions bury the active ones. During a search it only
		// appears when something closed actually matched.
		const summaryCount = query.length === 0 ? closedPeers.length : matchedClosed.length;
		if (summaryCount > 0) {
			rows.push({ kind: "collapsed", label: "已关闭", count: summaryCount, expanded: false });
		}
		return rows;
	}

	if (filter === "all") {
		if (matchedClosed.length > 0) {
			rows.push({ kind: "collapsed", label: "已关闭", count: matchedClosed.length, expanded: expandedClosed });
			if (expandedClosed) rows.push(...groupPeers(matchedClosed));
		}
		return rows;
	}

	rows.push(...groupPeers(matchedClosed));
	return rows;
}

/** Closed peers age from `closedAt`; live peers from `startedAt`. Never heartbeat. */
export function formatAge(peer: PeerView, now: number): string {
	const iso = peer.state === "closed" ? (peer.closedAt ?? peer.startedAt) : peer.startedAt;
	const ms = now - Date.parse(iso);
	if (!Number.isFinite(ms)) return "-";
	const seconds = Math.max(0, Math.floor(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.min(999, Math.floor(hours / 24))}d`;
}

/** A body line with only borders/padding has no visible content. */
function hasBodyContent(line: string): boolean {
	return line.replace(ESCAPE, "").replace(/[│\s]/g, "").length > 0;
}

/** Drop trailing padding rows; the scroll window still uses the full body height. */
function trimBody(lines: string[]): string[] {
	let end = lines.length;
	while (end > 1 && !hasBodyContent(lines[end - 1]!)) end--;
	return lines.slice(0, end);
}

/**
 * One-cell scrollbar column: `█` thumb, `░` track, spaces when content fits.
 * Pure geometry so hit-testing and rendering share one source of truth.
 */
export function scrollbarColumn(total: number, offset: number, height: number): string[] {
	if (height <= 0) return [];
	if (total <= height) return Array.from({ length: height }, () => " ");
	const view = Math.max(1, height);
	const max = total - view;
	const thumbHeight = Math.max(1, Math.round((view * view) / total));
	const start = Math.round(((view - thumbHeight) * Math.min(max, Math.max(0, offset))) / max);
	return Array.from({ length: height }, (_, i) => (i >= start && i < start + thumbHeight ? "█" : "░"));
}

/** Keep the selected row inside the window without jumping when it is already visible. */
export function scrollWindow(total: number, selectedIndex: number, height: number, offset = 0): number {
	const rows = Math.max(0, Math.floor(total));
	const view = Math.max(1, Math.floor(height));
	if (rows === 0) return 0;
	const max = Math.max(0, rows - view);
	let start = Math.min(max, Math.max(0, Math.floor(offset)));
	const selected = Math.min(rows - 1, Math.max(0, Math.floor(selectedIndex)));
	if (selected < start) start = selected;
	else if (selected >= start + view) start = selected - view + 1;
	return Math.min(max, Math.max(0, start));
}

// ── panel ────────────────────────────────────────────────────────────────

/** Injected so the panel needs no pi-tui runtime import (keeps unit tests standalone). */
export interface MeshKeys {
	up(data: string): boolean;
	down(data: string): boolean;
	pageUp(data: string): boolean;
	pageDown(data: string): boolean;
	right(data: string): boolean;
	left(data: string): boolean;
}

export interface MeshPanelDeps {
	keys: MeshKeys;
	fetchPeers(): Promise<PeerView[]>;
	fetchTranscript(sessionId: string, limit: number): Promise<TranscriptEntry[]>;
	setFollow(targetSessionId: string, following: boolean): Promise<void>;
	resume(peer: PeerView): Promise<{ ok: boolean; message: string }>;
	selfSessionId: string | null;
	now(): number;
	requestRender(): void;
	onClose(): void;
	/** Pi's active theme; the panel must not hard-code colors. */
	theme: MeshTheme;
	/** Injected by the host so body height follows the real terminal. */
	viewport?: () => { width: number; height: number };
}

export class MeshPanel {
	#deps: MeshPanelDeps;
	#C: MeshPalette;
	#peers: PeerView[] = [];
	#rows: MeshRow[] = [];
	#filter: MeshFilter = "active";
	#expandedClosed = false;
	#query = "";
	#searchMode = false;
	#searchReturnId: string | null = null;
	#help = false;
	#focus: "list" | "detail" = "list";
	#selectedId: string | null = null;
	#scrollOffset = 0;
	#detailPeer: PeerView | null = null;
	#detailEntries: TranscriptEntry[] = [];
	#detailOpen = false;
	#detailScroll = 0;
	#detailLineCount = 0;
	#detailLoading = false;
	#detailToken = 0;
	#status = "加载中…";
	#statusError = false;
	#width = 100;
	#splitX = 0;
	#rowMap: number[] = [];
	#pressedIndex: number | undefined;
	#hoveredIndex: number | undefined;
	/** Active pointer capture: row drag-select, or scrollbar thumb tracking. */
	#drag: { kind: "row" | "listbar" | "detailbar"; y: number; value: number } | undefined;
	/** Rendered scrollbar columns (null when that area is not on screen). */
	#listBarX: number | null = null;
	#detailBarX: number | null = null;
	#loading = false;
	#pendingResume: PeerView | null = null;

	constructor(deps: MeshPanelDeps) {
		this.#deps = deps;
		this.#C = paletteFromTheme(deps.theme);
		this.#width = deps.viewport?.().width ?? 100;
		void this.refresh();
	}

	async refresh(quiet = false): Promise<void> {
		if (this.#loading) return;
		this.#loading = true;
		if (!quiet) this.#setStatus("加载中…");
		this.#deps.requestRender();
		try {
			this.#peers = await this.#deps.fetchPeers();
			this.#rebuildRows();
			// The title already shows the counts; a lingering echo line is noise.
			if (!quiet) this.#setStatus("");
		} catch (err) {
			this.#setStatus(`加载失败: ${err instanceof Error ? err.message : String(err)}`, true);
		} finally {
			this.#loading = false;
			this.#deps.requestRender();
		}
	}

	invalidate(): void {
		this.#C = paletteFromTheme(this.#deps.theme);
		this.#deps.requestRender();
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.type === "wheel" && event.wheelDelta) {
			const detail = this.#isWide() ? event.x >= this.#splitX : this.#detailOpen;
			if (detail) this.#scrollDetail(event.wheelDelta);
			else this.#move(event.wheelDelta);
			return { handled: true };
		}

		// Plain pointer motion only; hover never changes the selection.
		if (event.type === "move" && event.button === "none") {
			const inDetail = this.#isWide() ? event.x >= this.#splitX : this.#detailOpen;
			const row = inDetail ? undefined : this.#rowMap[event.y];
			const next = row === undefined || row < 0 ? undefined : row;
			if (next === this.#hoveredIndex) return { handled: true, render: false };
			this.#hoveredIndex = next;
			return { handled: true, render: true };
		}

		// Captured drag: row drag-select or scrollbar thumb tracking.
		if (event.type === "drag") {
			const drag = this.#drag;
			if (!drag) return undefined;
			if (drag.kind === "detailbar") {
				this.#jumpDetailBar(event.y);
				return { handled: true };
			}
			if (drag.kind === "listbar") {
				this.#jumpListBar(event.y);
				return { handled: true };
			}
			const row = this.#rowMap[event.y];
			if (row === undefined || row < 0) {
				// Off the visible rows: auto-scroll at the edge.
				this.#move(event.y < 1 ? -1 : 1);
			} else {
				this.#move(row - this.#selectedRowIndex());
			}
			return { handled: true };
		}

		if (event.type === "release") {
			this.#drag = undefined;
			this.#pressedIndex = undefined;
			return undefined;
		}

		// Right click: open the row's detail, or leave the detail panel.
		if (event.type === "click" && event.button === "right") {
			const detail = this.#isWide() ? event.x >= this.#splitX : this.#detailOpen;
			if (detail) {
				this.#backToList();
				return { handled: true };
			}
			const index = this.#rowMap[event.y];
			if (index === undefined || index < 0) return { handled: true };
			this.#selectIndex(index);
			this.#enter();
			return { handled: true };
		}

		if (event.button !== "left" || (event.type !== "press" && event.type !== "click")) return undefined;
		const detail = this.#isWide() ? event.x >= this.#splitX : this.#detailOpen;
		// Scrollbar columns capture so drag keeps tracking the thumb.
		if (event.type === "press" && this.#detailBarX !== null && event.x === this.#detailBarX && detail) {
			this.#drag = { kind: "detailbar", y: event.y, value: 0 };
			this.#jumpDetailBar(event.y);
			return { handled: true, capture: true };
		}
		if (event.type === "press" && this.#listBarX !== null && event.x === this.#listBarX && !detail) {
			this.#drag = { kind: "listbar", y: event.y, value: 0 };
			this.#jumpListBar(event.y);
			return { handled: true, capture: true, focus: true };
		}
		// Detail text keeps the terminal's native drag-to-select.
		if (detail) return undefined;
		const index = this.#rowMap[event.y];
		if (index === undefined || index < 0) return undefined;

		if (event.type === "press") {
			this.#pressedIndex = index;
			this.#drag = { kind: "row", y: event.y, value: index };
			this.#selectIndex(index);
			return { handled: true, capture: true, focus: true };
		}

		const target = this.#pressedIndex ?? index;
		this.#pressedIndex = undefined;
		const row = this.#rows[target];
		if (row && isSelectableRow(row)) {
			this.#selectIndex(target);
			this.#enter();
		}
		return { handled: true };
	}

	handleInput(data: string): void {
		// Resume confirmation intercepts every key until y/n.
		if (this.#pendingResume) {
			this.#handlePendingResume(data);
			return;
		}
		if (this.#searchMode) {
			this.#handleSearchKey(data);
			return;
		}
		if (this.#help) {
			this.#help = false;
			this.#deps.requestRender();
			return;
		}
		if (data === "?") {
			this.#help = true;
			this.#deps.requestRender();
			return;
		}

		const wide = this.#isWide();
		const detailFocused = wide ? this.#focus === "detail" : this.#detailOpen;
		const page = Math.max(1, this.#bodyHeight() - 2);

		if (this.#deps.keys.up(data) || data === "k") {
			if (detailFocused) this.#scrollDetail(-1);
			else this.#move(-1);
			return;
		}
		if (this.#deps.keys.down(data) || data === "j") {
			if (detailFocused) this.#scrollDetail(1);
			else this.#move(1);
			return;
		}
		if (this.#deps.keys.pageUp(data)) {
			if (detailFocused) this.#scrollDetail(-page);
			else this.#move(-page);
			return;
		}
		if (this.#deps.keys.pageDown(data)) {
			if (detailFocused) this.#scrollDetail(page);
			else this.#move(page);
			return;
		}
		if (data === "\t" && wide) {
			this.#focus = this.#focus === "list" ? "detail" : "list";
			this.#syncDetailForSelection();
			this.#deps.requestRender();
			return;
		}
		if (this.#deps.keys.right(data)) {
			const row = this.#selectedRow();
			if (row?.kind === "collapsed") this.#setClosedExpanded(true);
			else if (row?.kind === "peer") this.#enter();
			return;
		}
		if (this.#deps.keys.left(data)) {
			const row = this.#selectedRow();
			if (row?.kind === "collapsed" && this.#expandedClosed) this.#setClosedExpanded(false);
			else if (detailFocused) this.#backToList();
			return;
		}
		if (data === "\r" || data === "\n") {
			this.#enter();
			return;
		}
		if (data === "/") {
			// The no-results hint promises "/ 清除搜索"; pressing slash with a
			// committed query clears it and starts a fresh input instead.
			if (this.#query.length > 0) {
				this.#query = "";
				this.#searchReturnId = null;
				this.#rebuildRows();
			}
			this.#searchMode = true;
			this.#searchReturnId = this.#selectedId;
			this.#detailOpen = false;
			this.#focus = "list";
			this.#deps.requestRender();
			return;
		}
		if (data === "a") {
			if (!detailFocused) this.#cycleFilter();
			return;
		}
		if (data === "f") {
			if (!detailFocused) void this.#toggleFollow();
			return;
		}
		if (data === "R") {
			if (!detailFocused) void this.#askResume();
			return;
		}
		if (data === "r") {
			void this.refresh();
			return;
		}
		if (data === "q") {
			this.#deps.onClose();
			return;
		}
		if (data === "\x1b" || data === "b") {
			if (detailFocused) {
				this.#backToList();
				return;
			}
			if (data === "\x1b") this.#deps.onClose();
		}
	}

	// ── state transitions ───────────────────────────────────────────────

	#setStatus(text: string, error = false): void {
		this.#status = text;
		this.#statusError = error;
	}

	#rebuildRows(): void {
		this.#rows = buildRows(this.#peers, {
			filter: this.#filter,
			expandedClosed: this.#expandedClosed,
			query: this.#query,
		});
		this.#resolveSelection();
		this.#syncScroll();
		this.#syncDetailForSelection();
	}

	#resolveSelection(): void {
		const keys = this.#rows.filter(isSelectableRow).map(rowKey);
		if (this.#selectedId !== null && keys.includes(this.#selectedId)) return;
		this.#selectedId = keys[0] ?? null;
	}

	#selectedRowIndex(): number {
		if (this.#selectedId === null) return -1;
		return this.#rows.findIndex((row) => isSelectableRow(row) && rowKey(row) === this.#selectedId);
	}

	#selectedRow(): MeshRow | null {
		const index = this.#selectedRowIndex();
		return index < 0 ? null : (this.#rows[index] ?? null);
	}

	#selectedPeer(): PeerView | null {
		const row = this.#selectedRow();
		return row?.kind === "peer" ? row.peer : null;
	}

	#syncScroll(): void {
		const index = this.#selectedRowIndex();
		this.#scrollOffset =
			index < 0 ? 0 : scrollWindow(this.#rows.length, index, this.#bodyHeight(), this.#scrollOffset);
	}

	#selectIndex(index: number): void {
		const row = this.#rows[index];
		if (!row || !isSelectableRow(row)) return;
		const previousPeer = this.#selectedPeer()?.sessionId ?? null;
		this.#selectedId = rowKey(row);
		this.#syncScroll();
		if (row.kind === "peer" && row.peer.sessionId !== previousPeer) this.#detailScroll = 0;
		this.#syncDetailForSelection();
		this.#deps.requestRender();
	}

	#move(delta: number): void {
		const current = this.#selectedRowIndex();
		const direction = delta > 0 ? 1 : -1;
		let index = current;
		if (index < 0) index = direction > 0 ? -1 : this.#rows.length;
		let remaining = Math.abs(delta);
		while (remaining > 0) {
			let next = index + direction;
			while (next >= 0 && next < this.#rows.length && !isSelectableRow(this.#rows[next]!)) next += direction;
			if (next < 0 || next >= this.#rows.length) return;
			index = next;
			remaining--;
		}
		if (index !== current) this.#selectIndex(index);
	}

	#syncDetailForSelection(): void {
		const wide = this.#isWide();
		if (!wide) {
			if (!this.#detailOpen) return;
			const current = this.#detailPeer;
			if (!current) {
				this.#detailOpen = false;
				this.#focus = "list";
				return;
			}
			const fresh = this.#peers.find((peer) => peer.sessionId === current.sessionId);
			if (!fresh) {
				this.#detailOpen = false;
				this.#focus = "list";
				this.#deps.requestRender();
				return;
			}
			this.#detailPeer = fresh;
			return;
		}
		const peer = this.#selectedPeer();
		if (!peer) {
			this.#clearDetail();
			return;
		}
		if (this.#detailPeer?.sessionId === peer.sessionId) {
			this.#detailPeer = peer;
			return;
		}
		void this.#loadDetail(peer, false);
	}

	#clearDetail(): void {
		this.#detailToken++;
		this.#detailPeer = null;
		this.#detailEntries = [];
		this.#detailLoading = false;
		this.#detailScroll = 0;
		this.#detailLineCount = 0;
	}

	async #loadDetail(peer: PeerView, announce: boolean): Promise<void> {
		const token = ++this.#detailToken;
		this.#detailPeer = peer;
		this.#detailEntries = [];
		this.#detailLoading = true;
		this.#detailScroll = 0;
		this.#detailLineCount = 0;
		if (announce) this.#setStatus("加载历史…");
		this.#deps.requestRender();
		try {
			const entries = await this.#deps.fetchTranscript(peer.sessionId, 30);
			if (token !== this.#detailToken) return;
			this.#detailEntries = entries.slice(-30);
			this.#detailLoading = false;
			if (announce) this.#setStatus(`${this.#detailEntries.length} 条记录`);
		} catch (err) {
			if (token !== this.#detailToken) return;
			this.#detailLoading = false;
			this.#setStatus(`历史加载失败: ${err instanceof Error ? err.message : String(err)}`, true);
		}
		this.#deps.requestRender();
	}

	#enter(): void {
		const row = this.#selectedRow();
		if (!row) return;
		if (row.kind === "collapsed") {
			this.#setClosedExpanded(!this.#expandedClosed);
			return;
		}
		if (row.kind !== "peer") return;
		if (this.#isWide()) {
			this.#focus = "detail";
			if (this.#detailPeer?.sessionId !== row.peer.sessionId) void this.#loadDetail(row.peer, true);
			else {
				this.#detailPeer = row.peer;
				this.#deps.requestRender();
			}
			return;
		}
		this.#detailOpen = true;
		this.#focus = "detail";
		this.#detailScroll = 0;
		void this.#loadDetail(row.peer, true);
	}

	#backToList(): void {
		if (this.#isWide()) this.#focus = "list";
		else {
			this.#detailOpen = false;
			this.#focus = "list";
		}
		this.#deps.requestRender();
	}

	#detailContentWidth(): number {
		const width = this.#width;
		if (this.#isWide(width)) {
			const inner = Math.max(0, width - 8);
			const left = Math.max(1, Math.min(52, Math.floor(inner * 0.42)));
			return Math.max(0, inner - left);
		}
		return Math.max(0, width - 5);
	}

	#scrollDetail(delta: number): void {
		// Recompute before clamping so a keypress works even if the host has not
		// rendered the freshly loaded transcript yet.
		this.#detailLines(this.#detailContentWidth());
		this.#setDetailScroll(this.#detailScroll + delta);
	}

	#setDetailScroll(value: number): void {
		const max = Math.max(0, this.#detailLineCount - this.#bodyHeight());
		this.#detailScroll = Math.min(max, Math.max(0, value));
		this.#deps.requestRender();
	}

	/** Pointer y → 0..1 across the body scrollbar track (body rows start at y = 1). */
	#barRatio(y: number): number {
		const height = this.#bodyHeight();
		if (height <= 1) return 0;
		return Math.min(1, Math.max(0, (y - 1) / (height - 1)));
	}

	#jumpListBar(y: number): void {
		// Clamp to selectable rows: #move refuses a step that would land off-list.
		const first = this.#rows.findIndex(isSelectableRow);
		const last = this.#rows.length - 1 - [...this.#rows].reverse().findIndex(isSelectableRow);
		const target = Math.round(this.#barRatio(y) * Math.max(0, this.#rows.length - 1));
		const clamped = Math.min(last, Math.max(first, target));
		this.#move(clamped - this.#selectedRowIndex());
	}

	#jumpDetailBar(y: number): void {
		this.#detailLines(this.#detailContentWidth());
		const max = Math.max(0, this.#detailLineCount - this.#bodyHeight());
		this.#setDetailScroll(Math.round(this.#barRatio(y) * max));
	}

	#setClosedExpanded(expanded: boolean): void {
		if (this.#filter === "closed") return;
		// The active list has no closed peer rows; expanding means switching to all.
		if (this.#filter === "active" && expanded) this.#filter = "all";
		this.#expandedClosed = expanded;
		this.#rebuildRows();
		this.#deps.requestRender();
	}

	#cycleFilter(): void {
		this.#filter = this.#filter === "active" ? "all" : this.#filter === "all" ? "closed" : "active";
		this.#expandedClosed = false;
		this.#rebuildRows();
		this.#deps.requestRender();
	}

	#handleSearchKey(data: string): void {
		if (data === "\x1b") {
			this.#searchMode = false;
			this.#query = "";
			this.#selectedId = this.#searchReturnId ?? this.#selectedId;
			this.#searchReturnId = null;
			this.#rebuildRows();
			this.#deps.requestRender();
			return;
		}
		if (data === "\x7f" || data === "\b") {
			this.#query = [...this.#query].slice(0, -1).join("");
			this.#rebuildRows();
			this.#deps.requestRender();
			return;
		}
		if (data === "\r" || data === "\n") {
			this.#searchMode = false;
			this.#searchReturnId = null;
			this.#deps.requestRender();
			return;
		}
		if (data.startsWith("\x1b") || /[\x00-\x1f\x7f]/.test(data)) return;
		this.#query += data;
		this.#rebuildRows();
		this.#deps.requestRender();
	}

	async #toggleFollow(): Promise<void> {
		const peer = this.#selectedPeer();
		if (!peer) return;
		const self = this.#deps.selfSessionId;
		if (!self) {
			this.#setStatus("无法关注: 当前会话 id 未知", true);
			this.#deps.requestRender();
			return;
		}
		if (peer.sessionId === self) {
			this.#setStatus("不能关注自己", true);
			this.#deps.requestRender();
			return;
		}
		// The edge lives on the self record: self.following contains target.
		const selfPeer = this.#peers.find((item) => item.sessionId === self);
		const isFollowing = !!selfPeer?.following?.includes(peer.sessionId);
		try {
			await this.#deps.setFollow(peer.sessionId, !isFollowing);
			this.#setStatus(!isFollowing ? `已关注 ${peer.sessionId.slice(-8)}` : `已解绑关注 ${peer.sessionId.slice(-8)}`);
			await this.refresh(true);
		} catch (err) {
			this.#setStatus(`操作失败: ${err instanceof Error ? err.message : String(err)}`, true);
			this.#deps.requestRender();
		}
	}

	#askResume(): void {
		const peer = this.#selectedPeer();
		if (!peer) return;
		if (peer.state === "running" || peer.state === "waiting") {
			this.#setStatus(`${peer.sessionId.slice(0, 8)} 仍在运行，未恢复`, true);
			this.#deps.requestRender();
			return;
		}
		this.#pendingResume = peer;
		this.#setStatus(`恢复 ${peer.sessionId.slice(0, 8)} 到独立 herdr 工作区? [y/N]`);
		this.#deps.requestRender();
	}

	#handlePendingResume(data: string): void {
		const peer = this.#pendingResume!;
		this.#pendingResume = null;
		if (data === "y" || data === "Y") {
			this.#setStatus("恢复中…");
			this.#deps.requestRender();
			void Promise.resolve()
				.then(() => this.#deps.resume(peer))
				.then((out) => {
					this.#setStatus(out.message, !out.ok);
					this.#deps.requestRender();
				})
				.catch((err) => {
					this.#setStatus(`恢复失败: ${err instanceof Error ? err.message : String(err)}`, true);
					this.#deps.requestRender();
				});
			return;
		}
		this.#setStatus("已取消恢复");
		this.#deps.requestRender();
	}

	// ── rendering ───────────────────────────────────────────────────────

	#bodyHeight(): number {
		const viewport = this.#deps.viewport?.() ?? { width: 100, height: 32 };
		const height = Number.isFinite(viewport.height) ? viewport.height : 32;
		return Math.min(30, Math.max(8, Math.floor(height * 0.85) - 2));
	}

	#isWide(width = this.#width): boolean {
		const w = width || this.#deps.viewport?.().width || 100;
		return w >= 88;
	}

	render(width: number): string[] {
		const w = Math.max(1, Math.floor(width));
		this.#width = w;
		const lines: string[] = [this.#renderTitle(w)];
		const bodyHeight = this.#bodyHeight();
		const wide = this.#isWide(w);
		const listVisible = !this.#help && (wide || !this.#detailOpen);
		let body: string[];
		if (this.#help) {
			this.#listBarX = null;
			this.#detailBarX = null;
			body = this.#renderHelpBody(w, bodyHeight);
		}
		else if (wide) body = this.#renderWideBody(w, bodyHeight);
		else body = this.#renderNarrowBody(w, bodyHeight);
		const trimmedBody = trimBody(body);
		lines.push(...trimmedBody);
		lines.push(this.#renderFooter(w));
		// rowMap mirrors the complete render output: title, each body line, footer.
		// Only visible left-column rows map to their #rows index; everything else is -1.
		const rowMap: number[] = [-1];
		for (let i = 0; i < trimmedBody.length; i++) {
			let index = -1;
			if (listVisible) {
				const rowIndex = this.#scrollOffset + i;
				const row = this.#rows[rowIndex];
				if (row && isSelectableRow(row)) index = rowIndex;
			}
			rowMap.push(index);
		}
		rowMap.push(-1);
		this.#rowMap = rowMap;
		return lines.map((line) => fit(line, w));
	}

	#renderTitle(width: number): string {
		let running = 0;
		let waiting = 0;
		let offline = 0;
		let closed = 0;
		for (const peer of this.#peers) {
			if (peer.state === "running") running++;
			else if (peer.state === "waiting") waiting++;
			else if (peer.state === "offline") offline++;
			else if (peer.state === "closed") closed++;
		}
		const active = running + waiting + offline;
		const hint = width >= 24 ? " q 关闭 " : " q ";
		const filter = this.#filter === "active" ? "" : ` · ${FILTER_LABEL[this.#filter]}`;
		const query = this.#query ? ` · /${cleanText(this.#query)}` : "";
		const status = this.#status
			? ` · ${this.#statusError ? this.#C.error : this.#C.dim}${cleanText(this.#status)}${this.#C.reset}`
			: "";
		const left = ` ${this.#C.bold}pi-mesh${this.#C.reset} · 活跃 ${active} · 关闭 ${closed}${status}${filter}${query}`;
		const available = Math.max(0, width - 2 - displayWidth(hint) - 2);
		return (
			`${this.#C.border}${B.tl}${B.h}${this.#C.reset}` +
			fit(left, available) +
			`${this.#C.border}${B.h}${hint}${B.tr}${this.#C.reset}`
		);
	}

	/** Only the three highest-frequency actions stay visible; `?` owns the rest. */
	#footerText(): string {
		if (this.#pendingResume) return "y 确认恢复 · 其他键取消";
		if (this.#help) return "任意键关闭帮助";
		if (this.#searchMode) return `搜索: ${cleanText(this.#query)}▏  Enter 确认 · Esc 清除`;
		const detail = this.#isWide() ? this.#focus === "detail" : this.#detailOpen;
		if (detail) return "↑↓ 滚动 · Esc 返回 · ? 快捷键";
		return "↑↓ 选择 · Enter 详情 · ? 快捷键";
	}

	#renderFooter(width: number): string {
		const text = ` ${this.#footerText()} `;
		return (
			`${this.#C.border}${B.bl}${B.h}${this.#C.reset}` +
			fit(`${this.#C.dim}${text}${this.#C.reset}`, Math.max(0, width - 4)) +
			`${this.#C.border}${B.h}${B.br}${this.#C.reset}`
		);
	}

	/** One cell per body row: thumb `█`, track `░`, blank when content fits. */
	#barCells(detail: boolean, height: number): string[] {
		return scrollbarColumn(
			detail ? this.#detailLineCount : this.#rows.length,
			detail ? this.#detailScroll : this.#scrollOffset,
			height,
		);
	}

	#barCell(cell: string): string {
		if (cell === "█") return `${this.#C.accent}█${this.#C.reset}`;
		if (cell === "░") return `${this.#C.muted}░${this.#C.reset}`;
		return " ";
	}

	#renderNarrowBody(width: number, height: number): string[] {
		const contentWidth = Math.max(0, width - 5);
		const inner = Math.max(0, contentWidth - 2);
		const detail = this.#detailOpen;
		// Content first: #listLines / #sliceDetail refresh the scroll state the bar reads.
		const content = detail
			? this.#sliceDetail(this.#detailLines(inner), height)
			: this.#listLines(inner, height);
		const cells = this.#barCells(detail, height);
		this.#listBarX = detail ? null : width - 3;
		this.#detailBarX = detail ? width - 3 : null;
		return content.map(
			(line, i) => ` ${B.v} ` + fit(line, inner) + ` ${this.#barCell(cells[i] ?? " ")}${B.v}`,
		);
	}

	#renderWideBody(width: number, height: number): string[] {
		const inner = Math.max(0, width - 8);
		const leftWidth = Math.max(1, Math.min(52, Math.floor(inner * 0.42)));
		const rightWidth = Math.max(0, inner - leftWidth);
		this.#splitX = leftWidth + 6;
		const leftInner = Math.max(0, leftWidth - 2);
		const rightInner = Math.max(0, rightWidth - 2);
		const left = this.#listLines(leftInner, height);
		const right = this.#sliceDetail(this.#detailLines(rightInner), height);
		const listCells = this.#barCells(false, height);
		const detailCells = this.#barCells(true, height);
		this.#listBarX = leftWidth + 2;
		this.#detailBarX = this.#splitX + rightInner + 1;
		const out: string[] = [];
		for (let i = 0; i < height; i++) {
			out.push(
				` ${B.v} ` +
					fit(left[i] ?? "", leftInner) +
					` ${this.#barCell(listCells[i] ?? " ")} ${this.#C.muted}${B.v}${this.#C.reset} ` +
					fit(right[i] ?? "", rightInner) +
					` ${this.#barCell(detailCells[i] ?? " ")}${B.v}`,
			);
		}
		return out;
	}

	#renderHelpBody(width: number, height: number): string[] {
		const contentWidth = Math.max(0, width - 5);
		const group = (text: string) => `${this.#C.accent}${text}${this.#C.reset}`;
		const item = (text: string) => `${this.#C.dim}  ${text}${this.#C.reset}`;
		const lines = [
			`${this.#C.bold}按键速查${this.#C.reset}`,
			group("导航"),
			item("↑↓ / j k   移动列表 / 滚动详情"),
			item("PgUp / PgDn  翻页 · Enter 打开详情"),
			item("→ / ←     展开 / 收起 · Tab 切换栏（宽屏）"),
			group("过滤与搜索"),
			item("/ 搜索 · a 切换过滤 · Backspace 删除"),
			group("会话操作"),
			item("f 关注 / 取消 · R 恢复（y 确认） · r 刷新"),
			group("其它"),
			item("鼠标   滚轮滚动 · 点击选择 · 右键详情/返回"),
			item("Esc / b 返回 · q 关闭 · ? 本帮助"),
		];
		const out = lines.slice(0, height);
		while (out.length < height) out.push("");
		return out.map((line) => ` ${B.v} ` + fit(line, contentWidth) + ` ${B.v}`);
	}

	#emptyMessage(): string {
		if (this.#query) return `${this.#C.dim}(没有匹配的会话 · / 清除搜索)${this.#C.reset}`;
		if (this.#filter === "closed") return `${this.#C.dim}(没有已关闭的会话 · a 切换过滤)${this.#C.reset}`;
		if (this.#filter === "all") return `${this.#C.dim}(没有已注册的 pi 会话)${this.#C.reset}`;
		return `${this.#C.dim}(没有活跃会话 · a 切换过滤)${this.#C.reset}`;
	}

	#listLines(width: number, height: number): string[] {
		const total = this.#rows.length;
		const selectedIndex = this.#selectedRowIndex();
		if (total === 0) {
			this.#scrollOffset = 0;
			const out = [this.#emptyMessage()];
			while (out.length < height) out.push("");
			return out.slice(0, height).map((line) => fit(line, width));
		}
		this.#scrollOffset = scrollWindow(total, selectedIndex < 0 ? 0 : selectedIndex, height, this.#scrollOffset);
		const now = this.#deps.now();
		const out: string[] = [];
		const end = Math.min(total, this.#scrollOffset + height);
		for (let i = this.#scrollOffset; i < end; i++) {
			out.push(this.#renderRow(this.#rows[i]!, width, i === selectedIndex, i === this.#hoveredIndex, now));
		}
		while (out.length < height) out.push("");
		return out;
	}

	#renderRow(row: MeshRow, width: number, selected: boolean, hovered: boolean, now: number): string {
		if (row.kind === "group") return `${this.#C.dim}${row.label}${this.#C.reset}`;
		if (row.kind === "collapsed") {
			const cursor = selected ? `${this.#C.accent}❯${this.#C.reset}` : " ";
			const glyph = row.expanded ? "▾" : "▸";
			return `${cursor}${this.#C.muted}${glyph} ${row.label} · ${row.count}${this.#C.reset}`;
		}

		const peer = row.peer;
		const state = STATE_STYLE[peer.state] ?? STATE_STYLE.closed!;
		const cursor = selected ? `${this.#C.accent}❯${this.#C.reset}` : " ";
		const sym = `${this.#C[state.color]}${state.sym}${this.#C.reset}`;
		const id = `${this.#C.dim}${peer.sessionId.slice(-8)}${this.#C.reset}`;
		const age = `${this.#C.dim}${formatAge(peer, now).padStart(4, " ")}${this.#C.reset}`;
		const title = cleanText(peer.title ?? peer.cwd.split("/").pop() ?? "-") || "-";
		const self = this.#deps.selfSessionId;
		const isSelf = !!self && peer.sessionId === self;
		const badgeParts: string[] = [];
		if (isSelf) badgeParts.push("本");
		if ((peer.files?.length ?? 0) > 0) badgeParts.push(`${peer.files.length}f`);
		const resumptionCount = peer.resumptions?.length ?? 0;
		if (resumptionCount > 0) badgeParts.push(`↻${resumptionCount}`);
		if (self && !isSelf) {
			const selfPeer = this.#peers.find((item) => item.sessionId === self);
			if (selfPeer?.following?.includes(peer.sessionId)) badgeParts.push("◆");
		}
		const badges = badgeParts.length > 0 ? `${this.#C.dim}${badgeParts.join(" ")}${this.#C.reset}` : "";
		const badgeWidth = displayWidth(badges);
		// Row grid: 2 indent + cursor/state 2 + id 8 + age 4 (right) + 2 gaps.
		const titleWidth = Math.max(1, width - 20 - (badgeWidth > 0 ? badgeWidth + 2 : 0));
		const titleText = selected
			? `${this.#C.bold}${title}${this.#C.reset}`
			: hovered
				? `${this.#C.accent}${title}${this.#C.reset}`
				: peer.state === "closed"
					? `${this.#C.dim}${title}${this.#C.reset}`
					: title;
		const titleFit = fit(titleText, titleWidth);
		return `  ${cursor}${sym} ${id} ${age}  ${titleFit}${badges ? `  ${badges}` : ""}`;
	}

	#detailLines(width: number): string[] {
		const peer = this.#detailPeer;
		if (!peer) {
			this.#detailLineCount = 1;
			return [`${this.#C.dim}(选择一个会话查看详情)${this.#C.reset}`];
		}
		const lines: string[] = [];
		const title = cleanText(peer.title ?? peer.cwd.split("/").pop() ?? "-") || "-";
		lines.push(`${this.#C.bold}${title}${this.#C.reset}`);
		const model = peer.model ? cleanText(peer.model) : "(未知模型)";
		const selfTag =
			this.#deps.selfSessionId && peer.sessionId === this.#deps.selfSessionId ? ` · ${this.#C.accent}本会话${this.#C.reset}` : "";
		lines.push(
			`${this.#C.dim}${peer.sessionId.slice(-8)} · ${cleanText(branchLabel(peer))} · ${model}${this.#C.reset}${selfTag}`,
		);
		lines.push(`${this.#C.dim}${tildePath(cleanText(peer.cwd))}${this.#C.reset}`);
		const counts: string[] = [];
		if ((peer.files?.length ?? 0) > 0) counts.push(`${peer.files.length} 文件`);
		if ((peer.following?.length ?? 0) > 0) counts.push(`${peer.following.length} 关注`);
		const followers = this.#peers.filter(
			(item) => item.sessionId !== peer.sessionId && item.following?.includes(peer.sessionId),
		).length;
		if (followers > 0) counts.push(`${followers} 被关注`);
		const resumptionCount = peer.resumptions?.length ?? 0;
		if (resumptionCount > 0) counts.push(`${resumptionCount} 恢复`);
		if (counts.length > 0) lines.push(`${this.#C.dim}${counts.join(" · ")}${this.#C.reset}`);
		if (peer.state === "closed") {
			const reason = peer.closeReason ? ` · ${cleanText(peer.closeReason)}` : "";
			lines.push(`${this.#C.muted}已关闭${reason}${this.#C.reset}`);
		}
		// A short rule separates identity from history; a full-width rule is heavy.
		lines.push(`${this.#C.dim}${"─".repeat(Math.min(24, Math.max(1, width)))}${this.#C.reset}`);
		if (this.#detailLoading) {
			lines.push(`${this.#C.dim}(加载中…)${this.#C.reset}`);
		} else if (this.#detailEntries.length === 0) {
			lines.push(`${this.#C.dim}(暂无历史记录)${this.#C.reset}`);
		} else {
			lines.push(...this.#historyLines(this.#detailEntries));
		}
		this.#detailLineCount = lines.length;
		return lines;
	}

	#historyLines(entries: TranscriptEntry[]): string[] {
		const out: string[] = [];
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i]!;
			const time = `${this.#C.dim}${entry.timestamp.slice(11, 16)}${this.#C.reset}`;
			if (entry.role === "toolResult") {
				const group: TranscriptEntry[] = [];
				while (i < entries.length && entries[i]!.role === "toolResult") {
					group.push(entries[i]!);
					i++;
				}
				i--; // outer loop advances
				if (group.length === 1) {
					const tool = group[0]!;
					const error = tool.isError ? ` ${this.#C.error}✗${this.#C.reset}` : "";
					out.push(
						`${time} ${this.#C.warning}${tool.toolName ?? "tool"}${this.#C.reset}${error} ${cleanText(tool.text)}`,
					);
					continue;
				}
				const names = [...new Set(group.map((tool) => tool.toolName ?? "tool"))];
				const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
				const errors = group.filter((tool) => tool.isError).length;
				const errorTag = errors > 0 ? ` ${this.#C.error}${errors}✗${this.#C.reset}` : "";
				out.push(
					`${time} ${this.#C.dim}⋯ 工具调用 ×${group.length}${errorTag} · ${shown}${this.#C.reset}`,
				);
				continue;
			}
			const roleColor =
				entry.role === "user" ? this.#C.accent : entry.role === "assistant" ? this.#C.success : entry.isError ? this.#C.error : this.#C.warning;
			// Role tags pad to one column so history text starts at a stable x.
			out.push(`${time} ${roleColor}${entry.role.padEnd(9)}${this.#C.reset} ${cleanText(entry.text)}`);
		}
		return out;
	}

	#sliceDetail(lines: string[], height: number): string[] {
		const max = Math.max(0, lines.length - height);
		this.#detailScroll = Math.min(max, Math.max(0, this.#detailScroll));
		const out = lines.slice(this.#detailScroll, this.#detailScroll + height);
		while (out.length < height) out.push("");
		return out;
	}
}
