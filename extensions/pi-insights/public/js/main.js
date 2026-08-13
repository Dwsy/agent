/**
 * Wiring: boot, data loading, URL sync, keyboard, theme and locale.
 * Everything else lives in its own module.
 */
import { fetchReport, fetchSessionDetail, requestRescan } from "./api.js";
import { setLocale } from "./i18n.js";
import { RANGES, VIEWS, currentSort, readHash, setDetail, setState, state, subscribe, writeHash } from "./state.js";
import { render } from "./view.js";

const THEME_KEY = "pi-insights-theme";
const THEME_MODES = ["light", "dark", "system"];
const darkQuery = matchMedia("(prefers-color-scheme: dark)");

const search = document.getElementById("search");
const detailPanel = document.getElementById("detail");

let reportRequest;
let detailRequest;
let focusBeforeDetail;

function applyTheme(mode) {
	const root = document.documentElement;
	root.dataset.themeMode = mode;
	root.dataset.theme = mode === "system" ? (darkQuery.matches ? "dark" : "light") : mode;
	try {
		localStorage.setItem(THEME_KEY, mode);
	} catch {}
}

/** Central mutation point: state first, then the URL that describes it. */
function commit(patch, { push = false } = {}) {
	setState(patch);
	const hash = writeHash();
	if (location.hash === hash) return;
	if (push) history.pushState(null, "", hash);
	else history.replaceState(null, "", hash);
}

function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}

async function loadReport({ refresh = false } = {}) {
	reportRequest?.abort();
	reportRequest = new AbortController();
	setState({ status: "loading", error: undefined });
	try {
		const report = await fetchReport(state.range, { refresh, signal: reportRequest.signal });
		setState({ report, status: "ready", error: undefined });
	} catch (error) {
		if (error?.name === "AbortError") return;
		setState({ status: "error", error: messageOf(error) });
	}
}

async function openDetail(path) {
	if (state.detail.open && state.detail.path === path) return closeDetail();
	focusBeforeDetail = document.activeElement;
	detailRequest?.abort();
	detailRequest = new AbortController();
	setDetail({ open: true, path, status: "loading", data: undefined, error: undefined });
	detailPanel.querySelector(".icon-button")?.focus();
	try {
		const data = await fetchSessionDetail(path, detailRequest.signal);
		if (!data) throw new Error(path);
		if (state.detail.path !== path) return;
		setDetail({ status: "ready", data });
	} catch (error) {
		if (error?.name === "AbortError") return;
		setDetail({ status: "error", error: messageOf(error) });
	}
}

function closeDetail() {
	if (!state.detail.open) return;
	detailRequest?.abort();
	setDetail({ open: false, path: undefined, status: "idle", data: undefined, error: undefined });
	if (focusBeforeDetail?.isConnected) focusBeforeDetail.focus();
	focusBeforeDetail = undefined;
}

const handlers = {
	onRetry: () => loadReport(),
	onRange: (range) => {
		commit({ range, page: 1 }, { push: true });
		loadReport();
	},
	onSeries: (series) => commit({ series }),
	onSort: (key) => {
		const active = currentSort();
		const direction = active.key === key && active.direction === "desc" ? "asc" : "desc";
		commit({ sorts: { ...state.sorts, [state.view]: { key, direction } }, page: 1 });
	},
	onProject: (project) => commit({ project, page: 1 }),
	onPageSize: (pageSize) => commit({ pageSize, page: 1 }),
	onPage: (page) => commit({ page }),
	onOpenSession: openDetail,
	onCloseDetail: closeDetail,
};

function bindChrome() {
	for (const button of document.querySelectorAll("#rangeGroup button")) {
		button.addEventListener("click", () => handlers.onRange(button.dataset.range));
	}
	for (const button of document.querySelectorAll("#nav button")) {
		button.addEventListener("click", () => commit({ view: button.dataset.view }, { push: true }));
	}
	document.getElementById("rescan").addEventListener("click", async () => {
		if (state.rescanning) return;
		setState({ rescanning: true });
		try {
			await requestRescan();
			await loadReport({ refresh: true });
		} catch (error) {
			setState({ status: "error", error: messageOf(error) });
		} finally {
			setState({ rescanning: false });
		}
	});
	document.getElementById("theme").addEventListener("click", () => {
		const next = THEME_MODES[(THEME_MODES.indexOf(document.documentElement.dataset.themeMode) + 1) % THEME_MODES.length];
		applyTheme(next);
		render(handlers);
	});
	document.getElementById("locale").addEventListener("click", () => {
		setLocale(document.documentElement.dataset.locale === "en" ? "zh" : "en");
		render(handlers);
	});
	document.getElementById("scrim").addEventListener("click", closeDetail);

	search.addEventListener("input", () => {
		const patch = { query: search.value, page: 1 };
		if (state.view !== "sessions") patch.view = "sessions";
		commit(patch);
	});
	darkQuery.addEventListener("change", () => {
		if (document.documentElement.dataset.themeMode === "system") applyTheme("system");
		render(handlers);
	});
}

function isTypingTarget(target) {
	return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

function bindKeyboard() {
	document.addEventListener("keydown", (event) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.key === "Escape") {
			if (state.detail.open) return closeDetail();
			if (document.activeElement === search) search.blur();
			return;
		}
		if (isTypingTarget(event.target)) return;
		if (event.key === "/") {
			event.preventDefault();
			search.focus();
			search.select();
			return;
		}
		const index = Number(event.key);
		if (Number.isInteger(index) && index >= 1 && index <= VIEWS.length) {
			commit({ view: VIEWS[index - 1] }, { push: true });
		}
	});
}

function boot() {
	const stored = localStorage.getItem(THEME_KEY);
	applyTheme(THEME_MODES.includes(stored) ? stored : "system");

	const patch = readHash();
	if (!RANGES.includes(patch.range)) patch.range = state.range;
	setState(patch);

	subscribe(() => render(handlers));
	bindChrome();
	bindKeyboard();
	window.addEventListener("hashchange", () => {
		setState(readHash());
		if (state.report?.range.key !== state.range) loadReport();
	});

	render(handlers);
	history.replaceState(null, "", writeHash());
	loadReport();
}

boot();
