/**
 * Application state and the selectors derived from it. Holds no DOM and does
 * no formatting; `view.js` reads from here and renders.
 */

export const VIEWS = ["overview", "sessions", "models", "tools", "projects"];
export const RANGES = ["24h", "7d", "30d", "90d", "all"];
export const SERIES = ["tokens", "sessions", "activeMinutes", "costUsd", "userMessages", "linesAdded"];
export const PAGE_SIZES = [25, 50, 100];

export const state = {
	view: "overview",
	range: "30d",
	/** loading | ready | error */
	status: "loading",
	error: undefined,
	report: undefined,
	rescanning: false,
	series: "tokens",
	query: "",
	project: "",
	/** One sort per table view, so switching views does not lose the ordering. */
	sorts: {
		sessions: { key: "startedAt", direction: "desc" },
		models: { key: "tokens", direction: "desc" },
		tools: { key: "calls", direction: "desc" },
		projects: { key: "activeMinutes", direction: "desc" },
	},
	page: 1,
	pageSize: 25,
	detail: { open: false, path: undefined, status: "idle", data: undefined, error: undefined },
};

const listeners = new Set();

export function subscribe(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function emit() {
	for (const listener of listeners) listener();
}

export function setState(patch) {
	Object.assign(state, patch);
	emit();
}

export function setDetail(patch) {
	state.detail = { ...state.detail, ...patch };
	emit();
}

/**
 * Sort accessors per view. Numeric and text columns sort differently, and a
 * column whose value can be absent (a rate with no denominator) sorts last in
 * either direction rather than pretending to be zero.
 */
const SORTERS = {
	sessions: {
		numeric: {
			startedAt: (row) => Date.parse(row.startedAt) || 0,
			activeMinutes: (row) => row.activeMinutes,
			wallMinutes: (row) => row.wallMinutes,
			userMessages: (row) => row.userMessages,
			assistantMessages: (row) => row.assistantMessages,
			toolCalls: (row) => row.toolCalls,
			toolErrors: (row) => row.toolErrors,
			interruptions: (row) => row.interruptions,
			compactions: (row) => row.compactions,
			tokens: (row) => row.usage.totalTokens,
			cost: (row) => row.usage.costUsd,
			lines: (row) => row.edits.linesAdded + row.edits.linesRemoved,
		},
		text: {
			name: (row) => row.name ?? "",
			project: (row) => row.project ?? "",
		},
		fallback: "startedAt",
	},
	models: {
		numeric: {
			sessions: (row) => row.sessions,
			requests: (row) => row.usage.requests,
			input: (row) => row.usage.input,
			output: (row) => row.usage.output,
			cacheRead: (row) => row.usage.cacheRead,
			tokens: (row) => row.usage.totalTokens,
			cost: (row) => row.usage.costUsd,
			share: (row) => row.share,
		},
		text: { model: (row) => `${row.provider}/${row.model}` },
		fallback: "tokens",
	},
	tools: {
		numeric: {
			calls: (row) => row.calls,
			errors: (row) => row.errors,
			errorRate: (row) => row.errorRate,
			sessions: (row) => row.sessions,
		},
		text: { name: (row) => row.name },
		fallback: "calls",
	},
	projects: {
		numeric: {
			sessions: (row) => row.sessions,
			activeMinutes: (row) => row.activeMinutes,
			userMessages: (row) => row.userMessages,
			toolCalls: (row) => row.toolCalls,
			tokens: (row) => row.usage.totalTokens,
			cost: (row) => row.usage.costUsd,
			lines: (row) => row.edits.linesAdded + row.edits.linesRemoved,
			firstAt: (row) => Date.parse(row.firstAt) || 0,
			lastAt: (row) => Date.parse(row.lastAt) || 0,
		},
		text: { name: (row) => row.name },
		fallback: "activeMinutes",
	},
};

export function currentSort(view = state.view) {
	return state.sorts[view] ?? state.sorts.sessions;
}

export function isSortable(view, key) {
	const sorter = SORTERS[view];
	if (!sorter || !key) return false;
	return key in sorter.numeric || key in sorter.text;
}

export function sortRows(view, rows) {
	const sorter = SORTERS[view];
	if (!sorter) return rows;
	const { key, direction } = currentSort(view);
	const sign = direction === "asc" ? 1 : -1;
	const text = sorter.text[key];
	const numeric = sorter.numeric[key] ?? sorter.numeric[sorter.fallback];

	return [...rows].sort((a, b) => {
		if (text) return text(a).localeCompare(text(b)) * sign;
		const left = numeric(a);
		const right = numeric(b);
		// Absent measurements sink to the bottom whichever way the column points.
		if (left === undefined || right === undefined) {
			if (left === right) return 0;
			return left === undefined ? 1 : -1;
		}
		return (left - right) * sign;
	});
}

export function filteredSessions() {
	const sessions = state.report?.sessions ?? [];
	const needle = state.query.trim().toLowerCase();
	return sessions.filter((session) => {
		if (state.project && session.cwd !== state.project) return false;
		if (!needle) return true;
		const haystack = `${session.name ?? ""} ${session.project} ${session.cwd}`.toLowerCase();
		return haystack.includes(needle);
	});
}

export function sortedSessions() {
	return sortRows("sessions", filteredSessions());
}

export function pagedSessions() {
	const rows = sortedSessions();
	const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
	const page = Math.min(state.page, pages);
	const from = (page - 1) * state.pageSize;
	const slice = rows.slice(from, from + state.pageSize);
	return { rows: slice, total: rows.length, page, pages, from: rows.length === 0 ? 0 : from + 1, to: from + slice.length };
}

export function projectOptions() {
	const projects = state.report?.projects ?? [];
	return [...projects].sort((a, b) => b.sessions - a.sessions).map((project) => ({ value: project.cwd, label: project.name }));
}

/** Token mix for the composition bar; zero-width segments are dropped. */
export function tokenComposition() {
	const usage = state.report?.totals.usage;
	if (!usage) return [];
	return [
		{ key: "input", value: usage.input },
		{ key: "output", value: usage.output },
		{ key: "cacheRead", value: usage.cacheRead },
		{ key: "cacheWrite", value: usage.cacheWrite },
		{ key: "reasoning", value: usage.reasoning },
	].filter((segment) => segment.value > 0);
}

export function modelRows() {
	const models = state.report?.models ?? [];
	const total = models.reduce((sum, model) => sum + model.usage.totalTokens, 0);
	return sortRows(
		"models",
		models.map((model) => ({ ...model, share: total > 0 ? model.usage.totalTokens / total : undefined })),
	);
}

export function toolRows() {
	const tools = state.report?.tools ?? [];
	return sortRows(
		"tools",
		tools.map((tool) => ({ ...tool, errorRate: tool.calls > 0 ? tool.errors / tool.calls : undefined })),
	);
}

export function projectRows() {
	return sortRows("projects", state.report?.projects ?? []);
}

export function widerRange() {
	const index = RANGES.indexOf(state.range);
	return index >= 0 && index < RANGES.length - 1 ? RANGES[index + 1] : undefined;
}

/** `#/sessions?range=7d&q=cache&sort=tokens` — every view is linkable. */
export function readHash() {
	const raw = location.hash.replace(/^#\/?/, "");
	const [path, search] = raw.split("?");
	const params = new URLSearchParams(search ?? "");
	const patch = {};
	if (VIEWS.includes(path)) patch.view = path;
	const range = params.get("range");
	if (RANGES.includes(range)) patch.range = range;
	const series = params.get("series");
	if (SERIES.includes(series)) patch.series = series;
	if (params.has("q")) patch.query = params.get("q");
	if (params.has("project")) patch.project = params.get("project");
	const sortKey = params.get("sort");
	const view = patch.view ?? state.view;
	if (isSortable(view, sortKey)) {
		patch.sorts = {
			...state.sorts,
			[view]: { key: sortKey, direction: params.get("dir") === "asc" ? "asc" : "desc" },
		};
	}
	const page = Number(params.get("page"));
	if (Number.isInteger(page) && page > 0) patch.page = page;
	return patch;
}

export function writeHash() {
	const params = new URLSearchParams();
	params.set("range", state.range);
	if (state.view === "overview" && state.series !== "tokens") params.set("series", state.series);
	if (state.view === "sessions") {
		if (state.query) params.set("q", state.query);
		if (state.project) params.set("project", state.project);
		if (state.page > 1) params.set("page", String(state.page));
	}
	if (state.view !== "overview") {
		const sort = currentSort();
		params.set("sort", sort.key);
		params.set("dir", sort.direction);
	}
	return `#/${state.view}?${params}`;
}
