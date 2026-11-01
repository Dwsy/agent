/**
 * Interactive pi-mesh status panel for the pi TUI, opened by `/mesh`.
 *
 * Rendering follows the pi-tui-kit reference demo (examples/demo-simple.ts):
 * hand-built bordered lines + raw key sequences — the width-safe pattern the
 * kit itself uses for full-screen views. All lines are fitted to the viewport
 * width (CJK-aware), never wrapped by the terminal.
 */

import os from "node:os";
import type { PeerView, TranscriptEntry } from "./protocol.ts";

// ── ANSI + width helpers ─────────────────────────────────────────────────

const C = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
};

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

/** Fit a (possibly colored) line to width by padding or truncating the plain part. */
export function fit(line: string, width: number): string {
	if (width <= 0) return "";
	if (displayWidth(line) <= width) return line + " ".repeat(Math.max(0, width - displayWidth(line)));
	// Truncate by display width, then re-apply no colors (safe degradation).
	const plain = line.replace(ESCAPE, "");
	let out = "";
	let w = 0;
	for (const ch of plain) {
		const cw = displayWidth(ch);
		if (w + cw > width - 1) break;
		out += ch;
		w += cw;
	}
	return out + "…" + " ".repeat(Math.max(0, width - w - 1));
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

const STATE_STYLE: Record<string, { sym: string; color: string; label: string }> = {
	running: { sym: "▶", color: C.green, label: "运行中" },
	waiting: { sym: "·", color: C.yellow, label: "等待" },
	offline: { sym: "!", color: C.red, label: "离线" },
	closed: { sym: "✕", color: C.gray, label: "已关闭" },
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

export interface MeshPanelDeps {
	fetchPeers(): Promise<PeerView[]>;
	fetchTranscript(sessionId: string, limit: number): Promise<TranscriptEntry[]>;
	setFollow(targetSessionId: string, following: boolean): Promise<void>;
	resume(peer: PeerView): Promise<{ ok: boolean; message: string }>;
	selfSessionId: string | null;
	now(): number;
	requestRender(): void;
	onClose(): void;
	/** Injected by the host so body height follows the real terminal. */
	viewport?: () => { width: number; height: number };
}

export class MeshPanel {
	#deps: MeshPanelDeps;
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
	#loading = false;
	#pendingResume: PeerView | null = null;

	constructor(deps: MeshPanelDeps) {
		this.#deps = deps;
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
			if (!quiet) this.#setStatus(`${this.#peers.length} 个会话`);
		} catch (err) {
			this.#setStatus(`加载失败: ${err instanceof Error ? err.message : String(err)}`, true);
		} finally {
			this.#loading = false;
			this.#deps.requestRender();
		}
	}

	invalidate(): void {
		this.#deps.requestRender();
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

		if (data === "\x1b[A" || data === "k") {
			if (detailFocused) this.#scrollDetail(-1);
			else this.#move(-1);
			return;
		}
		if (data === "\x1b[B" || data === "j") {
			if (detailFocused) this.#scrollDetail(1);
			else this.#move(1);
			return;
		}
		if (data === "\x1b[5~") {
			if (detailFocused) this.#scrollDetail(-page);
			else this.#move(-page);
			return;
		}
		if (data === "\x1b[6~") {
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
		if (data === "\x1b[C") {
			const row = this.#selectedRow();
			if (row?.kind === "collapsed") this.#setClosedExpanded(true);
			else if (row?.kind === "peer") this.#enter();
			return;
		}
		if (data === "\x1b[D") {
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
		const max = Math.max(0, this.#detailLineCount - this.#bodyHeight());
		this.#detailScroll = Math.min(max, Math.max(0, this.#detailScroll + delta));
		this.#deps.requestRender();
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
		let body: string[];
		if (this.#help) body = this.#renderHelpBody(w, bodyHeight);
		else if (this.#isWide(w)) body = this.#renderWideBody(w, bodyHeight);
		else body = this.#renderNarrowBody(w, bodyHeight);
		lines.push(...trimBody(body));
		lines.push(this.#renderFooter(w));
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
			? ` · ${this.#statusError ? C.red : C.dim}${cleanText(this.#status)}${C.reset}`
			: "";
		const left = ` ${C.bold}pi-mesh${C.reset} · 活跃 ${active} · 关闭 ${closed}${status}${filter}${query}`;
		const available = Math.max(0, width - 2 - displayWidth(hint) - 2);
		return (
			`${C.cyan}${B.tl}${B.h}${C.reset}` +
			fit(left, available) +
			`${C.cyan}${B.h}${hint}${B.tr}${C.reset}`
		);
	}

	#footerText(width: number): string {
		if (this.#pendingResume) return "y 确认恢复 · 其他键取消";
		if (this.#help) return "任意键关闭帮助";
		if (this.#searchMode) {
			return this.#pickFooter(width, [
				`搜索: ${cleanText(this.#query)}▏  Enter 确认 · Esc 清除`,
				`搜索: ${cleanText(this.#query)}▏  Enter · Esc`,
			]);
		}
		const wide = this.#isWide();
		const detail = wide ? this.#focus === "detail" : this.#detailOpen;
		if (detail) {
			return wide
				? this.#pickFooter(width, [
						"↑↓/jk 滚动 · PgUp/PgDn 翻页 · Tab 列表 · Esc 返回 · ? 帮助",
						"↑↓ 滚动 · PgUp/PgDn 翻页 · Esc 返回 · ? 帮助",
					])
				: this.#pickFooter(width, [
						"↑↓/jk 滚动 · PgUp/PgDn 翻页 · Esc 返回 · ? 帮助",
						"↑↓ 滚动 · PgUp/PgDn 翻页 · Esc 返回 · ? 帮助",
						"↑↓ 滚动 · Esc 返回",
					]);
		}
		if (wide) {
			return this.#pickFooter(width, [
				"↑↓/jk 移动 · Enter 详情/展开 · Tab 详情 · / 搜索 · a 过滤 · f 关注 · R 恢复 · ? 帮助 · q 关闭",
				"↑↓/jk 移动 · Enter 详情/展开 · / 搜索 · a 过滤 · f 关注 · ? 帮助 · q 关闭",
				"↑↓ 移动 · Enter 详情/展开 · / 搜索 · a 过滤 · q 关闭",
				"↑↓ 移动 · Enter 详情 · q 关闭",
			]);
		}
		return this.#pickFooter(width, [
			"↑↓/jk 移动 · Enter 详情/展开 · / 搜索 · a 过滤 · f 关注 · R 恢复 · ? 帮助 · q 关闭",
			"↑↓ 移动 · Enter 详情/展开 · / 搜索 · a 过滤 · ? 帮助 · q 关闭",
			"↑↓ 移动 · Enter 详情/展开 · / 搜索 · a 过滤 · q 关闭",
			"↑↓ 移动 · Enter 详情 · q 关闭",
		]);
	}

	#pickFooter(width: number, candidates: string[]): string {
		const available = Math.max(0, width - 4);
		return candidates.find((text) => displayWidth(` ${text} `) <= available) ?? candidates[candidates.length - 1]!;
	}

	#renderFooter(width: number): string {
		const text = ` ${this.#footerText(width)} `;
		return (
			`${C.cyan}${B.bl}${B.h}${C.reset}` +
			fit(`${C.dim}${text}${C.reset}`, Math.max(0, width - 4)) +
			`${C.cyan}${B.h}${B.br}${C.reset}`
		);
	}

	#renderNarrowBody(width: number, height: number): string[] {
		const contentWidth = Math.max(0, width - 5);
		const content = this.#detailOpen
			? this.#sliceDetail(this.#detailLines(contentWidth), height)
			: this.#listLines(contentWidth, height);
		return content.map((line) => ` ${B.v} ` + fit(line, contentWidth) + ` ${B.v}`);
	}

	#renderWideBody(width: number, height: number): string[] {
		const inner = Math.max(0, width - 8);
		const leftWidth = Math.max(1, Math.min(52, Math.floor(inner * 0.42)));
		const rightWidth = Math.max(0, inner - leftWidth);
		const left = this.#listLines(leftWidth, height);
		const right = this.#sliceDetail(this.#detailLines(rightWidth), height);
		const out: string[] = [];
		for (let i = 0; i < height; i++) {
			out.push(
				` ${B.v} ` +
					fit(left[i] ?? "", leftWidth) +
					` ${C.gray}${B.v}${C.reset} ` +
					fit(right[i] ?? "", rightWidth) +
					` ${B.v}`,
			);
		}
		return out;
	}

	#renderHelpBody(width: number, height: number): string[] {
		const contentWidth = Math.max(0, width - 5);
		const lines = [
			`${C.bold}按键速查${C.reset}`,
			"",
			"↑↓ / j k     移动列表 / 滚动详情",
			"PgUp / PgDn  翻页",
			"Enter        打开详情 / 展开已关闭",
			"→ / ←        展开 / 收起已关闭",
			"Tab          切换列表 / 详情（宽屏）",
			"/            搜索",
			"a            过滤：活跃 → 全部 → 已关闭",
			"f            关注 / 取消关注",
			"R            恢复会话（y 确认）",
			"r            刷新",
			"Esc          返回 / 关闭",
			"b            详情中返回列表",
			"Backspace    搜索中删除",
			"y / n        确认 / 取消恢复",
			"q            关闭面板",
			"?            打开帮助",
		].map((line, index) => (index === 0 ? line : `${C.dim}${line}${C.reset}`));
		const out = lines.slice(0, height);
		while (out.length < height) out.push("");
		return out.map((line) => ` ${B.v} ` + fit(line, contentWidth) + ` ${B.v}`);
	}

	#emptyMessage(): string {
		if (this.#query) return `${C.dim}(没有匹配的会话 · / 清除搜索)${C.reset}`;
		if (this.#filter === "closed") return `${C.dim}(没有已关闭的会话 · a 切换过滤)${C.reset}`;
		if (this.#filter === "all") return `${C.dim}(没有已注册的 pi 会话)${C.reset}`;
		return `${C.dim}(没有活跃会话 · a 切换过滤)${C.reset}`;
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
			out.push(this.#renderRow(this.#rows[i]!, width, i === selectedIndex, now));
		}
		while (out.length < height) out.push("");
		return out;
	}

	#renderRow(row: MeshRow, width: number, selected: boolean, now: number): string {
		if (row.kind === "group") return `${C.dim}${row.label}${C.reset}`;
		if (row.kind === "collapsed") {
			const cursor = selected ? `${C.cyan}❯${C.reset}` : " ";
			const glyph = row.expanded ? "▾" : "▸";
			return `${cursor} ${C.gray}${glyph} ${row.label} · ${row.count}${C.reset}`;
		}

		const peer = row.peer;
		const state = STATE_STYLE[peer.state] ?? STATE_STYLE.closed!;
		const cursor = selected ? `${C.cyan}❯${C.reset}` : " ";
		const sym = `${state.color}${state.sym}${C.reset}`;
		const id = `${C.dim}${peer.sessionId.slice(-8)}${C.reset}`;
		const age = `${C.dim}${formatAge(peer, now).padStart(4, " ")}${C.reset}`;
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
		const badges = badgeParts.length > 0 ? `${C.dim}${badgeParts.join(" ")}${C.reset}` : "";
		const badgeWidth = displayWidth(badges);
		const titleWidth = Math.max(1, width - 17 - (badgeWidth > 0 ? badgeWidth + 1 : 0));
		const titleText = selected
			? `${C.bold}${title}${C.reset}`
			: peer.state === "closed"
				? `${C.dim}${title}${C.reset}`
				: title;
		const titleFit = fit(titleText, titleWidth);
		return `${cursor}${sym} ${id} ${age} ${titleFit}${badges ? ` ${badges}` : ""}`;
	}

	#detailLines(width: number): string[] {
		const peer = this.#detailPeer;
		if (!peer) {
			this.#detailLineCount = 1;
			return [`${C.dim}(选择一个会话查看详情)${C.reset}`];
		}
		const lines: string[] = [];
		const title = cleanText(peer.title ?? peer.cwd.split("/").pop() ?? "-") || "-";
		lines.push(`${C.bold}${title}${C.reset}`);
		if (this.#deps.selfSessionId && peer.sessionId === this.#deps.selfSessionId) {
			lines.push(`${C.dim}本会话${C.reset}`);
		}
		const model = peer.model ? cleanText(peer.model) : "(未知模型)";
		lines.push(`${C.dim}${peer.sessionId.slice(-8)} · ${cleanText(branchLabel(peer))} · ${model}${C.reset}`);
		lines.push(`${C.dim}${tildePath(cleanText(peer.cwd))}${C.reset}`);
		const counts: string[] = [];
		if ((peer.files?.length ?? 0) > 0) counts.push(`${peer.files.length} 文件`);
		if ((peer.following?.length ?? 0) > 0) counts.push(`${peer.following.length} 关注`);
		const followers = this.#peers.filter(
			(item) => item.sessionId !== peer.sessionId && item.following?.includes(peer.sessionId),
		).length;
		if (followers > 0) counts.push(`${followers} 被关注`);
		const resumptionCount = peer.resumptions?.length ?? 0;
		if (resumptionCount > 0) counts.push(`${resumptionCount} 恢复`);
		if (counts.length > 0) lines.push(`${C.dim}${counts.join(" · ")}${C.reset}`);
		if (peer.state === "closed") {
			const reason = peer.closeReason ? ` · ${cleanText(peer.closeReason)}` : "";
			lines.push(`${C.gray}已关闭${reason}${C.reset}`);
		}
		lines.push(`${C.dim}${"─".repeat(Math.max(1, width))}${C.reset}`);
		if (this.#detailLoading) {
			lines.push(`${C.dim}(加载中…)${C.reset}`);
		} else if (this.#detailEntries.length === 0) {
			lines.push(`${C.dim}(暂无历史记录)${C.reset}`);
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
			const time = `${C.dim}${entry.timestamp.slice(11, 16)}${C.reset}`;
			if (entry.role === "toolResult") {
				const group: TranscriptEntry[] = [];
				while (i < entries.length && entries[i]!.role === "toolResult") {
					group.push(entries[i]!);
					i++;
				}
				i--; // outer loop advances
				if (group.length === 1) {
					const tool = group[0]!;
					const error = tool.isError ? ` ${C.red}✗${C.reset}` : "";
					out.push(
						`${time} ${C.yellow}${tool.toolName ?? "tool"}${C.reset}${error} ${cleanText(tool.text)}`,
					);
					continue;
				}
				const names = [...new Set(group.map((tool) => tool.toolName ?? "tool"))];
				const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
				const errors = group.filter((tool) => tool.isError).length;
				const errorTag = errors > 0 ? ` ${C.red}${errors}✗${C.reset}` : "";
				out.push(
					`${time} ${C.dim}⋯ 工具调用 ×${group.length}${errorTag} · ${shown}${C.reset}`,
				);
				continue;
			}
			const roleColor =
				entry.role === "user" ? C.cyan : entry.role === "assistant" ? C.green : entry.isError ? C.red : C.yellow;
			out.push(`${time} ${roleColor}${entry.role}${C.reset} ${cleanText(entry.text)}`);
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
