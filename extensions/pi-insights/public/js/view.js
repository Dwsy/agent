/**
 * Rendering. Reads state, writes DOM, and nothing else.
 *
 * The one rule that shapes this file: a number that was never measured is
 * rendered as an em dash carrying a `title` that explains the absence. A
 * measured zero is rendered as `0`, because that is a fact.
 */
import { barChart, heatStrip, stackedBar, timeSeriesChart } from "./charts.js";
import {
	DASH,
	formatBytes,
	formatClock,
	formatCompact,
	formatCost,
	formatCount,
	formatDate,
	formatDateTime,
	formatDayFull,
	formatDuration,
	formatHourLabel,
	formatHours,
	formatMs,
	formatPercent,
	formatRelative,
	formatSigned,
	shortenPath,
} from "./format.js";
import { applyStaticText, t } from "./i18n.js";
import { PAGE_SIZES, SERIES, currentSort, isSortable, modelRows, pagedSessions, projectOptions, projectRows, state, tokenComposition, toolRows, widerRange } from "./state.js";
import { isFixtureData } from "./api.js";

const dom = {
	app: document.getElementById("app"),
	provenance: document.getElementById("provenance"),
	nav: document.getElementById("nav"),
	rangeGroup: document.getElementById("rangeGroup"),
	search: document.getElementById("search"),
	rescan: document.getElementById("rescan"),
	theme: document.getElementById("theme"),
	locale: document.getElementById("locale"),
	view: document.getElementById("view"),
	detail: document.getElementById("detail"),
	scrim: document.getElementById("scrim"),
};

const ICONS = {
	mark: ["M4 19V6", "M4 19h16", "M8 19v-6", "M12.5 19V9", "M17 19v-9.5", "M8 6.5h7"],
	search: ["M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z", "m16 16 3.8 3.8"],
	refresh: ["M20 7v5h-5", "M4 17v-5h5", "M6.1 8.3A7 7 0 0 1 18.8 7", "M17.9 15.7A7 7 0 0 1 5.2 17"],
	light: ["M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
	dark: ["M20 15.3A8 8 0 0 1 8.7 4 8.2 8.2 0 1 0 20 15.3Z"],
	system: ["M4 5h16v11H4z", "M9 20h6", "M12 16v4"],
	close: ["m6 6 12 12", "M18 6 6 18"],
	prev: ["m14 6-6 6 6 6"],
	next: ["m10 6 6 6-6 6"],
	up: ["m7 14 5-5 5 5"],
	down: ["m7 10 5 5 5-5"],
};

/** Parsed from markup so the SVG namespace never appears as a URL literal. */
function icon(name) {
	const paths = (ICONS[name] ?? []).map((path) => `<path d="${path}"/>`).join("");
	const template = document.createElement("template");
	template.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
	return template.content.firstElementChild;
}

function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined && text !== null) node.textContent = String(text);
	return node;
}

function frag(...children) {
	const fragment = document.createDocumentFragment();
	fragment.append(...children.filter(Boolean));
	return fragment;
}

/** The only way this UI is allowed to say "nothing here". */
function dash(reasonKey = "nodata.generic") {
	const node = el("span", "dash", DASH);
	node.title = t(reasonKey);
	return node;
}

/** `has` is the honest guard: false means unmeasured, not zero. */
function measured(has, render, reasonKey) {
	return has ? render() : dash(reasonKey);
}

/** Charts own a ResizeObserver each, so they must be released before a re-render. */
let activeCharts = [];

function trackChart(controller) {
	activeCharts.push(controller);
}

function destroyCharts() {
	for (const controller of activeCharts) controller.destroy();
	activeCharts = [];
}

function panel(titleKey, hintKey, ...children) {
	const section = el("section", "panel");
	const head = el("header", "panel-head");
	head.append(el("h2", "", t(titleKey)));
	if (hintKey) head.append(el("p", "panel-hint", t(hintKey)));
	section.append(head, ...children.filter(Boolean));
	return section;
}

function chartHost(className) {
	return el("div", `chart-host ${className ?? ""}`.trim());
}

function segmented(options, current, onSelect, labelKey) {
	const group = el("div", "segmented");
	group.setAttribute("role", "group");
	group.setAttribute("aria-label", t(labelKey));
	for (const option of options) {
		const button = el("button", "", t(option.labelKey));
		button.type = "button";
		button.setAttribute("aria-pressed", String(option.value === current));
		button.addEventListener("click", () => onSelect(option.value));
		group.append(button);
	}
	return group;
}

/* ---------------------------------------------------------------- chrome -- */

export function renderChrome() {
	applyStaticText();
	// Assigning an identical value would move the caret while the user types.
	if (dom.search.value !== state.query) dom.search.value = state.query;

	for (const button of dom.rangeGroup.querySelectorAll("button")) {
		button.textContent = t(`range.${button.dataset.range}`);
		button.setAttribute("aria-pressed", String(button.dataset.range === state.range));
	}
	for (const button of dom.nav.querySelectorAll("button")) {
		button.querySelector(".nav-label").textContent = t(`nav.${button.dataset.view}`);
		button.title = t("nav.shortcut", { key: button.dataset.key });
		button.setAttribute("aria-current", button.dataset.view === state.view ? "page" : "false");
	}

	const mode = document.documentElement.dataset.themeMode ?? "system";
	dom.theme.replaceChildren(icon(mode === "system" ? "system" : mode));
	dom.theme.title = t("action.theme", { mode: t(`theme.${mode}`) });
	dom.theme.setAttribute("aria-label", dom.theme.title);
	dom.locale.textContent = document.documentElement.dataset.locale === "en" ? "EN" : "ZH";
	dom.locale.title = t("action.locale");
	dom.locale.setAttribute("aria-label", t("action.locale"));

	dom.rescan.replaceChildren(icon("refresh"), el("span", "", t(state.rescanning ? "action.refreshing" : "action.refresh")));
	dom.rescan.disabled = state.rescanning;
	dom.rescan.classList.toggle("is-busy", state.rescanning);
}

function fact(labelKey, value, title) {
	const item = el("div", "fact");
	item.append(el("span", "fact-label", t(labelKey)));
	const node = typeof value === "string" ? el("span", "fact-value", value) : value;
	node.classList.add("fact-value");
	item.append(node);
	if (title) item.title = t(title);
	return item;
}

export function renderProvenance() {
	const report = state.report;
	if (!report) {
		dom.provenance.replaceChildren();
		return;
	}
	const scan = report.scan;
	const source = isFixtureData() ? "scan.fixture" : scan.cached ? "scan.cached" : "scan.fresh";
	const sourceFact = fact("scan.label", t(source), isFixtureData() ? "scan.fixtureTitle" : undefined);
	sourceFact.classList.add("fact-source");
	if (isFixtureData()) sourceFact.classList.add("is-fixture");

	dom.provenance.replaceChildren(
		sourceFact,
		fact("scan.window", `${formatDate(report.range.start)} – ${formatDate(report.range.end)}`),
		fact("scan.parsed", `${formatCount(scan.parsed)} / ${formatCount(scan.files)}`),
		fact("scan.skipped", formatCount(scan.skipped), "scan.skippedTitle"),
		fact("scan.badLines", formatCount(scan.badLines), "scan.badLinesTitle"),
		fact("scan.bytes", formatBytes(scan.bytes)),
		fact("scan.duration", formatMs(scan.durationMs)),
		fact("scan.generated", formatRelative(report.generatedAt)),
	);
}

/* ----------------------------------------------------------------- states -- */

function loadingState() {
	const root = el("div", "state-block");
	root.append(el("h2", "", t("state.loading")), el("p", "", t("state.loadingHint")));
	const skeleton = el("div", "skeleton-grid");
	for (let index = 0; index < 6; index += 1) skeleton.append(el("div", "skeleton-tile"));
	root.append(skeleton, el("div", "skeleton-chart"));
	return root;
}

function errorState(onRetry) {
	const root = el("div", "state-block is-error");
	root.append(el("h2", "", t("state.errorTitle")), el("p", "state-message", state.error ?? DASH));
	const retry = el("button", "button-primary", t("action.retry"));
	retry.type = "button";
	retry.addEventListener("click", onRetry);
	root.append(retry);
	return root;
}

function emptyRangeState(onWiden) {
	const report = state.report;
	const root = el("div", "state-block");
	root.append(el("h2", "", t("state.emptyTitle")));
	root.append(el("p", "", t("state.emptyBody", { start: formatDateTime(report.range.start), end: formatDateTime(report.range.end) })));
	const wider = widerRange();
	if (wider) {
		const button = el("button", "button-primary", t("state.widen", { range: t(`range.${wider}`) }));
		button.type = "button";
		button.addEventListener("click", () => onWiden(wider));
		root.append(button);
	}
	return root;
}

/** A refresh can fail while stale data is still on screen; say so without hiding it. */
function errorBanner(handlers) {
	if (!state.error || !state.report) return undefined;
	const banner = el("div", "error-banner");
	banner.setAttribute("role", "alert");
	banner.append(el("strong", "", t("state.errorTitle")), el("p", "state-message", state.error));
	const retry = el("button", "button-quiet", t("action.retry"));
	retry.type = "button";
	retry.addEventListener("click", handlers.onRetry);
	banner.append(retry);
	return banner;
}

function emptyRows() {
	const root = el("div", "state-inline");
	root.append(el("p", "state-inline-title", t("state.emptyRows")), el("p", "", t("state.emptyRowsHint")));
	return root;
}

function emptySection() {
	return el("p", "state-inline", t("state.emptySection"));
}

/* ------------------------------------------------------------------ table -- */

/**
 * One table builder for all five views. `columns[].render` returns a node or a
 * string; `data-label` on every cell is what makes the stacked mobile layout
 * readable instead of pinched.
 */
function table(columns, rows, options = {}) {
	const wrapper = el("div", "table-wrap");
	const element = el("table", "data-table");
	if (options.dense) element.classList.add("is-dense");

	const head = el("thead");
	const headRow = el("tr");
	for (const column of columns) {
		const cell = el("th");
		if (column.numeric) cell.classList.add("is-numeric");
		// The accessor map in state.js decides what can be sorted, so a column
		// never advertises an ordering the model cannot actually produce.
		const sortable = options.sortView && isSortable(options.sortView, column.key);
		if (sortable && options.onSort) {
			const sort = currentSort(options.sortView);
			const active = sort.key === column.key;
			cell.setAttribute("aria-sort", active ? (sort.direction === "asc" ? "ascending" : "descending") : "none");
			const button = el("button", "sort-button");
			button.type = "button";
			button.append(el("span", "", t(column.labelKey)));
			if (active) button.append(icon(sort.direction === "asc" ? "up" : "down"));
			button.setAttribute("aria-label", `${t(column.labelKey)} · ${t(active && sort.direction === "asc" ? "sort.desc" : "sort.asc")}`);
			button.addEventListener("click", () => options.onSort(column.key));
			cell.append(button);
		} else {
			cell.textContent = t(column.labelKey);
		}
		if (column.scaleHint) {
			cell.append(el("span", "col-scale", t(column.scaleHint.key, column.scaleHint.vars)));
		}
		headRow.append(cell);
	}
	head.append(headRow);

	const body = el("tbody");
	for (const row of rows) {
		const tr = el("tr");
		if (options.onOpen) {
			tr.classList.add("is-clickable");
			tr.addEventListener("click", (event) => {
				if (event.target.closest("button, a, input, select")) return;
				options.onOpen(row);
			});
		}
		if (options.rowKey && options.activeKey && options.rowKey(row) === options.activeKey) tr.classList.add("is-active");
		for (const column of columns) {
			const cell = el("td");
			cell.dataset.label = t(column.labelKey);
			if (column.numeric) cell.classList.add("is-numeric");
			if (column.className) cell.classList.add(column.className);
			const content = column.render(row);
			cell.append(typeof content === "string" ? document.createTextNode(content) : content);
			tr.append(cell);
		}
		body.append(tr);
	}

	element.append(head, body);
	wrapper.append(element);
	if (rows.length === 0) wrapper.append(emptyRows());
	return wrapper;
}

function costCell(usage) {
	if (usage.requests === 0) return dash("nodata.usage");
	if (usage.costUsd === 0) {
		const node = el("span", "is-zero-cost", formatCost(0));
		node.title = t("nodata.cost");
		return node;
	}
	return formatCost(usage.costUsd);
}

function tokenCell(usage) {
	return measured(usage.requests > 0, () => formatCompact(usage.totalTokens), "nodata.usage");
}

function linesCell(edits) {
	const total = edits.linesAdded + edits.linesRemoved;
	if (edits.writes === 0 && edits.edits === 0) return dash("nodata.edits");
	const node = el("span", "lines-cell");
	node.append(el("span", "line-added", formatSigned(edits.linesAdded)), el("span", "line-removed", formatSigned(-edits.linesRemoved)));
	node.title = `${formatCount(total)} ${t("unit.lines")}`;
	return node;
}

/** Proportion rendered as a rule, not a decoration: width is the value. */
function ratioBar(ratio, tone) {
	const bar = el("div", `ratio-bar ${tone ?? ""}`.trim());
	const fill = el("span");
	fill.style.width = `${Math.min(100, Math.max(0, ratio * 100)).toFixed(2)}%`;
	bar.append(fill);
	return bar;
}

/**
 * The percentage is the claim; the bar only helps compare rows. Error rates and
 * shares live well under 100%, so a full-width scale flattens every row into an
 * identical sliver. The bar is drawn against the column maximum instead, and
 * the header states that maximum so the encoding is not silently misread.
 */
function ratioCell(ratio, { tone, reasonKey = "nodata.rate", scaleMax = 1 } = {}) {
	if (ratio === undefined) return dash(reasonKey);
	const cell = el("div", "ratio-cell");
	cell.append(el("span", "ratio-value", formatPercent(ratio)), ratioBar(scaleMax > 0 ? ratio / scaleMax : 0, tone));
	return cell;
}

function columnScale(values) {
	const max = values.reduce((best, value) => (typeof value === "number" && value > best ? value : best), 0);
	// A near-full-width maximum already reads correctly against the whole.
	return max > 0 && max < 0.85 ? max : 1;
}

function scaleHint(scaleMax) {
	return scaleMax < 1 ? { key: "scale.barMax", vars: { max: formatPercent(scaleMax) } } : undefined;
}

/* --------------------------------------------------------------- overview -- */

function metricTile({ labelKey, value, unitKey, subKey, subVars, extra }) {
	const tile = el("article", "metric");
	tile.append(el("p", "metric-label", t(labelKey)));
	const valueRow = el("p", "metric-value");
	valueRow.append(typeof value === "string" ? document.createTextNode(value) : value);
	valueRow.append(el("span", "metric-unit", t(unitKey)));
	tile.append(valueRow);
	if (extra) tile.append(extra);
	tile.append(el("p", "metric-sub", t(subKey, subVars)));
	return tile;
}

function overviewMetrics(report) {
	const { totals } = report;
	const usage = totals.usage;
	const promptTokens = usage.input + usage.cacheRead;
	const grid = el("div", "metric-grid");

	grid.append(
		metricTile({
			labelKey: "metric.sessions",
			value: formatCount(totals.sessions),
			unitKey: "unit.sessions",
			subKey: "metric.sessions.sub",
			subVars: { days: formatCount(totals.activeDays), projects: formatCount(report.projects.length) },
		}),
		metricTile({
			labelKey: "metric.activeTime",
			value: measured(totals.activeMinutes > 0, () => formatHours(totals.activeMinutes), "nodata.time"),
			unitKey: "unit.hours",
			subKey: "metric.activeTime.sub",
			subVars: { wall: formatDuration(totals.wallMinutes) },
		}),
		metricTile({
			labelKey: "metric.tokens",
			value: tokenCell(usage),
			unitKey: "unit.tokens",
			subKey: "metric.tokens.sub",
			subVars: { input: formatCompact(usage.input), output: formatCompact(usage.output), cacheRead: formatCompact(usage.cacheRead) },
		}),
		metricTile({
			labelKey: "metric.cost",
			value: costCell(usage),
			unitKey: "unit.usd",
			subKey: usage.requests > 0 && usage.costUsd === 0 ? "metric.cost.zero" : "metric.cost.sub",
			subVars: { requests: formatCount(usage.requests) },
		}),
		metricTile({
			labelKey: "metric.cacheHit",
			value: measured(promptTokens > 0, () => formatPercent(totals.cacheHitRate), "nodata.rate"),
			unitKey: "unit.percent",
			subKey: "metric.cacheHit.sub",
			subVars: { hit: formatCount(usage.cacheRead), total: formatCount(promptTokens) },
			extra: promptTokens > 0 ? ratioBar(totals.cacheHitRate) : undefined,
		}),
		metricTile({
			labelKey: "metric.lines",
			value: measured(totals.edits.writes + totals.edits.edits > 0, () => formatCount(totals.edits.linesAdded + totals.edits.linesRemoved), "nodata.edits"),
			unitKey: "unit.lines",
			subKey: "metric.lines.sub",
			subVars: { files: formatCount(totals.edits.filesTouched), writes: formatCount(totals.edits.writes), edits: formatCount(totals.edits.edits) },
			extra: linesCell(totals.edits),
		}),
	);
	return grid;
}

const SERIES_VALUE = {
	tokens: (point) => point.tokens,
	sessions: (point) => point.sessions,
	activeMinutes: (point) => point.activeMinutes,
	costUsd: (point) => point.costUsd,
	userMessages: (point) => point.userMessages,
	linesAdded: (point) => point.linesAdded,
};

const SERIES_FORMAT = {
	tokens: formatCompact,
	sessions: (value) => formatCount(Math.round(value)),
	activeMinutes: (value) => formatDuration(value),
	costUsd: (value) => formatCost(value),
	userMessages: (value) => formatCount(Math.round(value)),
	linesAdded: formatCompact,
};

function activitySection(report, onSeries) {
	const section = panel("section.activity", "section.activityHint");
	section.querySelector(".panel-head").append(
		segmented(
			SERIES.map((key) => ({ value: key, labelKey: `series.${key}` })),
			state.series,
			onSeries,
			"section.activity",
		),
	);
	const host = chartHost();
	section.append(host);
	trackChart(
		timeSeriesChart(host, {
			points: report.daily,
			value: SERIES_VALUE[state.series],
			label: t(`series.${state.series}`),
			formatValue: SERIES_FORMAT[state.series],
			formatX: (point) => formatDate(point.date),
			formatReadoutX: (point) => formatDayFull(point.date),
		}),
	);
	return section;
}

function distributionSections(report) {
	const row = el("div", "panel-row");

	const hourPanel = panel("section.hourly", "section.hourlyHint");
	const hourHost = chartHost();
	hourPanel.append(hourHost);
	trackChart(
		heatStrip(hourHost, {
			values: report.hourly,
			label: t("section.hourly"),
			formatValue: (value) => `${formatCount(value)} ${t("col.user")}`,
			formatHour: formatHourLabel,
		}),
	);

	const weekPanel = panel("section.weekday", "section.weekdayHint");
	const weekHost = chartHost();
	weekPanel.append(weekHost);
	trackChart(
		barChart(weekHost, {
			items: report.weekday.map((value, index) => ({ label: t(`wd.${index}`), value })),
			label: t("section.weekday"),
			formatValue: (value) => formatCount(Math.round(value)),
			height: 132,
		}),
	);

	row.append(hourPanel, weekPanel);
	return row;
}

function signalsSection(report) {
	const section = panel("section.signals", "section.signalsHint");
	if (report.signals.length === 0) {
		section.append(emptySection());
		return section;
	}
	const list = el("ul", "signal-list");
	for (const signal of report.signals) {
		const item = el("li", `signal is-${signal.severity}`);
		const claim = el("div", "signal-claim");
		claim.append(el("span", "signal-severity", t(`severity.${signal.severity}`)));
		claim.append(el("p", "signal-title", t(signal.titleKey, signal.values)));
		claim.append(el("code", "signal-id", signal.id));
		const evidence = el("dl", "signal-evidence");
		for (const entry of signal.evidence) {
			evidence.append(el("dt", "", t(entry.labelKey)), el("dd", "", entry.value));
		}
		item.append(claim, evidence);
		list.append(item);
	}
	section.append(list);
	return section;
}

function renderOverview(report, handlers) {
	return frag(overviewMetrics(report), activitySection(report, handlers.onSeries), distributionSections(report), signalsSection(report));
}

/* --------------------------------------------------------------- sessions -- */

const sessionColumns = (handlers) => [
	{
		key: "startedAt",
		labelKey: "col.started",
		render: (session) => {
			const node = el("span", "cell-stack");
			node.append(el("strong", "", formatRelative(session.startedAt)), el("span", "cell-sub", formatClock(session.startedAt)));
			node.title = formatDateTime(session.startedAt);
			return node;
		},
	},
	{
		key: "name",
		labelKey: "col.session",
		className: "cell-primary",
		render: (session) => {
			const button = el("button", "link-button");
			button.type = "button";
			button.textContent = session.name ?? t("detail.untitled");
			if (!session.name) button.classList.add("is-muted");
			button.setAttribute("aria-label", `${t("action.openSession")}: ${session.name ?? session.project}`);
			button.addEventListener("click", () => handlers.onOpenSession(session.filePath));
			return button;
		},
	},
	{ key: "project", labelKey: "col.project", render: (session) => el("span", "mono-cell", session.project) },
	{ key: "activeMinutes", labelKey: "col.active", numeric: true, render: (session) => formatDuration(session.activeMinutes) },
	{ key: "userMessages", labelKey: "col.user", numeric: true, render: (session) => formatCount(session.userMessages) },
	{
		key: "toolCalls",
		labelKey: "col.tools",
		numeric: true,
		render: (session) => {
			if (session.toolCalls === 0) return dash("nodata.generic");
			const node = el("span", "cell-stack");
			node.append(el("strong", "", formatCount(session.toolCalls)));
			node.append(el("span", session.toolErrors > 0 ? "cell-sub is-warn" : "cell-sub", `${formatCount(session.toolErrors)} ${t("col.errors")}`));
			return node;
		},
	},
	{ key: "tokens", labelKey: "col.tokens", numeric: true, render: (session) => tokenCell(session.usage) },
	{ key: "cost", labelKey: "col.cost", numeric: true, render: (session) => costCell(session.usage) },
	{ key: "lines", labelKey: "col.lines", numeric: true, render: (session) => linesCell(session.edits) },
	{
		key: "models",
		labelKey: "col.models",
		render: (session) => {
			if (session.models.length === 0) return dash("nodata.usage");
			const node = el("span", "model-cell");
			for (const key of session.models) node.append(el("span", "mono-cell", key.split("/").pop()));
			node.title = session.models.join(", ");
			return node;
		},
	},
];

function sessionsToolbar(handlers) {
	const bar = el("div", "toolbar");

	const projectSelect = el("select", "select");
	projectSelect.setAttribute("aria-label", t("filter.project"));
	const allOption = el("option", "", t("filter.allProjects"));
	allOption.value = "";
	projectSelect.append(allOption);
	for (const option of projectOptions()) {
		const node = el("option", "", option.label);
		node.value = option.value;
		if (option.value === state.project) node.selected = true;
		projectSelect.append(node);
	}
	projectSelect.addEventListener("change", () => handlers.onProject(projectSelect.value));

	const sizeSelect = el("select", "select");
	sizeSelect.setAttribute("aria-label", t("filter.rows", { count: state.pageSize }));
	for (const size of PAGE_SIZES) {
		const node = el("option", "", t("filter.rows", { count: size }));
		node.value = String(size);
		if (size === state.pageSize) node.selected = true;
		sizeSelect.append(node);
	}
	sizeSelect.addEventListener("change", () => handlers.onPageSize(Number(sizeSelect.value)));

	bar.append(projectSelect, sizeSelect);
	return bar;
}

function pager(page, handlers) {
	const bar = el("div", "pager");
	bar.append(el("p", "pager-summary", t("pager.summary", { from: formatCount(page.from), to: formatCount(page.to), total: formatCount(page.total) })));
	const controls = el("div", "pager-controls");
	const previous = el("button", "icon-button");
	previous.type = "button";
	previous.append(icon("prev"));
	previous.title = t("pager.prev");
	previous.setAttribute("aria-label", t("pager.prev"));
	previous.disabled = page.page <= 1;
	previous.addEventListener("click", () => handlers.onPage(page.page - 1));
	const next = el("button", "icon-button");
	next.type = "button";
	next.append(icon("next"));
	next.title = t("pager.next");
	next.setAttribute("aria-label", t("pager.next"));
	next.disabled = page.page >= page.pages;
	next.addEventListener("click", () => handlers.onPage(page.page + 1));
	controls.append(previous, el("span", "pager-page", `${page.page} / ${page.pages}`), next);
	bar.append(controls);
	return bar;
}

function renderSessions(handlers) {
	const page = pagedSessions();
	const section = panel("section.sessions", undefined);
	section.querySelector(".panel-head").append(el("p", "panel-hint", t("pager.summary", { from: formatCount(page.from), to: formatCount(page.to), total: formatCount(page.total) })));
	section.append(
		sessionsToolbar(handlers),
		table(sessionColumns(handlers), page.rows, {
			sortView: "sessions",
			onSort: handlers.onSort,
			onOpen: (session) => handlers.onOpenSession(session.filePath),
			rowKey: (session) => session.filePath,
			activeKey: state.detail.open ? state.detail.path : undefined,
		}),
		pager(page, handlers),
	);
	return section;
}

/* ----------------------------------------------------------------- models -- */

function compositionCell(usage) {
	if (usage.totalTokens === 0) return dash("nodata.usage");
	const parts = [usage.input, usage.output, usage.cacheRead, usage.reasoning];
	const total = parts.reduce((sum, value) => sum + value, 0);
	const bar = el("div", "mini-stack");
	parts.forEach((value, index) => {
		if (value <= 0) return;
		const span = el("span");
		span.style.width = `${((value / total) * 100).toFixed(2)}%`;
		span.style.background = `var(--series-${index + 1})`;
		span.title = `${t(["col.input", "col.output", "col.cacheRead", "col.reasoning"][index])}: ${formatCompact(value)}`;
		bar.append(span);
	});
	return bar;
}

function modelColumns(rows) {
	const shareScale = columnScale(rows.map((row) => row.share));
	return [
		{
			key: "model",
			labelKey: "col.model",
			className: "cell-primary",
			render: (row) => {
				const node = el("span", "cell-stack");
				node.append(el("strong", "", row.model), el("span", "cell-sub mono-cell", row.api ? `${row.provider} · ${row.api}` : row.provider));
				return node;
			},
		},
		{ key: "sessions", labelKey: "col.sessionCount", numeric: true, render: (row) => formatCount(row.sessions) },
		{ key: "requests", labelKey: "col.requests", numeric: true, render: (row) => formatCount(row.usage.requests) },
		{ key: "input", labelKey: "col.input", numeric: true, render: (row) => formatCompact(row.usage.input) },
		{ key: "output", labelKey: "col.output", numeric: true, render: (row) => formatCompact(row.usage.output) },
		{ key: "cacheRead", labelKey: "col.cacheRead", numeric: true, render: (row) => formatCompact(row.usage.cacheRead) },
		{ key: "tokens", labelKey: "col.tokens", numeric: true, render: (row) => tokenCell(row.usage) },
		{ key: "cost", labelKey: "col.cost", numeric: true, render: (row) => costCell(row.usage) },
		{
			key: "share",
			labelKey: "col.share",
			numeric: true,
			scaleHint: scaleHint(shareScale),
			render: (row) => ratioCell(row.share, { scaleMax: shareScale, reasonKey: "nodata.usage" }),
		},
		{ key: "composition", labelKey: "col.composition", render: (row) => compositionCell(row.usage) },
	];
}

function renderModels(handlers) {
	const rows = modelRows();
	const mix = panel("section.tokenMix", "section.tokenMixHint");
	const host = chartHost("chart-host-stack");
	mix.append(host);
	const segments = tokenComposition();
	trackChart(
		stackedBar(host, {
			segments: segments.map((segment) => ({ ...segment, label: t(`col.${segment.key}`) })),
			label: t("section.tokenMix"),
			formatValue: formatCompact,
		}),
	);
	const list = panel(
		"section.models",
		undefined,
		table(modelColumns(rows), rows, { dense: true, sortView: "models", onSort: handlers.onSort }),
	);
	return frag(mix, list);
}

/* ------------------------------------------------------------------ tools -- */

function toolColumns(rows) {
	const errorScale = columnScale(rows.map((row) => row.errorRate));
	return [
		{ key: "name", labelKey: "col.tool", className: "cell-primary", render: (row) => el("span", "mono-cell", row.name) },
		{ key: "calls", labelKey: "col.calls", numeric: true, render: (row) => formatCount(row.calls) },
		{ key: "errors", labelKey: "col.errors", numeric: true, render: (row) => formatCount(row.errors) },
		{
			key: "errorRate",
			labelKey: "col.errorRate",
			scaleHint: scaleHint(errorScale),
			render: (row) => ratioCell(row.errorRate, { tone: "is-danger", scaleMax: errorScale }),
		},
		{ key: "sessions", labelKey: "col.reach", numeric: true, render: (row) => formatCount(row.sessions) },
	];
}

function renderTools(handlers) {
	const rows = toolRows();
	const chartPanel = panel("section.toolErrors", "section.toolErrorsHint");
	const host = chartHost();
	chartPanel.append(host);
	trackChart(
		barChart(host, {
			items: rows.slice(0, 12).map((row) => ({ label: row.name, value: (row.errorRate ?? 0) * 100 })),
			label: t("section.toolErrors"),
			formatValue: (value) => `${value.toFixed(1)}%`,
			height: 168,
		}),
	);
	return frag(
		chartPanel,
		panel("section.tools", undefined, table(toolColumns(rows), rows, { dense: true, sortView: "tools", onSort: handlers.onSort })),
	);
}

/* --------------------------------------------------------------- projects -- */

const PROJECT_COLUMNS = [
	{
		key: "name",
		labelKey: "col.project",
		className: "cell-primary",
		render: (row) => {
			const node = el("span", "cell-stack");
			node.append(el("strong", "", row.name), el("span", "cell-sub mono-cell", shortenPath(row.cwd)));
			node.title = row.cwd;
			return node;
		},
	},
	{ key: "sessions", labelKey: "col.sessionCount", numeric: true, render: (row) => formatCount(row.sessions) },
	{ key: "activeMinutes", labelKey: "col.activeTime", numeric: true, render: (row) => formatDuration(row.activeMinutes) },
	{ key: "userMessages", labelKey: "col.user", numeric: true, render: (row) => formatCount(row.userMessages) },
	{ key: "toolCalls", labelKey: "col.tools", numeric: true, render: (row) => formatCount(row.toolCalls) },
	{ key: "tokens", labelKey: "col.tokens", numeric: true, render: (row) => tokenCell(row.usage) },
	{ key: "cost", labelKey: "col.cost", numeric: true, render: (row) => costCell(row.usage) },
	{ key: "lines", labelKey: "col.lines", numeric: true, render: (row) => linesCell(row.edits) },
	{ key: "firstAt", labelKey: "col.first", render: (row) => withTitle(el("span", "", formatDate(row.firstAt)), formatDateTime(row.firstAt)) },
	{ key: "lastAt", labelKey: "col.last", render: (row) => withTitle(el("span", "", formatRelative(row.lastAt)), formatDateTime(row.lastAt)) },
];

function withTitle(node, title) {
	node.title = title;
	return node;
}

function renderProjects(handlers) {
	return panel(
		"section.projects",
		undefined,
		table(PROJECT_COLUMNS, projectRows(), { dense: true, sortView: "projects", onSort: handlers.onSort }),
	);
}

/* ----------------------------------------------------------------- detail -- */

const DETAIL_TOOL_COLUMNS = [
	{ key: "name", labelKey: "col.tool", render: (row) => el("span", "mono-cell", row.name) },
	{ key: "calls", labelKey: "col.calls", numeric: true, render: (row) => formatCount(row.calls) },
	{ key: "errors", labelKey: "col.errors", numeric: true, render: (row) => formatCount(row.errors) },
];

const DETAIL_LANGUAGE_COLUMNS = [
	{ key: "label", labelKey: "col.language", render: (row) => row.label },
	{ key: "files", labelKey: "col.files", numeric: true, render: (row) => formatCount(row.files) },
	{ key: "linesAdded", labelKey: "col.added", numeric: true, render: (row) => formatSigned(row.linesAdded) },
	{ key: "linesRemoved", labelKey: "col.removed", numeric: true, render: (row) => formatSigned(-row.linesRemoved) },
];

const DETAIL_MODEL_COLUMNS = [
	{ key: "key", labelKey: "col.model", render: (row) => el("span", "mono-cell", row.key) },
	{ key: "requests", labelKey: "col.requests", numeric: true, render: (row) => formatCount(row.usage.requests) },
	{ key: "tokens", labelKey: "col.tokens", numeric: true, render: (row) => tokenCell(row.usage) },
	{ key: "cost", labelKey: "col.cost", numeric: true, render: (row) => costCell(row.usage) },
];

const DETAIL_FILE_COLUMNS = [
	{ key: "path", labelKey: "col.path", className: "cell-primary", render: (row) => withTitle(el("span", "mono-cell", shortenPath(row.path, 2)), row.path) },
	{ key: "writes", labelKey: "col.writes", numeric: true, render: (row) => formatCount(row.writes) },
	{ key: "edits", labelKey: "col.edits", numeric: true, render: (row) => formatCount(row.edits) },
	{ key: "linesAdded", labelKey: "col.added", numeric: true, render: (row) => formatSigned(row.linesAdded) },
	{ key: "linesRemoved", labelKey: "col.removed", numeric: true, render: (row) => formatSigned(-row.linesRemoved) },
];

function detailFacts(detail) {
	const grid = el("div", "detail-facts");
	grid.append(
		fact("col.project", detail.project),
		fact("col.started", formatDateTime(detail.startedAt)),
		fact("col.active", `${formatDuration(detail.activeMinutes)} / ${formatDuration(detail.wallMinutes)}`),
		fact("col.user", `${formatCount(detail.userMessages)} / ${formatCount(detail.assistantMessages)}`),
		fact("col.tools", `${formatCount(detail.toolCalls)} / ${formatCount(detail.toolErrors)}`),
		fact("col.tokens", tokenCell(detail.usage)),
		fact("col.cost", costCell(detail.usage)),
		fact("col.interruptions", formatCount(detail.interruptions)),
		fact("col.compactions", formatCount(detail.compactions)),
		fact("col.lines", linesCell(detail.edits)),
	);
	return grid;
}

function detailTimeline(events) {
	if (events.length === 0) return emptySection();
	const list = el("ol", "timeline");
	for (const event of events) {
		const item = el("li", `timeline-item is-${event.kind}`);
		item.append(el("time", "timeline-time", formatClock(event.at)));
		item.append(el("span", "timeline-kind", t(`event.${event.kind}`)));
		item.append(el("span", "timeline-label", event.label));
		list.append(item);
	}
	return list;
}

function detailSection(titleKey, content) {
	const section = el("section", "detail-section");
	section.append(el("h3", "", t(titleKey)), content);
	return section;
}

export function renderDetail(handlers) {
	const { open, status, data, error, path } = state.detail;
	dom.detail.hidden = !open;
	dom.scrim.hidden = !open;
	dom.app.classList.toggle("detail-open", open);
	if (!open) {
		dom.detail.replaceChildren();
		return;
	}

	const header = el("header", "detail-head");
	const identity = el("div", "detail-identity");
	identity.append(el("p", "eyebrow", t("detail.eyebrow")));
	identity.append(el("h2", "", status === "ready" ? data.name ?? t("detail.untitled") : t("detail.loading")));
	identity.append(withTitle(el("p", "detail-path mono-cell", shortenPath(path, 2)), path ?? ""));
	const close = el("button", "icon-button");
	close.type = "button";
	close.append(icon("close"));
	close.title = t("action.close");
	close.setAttribute("aria-label", t("action.close"));
	close.addEventListener("click", handlers.onCloseDetail);
	header.append(identity, close);

	const body = el("div", "detail-body");
	if (status === "loading") {
		const skeleton = el("div", "skeleton-grid is-detail");
		for (let index = 0; index < 6; index += 1) skeleton.append(el("div", "skeleton-tile"));
		body.append(skeleton);
	} else if (status === "error") {
		body.append(el("h3", "", t("detail.errorTitle")), el("p", "state-message", error ?? DASH));
	} else if (data) {
		body.append(detailFacts(data));
		body.append(detailSection("detail.tools", data.tools.length ? table(DETAIL_TOOL_COLUMNS, data.tools, { dense: true }) : emptySection()));
		body.append(detailSection("detail.languages", data.languages.length ? table(DETAIL_LANGUAGE_COLUMNS, data.languages, { dense: true }) : emptySection()));
		body.append(detailSection("detail.models", data.modelUsage.length ? table(DETAIL_MODEL_COLUMNS, data.modelUsage, { dense: true }) : emptySection()));
		body.append(detailSection("detail.files", data.files.length ? table(DETAIL_FILE_COLUMNS, data.files, { dense: true }) : emptySection()));
		body.append(detailSection("detail.timeline", detailTimeline(data.events)));
	}

	dom.detail.replaceChildren(header, body);
}

/* ------------------------------------------------------------------- root -- */

export function render(handlers) {
	renderChrome();
	renderProvenance();
	destroyCharts();

	if (state.status === "loading" && !state.report) {
		dom.view.replaceChildren(loadingState());
	} else if (state.status === "error" && !state.report) {
		dom.view.replaceChildren(errorState(handlers.onRetry));
	} else if (state.report?.totals.sessions === 0) {
		dom.view.replaceChildren(emptyRangeState(handlers.onRange));
	} else if (state.report) {
		const report = state.report;
		const byView = {
			overview: () => renderOverview(report, handlers),
			sessions: () => renderSessions(handlers),
			models: () => renderModels(handlers),
			tools: () => renderTools(handlers),
			projects: () => renderProjects(handlers),
		};
		dom.view.replaceChildren(frag(errorBanner(handlers), byView[state.view]()));
	}

	dom.view.dataset.view = state.view;
	dom.app.setAttribute("aria-busy", String(state.status === "loading"));
	renderDetail(handlers);
}
