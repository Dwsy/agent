/* pi-mesh WebUI — helpers / fetch layer / Alpine app / lucide glue. No build step. */

/* ----------------------------- helpers ----------------------------- */
/** HTML-escape arbitrary model/session text before it is interpolated into HTML. */
function esc(v) {
	return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function basename(p) {
	const s = String(p ?? "").replace(/[\\/]+$/, "");
	return s.split(/[\\/]/).pop() || String(p ?? "");
}
/** Truncate in the middle: /very/long/…/path */
function midTrunc(s, max = 46) {
	s = String(s ?? "");
	if (s.length <= max) return s;
	const k = Math.floor((max - 1) / 2);
	return s.slice(0, k) + "…" + s.slice(-k);
}
/** Short 8-char session id (labels / toasts).
 *  Session ids share a timestamp prefix, so the *tail* is the distinguishing part. */
function sid8(v) {
	return String(v ?? "").slice(-8);
}
/** Subsequence fuzzy match for the ⌘K CommandBar (case-insensitive, in order). */
function fuzzyHit(q, s) {
	const hay = String(s ?? "").toLowerCase();
	const needle = String(q ?? "").toLowerCase();
	if (!needle) return true;
	let i = 0;
	for (const ch of needle) {
		i = hay.indexOf(ch, i);
		if (i < 0) return false;
		i++;
	}
	return true;
}
function relTime(iso, now = Date.now()) {
	const t = Date.parse(String(iso ?? ""));
	if (Number.isNaN(t)) return "—";
	const s = Math.max(0, Math.floor((now - t) / 1000));
	if (s < 5) return "刚刚";
	if (s < 60) return s + "秒前";
	const m = Math.floor(s / 60);
	if (m < 60) return m + "分钟前";
	const h = Math.floor(m / 60);
	return h < 24 ? h + "小时前" : Math.floor(h / 24) + "天前";
}
function ageSec(iso, now = Date.now()) {
	const t = Date.parse(String(iso ?? ""));
	return Number.isNaN(t) ? Infinity : Math.max(0, (now - t) / 1000);
}
/* ----------------------------- pane resize (drag handle) ----------------------------- */
/** Desktop two-pane width limits: list 360–720px, detail keeps ≥600px. */
const PANE_LIMITS = { listMin: 360, listMax: 720, detailMin: 600 };
/** Default list width (the detail takes the rest). */
const PANE_DEFAULTS = { list: 480 };
const PANE_KEY = "pi-mesh.panes"; // localStorage key for 拖拽后的栏宽
/**
 * Clamp the dragged list width (px) so the detail keeps ≥`detailMin`. Returns 0
 * for unusable input.
 */
function clampPaneWidth(kind, px, viewport) {
	const n = Math.round(Number(px));
	if (!Number.isFinite(n) || kind !== "list") return 0;
	const v = Math.round(Number(viewport) || 2000);
	const max = Math.min(PANE_LIMITS.listMax, Math.max(PANE_LIMITS.listMin, v - PANE_LIMITS.detailMin - 1));
	return Math.min(max, Math.max(PANE_LIMITS.listMin, n));
}
/** Saved `pi-mesh.panes` → live state; legacy entries also carried `rail` or the detail width. */
function readPaneState(saved, viewport) {
	const raw = saved && typeof saved === "object" ? saved : {};
	const v = Math.round(Number(viewport) || 1440);
	if (raw.list) return { list: clampPaneWidth("list", raw.list, v) || PANE_DEFAULTS.list };
	if (raw.detail) {
		// the old layout owned the detail width; the list now owns the draggable width
		const migrated = clampPaneWidth("list", v - Number(raw.detail) - 1, v);
		if (migrated) return { list: migrated };
	}
	return { list: PANE_DEFAULTS.list };
}
/* ----------------------------- repo group collapse ----------------------------- */
const COLLAPSED_KEY = "pi-mesh.collapsed"; // localStorage key for 折叠的 repo 组
const STATE_FILTER_KEY = "pi-mesh.state-filter";
function normalizeStateFilter(filter) {
	const value = String(filter || "");
	if (value === "running" || value === "waiting") return "online";
	return ["all", "online", "offline", "closed"].includes(value) ? value : "online";
}
function readStateFilter() {
	try {
		const stored = String(localStorage.getItem(STATE_FILTER_KEY) || "");
		const value = normalizeStateFilter(stored);
		if (stored && stored !== value) localStorage.setItem(STATE_FILTER_KEY, value);
		return value;
	} catch (_) {}
	return "online";
}
/** Stored collapse map → only explicit true entries. */
function readCollapsed(saved) {
	const raw = saved && typeof saved === "object" ? saved : {};
	const out = {};
	for (const [k, v] of Object.entries(raw)) if (v === true) out[k] = true;
	return out;
}
/** An active search always expands: matches stay visible without rewriting the stored fold. */
function isRepoCollapsed(collapsed, root, search) {
	return !String(search ?? "").trim() && !!collapsed[String(root ?? "")];
}
/** Next collapse map for a repo-header click; searching keeps the stored map untouched. */
function nextCollapsed(collapsed, root, search) {
	const k = String(root ?? "");
	if (!k || String(search ?? "").trim()) return collapsed;
	const next = { ...collapsed };
	if (next[k]) delete next[k];
	else next[k] = true;
	return next;
}
/** repo sections → repo groups; consecutive same-root sections merge. */
function groupByRepo(sections) {
	const out = [];
	for (const s of sections) {
		const last = out[out.length - 1];
		if (last && last.root === s.root) {
			last.branches.push(s);
			last.count += s.peers.length;
		} else {
			out.push({ root: s.root, repo: s.repo, count: s.peers.length, branches: [s] });
		}
	}
	return out;
}

/**
 * Two different roots can share a basename (`tmp/1` and `work/1`). Only those
 * duplicates get a parent segment; unique names stay short.
 */
function disambiguateNames(groups) {
	const counts = {};
	for (const g of groups) counts[g.name] = (counts[g.name] || 0) + 1;
	for (const g of groups) {
		if (counts[g.name] < 2) continue;
		const parts = String(g.key || "").split("/").filter(Boolean);
		if (parts.length >= 2) g.name = parts.slice(-2).join("/");
	}
	return groups;
}
/** Rows that are actually rendered (collapsed groups skipped; keyboard order follows). */
function visiblePeersOf(groups, collapsed, search) {
	const out = [];
	for (const g of groups) {
		if (isRepoCollapsed(collapsed, g.root, search)) continue;
		for (const s of g.branches) out.push(...s.peers);
	}
	return out;
}
function isSelectedHidden(selectedId, visiblePeers) {
	const sid = String(selectedId || "");
	return !!sid && !(Array.isArray(visiblePeers) ? visiblePeers : []).some((peer) => String(peer && peer.sessionId || "") === sid);
}
/* ----------------------------- SSE status state machine ----------------------------- */
/**
 * Display state for the SSE link: "connecting" | "connected" | "retrying" | "paused".
 * Events: "open" | "lost" | "pause" | "resume"; `ever` = a connection was
 * established before. Before the first open the UI stays quiet (连接中) —
 * the disconnect banner must never flash on page load.
 */
function connNextState(event, ever) {
	if (event === "open") return "connected";
	if (event === "lost") return ever ? "retrying" : "connecting";
	if (event === "pause") return "paused";
	if (event === "resume") return "connecting";
	return "connecting";
}
/** 「连接断开 · 正在自动重连…」only for established-then-lost (a grace timer gates the timing). */
function connBannerOn(ever, state) {
	return !!ever && state === "retrying";
}
/** Migrate the old overview/history/review tabs into the three workbench views. */
function normalizeDetailTab(tab) {
	const value = String(tab || "");
	if (value === "overview" || value === "history" || value === "session") return "session";
	if (value === "review" || value === "files" || value === "changes") return "changes";
	return value === "terminal" ? "terminal" : "session";
}
function parseSelectionHash(hash) {
	const value = String(hash || "");
	if (!value.startsWith("#")) return { sessionId: "", tab: "", file: "" };
	const params = new URLSearchParams(value.slice(1));
	return {
		sessionId: params.get("p") || "",
		tab: params.get("tab") || "",
		file: params.get("file") || "",
	};
}
function matchesStateFilter(peer, filter, hasSearch = false) {
	const normalized = normalizeStateFilter(filter);
	if (hasSearch || normalized === "all") return true;
	if (normalized === "online") return peer.state === "running" || peer.state === "waiting";
	return peer.state === normalized;
}
function comparePeersByStartedAt(a, b) {
	const at = Date.parse(String(a.startedAt || ""));
	const bt = Date.parse(String(b.startedAt || ""));
	if (Number.isNaN(at) !== Number.isNaN(bt)) return Number.isNaN(at) ? 1 : -1;
	if (!Number.isNaN(at) && at !== bt) return bt - at;
	return String(a.sessionId || "").localeCompare(String(b.sessionId || ""));
}
/**
 * Viewport-anchored popup position: flush at (x, y), flipping inside the
 * viewport near the right/bottom edges, clamped to an 8px margin.
 */
function popupPos(x, y, w, h, vw, vh) {
	const px = Math.round(Number(x) || 0);
	const py = Math.round(Number(y) || 0);
	const pw = Math.max(1, Math.round(Number(w) || 216));
	const ph = Math.max(1, Math.round(Number(h) || 160));
	const W = Math.round(Number(vw) || 1024);
	const H = Math.round(Number(vh) || 768);
	let left = px;
	let top = py;
	if (left + pw + 8 > W) left = px - pw; // near the right edge: flip left of the cursor
	if (top + ph + 8 > H) top = py - ph; // near the bottom edge: flip above the cursor
	return {
		x: Math.min(Math.max(8, left), Math.max(8, W - pw - 8)),
		y: Math.min(Math.max(8, top), Math.max(8, H - ph - 8)),
	};
}
/** Button menus keep their trigger edge; remeasurement always uses the original anchor. */
function menuPopupPos(anchor, w, h, vw, vh) {
	const at = anchor || {};
	if (!at.rect) return popupPos(at.x, at.y, w, h, vw, vh);
	const r = at.rect;
	const pw = Math.max(1, Math.round(Number(w) || 216));
	const ph = Math.max(1, Math.round(Number(h) || 160));
	const W = Math.round(Number(vw) || 1024);
	const H = Math.round(Number(vh) || 768);
	const left = at.align === "start" ? Number(r.left) || 0 : (Number(r.right) || 0) - pw;
	const below = (Number(r.bottom) || 0) + 4;
	const top = below + ph + 8 > H ? (Number(r.top) || 0) - ph - 4 : below;
	return {
		x: Math.min(Math.max(8, Math.round(left)), Math.max(8, W - pw - 8)),
		y: Math.min(Math.max(8, Math.round(top)), Math.max(8, H - ph - 8)),
	};
}
/* Semantic classes (styles live in app.css, themed via CSS custom properties). */
const STATE_META = {
	running: { label: "运行中", dot: "dot dot-running", badge: "badge badge-running" },
	waiting: { label: "在线·空闲", dot: "dot dot-waiting", badge: "badge badge-waiting" },
	offline: { label: "离线", dot: "dot dot-offline", badge: "badge badge-offline" },
	closed: { label: "已关闭", dot: "dot dot-closed", badge: "badge badge-closed" },
};
function stateMeta(st) { return STATE_META[st] || STATE_META.closed; }
const ROLE_META = {
	user: { label: "用户", chip: "chip chip-user" },
	assistant: { label: "助手", chip: "chip chip-assistant" },
	toolResult: { label: "工具结果", chip: "chip chip-tool" },
};
function roleMeta(r) { return ROLE_META[r] || { label: r || "其他", chip: "chip chip-muted" }; }
function wtLabel(w) { return w === "main" ? "主工作树" : w === "linked" ? "linked 工作树" : w ? String(w) : "未指定工作树"; }
/** Group transcript entries into drawer items. A run of consecutive toolResult
 *  entries collapses into ONE tool-chain item (open by default only when < 2);
 *  everything else becomes a plain conversation entry. */
/* ----------------------------- markdown rendering ----------------------------- */
/**
 * Server-rendered Markdown (satteri + expressive-code + mermaid) arrives as
 * entry.html. DOMPurify is the XSS boundary: satteri passes raw HTML in the
 * source through verbatim. Lazy-loaded from /vendor/dompurify.
 */
let _purify = null;
async function loadSanitizer() {
	if (_purify) return _purify;
	const mod = await import("dompurify");
	const DOMPurify = mod.default ?? mod;
	// Expressive Code ships its stylesheet inside .expressive-code; a <style>
	// from anywhere else is attacker-injected CSS — drop it.
	DOMPurify.addHook("uponSanitizeElement", (node, data) => {
		if (data.tagName === "style" && !(node.parentNode && node.parentNode.closest && node.parentNode.closest(".expressive-code"))) {
			node.remove();
		}
	});
	_purify = DOMPurify;
	return _purify;
}

/**
 * Expressive Code ships dual themes switchable via [data-theme] on its own
 * container (our page-level data-theme uses "light"/"dark" and must not be
 * reused). Pin each code block to the active page theme after sanitizing.
 */
function applyEcTheme(html, theme) {
	if (theme !== "dark") return html;
	return html.replace(/<div class="expressive-code"/g, '<div class="expressive-code" data-theme="github-dark"');
}

/** Sanitized HTML for one history entry; plain-text fallback when absent/failed. */
async function mdHtml(entry, theme) {
	if (!entry || !entry.html) return esc(entry && entry.text);
	try {
		const DOMPurify = await loadSanitizer();
		const clean = DOMPurify.sanitize(entry.html, { USE_PROFILES: { html: true, svg: true, svgFilters: true } });
		return applyEcTheme(clean, theme || loadTheme());
	} catch (_) {
		return esc(entry.text);
	}
}

/** History page size for openHistory + 加载更早 backward pagination. */
const HISTORY_PAGE = 50;
const FILE_ACTIVITY_LIMIT = 50;
/** Older page merge for 加载更早: older entries go in front (oldest-first order)
 *  and duplicate ids drop out so every buildHistory :key stays unique. */
function mergeOlderEntries(current, older) {
	const cur = Array.isArray(current) ? current : [];
	const seen = new Set(cur.map((e) => String(e && e.id)));
	const add = (Array.isArray(older) ? older : []).filter((e) => e && !seen.has(String(e.id)));
	return add.concat(cur);
}
/** Merge SSE file activity with the current peer snapshot using the registry's 50-row contract. */
function mergeFileActivities(current, incoming, limit = 50) {
	const rows = [...(Array.isArray(incoming) ? incoming : []), ...(Array.isArray(current) ? current : [])];
	const unique = new Map();
	for (const row of rows) {
		if (!row || typeof row !== "object" || !String(row.path || "")) continue;
		const key = [String(row.path), String(row.op || ""), String(row.ts || "")].join("\u0000");
		if (!unique.has(key)) unique.set(key, row);
	}
	return [...unique.values()]
		.sort((a, b) => {
			const at = Date.parse(String(a.ts || ""));
			const bt = Date.parse(String(b.ts || ""));
			return (Number.isNaN(bt) ? -Infinity : bt) - (Number.isNaN(at) ? -Infinity : at);
		})
		.slice(0, Math.max(1, Math.min(50, Math.floor(Number(limit) || 50))));
}
/** Enter used to commit an IME candidate must never be treated as Send. */
function isImeEnter(event, composing = false) {
	return !!(composing || (event && event.isComposing) || (event && (event.keyCode === 229 || event.which === 229)));
}
function defaultComposerDraft() {
	return { open: false, mode: "followUp", text: "", version: 0, sending: false, receipt: null };
}
/** Every edit advances the draft version; asynchronous receipts may clear only the version they submitted. */
function nextComposerDraft(current, patch) {
	const draft = { ...defaultComposerDraft(), ...(current || {}) };
	return { ...draft, ...patch, version: Number(draft.version || 0) + 1 };
}
function createComposerSnapshot(sessionId, draft, viewerId) {
	const state = { ...defaultComposerDraft(), ...(draft || {}) };
	return {
		sessionId: String(sessionId || ""),
		text: String(state.text || "").trim(),
		mode: state.mode === "steer" ? "steer" : "followUp",
		fromSessionId: String(viewerId || "") || undefined,
		version: Number(state.version || 0),
	};
}
function settleComposerDraft(current, snapshot, receipt) {
	const draft = { ...defaultComposerDraft(), ...(current || {}) };
	const unchanged = Number(draft.version || 0) === snapshot.version;
	const accepted = receipt && receipt.state === "accepted";
	return {
		...draft,
		sending: false,
		text: accepted && unchanged ? "" : draft.text,
		version: accepted && unchanged ? snapshot.version + 1 : Number(draft.version || 0),
		receipt: {
			state: String((receipt && receipt.state) || "unknown"),
			disposition: String((receipt && receipt.disposition) || ""),
			message: String((receipt && receipt.message) || ""),
			submittedVersion: snapshot.version,
			submittedText: snapshot.text,
		},
	};
}
/** A transport timeout is ambiguous; only explicit target/API refusal is a rejection. */
function classifyMessageFailure(error) {
	const message = String(error && error.message ? error.message : error || "");
	const status = Number(error && error.status);
	if (status >= 500 || /网络错误|timeout|timed out|peer did not respond|failed to fetch|network|econnreset|econnrefused|socket hang up|aborted|connection lost/i.test(message)) {
		return "unknown";
	}
	return "rejected";
}
function isMessageablePeer(peer) {
	return !!peer && (peer.state === "running" || peer.state === "waiting");
}
function resolveViewerId(peers, currentId) {
	const list = Array.isArray(peers) ? peers : [];
	const current = String(currentId || "");
	if (current && list.some(peer => String(peer && peer.sessionId || "") === current)) return current;
	const next = list.find(isMessageablePeer);
	return next ? String(next.sessionId || "") : "";
}
function messageAvailabilityLabel(peer) {
	if (!peer) return "目标会话不可用";
	if (peer.state === "running") return "在线 · 正在运行，可发送";
	if (peer.state === "waiting") return "在线 · 空闲，可发送";
	if (peer.state === "offline") return "离线 · 草稿保留，恢复在线后可发送";
	return "已结束 · 草稿保留";
}
function messageSourceLabel(peer) {
	if (!peer) return "网页直发 · 不建立会话关注";
	const cwd = String(peer.cwd || "").replace(/[\\/]+$/, "");
	const title = String(peer.title || cwd.split(/[\\/]/).pop() || "未命名会话");
	const states = { running: "运行中", waiting: "在线·空闲", offline: "离线", closed: "已结束" };
	return "会话协作 · " + title + " · " + String(peer.sessionId || "").slice(-8) + " · " + (states[peer.state] || "状态未知");
}
function messageSourceTitle(peer) {
	if (!peer) return "网页直发不会建立会话关注关系";
	return "以该会话作为协作来源；消息成功交付后会建立它到目标会话的关注关系";
}
function buildHistory(entries) {
	const out = [];
	let run = null;
	for (const e of Array.isArray(entries) ? entries : []) {
		if (e && e.role === "toolResult") {
			if (!run) {
				run = { kind: "tools", key: "t:" + String(e.id || out.length), items: [] };
				out.push(run);
			}
			run.items.push(e);
		} else {
			run = null;
			out.push({ kind: "entry", key: "e:" + String((e && e.id) || out.length), e });
		}
	}
	for (const it of out) {
		if (it.kind !== "tools") continue;
		const names = [];
		let errors = 0;
		for (const e of it.items) {
			const n = String(e.toolName || "工具");
			if (!names.includes(n)) names.push(n);
			if (e.isError) errors++;
		}
		it.count = it.items.length;
		it.toolNames = names.slice(0, 3);
		it.extraTools = Math.max(0, names.length - 3);
		it.errorCount = errors;
		it.open = it.count < 2; // runs of 2+ start collapsed
	}
	return out;
}
/** How a mesh peer maps onto a herdr surface. Resolution order mirrors
 *  resume.ts findHerdrHost: newest resume link (resumptions[].herdrWorkspaceId)
 *  first, then a live herdr agent whose sessionPath equals the peer's
 *  sessionFile. Returns null when the peer is not in herdr. */
function resolveHerdrHost(peer, agents) {
	const rs = Array.isArray(peer && peer.resumptions) ? peer.resumptions : [];
	let link = null;
	for (const r of rs) if (r && r.herdrWorkspaceId) link = r; // newest last
	const list = Array.isArray(agents) ? agents : [];
	const sessionFile = String((peer && peer.sessionFile) ?? "");
	const hit = list.find((a) => a && a.sessionPath && a.sessionPath === sessionFile) || null;
	if (link) {
		return {
			via: "resume",
			workspaceId: String(link.herdrWorkspaceId),
			paneId: String((hit && hit.paneId) || link.herdrPaneId || ""),
			status: String((hit && hit.status) || "resume-link"),
			command: "herdr workspace focus " + String(link.herdrWorkspaceId),
		};
	}
	if (hit) {
		return {
			via: "agent",
			workspaceId: String(hit.workspaceId || ""),
			paneId: String(hit.paneId || ""),
			status: String(hit.status || "unknown"),
			command: "herdr agent focus " + String(hit.paneId || ""),
		};
	}
	return null;
}

/* ----------------------------- terminal helpers ----------------------------- */
/** Clamp to an integer within bounds (herdr accepts cols 20..400, rows 5..200). */
function clampInt(v, min, max) {
	const n = Math.round(Number(v));
	if (!Number.isFinite(n)) return min;
	return Math.min(max, Math.max(min, n));
}
/** UTF-8-safe base64 of a JS string -> `terminal.input` bytes (herdr JSONL). */
function utf8ToBase64(str) {
	const bytes = new TextEncoder().encode(String(str ?? ""));
	let bin = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
	}
	return btoa(bin);
}
/** Decode herdr base64 frame bytes -> Uint8Array (fed straight into WTerm.write). */
function base64ToBytes(b64) {
	const bin = atob(String(b64 ?? ""));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}
/** Decode herdr base64 frame bytes as UTF-8 text (inspection helper). */
function base64ToUtf8(b64) {
	return new TextDecoder("utf-8").decode(base64ToBytes(b64));
}
/** JSONL envelope: terminal input -> herdr (verbatim contract, see protocol.ts). */
function terminalInputLine(data) {
	return JSON.stringify({ type: "terminal.input", bytes: utf8ToBase64(data) });
}
/** JSONL envelope: terminal resize -> herdr (clamped to herdr bounds). */
function terminalResizeLine(cols, rows) {
	return JSON.stringify({ type: "terminal.resize", cols: clampInt(cols, 20, 400), rows: clampInt(rows, 5, 200) });
}
/** Raw bytes -> base64 (`terminal.input` binary frames: X10 mouse reports etc). */
function bytesToBase64(bytes) {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let bin = "";
	for (let i = 0; i < arr.length; i += 0x8000) {
		bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
	}
	return btoa(bin);
}
/** JSONL envelope: binary terminal input -> herdr (verbatim bytes, not text). */
function terminalInputBytesLine(bytes) {
	return JSON.stringify({ type: "terminal.input", bytes: bytesToBase64(bytes) });
}
/** JSONL envelope: terminal.scroll -> herdr (probed shape: direction up|down + u16 lines). */
function terminalScrollLine(direction, lines) {
	return JSON.stringify({
		type: "terminal.scroll",
		direction: direction === "up" ? "up" : "down",
		lines: clampInt(lines, 0, 65535),
	});
}
/** JSONL envelope: terminal.release -> herdr (probed shape: no fields, detaches). */
function terminalReleaseLine() {
	return JSON.stringify({ type: "terminal.release" });
}
/**
 * Pure mouse-report encoder matching the active core wire encoding
 * (`mouseEncoding()`: x10 | utf8 | sgr | urxvt | sgr-pixels).
 *
 * report = { encoding, kind: "press"|"release"|"move"|"wheel",
 *            button, buttons, x, y, shift, alt, ctrl, deltaX, deltaY }
 * Returns the exact wire bytes (Uint8Array) or null when the event cannot be
 * represented in that encoding (out-of-range coordinates, zero wheel delta).
 * x10 emits raw bytes (send via terminalInputBytesLine); the other encodings
 * are UTF-8 text-safe (1005 intentionally wants UTF-8 code points).
 */
function encodeMouseReport(report) {
	const r = report || {};
	const encoding = String(r.encoding || "");
	const kind = String(r.kind || "");
	const x = Math.max(1, Math.round(Number(r.x) || 0));
	const y = Math.max(1, Math.round(Number(r.y) || 0));
	const mods = (r.shift ? 4 : 0) | (r.alt ? 8 : 0) | (r.ctrl ? 16 : 0);
	let code;
	let fin = "M";
	if (kind === "wheel") {
		const dx = Number(r.deltaX) || 0;
		const dy = Number(r.deltaY) || 0;
		if (Math.abs(dx) > Math.abs(dy)) {
			if (dx === 0) return null;
			code = (dx < 0 ? 66 : 67) | mods; // wheel left / right
		} else {
			if (dy === 0) return null;
			code = (dy < 0 ? 64 : 65) | mods; // wheel up / down
		}
	} else if (kind === "press" || kind === "release" || kind === "move") {
		const buttons = Number(r.buttons) || 0;
		const button =
			kind === "release" && encoding !== "sgr" && encoding !== "sgr-pixels"
				? 3
				: kind === "move"
					? buttons === 0
						? 3
						: buttons & 4
							? 1
							: buttons & 2
								? 2
								: 0
					: r.button === 1
						? 1
						: r.button === 2
							? 2
							: 0;
		code = button | mods | (kind === "move" ? 32 : 0);
		if (kind === "release") fin = "m";
	} else {
		return null;
	}
	if (encoding === "x10") {
		if (x > 223 || y > 223) return null; // legacy 6-byte cap (offset 32)
		return Uint8Array.of(0x1b, 0x5b, 0x4d, (code + 32) & 0xff, x + 32, y + 32);
	}
	if (encoding === "utf8") {
		if (x > 2015 || y > 2015) return null; // 3-byte UTF-8 cap
		return new TextEncoder().encode("\x1b[M" + String.fromCodePoint(code + 32, x + 32, y + 32));
	}
	if (encoding === "urxvt") {
		return new TextEncoder().encode("\x1b[" + (code + 32) + ";" + x + ";" + y + "M");
	}
	if (encoding === "sgr" || encoding === "sgr-pixels") {
		return new TextEncoder().encode("\x1b[<" + code + ";" + x + ";" + y + fin);
	}
	return null;
}
/**
 * True when the output stream carried mouse/alt-screen DECSET/DECRST sequences
 * (modes 9/1000/1002/1003/1004/1005/1006/1015/1016/1047/1048/1049) as real
 * terminal state. The core's mode state only reflects sequences it parsed: a
 * mid-stream attach (herdr terminal session replays a bare screen paint) never
 * sees the app's earlier modes, so "no activity since attach" means the state
 * is unknown. Only the frame's state prologue counts: herdr frames are cell
 * paints, and escape-looking TEXT on screen (code diffs, terminal docs) must
 * never be mistaken for mode activity — cells only appear after the first
 * cursor-positioning sequence.
 */
function termModeActivity(bytes) {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let bin = "";
	for (let i = 0; i < arr.length; i += 0x8000) {
		bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
	}
	const cut = bin.search(/\x1b\[\d+;\d+[Hf]/);
	const head = cut === -1 ? bin : bin.slice(0, cut);
	return /\x1b\[\?(?:\d+;)*(?:9|1000|1002|1003|1004|1005|1006|1015|1016|1047|1048|1049)(?:;\d+)*[hl]/.test(head);
}
/**
 * Click policy for the embedded terminal.
 * state = { tracking, modesSeen, mouse, shift }
 * - "wterm": trusted mode activity (frame prologue) says the app captures the
 *   mouse; WTerm's InputHandler encodes and sends the report itself.
 * - "report": forward an SGR report here — the stale zone: the app set its
 *   mouse modes before this mid-stream attach so the core never saw them
 *   (pi TUIs capture with1006; verified live against a real pane).
 * - "select": leave the click to native text selection.
 */
function termClickAction(state) {
	const s = state || {};
	if (s.shift) return "select";
	if (Number(s.tracking) && s.modesSeen) return "wterm";
	if (s.mouse === "local") return "select";
	if (!s.modesSeen) return "report";
	return "select";
}
/**
 * Wheel policy for the embedded terminal.
 * state = { tracking, modesSeen, mouse, altScreen, shift, deltaY, canScrollLocal }
 * - "wterm": trusted mode activity says the app captures the mouse — reports
 *   come from WTerm's InputHandler.
 * - "native": the local DOM scrollback can still move in this direction (only
 *   possible on transports that stream raw bytes; herdr's rendered frames
 *   never accumulate local history).
 * - "report": forward SGR wheel reports — fullscreen TUIs scroll their own
 *   viewport (pi handles buttons 64/65; verified live).
 * - "scroll": scroll the herdr pane history via terminal.scroll (the shared
 *   pane scroll state — the transport's only scrollback): shift+wheel and
 *   鼠标·本地.
 * - "page": translate the wheel to PageUp/PageDown for fullscreen apps that
 *   did not capture the mouse.
 */
function termWheelAction(state) {
	const s = state || {};
	if (s.shift) return "scroll"; // shift+wheel always scrolls pane history
	if (Number(s.tracking) && s.modesSeen) return "wterm";
	if (s.canScrollLocal) return "native";
	if (s.mouse === "local") return "scroll";
	if (!s.modesSeen) return "report";
	return s.altScreen ? "page" : "scroll";
}
/** Race a promise against a timeout: a stalled module/wasm fetch must surface
 *  as a terminal error instead of leaving the panel on 正在连接终端… forever. */
function withTimeout(promise, ms, label) {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error((label || "加载") + " 超时")), ms);
		Promise.resolve(promise).then(
			(v) => { clearTimeout(t); resolve(v); },
			(e) => { clearTimeout(t); reject(e); },
		);
	});
}
/** WS URL of the hub terminal bridge: ws(s)://<same-host>/api/terminal?... */
function terminalWsUrl(target, mode, cols, rows, loc) {
	const at = loc || (typeof location !== "undefined" ? location : { protocol: "http:", host: "" });
	const scheme = String(at.protocol) === "https:" ? "wss://" : "ws://";
	return (
		scheme + at.host +
		"/api/terminal?target=" + encodeURIComponent(String(target ?? "")) +
		"&mode=" + (mode === "observe" ? "observe" : "control") +
		"&cols=" + clampInt(cols, 20, 400) +
		"&rows=" + clampInt(rows, 5, 200)
	);
}
/** CSS colour (hex/rgb/rgba) -> 0xRRGGBB number, or null when unreadable. */
function cssColorToRgb(value) {
	const s = String(value ?? "").trim().toLowerCase();
	if (!s) return null;
	const h = s.match(/^#([0-9a-f]{3,8})$/);
	if (h) {
		const hex = h[1];
		if (hex.length === 3 || hex.length === 4) {
			const r = parseInt(hex[0] + hex[0], 16);
			const g = parseInt(hex[1] + hex[1], 16);
			const b = parseInt(hex[2] + hex[2], 16);
			return (r << 16) | (g << 8) | b;
		}
		if (hex.length === 6 || hex.length === 8) {
			const n = parseInt(hex.slice(0, 6), 16);
			return Number.isNaN(n) ? null : n;
		}
		return null;
	}
	const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
	if (m) {
		return (Math.round(Number(m[1])) << 16) | (Math.round(Number(m[2])) << 8) | Math.round(Number(m[3]));
	}
	return null;
}
/** Map resolved page theme tokens (CSS custom properties) to WTerm theme colors.
 *  background=--panel, foreground=--text, cursor=--accent; the 16-entry palette
 *  is built from the same semantic tokens so ANSI colors follow the theme. */
function buildTerminalTheme(pal) {
	const p = pal || {};
	const rgb = (name) => cssColorToRgb(p[name]);
	const fg = rgb("text");
	const bg = rgb("panel");
	const cursor = rgb("accent");
	const base = fg === null ? 0 : fg;
	const pick = (name) => {
		const v = rgb(name);
		return v === null ? base : v;
	};
	return {
		foreground: base,
		background: bg === null ? 0 : bg,
		cursor: cursor === null ? base : cursor,
		palette: [
			pick("panel3"), pick("danger"), pick("running"), pick("waiting"),
			pick("accent"), pick("danger"), pick("accentStrong"), pick("text"),
			pick("muted"), pick("offline"), pick("running"), pick("waiting"),
			pick("accentStrong"), pick("danger"), pick("accent"), pick("text"),
		],
	};
}
const DISPOSITIONS = { handled: "已交给目标扩展", queued: "已交给目标扩展", started: "已交给目标扩展" };
const VIEWER_KEY = "pi-mesh.viewer"; // localStorage key for 当前视角

/* ----------------------------- theme (light/dark) ----------------------------- */
const THEME_KEY = "pi-mesh.theme"; // localStorage key for 主题 ("light" | "dark")
/** System preference (prefers-color-scheme); light unless the OS asks for dark. */
function systemTheme() {
	try {
		return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	} catch (_) {
		return "light";
	}
}
/** Stored choice wins; on first visit fall back to prefers-color-scheme (default: light). */
function loadTheme() {
	try {
		const t = String(localStorage.getItem(THEME_KEY) || "");
		if (t === "light" || t === "dark") return t;
	} catch (_) {}
	return systemTheme();
}
/** Single theme mechanism: data-theme on <html> drives all CSS custom properties. */
function applyTheme(t) {
	const next = t === "dark" ? "dark" : "light";
	document.documentElement.setAttribute("data-theme", next);
	return next;
}

/* ----------------------------- fetch layer ----------------------------- */
const API = {
	async json(path, opts) {
		let res;
		try {
			res = await fetch(path, opts);
		} catch (e) {
			throw new Error("网络错误: " + (e && e.message ? e.message : String(e)));
		}
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			const error = new Error((body && body.error) || "HTTP " + res.status);
			error.status = res.status;
			throw error;
		}
		if (body && body.ok === false) {
			const error = new Error(body.error || "请求被拒绝");
			error.status = res.status;
			throw error;
		}
		return body || {};
	},
	peers() { return this.json("/api/peers"); },
	/** GET /api/herdr -> { agents: [{paneId, workspaceId, sessionPath, status}] }.
	 *  herdr absent/unreachable simply yields an empty agent list. */
	herdr() { return this.json("/api/herdr"); },
	/** GET /api/peers/:sessionId/transcript?limit&theme[&beforeEntryId] — beforeEntryId
	 *  paginates backwards (older entries) from the head of the loaded window. */
	transcript(sessionId, limit = 50, theme = "", beforeEntryId = "") {
		const t = theme || loadTheme();
		const before = beforeEntryId ? "&beforeEntryId=" + encodeURIComponent(beforeEntryId) : "";
		return this.json("/api/peers/" + encodeURIComponent(sessionId) + "/transcript?limit=" + limit + "&theme=" + encodeURIComponent(t) + before);
	},
	message(sessionId, text, mode, fromSessionId) {
		return this.json("/api/peers/" + encodeURIComponent(sessionId) + "/message", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text, mode: mode, fromSessionId: fromSessionId || undefined }),
		});
	},
	follow(sessionId, targetSessionId) {
		return this.json("/api/peers/" + encodeURIComponent(sessionId) + "/follow", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetSessionId: targetSessionId }),
		});
	},
	unfollow(sessionId, targetSessionId) {
		return this.json("/api/peers/" + encodeURIComponent(sessionId) + "/unfollow", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetSessionId: targetSessionId }),
		});
	},
	cancel(sessionId) {
		return this.json("/api/peers/" + encodeURIComponent(sessionId) + "/cancel", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
		});
	},
	/** POST /api/peers/:sessionId/resume {fork} -> {ok, message, workspaceId?, paneId?}.
	 *  Always HTTP 200: ok:false is a handled refusal carried in `message`, so unlike
	 *  json() this resolves with the body (the caller toasts message green/red). */
	async resume(sessionId, fork) {
		let res;
		try {
			res = await fetch("/api/peers/" + encodeURIComponent(sessionId) + "/resume", {
				method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fork: !!fork }),
			});
		} catch (e) {
			throw new Error("网络错误: " + (e && e.message ? e.message : String(e)));
		}
		const body = await res.json().catch(() => null);
		if (!res.ok) throw new Error((body && (body.error || body.message)) || "HTTP " + res.status);
		return body || {};
	},
	/** POST /api/peers/:sessionId/focus -> {ok, message, workspaceId?}.
	 *  Always HTTP 200: ok:false is a handled refusal carried in `message`, so
	 *  this resolves with the body (the caller toasts message green/red). */
	async focus(sessionId) {
		let res;
		try {
			res = await fetch("/api/peers/" + encodeURIComponent(sessionId) + "/focus", {
				method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
			});
		} catch (e) {
			throw new Error("网络错误: " + (e && e.message ? e.message : String(e)));
		}
		const body = await res.json().catch(() => null);
		if (!res.ok) throw new Error((body && (body.error || body.message)) || "HTTP " + res.status);
		return body || {};
	},
	/** POST /api/herdr/new-session {cwd?, label?} -> {ok, message, workspaceId?, paneId?}.
	 *  Same contract as resume: always HTTP 200, ok:false is a handled refusal
	 *  carried in `message` (the caller toasts green/red). */
	async newSession(cwd, label) {
		let res;
		try {
			res = await fetch("/api/herdr/new-session", {
				method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd: cwd || undefined, label: label || undefined }),
			});
		} catch (e) {
			throw new Error("网络错误: " + (e && e.message ? e.message : String(e)));
		}
		const body = await res.json().catch(() => null);
		if (!res.ok) throw new Error((body && (body.error || body.message)) || "HTTP " + res.status);
		return body || {};
	},
};

/* ----------------------------- Alpine app ----------------------------- */
document.addEventListener("alpine:init", () => {
	Alpine.data("mesh", () => ({
		peers: [],
		herdrAgents: [], // GET /api/herdr agents (peer.sessionFile join key)
		now: Date.now(),
		connState: "connecting", // SSE 展示态: connecting | connected | retrying | paused
		connEver: false, // 曾成功建立过（断网告警仅在建立后出现）
		connBanner: false, // 「连接断开 · 正在自动重连…」（建立后掉线 + ~1.8s 宽限）
		paused: false,
		toasts: [],
		compose: {},
		composerComposing: false,
		stateFilter: readStateFilter(), // 首次默认在线；用户选择持久化
		repoFilter: "", // repo 头过滤图标 / 移动端 chips（grouped key）
		search: "", // SessionList 搜索（/ 聚焦）
		booting: true, // SkeletonRows 首屏
		mobileView: "list", // 移动端推入式路由: list | detail
		mobileTab: "sessions", // 移动端底栏: sessions | discover | settings
		confirmAction: "", // ConfirmPopover: "" | "cancel" | "resume"
		confirmFor: "", // 取消目标 sessionId
		resumeFor: "", // 恢复目标 sessionId
		resumeFork: false, // --fork checkbox state for the pending 恢复
		confirmX: 120,
		confirmY: 120,
		menuSid: "", // RowOverflowMenu 打开的行 sessionId
		detailMenu: false, // 详情 overflow 菜单（与行菜单/右键菜单互斥）
		viewerOpen: false, // 自定义 当前视角 下拉
		viewerIndex: 0, // 下拉键盘游标
		ctx: { open: false, cwd: "" }, // 右键 ContextMenu（新建对话到 herdr）
		menuPos: { x: 0, y: 0 }, // 弹出菜单锚点（--menu-x/--menu-y，popupPos 夹取/翻转）
		menuAnchor: null, // 原始按钮矩形或右键坐标；实测尺寸后从这里重算
		fileTreeCollapsed: {}, // Overview 文件活动树：目录折叠状态（path -> bool）
		collapsed: {}, // 列表 repo 组折叠（root -> true；pi-mesh.collapsed 持久化）
		panes: { list: 0 }, // 拖拽栏宽（0 = 自动默认；pi-mesh.panes 持久化）
		branchFilter: "", // 分支头过滤图标（与 repoFilter 成对开关）
		cmd: { open: false, query: "", index: 0 }, // ⌘K CommandBar
		viewerId: "", // 当前视角 sessionId (localStorage-persisted)
		selectedId: "", // 选中会话 (localStorage + URL hash #p=<sid>&tab=<t> 持久化)
		detailTab: "session", // 详情主视图: session | changes | terminal（兼容旧 tab hash）
		reviewFocus: "", // 一次性 Review 导航路径（支持原始别名）
		reviewSelectedFile: "", // Review 稳定 fileKey；写入 URL 用于深链接恢复
		theme: "light", // 主题: "light" | "dark" (data-theme on <html>, persisted in localStorage)
		review: { open: false, sessionId: "", title: "" },
		drawer: { open: false, sessionId: "", title: "", entries: [], items: [], textOpen: {}, loading: false, error: "", hasMore: false, loadingOlder: false },
		/* embedded herdr terminal (wterm + ghostty), one session per drawer */
		term: { open: false, fullscreen: false, sessionId: "", title: "", target: "", mode: "control", status: "connecting", error: "" },
		_termWs: null,
		_wterm: null,
		_termCore: null,
		_termResizeTimer: null,
		_termRetried: false,
		_termGen: 0,
		_termModules: null,
		_termKeyHandler: null,
		_termMenuHandler: null,
		_termMouseHandlers: null,
		_termMouseButtons: 0,
		_es: null,
		_queue: [],
		_flushScheduled: false,
		_connBannerTimer: null,
		init() {
			this.theme = applyTheme(loadTheme());
			this.viewerId = this.loadViewer();
			this.loadPanes();
			this.loadCollapsed();
			this.restoreSelection();
			this.refreshPeers(true);
			this.connect();
			setInterval(() => (this.now = Date.now()), 5000);
			window.addEventListener("hashchange", () => this.restoreSelection());
			// ⌘K / Ctrl+K opens the CommandBar
			window.addEventListener("keydown", (e) => {
				if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
					e.preventDefault();
					if (this.cmd.open) this.closeCommand();
					else this.openCommand();
				}
			});
		},
		/* theme toggle (sun/moon button in the header) */
		toggleTheme() {
			const next = this.theme === "dark" ? "light" : "dark";
			this.theme = applyTheme(next);
			try { localStorage.setItem(THEME_KEY, this.theme); } catch (_) {}
			this.toast(this.theme === "dark" ? "已切换到深色主题" : "已切换到浅色主题", "info");
			this.refreshTermTheme(); // live terminal follows the new palette
			// 主题切换重新拉取历史（?theme= 决定 mermaid/EC 主题）+ 重开 Review
			if (this.detailTab === "session" && this.selected) this.openHistory(this.selected);
			else if (this.detailTab === "changes" && this.selected) this.openReview(this.selected); // ReviewPanel 主题切换重开
		},
		onEscape() {
			if (this.term.open) {
				// terminal-first: ⛶ fullscreen unwinds one level at a time
				if (this.term.fullscreen) this.term.fullscreen = false;
				else this.closeTerminal();
			} else if (this.confirmAction) this.closeConfirm();
			else if (this.menuSid) this.menuSid = "";
			else if (this.detailMenu) this.detailMenu = false;
			else if (this.ctx.open) this.ctx.open = false;
			else if (this.viewerOpen) this.viewerOpen = false;
			else if (this.cmd.open) this.closeCommand();
			else if (this.mobileView === "detail") this.mobileView = "list"; // 900–1179px 详情浮层
			else if (this.search) this.search = "";
		},
		/* SSE live stream: throttled apply + auto reconnect */
		closeEs() {
			if (!this._es) return;
			try { this._es.close(); } catch (_) {}
			this._es = null;
		},
		connect() {
			if (this.paused) return;
			this.closeEs();
			if (this.connState !== "retrying") this.connState = "connecting";
			let es;
			try {
				es = new EventSource("/api/events");
			} catch (_) {
				this.markConnLost();
				return this.scheduleReconnect();
			}
			this._es = es;
			es.onopen = () => {
				this.connState = connNextState("open", this.connEver);
				this.connEver = true;
				this.connBanner = false;
				if (this._connBannerTimer) {
					clearTimeout(this._connBannerTimer);
					this._connBannerTimer = null;
				}
				this.refreshPeers(true);
			};
			const onMsg = (ev) => {
				if (this.paused) return;
				try { this.enqueue(JSON.parse(ev.data)); } catch (_) {}
			};
			es.onmessage = onMsg;
			es.addEventListener("peers", onMsg);
			es.addEventListener("file_activity", onMsg);
			es.onerror = () => {
				if (this.paused) return;
				if (es.readyState === 1) return; // still open — nothing to report
				// transient auto-retry (0) or fatal close (2): mark the loss once,
				// brief blips recover inside the banner grace and stay silent
				this.markConnLost();
				if (es.readyState === 2) {
					this.closeEs();
					this.scheduleReconnect();
				}
			};
		},
		/** Connection lost/erroring: 重连中 (未建立过则保持 连接中) + banner grace. */
		markConnLost() {
			this.connState = connNextState("lost", this.connEver);
			this.armConnBanner();
		},
		/** 「连接断开」banner only after a ~1.8s grace — quick blips never flash it. */
		armConnBanner() {
			if (!this.connEver || this._connBannerTimer) return;
			this._connBannerTimer = setTimeout(() => {
				this._connBannerTimer = null;
				if (!this.paused && connBannerOn(this.connEver, this.connState)) this.connBanner = true;
			}, 1800);
		},
		scheduleReconnect() {
			setTimeout(() => { if (!this.paused && !this._es) this.connect(); }, 3000);
		},
		setPaused(v) {
			this.paused = v;
			if (v) {
				this.connState = connNextState("pause", this.connEver);
				this.closeEs();
				this.connBanner = false;
				if (this._connBannerTimer) {
					clearTimeout(this._connBannerTimer);
					this._connBannerTimer = null;
				}
				this.toast("实时更新已暂停", "info");
			} else {
				this.connState = connNextState("resume", this.connEver);
				this.connect();
				this.toast("实时更新已恢复", "success");
			}
		},
		enqueue(evt) {
			this._queue.push(evt);
			if (this._flushScheduled) return;
			this._flushScheduled = true;
			setTimeout(() => {
				this._flushScheduled = false;
				for (const e of this._queue.splice(0)) this.applyEvent(e);
			}, 120);
		},
		applyEvent(evt) {
			if (!evt || typeof evt !== "object") return;
			if (evt.type === "peers") {
				this.peers = Array.isArray(evt.peers) ? evt.peers : [];
				this.syncViewer();
				this.syncSelected();
			} else if (evt.type === "file_activity") {
				const p = this.peers.find((x) => x.sessionId === evt.sessionId);
				if (!p) return;
				p.files = mergeFileActivities(p.files, evt.files, FILE_ACTIVITY_LIMIT);
			}
		},
		/* REST */
		async refreshPeers(silent) {
			try {
				const body = await API.peers();
				this.peers = Array.isArray(body.peers) ? body.peers : [];
				this.syncViewer();
				this.syncSelected();
				if (!silent) this.toast("已刷新 · " + this.peers.length + " 个实例", "success");
			} catch (e) {
				if (!silent) this.toast("刷新失败: " + e.message, "error");
			}
			this.booting = false;
			this.refreshHerdr(true);
		},
		/* herdr index (GET /api/herdr): refreshed on load and after every refreshPeers() */
		async refreshHerdr(silent) {
			try {
				const body = await API.herdr();
				this.herdrAgents = Array.isArray(body.agents) ? body.agents : [];
			} catch (e) {
				this.herdrAgents = [];
				if (!silent) this.toast("herdr 状态获取失败: " + e.message, "error");
			}
		},
		/* derived views */
		/* SSE建立状态（模板/测试兼容：connected === connState === "connected"） */
		get connected() {
			return this.connState === "connected";
		},
		get counts() {
			const c = { running: 0, waiting: 0, online: 0, offline: 0, closed: 0, total: this.peers.length };
			for (const p of this.peers) if (c[p.state] !== undefined) c[p.state]++;
			c.online = c.running + c.waiting;
			return c;
		},
		get grouped() {
			const byRepo = new Map();
			for (const p of this.peers) {
				// 自动分组：检测到 git 仓库按 repoRoot，否则按会话目录（cwd）
				const root = (p.git && p.git.repoRoot) || String(p.cwd || "");
				if (!byRepo.has(root)) byRepo.set(root, []);
				byRepo.get(root).push(p);
			}
			const out = [];
			for (const [root, list] of byRepo) {
				const isGit = list.some((p) => p.git && p.git.repoRoot);
				const byWt = new Map();
				for (const p of list) {
					const w = (p.git && p.git.worktree) || "none";
					if (!byWt.has(w)) byWt.set(w, []);
					byWt.get(w).push(p);
				}
				const worktrees = [...byWt.entries()].map(([w, plist]) => {
					const byBr = new Map();
					for (const p of plist) {
						const b = (p.git && p.git.branch) || "(无分支)";
						if (!byBr.has(b)) byBr.set(b, []);
						byBr.get(b).push(p);
					}
					const branches = [...byBr.entries()].map(([name, peers]) => ({
						key: root + "|" + w + "|" + name,
						name,
						peers: peers.slice().sort(comparePeersByStartedAt),
					}));
					branches.sort((a, b) => a.name.localeCompare(b.name));
					return { key: root + "|" + w, label: wtLabel(w === "none" ? null : w), order: w === "main" ? 0 : w === "linked" ? 1 : 2, branches };
				}).sort((a, b) => a.order - b.order);
				const g = {
					key: root || "__no_git__",
					isGit,
					name: root ? basename(root) : "无 Git 仓库",
					worktrees,
				};
				// 单链条（单工作树 + 单分支）在分区头里折叠为一行
				g.single = worktrees.length === 1 && worktrees[0].branches.length === 1;
				out.push(g);
			}
			out.sort((a, b) => (a.key === "__no_git__") - (b.key === "__no_git__") || a.name.localeCompare(b.name));
			return disambiguateNames(out);
		},
		/* viewer (当前视角) + follows (关注) */
		loadViewer() {
			try { return String(localStorage.getItem(VIEWER_KEY) || ""); } catch (_) { return ""; }
		},
		saveViewer(id) {
			try { localStorage.setItem(VIEWER_KEY, String(id || "")); } catch (_) {}
		},
		/** Preserve an existing source choice; only choose a live source when the saved one disappeared. */
		syncViewer() {
			if (!this.peers.length) return; // an empty SSE snapshot is not proof that the chosen source disappeared
			const next = resolveViewerId(this.peers, this.viewerId);
			if (next !== this.viewerId) {
				this.viewerId = next;
				this.saveViewer(next);
			}
		},
		setViewer(id) {
			this.viewerId = String(id || "");
			this.saveViewer(this.viewerId);
			this.toast(this.viewerId ? "当前视角 · " + sid8(this.viewerId) : "已清除当前视角", "info");
		},
		get viewerOptions() {
			return this.peers
				.slice()
				.sort(comparePeersByStartedAt)
				.map((p) => ({
					sessionId: String(p.sessionId ?? ""),
					label: sid8(p.sessionId) + " · " + (p.title || basename(p.cwd)) + " · " + (STATE_META[p.state] ? STATE_META[p.state].label : "状态未知"),
				}));
		},
		get viewer() {
			return this.peers.find((p) => String(p.sessionId ?? "") === this.viewerId) || null;
		},
		isSelf(p) {
			return !!this.viewerId && String(p.sessionId ?? "") === this.viewerId;
		},
		/* ---------------- selection model + detail tabs ---------------- */
		peerById(sid) {
			const s = String(sid ?? "");
			return this.peers.find((p) => String(p.sessionId ?? "") === s) || null;
		},
		/** Accept a peer object or a sessionId string. */
		peerOf(pOrSid) {
			if (pOrSid && typeof pOrSid === "object") return pOrSid;
			return this.peerById(pOrSid);
		},
		get selected() {
			return this.peerById(this.selectedId);
		},
		/** Keep the selected target and its draft when list filters hide its row. */
		get selectedHidden() {
			return isSelectedHidden(this.selectedId, this.visiblePeers);
		},
		/** Select a session row; panels reload lazily for the new peer. */
		selectPeer(sid, opts) {
			const next = String(sid ?? "");
			const changed = next !== this.selectedId;
			this.selectedId = next;
			if (changed) {
				// panels belong to the old peer: tear the terminal down (unmount contract)
				if (this.term.open) this.closeTerminal();
				this.drawer.sessionId = "";
				this.drawer.entries = [];
				this.drawer.items = [];
				this.drawer.error = "";
				this.review.sessionId = "";
				this.reviewFocus = "";
				this.reviewSelectedFile = "";
				const order = this.visiblePeers;
				this._selIdx = Math.max(0, order.findIndex((p) => String(p.sessionId ?? "") === next));
			}
			this.persistSelection();
			if (opts && opts.tab) this.setTab(opts.tab);
			else if (changed) this.loadTab();
		},
		/** Lazy content for the active tab (history/review/terminal load on demand). */
		loadTab() {
			const p = this.selected;
			if (!p) return;
			if (this.detailTab === "session") this.openHistory(p);
			else if (this.detailTab === "changes") this.openReview(p);
			else if (this.detailTab === "terminal" && this.herdrInfo(p) && this.term.sessionId !== this.selectedId) this.openTerminal(p);
		},
		/** Restored selection (F5 / hash): load the active tab's lazy content once —
		 *  restoreSelection() sets selectedId+detailTab but never fetches. SSE
			 *  refreshes route through here too; the sessionId guards make those no-ops. */
		ensureTab() {
			const p = this.selected;
			if (!p) return;
			if (this.detailTab === "session") {
				if (this.drawer.sessionId !== this.selectedId) this.openHistory(p);
			} else if (this.detailTab === "changes") {
				if (this.review.sessionId !== this.selectedId) this.openReview(p);
			} else if (this.detailTab === "terminal" && this.herdrInfo(p) && this.term.sessionId !== this.selectedId) {
				this._tabSwitch = true; // restored boot must never steal focus
				this.openTerminal(p);
				this._tabSwitch = false;
			}
		},
		setTab(tab) {
			const id = normalizeDetailTab(tab);
			this.detailTab = id;
			this.persistSelection();
			this._tabSwitch = true; // tab switches must never auto-focus the terminal
			this.loadTab();
			this._tabSwitch = false;
			// focus moves to the panel heading — never auto-focus the terminal
			this.$nextTick(() => {
				const el = this.$refs.detailTitle;
				if (el && typeof el.focus === "function") el.focus();
			});
		},
		/** selectedId + detailTab persist in localStorage and URL hash #p=<sid>&tab=<t>. */
		persistSelection() {
			try {
				localStorage.setItem("pi-mesh.selected", this.selectedId || "");
				localStorage.setItem("pi-mesh.tab", this.detailTab || "session");
				localStorage.setItem("pi-mesh.review-file", this.reviewSelectedFile || "");
				localStorage.setItem("pi-mesh.review-file-session", this.selectedId || "");
			} catch (_) {}
			if (typeof history !== "undefined" && history.replaceState) {
				const fileParam = this.detailTab === "changes" && this.reviewSelectedFile
					? "&file=" + encodeURIComponent(this.reviewSelectedFile)
					: "";
				const h = "#p=" + encodeURIComponent(this.selectedId || "") + "&tab=" + encodeURIComponent(this.detailTab || "session") + fileParam;
				if (location.hash !== h) history.replaceState(null, "", h);
			}
		},
		restoreSelection() {
			let sid = "";
			let tab = "";
			let file = "";
			const hash = String(typeof location !== "undefined" ? location.hash : "");
			if (hash.startsWith("#")) {
				const parsed = parseSelectionHash(hash);
				sid = parsed.sessionId;
				tab = parsed.tab;
				file = parsed.file;
				if (!file) {
					try {
						const savedFileSession = String(localStorage.getItem("pi-mesh.review-file-session") || "");
						if (savedFileSession === sid) file = String(localStorage.getItem("pi-mesh.review-file") || "");
					} catch (_) {}
				}
			} else {
				try {
					sid = String(localStorage.getItem("pi-mesh.selected") || "");
					tab = String(localStorage.getItem("pi-mesh.tab") || "");
					const savedFileSession = String(localStorage.getItem("pi-mesh.review-file-session") || "");
					if (savedFileSession === sid) file = String(localStorage.getItem("pi-mesh.review-file") || "");
				} catch (_) {}
			}
			const previousSessionId = this.selectedId;
			const previousFile = this.reviewSelectedFile;
			this.detailTab = normalizeDetailTab(tab);
			this.selectedId = sid;
			this.reviewSelectedFile = file;
			this.reviewFocus = this.detailTab === "changes" ? file : "";
			if (sid === previousSessionId && this.detailTab === "changes" && file !== previousFile && this.selected) {
				this.openReview(this.selected);
			} else {
				this.ensureTab(); // restored tab content loads (no-op before peers arrive)
			}
		},
		/** SSE 刷新不动选择；peer 消失→最近行 + toast. */
		syncSelected() {
			if (!this.peers.length) {
				// 瞬时的空快照不清除选择 —— SSE 重渲染不会把选中行打回第一行
				return;
			}
			if (this.selectedId && this.peerById(this.selectedId)) {
				this.ensureTab(); // boot: peers just arrived for the restored selection
				return;
			}
			if (this.selectedId) this.toast("该会话已不存在", "info");
			const order = this.visiblePeers;
			const pick = order[Math.min(this._selIdx || 0, order.length - 1)] || order[0];
			this.selectedId = String((pick && pick.sessionId) ?? "");
			this.persistSelection();
			this.loadTab();
		},
		canFollow() {
			return !!this.viewerId;
		},
		/* state-filtered + searched flat list (SessionList rows / keyboard order) */
		get filteredPeers() {
			const q = this.search.trim().toLowerCase();
			return this.peers.filter((p) => {
				// Search is intentionally global across online/offline/closed sessions.
				if (!matchesStateFilter(p, this.stateFilter, !!q)) return false;
				if (this.repoFilter) {
					// 分组键 = git repoRoot 或会话目录（与 grouped 一致）
					const root = (p.git && p.git.repoRoot) || String(p.cwd || "") || "__no_git__";
					if (root !== this.repoFilter) return false;
				}
				if (this.branchFilter && ((p.git && p.git.branch) || "(无分支)") !== this.branchFilter) return false;
				if (!q) return true;
				const hay = [p.title, p.cwd, p.model, p.sessionId, p.git && p.git.branch].join(" ").toLowerCase();
				return hay.includes(q);
			});
		},
		/** Filtered flat sections (repo / worktree / branch) — repoGroups merges them under repo heads. */
		get sections() {
			const keep = new Set(this.filteredPeers.map((p) => String(p.sessionId ?? "")));
			const out = [];
			for (const g of this.grouped) {
				for (const wt of g.worktrees) {
					for (const br in wt.branches) {
						const b = wt.branches[br];
						const peers = b.peers.filter((p) => keep.has(String(p.sessionId ?? "")));
						if (peers.length) out.push({ key: b.key, root: g.key, repo: g.name, wt: wt.label, branch: b.name, peers, single: !!g.single });
					}
				}
			}
			return out;
		},
		get visiblePeers() {
			return visiblePeersOf(this.repoGroups, this.collapsed, this.search);
		},
		/** Same-repo sections fold under one repo header. */
		get repoGroups() {
			return groupByRepo(this.sections);
		},
		/* 文件活动树（概览）:目录可折叠，点按文件 → Review 聚焦 */
		get fileTreeRows() {
			const p = this.selected;
			const files = p && Array.isArray(p.files) ? p.files : [];
			const root = { dirs: new Map(), files: [] };
			const seen = new Set();
			for (const f of files) {
				const path = String((f && f.path) || "");
				if (seen.has(path)) continue; // 同一文件多次改动只保留最新一条（files 新→旧）
				seen.add(path);
				const parts = path.split("/").filter(Boolean);
				let node = root;
				for (let i = 0; i < parts.length - 1; i++) {
					const dirPath = parts.slice(0, i + 1).join("/");
					if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { name: parts[i], path: dirPath, dirs: new Map(), files: [] });
					node = node.dirs.get(parts[i]);
				}
				node.files.push({ path, name: parts[parts.length - 1] || path, op: String((f && f.op) || ""), ts: f && f.ts });
			}
			const rows = [];
			const walk = (node, depth) => {
				for (const dir of node.dirs.values()) {
					rows.push({ kind: "dir", depth, path: dir.path, name: dir.name });
					if (!this.fileTreeCollapsed[dir.path]) walk(dir, depth + 1);
				}
				for (const f of node.files) rows.push({ kind: "file", depth, ...f });
			};
			walk(root, 0);
			return rows;
		},
		toggleFileTree(path) {
			const k = String(path || "");
			this.fileTreeCollapsed[k] = !this.fileTreeCollapsed[k];
		},
		/** 发现：跨会话文件时间线（新→旧） */
		get activityFeed() {
			const out = [];
			for (const p of this.peers) {
				for (const f of Array.isArray(p.files) ? p.files : []) {
					out.push({ sid: String(p.sessionId ?? ""), path: String((f && f.path) || ""), op: String((f && f.op) || ""), ts: f && f.ts });
				}
			}
			out.sort((a, b) => Date.parse(String(b.ts || "")) - Date.parse(String(a.ts || "")));
			return out.slice(0, 30);
		},
		/** 发现：关注图（follower -> followee） */
		get followEdges() {
			const out = [];
			for (const p of this.peers) {
				for (const t of Array.isArray(p.following) ? p.following : []) {
					out.push({ key: String(p.sessionId ?? "") + "->" + String(t ?? ""), from: sid8(p.sessionId), to: sid8(t) });
				}
			}
			return out;
		},
		/** 文件活动树 / 菜单点按 -> Review tab（聚焦该文件） */
		openReviewFile(path) {
			this.reviewFocus = String(path || "");
			this.reviewSelectedFile = this.reviewFocus;
			this.setTab("changes");
		},
		setStateFilter(value) {
			const next = normalizeStateFilter(value);
			this.stateFilter = next;
			try { localStorage.setItem(STATE_FILTER_KEY, next); } catch (_) {}
		},
		/** 无匹配结果空态 CTA：清空搜索 + 状态/仓库/分支过滤 */
		clearFilters() {
			this.setStateFilter("all");
			this.repoFilter = "";
			this.branchFilter = "";
			this.search = "";
		},
		/** Clear only list filters, reveal the same target, and keep its draft untouched. */
		locateSelected() {
			const sid = String(this.selectedId || "");
			const peer = this.selected;
			if (!sid || !peer) return;
			this.clearFilters();
			const root = String((peer.git && peer.git.repoRoot) || peer.cwd || "__no_git__");
			if (this.collapsed[root]) {
				this.collapsed = { ...this.collapsed };
				delete this.collapsed[root];
				this.persistCollapsed();
			}
			this.$nextTick(() => this.focusRow(sid));
		},
		/** repo 过滤入口（repo 头图标 / 移动端 chips）：过滤到该组（再点还原），分支过滤随之清空 */
		toggleGroupFilter(key) {
			const k = String(key || "");
			if (this.repoFilter === k && !this.branchFilter) this.repoFilter = "";
			else {
				this.repoFilter = k;
				this.branchFilter = "";
			}
		},
		/** 分支头过滤图标点按：过滤到该组的该分支（再点还原） */
		toggleBranchFilter(groupKey, name) {
			const k = String(groupKey || "");
			const n = String(name || "");
			if (this.branchFilter === n && this.repoFilter === k) {
				this.branchFilter = "";
				this.repoFilter = "";
			} else {
				this.repoFilter = k;
				this.branchFilter = n;
			}
		},
		/** 搜索非空时强制展开；折叠状态本身不改存储。 */
		isCollapsed(root) {
			return isRepoCollapsed(this.collapsed, root, this.search);
		},
		/** repo 头点按：折叠/展开该组（搜索中不生效）；再点还原。 */
		toggleRepo(root) {
			const next = nextCollapsed(this.collapsed, root, this.search);
			if (next === this.collapsed) return;
			this.collapsed = next;
			this.persistCollapsed();
		},
		loadCollapsed() {
			let saved = null;
			try { saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "null"); } catch (_) {}
			this.collapsed = readCollapsed(saved);
		},
		persistCollapsed() {
			const on = {};
			for (const [k, v] of Object.entries(this.collapsed || {})) if (v) on[k] = true;
			try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(on)); } catch (_) {}
		},
		/** Composer: Enter 发送 / Shift+Enter 换行 */
		onComposerKey(e) {
			if (e.shiftKey || isImeEnter(e, this.composerComposing)) return;
			e.preventDefault();
			if (!this.canSendMessage(this.selectedId)) {
				this.toast("目标会话离线或已结束 · 草稿已保留", "error");
				return;
			}
			this.send(this.selectedId);
		},
		onComposerCompositionStart() {
			this.composerComposing = true;
		},
		onComposerCompositionEnd() {
			this.composerComposing = false;
		},
		/** 键盘模型（window 级，输入/按钮/终端聚焦时让行）：↑↓ 选行（环绕）· Enter 详情 · 1–3 切视图 · / 搜索 · t/r/h/m/f/e */
		onListKey(e) {
			if (!e || e.metaKey || e.ctrlKey || e.altKey) return;
			const t = e.target;
			const tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
			// never hijack typing, native controls, buttons, or the terminal surface
			if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button" || tag === "a" || (t && t.isContentEditable)) return;
			if (this.cmd.open || this.confirmAction || this.ctx.open || this.menuSid || this.detailMenu || this.viewerOpen) return;
			if (this.term.open && t && t.closest && t.closest(".term-panel")) return;
			const rows = this.visiblePeers;
			const key = e.key;
			if (key === "ArrowDown" || key === "ArrowUp") {
				if (!rows.length) return;
				e.preventDefault();
				const delta = key === "ArrowDown" ? 1 : -1;
				const idx = rows.findIndex((p) => String(p.sessionId ?? "") === this.selectedId);
				const base = idx < 0 ? (delta > 0 ? -1 : 0) : idx;
				const next = rows[(base + delta + rows.length) % rows.length];
				this.selectPeer(String(next.sessionId ?? ""));
				this.focusRow(String(next.sessionId ?? ""));
				return;
			}
			if (key === "Enter") {
				e.preventDefault();
				this.setTab(this.detailTab);
				return;
			}
			if (key >= "1" && key <= "3") {
				e.preventDefault();
				this.setTab(["session", "changes", "terminal"][Number(key) - 1]);
				return;
			}
			if (key === "/") {
				e.preventDefault();
				this.focusSearch();
				return;
			}
			const p = this.selected;
			if (!p) return;
			if (key === "t") { e.preventDefault(); this.openTerminal(p); }
			else if (key === "r") { e.preventDefault(); this.setTab("changes"); }
			else if (key === "h") { e.preventDefault(); this.setTab("session"); }
			else if (key === "m") { e.preventDefault(); this.focusComposer(this.selectedId); }
			else if (key === "f") { e.preventDefault(); this.toggleFollow(this.selectedId); }
			else if (key === "e") { e.preventDefault(); this.enterHerdr(p); }
		},
		focusRow(sid) {
			this.$nextTick(() => {
				const el = document.querySelector('.peer-row[data-sid="' + String(sid) + '"]');
				if (el && typeof el.focus === "function") el.focus();
			});
		},
		focusSearch() {
			const el = this.$refs.searchInput;
			if (el && typeof el.focus === "function") el.focus();
		},
		/* ---------------- ⌘K CommandBar：模糊命令 + 最近会话 ---------------- */
		openCommand() {
			this.cmd.open = true;
			this.cmd.query = "";
			this.cmd.index = 0;
			this.$nextTick(() => {
				const el = this.$refs.cmdInput;
				if (el && typeof el.focus === "function") el.focus();
			});
		},
		closeCommand() {
			this.cmd.open = false;
		},
		onCmdKey(e) {
			const items = this.cmdItems;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				this.cmd.index = items.length ? (this.cmd.index + 1) % items.length : 0;
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				this.cmd.index = items.length ? (this.cmd.index - 1 + items.length) % items.length : 0;
			} else if (e.key === "Enter") {
				e.preventDefault();
				this.runCommand(items[this.cmd.index]);
			}
		},
		get cmdItems() {
			const q = this.cmd.query.trim();
			const cmds = [
				{ id: "focus", group: "命令", label: "聚焦会话", icon: "mouse-pointer-2", hint: "" },
				{ id: "compose", group: "命令", label: "发消息", icon: "send", hint: "" },
				{ id: "terminal", group: "命令", label: "打开终端", icon: "square-terminal", hint: "herdr peer" },
				{ id: "review", group: "命令", label: "查看 Review", icon: "file-diff", hint: "" },
				{ id: "history", group: "命令", label: "查看历史", icon: "history", hint: "" },
				{ id: "resume", group: "命令", label: "恢复会话", icon: "rotate-ccw", hint: "offline/closed" },
				{ id: "enter-herdr", group: "命令", label: "进入 herdr", icon: "log-in", hint: "" },
				{ id: "theme", group: "命令", label: "切换主题", icon: "sun-moon", hint: "" },
				{ id: "pause", group: "命令", label: this.paused ? "恢复实时" : "暂停实时", icon: this.paused ? "play" : "pause", hint: "SSE" },
				{ id: "filter-all", group: "过滤状态", label: "全部", icon: "list-filter", hint: "" },
				{ id: "filter-online", group: "过滤状态", label: "在线", icon: "list-filter", hint: "运行中 + 等待" },
				{ id: "filter-offline", group: "过滤状态", label: "离线", icon: "list-filter", hint: "" },
				{ id: "filter-closed", group: "过滤状态", label: "已关闭", icon: "list-filter", hint: "" },
			];
			const sessions = this.peers.map((p) => ({
				id: "sid:" + String(p.sessionId ?? ""),
				group: "最近会话",
				label: p.title || basename(p.cwd),
				icon: "message-square",
				hint: sid8(p.sessionId),
				kind: "session",
				sid: String(p.sessionId ?? ""),
			}));
			const all = [...cmds, ...sessions];
			return q ? all.filter((c) => fuzzyHit(q, c.label + " " + (c.hint || ""))) : all;
		},
		runCommand(c) {
			this.closeCommand();
			if (!c) return;
			if (c.kind === "session") {
				this.selectPeer(c.sid);
				this.focusRow(c.sid);
				return;
			}
			if (String(c.id).startsWith("filter-")) {
				this.setStateFilter(String(c.id).slice(7));
				return;
			}
			switch (c.id) {
				case "focus":
					this.focusRow(this.selectedId);
					break;
				case "compose":
					this.focusComposer(this.selectedId);
					break;
				case "terminal":
					if (this.selected) this.openTerminal(this.selected);
					break;
				case "review":
					this.setTab("changes");
					break;
				case "history":
					this.setTab("session");
					break;
				case "resume":
					if (this.selected && this.canResume(this.selected)) this.openResume(this.selectedId);
					else this.toast("仅离线 / 已关闭会话可恢复", "error");
					break;
				case "enter-herdr":
					if (this.selected) this.enterHerdr(this.selected);
					break;
				case "theme":
					this.toggleTheme();
					break;
				case "pause":
					this.setPaused(!this.paused);
					break;
			}
		},
		/* ---------------- ConfirmPopover 状态（取消 / 恢复） ---------------- */
		/* 临时会话（pi --no-session）：persistence === "memory"（旧字段 ephemeral 兜底），不保存记录 */
		ephemeral(p) {
			return !!p && (p.persistence === "memory" || !!p.ephemeral);
		},
		/** 裸目录名消歧：basename(cwd) 同名行旁显示父目录 */
		parentDirLabel(p) {
			const parts = String((p && p.cwd) || "").replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
			return parts.length >= 2 ? parts[parts.length - 2] : "";
		},
		canResume(pOrSid) {
			const p = this.peerOf(pOrSid);
			return !!p && !this.ephemeral(p) && (p.state === "offline" || p.state === "closed");
		},
		/** Anchor the ConfirmPopover under the triggering control. */
		anchorConfirm(ev) {
			const el = ev && ev.currentTarget;
			const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
			const W = typeof window !== "undefined" ? window.innerWidth : 1024;
			const H = typeof window !== "undefined" ? window.innerHeight : 768;
			this.confirmX = r ? Math.max(8, Math.min(r.left, W - 288)) : 120;
			this.confirmY = r ? Math.min(r.bottom + 6, H - 176) : 120;
		},
		closeConfirm() {
			this.confirmAction = "";
			this.confirmFor = "";
			this.resumeFor = "";
		},
		askCancel(sid, ev) {
			this.confirmAction = "cancel";
			this.confirmFor = String(sid ?? "");
			this.anchorConfirm(ev);
		},
		isFollowing(p) {
			const v = this.viewer;
			const sid = String(p.sessionId ?? "");
			return !!(v && Array.isArray(v.following) && v.following.includes(sid));
		},
		followerIds(p) {
			const sid = String(p.sessionId ?? "");
			return this.peers
				.filter((x) => Array.isArray(x.following) && x.following.includes(sid))
				.map((x) => sid8(x.sessionId));
		},
		followerCount(p) {
			return this.followerIds(p).length;
		},
		followingCount(p) {
			return Array.isArray(p.following) ? p.following.length : 0;
		},
		followerTip(p) {
			const ids = this.followerIds(p);
			return ids.length ? "粉丝 " + ids.length + ": " + ids.join(", ") : "暂无粉丝";
		},
		async toggleFollow(pOrSid) {
			const p = this.peerOf(pOrSid);
			const target = String((p && p.sessionId) ?? pOrSid ?? "");
			if (!target) return;
			if (!this.viewerId) return this.toast("先选择当前视角", "error");
			const was = this.isFollowing(p);
			try {
				if (was) await API.unfollow(this.viewerId, target);
				else await API.follow(this.viewerId, target);
			} catch (e) {
				this.toast((was ? "解绑关注失败: " : "关注失败: ") + e.message, "error");
				return;
			}
			// patch the snapshot locally, then refetch /api/peers to stay authoritative
			const v = this.viewer;
			if (v) {
				const set = new Set(Array.isArray(v.following) ? v.following : []);
				if (was) set.delete(target);
				else set.add(target);
				v.following = [...set];
			}
			this.toast((was ? "已解绑关注 · " : "已关注 · ") + sid8(target), was ? "info" : "success");
			this.refreshPeers(true);
		},
		/* per-card: compose / cancel / history / copy */
		/** 所有弹出菜单互斥（行菜单 / 详情菜单 / 右键菜单 / 视角下拉） */
		closePopups() {
			this.menuSid = "";
			this.detailMenu = false;
			this.ctx.open = false;
			this.viewerOpen = false;
		},
		/** 当前视角 下拉：自定义 menu-at 弹出（无原生 select） */
		toggleViewerMenu(ev) {
			if (this.viewerOpen) {
				this.viewerOpen = false;
				return;
			}
			this.menuSid = "";
			this.detailMenu = false;
			this.ctx.open = false;
			this.viewerOpen = true;
			const idx = this.viewerOptions.findIndex((v) => v.sessionId === this.viewerId);
			this.viewerIndex = idx >= 0 ? idx : 0;
			this.anchorPopup(ev, 288, Math.min(320, this.viewerOptions.length * 24 + 16), "start");
		},
		/** 下拉键盘：↑↓ 移动 · Enter 选中 · Esc 关闭 */
		onViewerKey(e) {
			const n = this.viewerOptions.length;
			if (!n || !e) return;
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				if (!this.viewerOpen) return this.toggleViewerMenu(e);
				const d = e.key === "ArrowDown" ? 1 : -1;
				this.viewerIndex = (this.viewerIndex + d + n) % n;
			} else if (e.key === "Enter" || e.key === " ") {
				if (!this.viewerOpen) return;
				e.preventDefault();
				const v = this.viewerOptions[this.viewerIndex];
				if (v) this.setViewer(v.sessionId);
				this.viewerOpen = false;
			} else if (e.key === "Escape") {
				if (this.viewerOpen) {
					e.preventDefault();
					this.viewerOpen = false;
				}
			}
		},
		/** RowOverflowMenu 开合：右键锚定鼠标处，⋯ 按钮锚定按钮下方；与详情菜单互斥 */
		toggleMenu(sid, ev) {
			const s = String(sid ?? "");
			if (this.menuSid === s && !this.detailMenu) {
				this.menuSid = "";
				return;
			}
			this.detailMenu = false;
			this.ctx.open = false;
			this.menuSid = s;
			this.anchorPopup(ev, 216, 248);
		},
		/** 详情 overflow 菜单：独立状态（与行菜单永不同时出现） */
		toggleDetailMenu(ev) {
			if (this.detailMenu) {
				this.detailMenu = false;
				return;
			}
			this.menuSid = "";
			this.ctx.open = false;
			this.detailMenu = true;
			this.anchorPopup(ev, 216, 248);
		},
		/** 右键 ContextMenu（新建对话到 herdr）：分组头带 repo/folder cwd，列表背景用默认 cwd */
		openCtx(ev, cwd) {
			this.menuSid = "";
			this.detailMenu = false;
			this.ctx = { open: true, cwd: String(cwd || "") };
			this.anchorPopup(ev, 216, 72);
		},
		/** Overflow buttons align right; source pickers opt into left alignment. */
		anchorPopup(ev, estW, estH, align = "end") {
			const e = ev || {};
			if (e.currentTarget && e.currentTarget.getBoundingClientRect && e.type !== "contextmenu") {
				const r = e.currentTarget.getBoundingClientRect();
				this.menuAnchor = { rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, align };
			} else {
				this.menuAnchor = { x: Number(e.clientX) || 8, y: Number(e.clientY) || 8 };
			}
			const W = typeof window !== "undefined" ? window.innerWidth : 1024;
			const H = typeof window !== "undefined" ? window.innerHeight : 768;
			this.menuPos = menuPopupPos(this.menuAnchor, estW, estH, W, H);
			this.placeMenu();
		},
		/** Re-clamp against the rendered size (the first pass may estimate it). */
		placeMenu() {
			const anchor = this.menuAnchor;
			this.$nextTick(() => {
				if (anchor !== this.menuAnchor) return;
				const el = Array.from(document.querySelectorAll(".menu-at")).find((m) => (m.getClientRects ? m.getClientRects().length : 0)) || null;
				if (!el || !el.getBoundingClientRect) return;
				const r = el.getBoundingClientRect();
				if (!r.width && !r.height) return;
				const W = typeof window !== "undefined" ? window.innerWidth : 1024;
				const H = typeof window !== "undefined" ? window.innerHeight : 768;
				this.menuPos = menuPopupPos(anchor, r.width, r.height, W, H);
			});
		},
		/** 新建 pi 会话到全新 herdr 工作区（POST /api/herdr/new-session） */
		async newHerdrSession() {
			const cwd = String(this.ctx.cwd || "");
			this.ctx = { ...this.ctx, open: false };
			try {
				const r = await API.newSession(cwd || undefined);
				const ok = !!(r && r.ok);
				this.toast(String((r && r.message) || (ok ? "已创建新会话" : "创建失败")), ok ? "success" : "error");
			} catch (e) {
				this.toast("新建对话失败: " + e.message, "error");
			}
			this.refreshPeers(true);
		},
		/* ---------------- pane resize（拖拽调宽，桌面两栏 ≥1180px） ---------------- */
		/** 弹出菜单位置自定义属性（body 上绑定，菜单只带 x-show，避免 :style 互踩） */
		get menuVars() {
			return "--menu-x:" + (this.menuPos.x || 0) + "px;--menu-y:" + (this.menuPos.y || 0) + "px";
		},
		/** Inline custom properties for the grid (0 falls back to the CSS default). */
		get paneStyle() {
			return "--pane-list-w:" + (this.panes.list || PANE_DEFAULTS.list) + "px;";
		},
		/** Restore the saved list width (pi-mesh.panes). */
		loadPanes() {
			let saved = null;
			try { saved = JSON.parse(localStorage.getItem(PANE_KEY) || "null"); } catch (_) {}
			const W = typeof window !== "undefined" ? window.innerWidth : 1440;
			this.panes = readPaneState(saved, W);
		},
		persistPanes() {
			try { localStorage.setItem(PANE_KEY, JSON.stringify({ list: this.panes.list })); } catch (_) {}
		},
		/** Direct drag (no transition): the list handle widens right. */
		startPaneDrag(kind, ev) {
			if (kind !== "list") return;
			const el = document.querySelector(".session-list");
			const startW = this.panes.list || (el && el.offsetWidth) || PANE_DEFAULTS.list;
			const startX = ev.clientX;
			this._paneMove = (e) => this.setPaneWidth("list", startW + (e.clientX - startX));
			this._paneUp = () => this.endPaneDrag();
			document.addEventListener("mousemove", this._paneMove);
			document.addEventListener("mouseup", this._paneUp);
			document.body.classList.add("pane-dragging");
		},
		endPaneDrag() {
			if (this._paneMove) document.removeEventListener("mousemove", this._paneMove);
			if (this._paneUp) document.removeEventListener("mouseup", this._paneUp);
			this._paneMove = this._paneUp = null;
			document.body.classList.remove("pane-dragging");
			this.persistPanes();
		},
		setPaneWidth(kind, px) {
			if (kind !== "list") return;
			const W = typeof window !== "undefined" ? window.innerWidth : 1440;
			this.panes.list = clampPaneWidth("list", px, W);
		},
		/** Double-click the handle: back to the 480px default. */
		resetPane(kind) {
			if (kind !== "list") return;
			this.panes.list = PANE_DEFAULTS.list;
			this.persistPanes();
		},
		/** 行级 发消息：选中 + 移动端推入详情 + 聚焦 Composer（拉起键盘） */
		focusComposer(sid) {
			this.selectPeer(String(sid ?? ""));
			this.mobileView = "detail";
			this.$nextTick(() => {
				const el = this.$refs.composerInput;
				if (el && typeof el.focus === "function") el.focus();
			});
		},
		cstate(sid) {
			return this.compose[sid] || defaultComposerDraft();
		},
		toggleCompose(sid) {
			this.compose[sid] = { ...this.cstate(sid), open: !this.cstate(sid).open };
		},
		setMode(sid, mode) {
			const current = this.cstate(sid);
			const nextMode = mode === "steer" ? "steer" : "followUp";
			if (current.mode === nextMode) return;
			this.compose[sid] = nextComposerDraft(current, { mode: nextMode, receipt: current.sending ? current.receipt : null });
		},
		setText(sid, text) {
			const current = this.cstate(sid);
			this.compose[sid] = nextComposerDraft(current, {
				text: String(text ?? ""),
				receipt: current.sending ? current.receipt : null,
			});
		},
		composerReceiptLabel(sid) {
			const receipt = this.cstate(sid).receipt;
			if (!receipt) return "";
			if (receipt.state === "sending") return "正在发送…";
			if (receipt.state === "accepted") return DISPOSITIONS[receipt.disposition] || "消息已交给目标扩展";
			if (receipt.state === "rejected") return "目标明确拒绝 · 草稿已保留";
			if (receipt.state === "unknown") return "发送结果未确认 · 草稿已保留";
			return "消息发送状态未知";
		},
		canSendMessage(sid) {
			return isMessageablePeer(this.peerById(sid));
		},
		composerAvailabilityLabel(sid) {
			return messageAvailabilityLabel(this.peerById(sid));
		},
		async send(sid) {
			const target = String(sid || "");
			if (!target) return;
			const current = this.cstate(target);
			if (current.sending) return this.toast("该会话已有消息发送中", "info");
			if (!this.canSendMessage(target)) return this.toast("目标会话离线或已结束 · 草稿已保留", "error");
			const snapshot = createComposerSnapshot(target, current, this.viewerId);
			if (!snapshot.text) return this.toast("消息内容为空", "error");
			this.compose[target] = {
				...current,
				sending: true,
				receipt: { state: "sending", submittedVersion: snapshot.version, submittedText: snapshot.text },
			};
			try {
				const r = await API.message(snapshot.sessionId, snapshot.text, snapshot.mode, snapshot.fromSessionId);
				this.compose[target] = settleComposerDraft(this.cstate(target), snapshot, {
					state: "accepted",
					disposition: r.disposition,
				});
				this.toast(DISPOSITIONS[r.disposition] || "消息已交给目标扩展", "success");
			} catch (e) {
				const state = classifyMessageFailure(e);
				this.compose[target] = settleComposerDraft(this.cstate(target), snapshot, {
					state,
					message: e && e.message ? e.message : String(e),
				});
				if (state === "unknown") {
					this.toast("发送结果未确认 · 草稿已保留，请检查目标会话后再决定是否重发", "error");
				} else {
					this.toast("目标拒绝消息 · 草稿已保留: " + (e && e.message ? e.message : String(e)), "error");
				}
			}
		},
		async doCancel(sid) {
			const target = String(sid ?? this.confirmFor ?? "");
			this.closeConfirm();
			try {
				await API.cancel(target);
				this.toast("已发送取消指令", "success");
			} catch (e) {
				this.toast("取消失败: " + e.message, "error");
			}
		},
		/* resume (恢复): resurrect an offline/closed session in a dedicated herdr workspace */
		openResume(p, ev) {
			const peer = this.peerOf(p);
			this.resumeFor = String((peer && peer.sessionId) ?? p ?? "");
			this.resumeFork = false;
			this.confirmAction = "resume";
			this.anchorConfirm(ev);
		},
		async doResume() {
			const sid = String(this.resumeFor || "");
			const fork = !!this.resumeFork;
			this.closeConfirm();
			try {
				const r = await API.resume(sid, fork);
				const ok = !!(r && r.ok);
				this.toast(String((r && r.message) || (ok ? "已恢复" : "恢复失败")), ok ? "success" : "error");
			} catch (e) {
				this.toast("恢复失败: " + e.message, "error");
			}
			this.refreshPeers(true);
		},
		/* resume badge (↻N) + tooltip: newest resumption's herdrWorkspaceId + time */
		resumeCount(p) {
			return Array.isArray(p.resumptions) ? p.resumptions.length : 0;
		},
		resumeTip(p) {
			const rs = Array.isArray(p.resumptions) ? p.resumptions : [];
			if (!rs.length) return "暂无恢复记录";
			let newest = rs[0];
			for (const r of rs) {
				if (Date.parse(String((r && r.at) || "")) >= Date.parse(String((newest && newest.at) || ""))) newest = r;
			}
			return "恢复 " + rs.length + " 次 · 最近: " + ((newest && newest.herdrWorkspaceId) || "(无工作区)") + " · " + this.relT(newest && newest.at);
		},
		async openReview(p) {
			const peer = this.peerOf(p);
			if (!peer) return;
			const sid = String(peer.sessionId ?? "");
			if (sid !== this.selectedId) {
				this.selectPeer(sid, { tab: "changes" });
				return;
			}
			if (this.detailTab !== "changes") {
				this.detailTab = "changes";
				this.persistSelection();
			}
			this.review = { open: true, sessionId: peer.sessionId, title: peer.title || basename(peer.cwd) };
			if (this.ephemeral(peer)) return; // 临时会话无文件改动记录
			let host = this.$refs.reviewHost;
			if (!host) {
				await this.$nextTick();
				host = this.$refs.reviewHost;
			}
			if (host && window.PiMeshReview) {
				host.innerHTML = "";
				const focusPath = String(this.reviewFocus || this.reviewSelectedFile || "");
				this.reviewFocus = "";
				await window.PiMeshReview.open(host, {
					sessionId: peer.sessionId,
					theme: document.documentElement.getAttribute("data-theme") || "light",
					baseUrl: "",
					focusPath: focusPath || undefined,
					onSelectFile: (file) => {
						const fileKey = String(file && (file.fileKey || file.canonicalPath || file.path) || "");
						if (!fileKey || fileKey === this.reviewSelectedFile) return;
						this.reviewSelectedFile = fileKey;
						this.persistSelection();
					},
				});
			}
		},
		closeReview() {
			this.review.open = false;
			const host = this.$refs.reviewHost;
			if (host) host.innerHTML = "";
		},
		async openHistory(p) {
			const peer = this.peerOf(p);
			if (!peer) return;
			const sid = String(peer.sessionId ?? "");
			if (sid !== this.selectedId) {
				this.selectPeer(sid, { tab: "session" });
				return;
			}
			this.drawer = { open: true, sessionId: peer.sessionId, title: peer.title || basename(peer.cwd), entries: [], items: [], textOpen: {}, loading: !this.ephemeral(peer), error: "", hasMore: false, loadingOlder: false };
			if (this.ephemeral(peer)) return; // 临时会话不保存历史
			try {
				const r = await API.transcript(peer.sessionId, HISTORY_PAGE, this.theme);
				if (this.drawer.sessionId !== peer.sessionId) return;
				const entries = Array.isArray(r.entries) ? r.entries : [];
				// Sanitize BEFORE exposure: mdHtml caches DOMPurify after first load.
				for (const e of entries) {
					if (e.role !== "toolResult" && e.html) e.htmlSafe = await mdHtml(e, this.theme);
				}
				this.drawer.entries = entries;
				this.drawer.items = buildHistory(entries);
				this.drawer.hasMore = entries.length >= HISTORY_PAGE; // full page → maybe older
			} catch (e) {
				if (this.drawer.sessionId !== peer.sessionId) return;
				this.drawer.error = e.message;
				this.toast("加载历史失败: " + e.message, "error");
			}
			if (this.drawer.sessionId === peer.sessionId) this.drawer.loading = false;
		},
		closeDrawer() { this.drawer.open = false; },
		/** 加载更早: backward pagination via beforeEntryId. History renders oldest-first,
		 *  so the missing head of the conversation sits ABOVE the loaded window — older
		 *  pages prepend and the reading position stays anchored while content is added.
		 *  Skipped for ephemeral peers (hasMore stays false). */
		async loadOlder() {
			if (this.drawer.loading || this.drawer.loadingOlder || !this.drawer.hasMore) return;
			const sid = String(this.drawer.sessionId ?? "");
			const peer = this.peerById(sid);
			if (!peer || this.ephemeral(peer)) return;
			const head = this.drawer.entries[0];
			const before = head && head.id ? String(head.id) : "";
			if (!before) { this.drawer.hasMore = false; return; }
			this.drawer.loadingOlder = true;
			const host = this.$refs.detailBody;
			const prevH = host ? host.scrollHeight : 0;
			try {
				const r = await API.transcript(sid, HISTORY_PAGE, this.theme, before);
				if (this.drawer.sessionId !== sid) return;
				const page = Array.isArray(r.entries) ? r.entries : [];
				for (const e of page) {
					if (e.role !== "toolResult" && e.html) e.htmlSafe = await mdHtml(e, this.theme);
				}
				this.drawer.hasMore = page.length >= HISTORY_PAGE;
				this.drawer.entries = mergeOlderEntries(this.drawer.entries, page);
				this.drawer.items = buildHistory(this.drawer.entries);
				await this.$nextTick();
				if (host) host.scrollTop += host.scrollHeight - prevH; // anchored prepend
			} catch (e) {
				if (this.drawer.sessionId === sid) this.toast("加载更早失败: " + e.message, "error");
			}
			if (this.drawer.sessionId === sid) this.drawer.loadingOlder = false;
		},
		/** Auto-fill: scrolling near the head of the history list pulls the older page. */
		onHistoryScroll(ev) {
			if (this.detailTab !== "session" || this.drawer.loading || this.drawer.loadingOlder || !this.drawer.hasMore) return;
			const el = (ev && ev.target) || this.$refs.detailBody;
			if (el && el.scrollTop < 120) this.loadOlder();
		},
		/* history items: tool-chain collapse + per-item text expand (Alpine state) */
		toggleRun(item) { item.open = !item.open; },
		textOpen(id) { return !!this.drawer.textOpen[String(id)]; },
		toggleText(id) { const k = String(id); this.drawer.textOpen[k] = !this.drawer.textOpen[k]; },
		isLongText(text) { return String(text ?? "").split("\n").length > 6; },
		/** 时间戳只在距上一条 >30 分钟时显示（历史不再行行「1小时前」） */
		showTimeGap(items, i) {
			if (!i) return true;
			const head = (it) => (it && (it.e || (it.items && it.items[0]))) || null;
			const t1 = Date.parse(String(((head(items[i]) || {}).timestamp) || ""));
			const t0 = Date.parse(String(((head(items[i - 1]) || {}).timestamp) || ""));
			if (!Number.isFinite(t0) || !Number.isFinite(t1)) return true;
			return t1 - t0 > 30 * 60 * 1000;
		},
		/* herdr annotation: chip + one-click 进入 + copyable focus command */
		herdrInfo(p) { return resolveHerdrHost(p, this.herdrAgents); },
		herdrTip(p) {
			const h = this.herdrInfo(p);
			return h ? "herdr 工作区 " + h.workspaceId + " · 状态 " + h.status : "";
		},
		async enterHerdr(p) {
			const sid = String(p.sessionId ?? "");
			try {
				const r = await API.focus(sid);
				const ok = !!(r && r.ok);
				this.toast(String((r && r.message) || (ok ? "已聚焦 herdr" : "聚焦失败")), ok ? "success" : "error");
			} catch (e) {
				this.toast("进入 herdr 失败: " + e.message, "error");
			}
		},
		copyHerdrCmd(p) {
			const h = this.herdrInfo(p);
			if (!h) return;
			return this.copyText(h.command, "已复制命令");
		},
		/* ---------------- embedded terminal drawer (herdr 终端) ---------------- */
		/** Open the browser terminal attached to the peer's herdr pane. */
		openTerminal(p) {
			const peer = this.peerOf(p);
			if (!peer) return;
			this.mobileView = "detail";
			const sid = String(peer.sessionId ?? "");
			if (sid !== this.selectedId) {
				this.selectPeer(sid, { tab: "terminal" });
				return;
			}
			// the panel is x-show'd on the terminal tab: switch first so WTerm mounts
			// on a laid-out host — a hidden mount falls back to the 80×24 grid and the
			// replay paints the wrong geometry (B1: blank terminal)
			if (this.detailTab !== "terminal") {
				this.detailTab = "terminal";
				this.persistSelection();
			}
			const h = this.herdrInfo(peer);
			const target = h ? String(h.paneId || "") : "";
			if (!target) return this.toast("未找到该实例的 herdr 终端目标", "error");
			// 触屏默认 鼠标·本地（触屏终端为受限体验）
			let mouse = "auto";
			try {
				if (navigator.maxTouchPoints > 0 && window.innerWidth < 900) mouse = "local";
			} catch (_) {}
			this._termHoldFocus = !!this._tabSwitch; // tab-switch opens never steal focus
			this.term = {
				open: true,
				fullscreen: false,
				sessionId: String(peer.sessionId ?? ""),
				title: String(peer.title || basename(peer.cwd)),
				target,
				mode: "control",
				mouse,
				status: "connecting",
				error: "",
			};
			this._termRetried = false;
			this.$nextTick(() => this.startTerminal());
		},
		/** 终端 ⛶ 全屏浮层（复用 .drawer 类与同一 x-ref="termHost" 元素） */
		toggleTermFull() {
			if (!this.term.open) return;
			this.term.fullscreen = !this.term.fullscreen;
		},
		/** 控制/观察 segmented toggle: switching mode reconnects the session. */
		setTermMode(mode) {
			const next = mode === "observe" ? "observe" : "control";
			if (next === this.term.mode) return;
			this.term.mode = next;
			this.toast(next === "observe" ? "观察模式 · 只读镜像" : "控制模式 · 可输入", "info");
			if (this.term.open) this.termReconnect();
		},
		/** 鼠标 toggle: "auto" forwards mouse events to the app whenever it captures
		 *  them (live mode state, or the stale-zone default); "local" keeps clicks
		 *  and wheel for native selection / local scrollback only. */
		setTermMouse(mouse) {
			const next = mouse === "local" ? "local" : "auto";
			if (!this.term.open || next === this.term.mouse) return;
			this.term.mouse = next;
			this.toast(next === "local" ? "鼠标 · 本地选择/滚动" : "鼠标 · 自动（转发给应用）", "info");
		},
		termReconnect() {
			if (!this.term.open) return;
			this._termRetried = false;
			this.startTerminal();
		},
		/** Lazy-load the terminal stack so the main page stays light. */
		loadTermModules() {
			if (!this._termModules) {
				this._termModules = Promise.all([import("@wterm/dom"), import("@wterm/ghostty")]).then((mods) => ({
					WTerm: mods[0].WTerm,
					GhosttyCore: mods[1].GhosttyCore,
				}));
			}
			return this._termModules;
		},
		/** (Re)build WTerm on the terminal panel and connect the herdr bridge. */
		async startTerminal() {
			const gen = ++this._termGen;
			this.teardownTerminal();
			this._termModesSeen = false; // fresh stream: mode state unknown until proven
			this.term.status = "connecting";
			this.term.error = "";
			try {
				const host = await this.termHostReady(gen);
				if (!host || gen !== this._termGen) return;
				const mods = await withTimeout(this.loadTermModules(), 10000, "终端组件加载");
				const core = await withTimeout(
					mods.GhosttyCore.load({ wasmPath: "/vendor/@wterm/ghostty/wasm/ghostty-vt.wasm" }),
					10000,
					"终端内核加载",
				);
				if (gen !== this._termGen) {
					try { core.dispose(); } catch (_) {}
					return;
				}
				this._termCore = core;
				const wterm = new mods.WTerm(host, {
					core,
					autoResize: true,
					onData: (d) => this.termSendInput(d),
					onBinary: (bytes) => this.termSendBytes(bytes),
					onResize: (cols, rows) => this.scheduleTermResize(cols, rows),
				});
				this._wterm = wterm;
				await wterm.init();
				if (gen !== this._termGen) return;
				wterm.setThemeColors(this.termThemeColors());
				this.termConnect();
				if (!this._termHoldFocus) wterm.focus();
				this._termHoldFocus = false;
				this.attachTermDomHandlers();
			} catch (e) {
				if (gen !== this._termGen) return;
				this.term.status = "error";
				this.term.error = String((e && e.message) || e);
				this.toast("终端启动失败: " + this.term.error, "error");
			}
		},
		/**
		 * The term-host ref is only laid out once the terminal tab is visible.
		 * Mounting WTerm on a 0×0 host falls back to an 80×24 grid and the attach
		 * replay paints the wrong geometry, so wait (briefly) for real bounds.
		 */
		termHostReady(gen) {
			return new Promise((resolve, reject) => {
				const t0 = Date.now();
				const poll = () => {
					const host = this.$refs.termHost;
					if (gen !== this._termGen) return resolve(null);
					const r = host && host.getBoundingClientRect();
					if (host && r && r.width > 0 && r.height > 0) return resolve(host);
					if (Date.now() - t0 > 1500) {
						return reject(new Error(host ? "终端容器不可见" : "终端容器未就绪"));
					}
					requestAnimationFrame(poll);
				};
				poll();
			});
		},
		teardownTerminal() {
			this.detachTermDomHandlers();
			if (this._termResizeTimer) {
				clearTimeout(this._termResizeTimer);
				this._termResizeTimer = null;
			}
			this.termCloseSocket();
			if (this._wterm) {
				try { this._wterm.destroy(); } catch (_) {}
				this._wterm = null;
			}
			if (this._termCore) {
				try { this._termCore.dispose(); } catch (_) {}
				this._termCore = null;
			}
		},
		closeTerminal() {
			this.term.open = false;
			this.teardownTerminal();
		},
		termCloseSocket() {
			const ws = this._termWs;
			this._termWs = null;
			if (!ws) return;
			ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
			try { ws.close(); } catch (_) {}
		},
		/** Connect the JSONL bridge to `herdr terminal session` for this pane. */
		termConnect() {
			this.termCloseSocket();
			this.term.status = "connecting";
			this.term.error = "";
			const cols = (this._wterm && this._wterm.cols) || 80;
			const rows = (this._wterm && this._wterm.rows) || 24;
			let ws;
			try {
				ws = new WebSocket(terminalWsUrl(this.term.target, this.term.mode, cols, rows));
			} catch (e) {
				this.term.status = "error";
				this.term.error = String((e && e.message) || e);
				this.toast("终端连接失败: " + this.term.error, "error");
				return;
			}
			this._termWs = ws;
			ws.onopen = () => {
				if (this._termWs !== ws) return;
				this.term.status = "open";
				this.scheduleTermResize(cols, rows);
			};
			ws.onmessage = (ev) => this.termOnMessage(ev);
			ws.onclose = () => {
				if (this._termWs !== ws) return;
				this._termWs = null;
				if (this.term.status === "closed") return; // herdr already said goodbye
				// unexpected drop: auto-reconnect once, then surface 连接已断开
				if (this.term.open && !this._termRetried) {
					this._termRetried = true;
					this.toast("终端连接断开，正在自动重连…", "info");
					setTimeout(() => {
						if (this.term.open && !this._termWs) this.termConnect();
					}, 800);
					return;
				}
				this.term.status = "closed";
				this.term.error = "连接已断开";
			};
		},
		/** herdr -> browser: {"bytes": base64} frames or terminal.closed. */
		termOnMessage(ev) {
			let msg;
			try {
				msg = JSON.parse(ev.data);
			} catch (_) {
				return;
			}
			if (!msg || typeof msg !== "object") return;
			if (typeof msg.bytes === "string") {
				const bytes = base64ToBytes(msg.bytes);
				// the core parses the same DECSET/DECRST: from the first mouse-mode
				// change on, its mode state is authoritative again
				if (termModeActivity(bytes)) this._termModesSeen = true;
				if (this._wterm) this._wterm.write(bytes);
				return;
			}
			if (msg.type === "terminal.closed") {
				this.term.status = "closed";
				this.term.error = String(msg.reason || "连接已断开");
			}
		},
		/** WTerm onData -> terminal.input (observe mode drops input: read-only). */
		termSendInput(data) {
			if (this.term.mode === "observe") return;
			const ws = this._termWs;
			if (!ws || ws.readyState !== 1) return;
			ws.send(terminalInputLine(data));
		},
		/** WTerm onBinary (raw bytes: X10 mouse reports) -> terminal.input. */
		termSendBytes(bytes) {
			if (this.term.mode === "observe") return;
			const ws = this._termWs;
			if (!ws || ws.readyState !== 1) return;
			ws.send(terminalInputBytesLine(bytes));
		},
		/** Scroll the herdr pane history (`terminal.scroll`; shared pane scroll state). */
		termScroll(direction, lines) {
			if (this.term.mode === "observe") return;
			const ws = this._termWs;
			if (!ws || ws.readyState !== 1) return;
			ws.send(terminalScrollLine(direction, lines));
		},
		/* ---------------- mouse / keyboard scroll wiring ---------------- */
		/**
		 * Terminal DOM wiring. Wheel routing is owned by _termWheelHandler
		 * (termWheelAction): local scrollback first, SGR wheel reports to
		 * mouse-capturing TUIs at the edge, PageUp/PageDown for fullscreen apps
		 * without mouse capture. Shift+PageUp/PageDown (page) and Shift+Up/Down
		 * (lines) scroll the local scrollback; WTerm exposes no scroll API
		 * (only scrollToPrompt).
		 */
		attachTermDomHandlers() {
			this.detachTermDomHandlers();
			const host = this.$refs.termHost;
			if (!host) return;
			this.attachTermMouseFallback();
			// wterm paints via requestAnimationFrame, which the browser throttles to
			// a standstill while the tab is hidden: a backgrounded attach can leave
			// the herdr replay sitting in a stale viewport. Force a repaint when the
			// tab returns so the terminal is never empty after a backgrounded attach.
			this._termVisibilityHandler = () => {
				const w = this._wterm;
				if (document.visibilityState !== "visible" || !w || typeof w.fit !== "function") return;
				try { w.fit(); } catch (_) {}
			};
			document.addEventListener("visibilitychange", this._termVisibilityHandler);
			// Shift+PageUp/PageDown (page) and Shift+Up/Down (lines) scroll the
			// local scrollback; WTerm exposes no scroll API (only scrollToPrompt).
			this._termKeyHandler = (e) => {
				if (!this.term.open) return;
				// Esc on the focused terminal surface exits 全屏 back to the tab first
				if (e.key === "Escape" && this.term.fullscreen) {
					e.preventDefault();
					e.stopPropagation();
					this.term.fullscreen = false;
					return;
				}
				if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
				let dir = 0;
				let page = false;
				if (e.key === "PageUp") { dir = -1; page = true; }
				else if (e.key === "PageDown") { dir = 1; page = true; }
				else if (e.key === "ArrowUp") dir = -1;
				else if (e.key === "ArrowDown") dir = 1;
				else return;
				e.preventDefault();
				e.stopPropagation();
				this.termScrollBy(dir, page);
			};
			// Mouse-reporting apps own right-click; otherwise keep the browser menu.
			// Only trusted mode activity counts — painted cell text must not steal it.
			this._termMenuHandler = (e) => {
				const core = this._termCore;
				if (
					this._termModesSeen &&
					core &&
					typeof core.mouseTracking === "function" &&
					core.mouseTracking() !== 0
				) {
					e.preventDefault();
				}
			};
			host.addEventListener("keydown", this._termKeyHandler, true);
			host.addEventListener("contextmenu", this._termMenuHandler);
		},
		detachTermDomHandlers() {
			this.detachTermMouseFallback();
			const host = this.$refs.termHost;
			if (host && this._termKeyHandler) host.removeEventListener("keydown", this._termKeyHandler, true);
			if (host && this._termMenuHandler) host.removeEventListener("contextmenu", this._termMenuHandler);
			if (this._termVisibilityHandler) document.removeEventListener("visibilitychange", this._termVisibilityHandler);
			this._termKeyHandler = null;
			this._termMenuHandler = null;
			this._termVisibilityHandler = null;
		},
		/** Scroll the local scrollback one page (page=true) or three lines. */
		termScrollBy(dir, page) {
			const host = this.$refs.termHost;
			if (!host || dir === 0 || host.scrollHeight <= host.clientHeight) return;
			const rowH = parseFloat(host.style.getPropertyValue("--term-row-height")) || 17;
			const step = page ? Math.max(rowH, host.clientHeight - rowH) : rowH * 3;
			const max = host.scrollHeight - host.clientHeight;
			host.scrollTop = Math.max(0, Math.min(max, host.scrollTop + dir * step));
		},
		/**
		 * DOM mouse wiring for WTerm's InputHandler. wterm's own handler only acts
		 * when the core's parsed mode state says the app captures the mouse, and a
		 * mid-stream attach never parses the DECSETs the app sent before us. The
		 * stale zone (no mode activity on the stream yet) is therefore owned here:
		 * clicks, drags and edge-wheel are forwarded as SGR (1006) reports — pi
		 * TUIs capture with 1006 and handle the reports themselves (verified live).
		 * Shift always keeps the event for native selection / local scrolling.
		 */
		attachTermMouseFallback() {
			this.detachTermMouseFallback();
			const wterm = this._wterm;
			const core = this._termCore;
			const host = this.$refs.termHost;
			if (!host || !core) return;
			const view = host.ownerDocument && host.ownerDocument.defaultView;
			const cellAt = (ev) => {
				const row = host.querySelector(".term-row:not(.term-scrollback-row)");
				const rr = row && row.getBoundingClientRect();
				const cols = core.getCols();
				const rows = core.getRows();
				if (!rr || !cols || !rows) return null;
				const charW = parseFloat(host.style.getPropertyValue("--term-cell-width")) || rr.width / cols || 1;
				const rowH = parseFloat(host.style.getPropertyValue("--term-row-height")) || rr.height || 1;
				const gridW = charW * cols;
				const gridH = rowH * rows;
				const x = Math.floor((ev.clientX - rr.left) / charW) + 1;
				const y = Math.floor((ev.clientY - rr.top) / rowH) + 1;
				if (x < 1 || y < 1 || ev.clientX >= rr.left + gridW || ev.clientY >= rr.top + gridH) return null;
				return { x: Math.min(x, cols), y: Math.min(y, rows), px: Math.min(Math.max(1, x), Math.ceil(gridW)), py: Math.min(Math.max(1, y), Math.ceil(gridH)) };
			};
			const state = (ev) => ({
				tracking: typeof core.mouseTracking === "function" ? core.mouseTracking() : 0,
				modesSeen: !!this._termModesSeen,
				mouse: this.term.mode === "observe" ? "local" : this.term.mouse,
				altScreen: typeof core.usingAltScreen === "function" && !!core.usingAltScreen(),
				shift: !!(ev && ev.shiftKey),
			});
			/** Stale-zone forwarding: SGR (1006) reports — what pi and modern TUIs expect. */
			const sendReport = (kind, ev) => {
				const cell = cellAt(ev);
				if (!cell) return false;
				const bytes = encodeMouseReport({
					encoding: "sgr",
					kind,
					button: ev.button,
					buttons: ev.buttons,
					x: cell.x,
					y: cell.y,
					shift: ev.shiftKey,
					alt: ev.altKey,
					ctrl: ev.ctrlKey,
					deltaX: ev.deltaX,
					deltaY: ev.deltaY,
				});
				if (!bytes) return false;
				this.termSendInput(new TextDecoder("utf-8").decode(bytes));
				return true;
			};
			const onDown = (ev) => {
				if (ev.button > 2) return; // back/forward stay with the browser
				if (termClickAction(state(ev)) !== "report") return; // wterm owns it, or native selection
				if (!sendReport("press", ev)) return;
				ev.preventDefault();
				if (wterm && typeof wterm.focus === "function") wterm.focus();
				this._termMouseButtons = Number(ev.buttons) & 7;
				if (view) {
					view.addEventListener("mousemove", onDrag);
					view.addEventListener("mouseup", onUp);
				}
			};
			const onDrag = (ev) => {
				this._termMouseButtons = Number(ev.buttons) & 7;
				if (termClickAction(state(ev)) === "report" && sendReport("move", ev)) ev.preventDefault();
				if (this._termMouseButtons === 0) onUp(ev);
			};
			const onUp = (ev) => {
				if (termClickAction(state(ev)) === "report" && sendReport("release", ev)) ev.preventDefault();
				this._termMouseButtons = 0;
				if (view) {
					view.removeEventListener("mousemove", onDrag);
					view.removeEventListener("mouseup", onUp);
				}
			};
			const onWheel = (ev) => {
				const horiz = Math.abs(ev.deltaX) > Math.abs(ev.deltaY);
				const delta = horiz ? ev.deltaX : ev.deltaY;
				if (delta === 0) return;
				const up = delta < 0;
				const max = Math.max(0, host.scrollHeight - host.clientHeight);
				const canScrollLocal = max > 0 && (up ? host.scrollTop > 2 : max - host.scrollTop > 2);
				const action = termWheelAction({ ...state(ev), deltaY: delta, canScrollLocal });
				if (action === "report") {
					if (sendReport("wheel", ev)) ev.preventDefault();
				} else if (action === "scroll") {
					ev.preventDefault();
					this.termScroll(up ? "up" : "down", 3);
				} else if (action === "page") {
					ev.preventDefault();
					this.termSendInput(up ? "\x1b[5~" : "\x1b[6~");
				}
				// "wterm": the core's handler forwards reports / scrolls local history
				// "native": the browser scrolls the local scrollback
			};
			host.addEventListener("mousedown", onDown);
			host.addEventListener("wheel", onWheel, { passive: false });
			this._termWheelHandler = onWheel;
			this._termMouseHandlers = { host, onDown, onWheel, view, onDrag, onUp };
		},
		detachTermMouseFallback() {
			const h = this._termMouseHandlers;
			this._termMouseHandlers = null;
			this._termWheelHandler = null;
			this._termMouseButtons = 0;
			if (!h) return;
			h.host.removeEventListener("mousedown", h.onDown);
			h.host.removeEventListener("wheel", h.onWheel);
			if (h.view) {
				h.view.removeEventListener("mousemove", h.onDrag);
				h.view.removeEventListener("mouseup", h.onUp);
			}
		},
		/** Container resize (debounced) -> terminal.resize for the herdr pane. */
		scheduleTermResize(cols, rows) {
			if (this._termResizeTimer) clearTimeout(this._termResizeTimer);
			this._termResizeTimer = setTimeout(() => {
				this._termResizeTimer = null;
				const ws = this._termWs;
				if (!ws || ws.readyState !== 1) return;
				ws.send(terminalResizeLine(cols, rows));
			}, 150);
		},
		/** Current theme's CSS custom properties -> WTerm TerminalThemeColors. */
		termThemeColors() {
			const cs = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
			const read = (name) => String((cs && cs.getPropertyValue(name)) || "").trim();
			return buildTerminalTheme({
				panel: read("--panel"),
				panel3: read("--panel-3"),
				text: read("--text"),
				muted: read("--muted"),
				accent: read("--accent"),
				accentStrong: read("--accent-strong"),
				danger: read("--danger"),
				running: read("--running"),
				waiting: read("--waiting"),
				offline: read("--offline"),
			});
		},
		/** Push the live theme into an open terminal (called on theme toggle). */
		refreshTermTheme() {
			const w = this._wterm;
			if (!w) return;
			try {
				w.setThemeColors(this.termThemeColors());
			} catch (e) {
				console.warn("terminal theme refresh failed", e);
			}
			// Full re-layout/repaint after the palette flip: the incremental
			// colorsChanged path can leave the canvas blank in the new theme.
			try {
				requestAnimationFrame(() => {
					try {
						if (this._wterm === w && typeof w.fit === "function") w.fit();
					} catch (_) {}
				});
			} catch (_) {}
		},
		async copySid(p) {
			return this.copyText(String(p.sessionId ?? ""), "已复制 sessionId");
		},
		async copyText(text, okMsg) {
			try {
				await navigator.clipboard.writeText(text);
				this.toast(okMsg, "success");
			} catch (_) {
				try {
					const ta = document.createElement("textarea");
					ta.value = text;
					document.body.appendChild(ta);
					ta.select();
					document.execCommand("copy");
					ta.remove();
					this.toast(okMsg, "success");
				} catch (_) {
					this.toast("复制失败", "error");
				}
			}
		},
		/* misc view helpers (reactive clock via this.now) */
		relT(iso) { return relTime(iso, this.now); },
		stale(p) { return ageSec(p.lastHeartbeat, this.now) > 45; },
		toast(msg, kind = "info") {
			const t = { id: Date.now() + Math.random(), msg: String(msg ?? ""), kind };
			this.toasts.push(t);
			setTimeout(() => { this.toasts = this.toasts.filter((x) => x.id !== t.id); }, 4000);
		},
		/* exposed rendering helpers */
		esc, basename, midTrunc, sid8, stateMeta, roleMeta, wtLabel,
	}));
});

/* ----------------------------- lucide glue ----------------------------- */
/* Hydrate on the next microtask (no debounce window): un-hydrated placeholders
   are CSS-hidden ([data-lucide]:not(svg) { visibility: hidden }) so icons never
   "pop" in after first paint. */
let iconQueued = false;
function refreshIcons() {
	if (iconQueued) return;
	iconQueued = true;
	queueMicrotask(() => {
		iconQueued = false;
		if (window.lucide && document.querySelector("i[data-lucide]")) {
			try { window.lucide.createIcons(); } catch (_) {}
		}
	});
}
// Re-run icon hydration whenever Alpine adds/changes DOM (guarded: only `i` tags).
new MutationObserver(refreshIcons).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", refreshIcons);
window.addEventListener("load", refreshIcons);
refreshIcons(); // eager first pass (vendored lucide defer runs before app.js)
