/**
 * pi-insights — local usage analytics for the Pi coding agent.
 *
 * Every number comes from the session transcripts under `~/.pi/agent/sessions`.
 * No language model is called anywhere in this extension, and nothing leaves
 * the machine: the Web UI binds to 127.0.0.1 only.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { countCachedSessions, getSessionsRoot } from "./index-api.js";
import { resolveCliLocale, t, type Locale } from "./server/i18n.js";
import {
	findLiveUiUrl,
	openBrowser,
	startInsightsServer,
	stopInsightsServer,
} from "./server/http.js";
import { DEFAULT_INSIGHTS_UI_PORT, getInsightsUiPort, setInsightsUiPort } from "./server/port.js";
import { onScanProgress, parseRange, RANGE_KEYS, requestReport } from "./server/reports.js";
import type { InsightsReport } from "./types.js";

const STATUS_KEY = "insights";
const SUBCOMMANDS = ["ui", "open", "port", "refresh", "stats"] as const;

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function formatMinutes(minutes: number): string {
	const total = Math.round(minutes);
	if (total < 60) return `${total}m`;
	return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

function formatCost(costUsd: number): string {
	if (costUsd === 0) return "$0";
	return costUsd < 1 ? `$${costUsd.toFixed(4)}` : `$${costUsd.toFixed(2)}`;
}

function statsLine(locale: Locale, report: InsightsReport): string {
	const { totals } = report;
	const model = [...report.models].sort((a, b) => b.usage.totalTokens - a.usage.totalTokens)[0];
	const tool = [...report.tools].sort((a, b) => b.calls - a.calls)[0];
	return t(locale, "statsLine", {
		range: report.range.key,
		sessions: totals.sessions,
		active: formatMinutes(totals.activeMinutes),
		tokens: formatTokens(totals.usage.totalTokens),
		cost: formatCost(totals.usage.costUsd),
		model: model?.key ?? t(locale, "valueNone"),
		tool: tool ? `${tool.name}(${tool.calls})` : t(locale, "valueNone"),
	});
}

async function showStatus(ctx: ExtensionCommandContext, locale: Locale): Promise<void> {
	const url = await findLiveUiUrl();
	const cached = await countCachedSessions();
	const sessions = getSessionsRoot();
	const message = url
		? t(locale, "statusRunning", { url, sessions, cached })
		: t(locale, "statusStopped", { sessions, cached });
	ctx.ui.notify(message, "info");
}

async function startUi(ctx: ExtensionCommandContext, locale: Locale): Promise<string | null> {
	try {
		return await startInsightsServer();
	} catch (err) {
		ctx.ui.notify(t(locale, "uiStartFailed", { message: errorMessage(err) }), "error");
		return null;
	}
}

async function openUi(ctx: ExtensionCommandContext, locale: Locale): Promise<void> {
	const url = await startUi(ctx, locale);
	if (!url) return;
	try {
		await openBrowser(url);
		ctx.ui.notify(t(locale, "uiOpened", { url }), "info");
	} catch (err) {
		ctx.ui.notify(t(locale, "uiOpenFailed", { message: errorMessage(err) }), "error");
	}
}

function showOrSetPort(ctx: ExtensionCommandContext, locale: Locale, arg: string | undefined): void {
	if (!arg) {
		ctx.ui.notify(
			t(locale, "portShow", {
				port: getInsightsUiPort(),
				defaultPort: DEFAULT_INSIGHTS_UI_PORT,
			}),
			"info",
		);
		return;
	}
	try {
		const port = setInsightsUiPort(Number(arg), true);
		ctx.ui.notify(t(locale, "portSet", { port }), "info");
	} catch {
		ctx.ui.notify(t(locale, "portInvalid"), "error");
	}
}

async function refreshCache(ctx: ExtensionCommandContext, locale: Locale): Promise<void> {
	ctx.ui.setStatus(STATUS_KEY, t(locale, "refreshStart"));
	const unsubscribe = onScanProgress((progress) => {
		ctx.ui.setStatus(STATUS_KEY, t(locale, "refreshProgress", progress));
	});
	try {
		const { scan } = await requestReport("all", true);
		ctx.ui.notify(
			t(locale, "refreshDone", {
				files: scan.files,
				parsed: scan.parsed,
				skipped: scan.skipped,
				badLines: scan.badLines,
				seconds: (scan.durationMs / 1000).toFixed(1),
			}),
			"info",
		);
	} catch (err) {
		ctx.ui.notify(t(locale, "refreshFailed", { message: errorMessage(err) }), "error");
	} finally {
		unsubscribe();
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

async function showStats(
	ctx: ExtensionCommandContext,
	locale: Locale,
	arg: string | undefined,
): Promise<void> {
	const range = parseRange(arg);
	if (!range) {
		ctx.ui.notify(t(locale, "statsRangeInvalid"), "error");
		return;
	}
	ctx.ui.setStatus(STATUS_KEY, t(locale, "statsWorking", { range }));
	try {
		const report = await requestReport(range, false);
		const message =
			report.totals.sessions === 0
				? t(locale, "statsEmpty", { range })
				: statsLine(locale, report);
		ctx.ui.notify(message, "info");
	} catch (err) {
		ctx.ui.notify(t(locale, "statsFailed", { message: errorMessage(err) }), "error");
	} finally {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

function argumentCompletions(
	prefix: string,
): Array<{ value: string; label: string; description?: string }> | null {
	const locale = resolveCliLocale();
	const raw = prefix.trimStart().toLowerCase();

	if (raw.startsWith("port ")) {
		const typed = raw.slice("port ".length).trim();
		const ports = [String(DEFAULT_INSIGHTS_UI_PORT), "33212", "8080"].filter((p) =>
			p.startsWith(typed),
		);
		return ports.length > 0
			? ports.map((p) => ({ value: p, label: p, description: t(locale, "portItem") }))
			: null;
	}

	if (raw.startsWith("stats ")) {
		const typed = raw.slice("stats ".length).trim();
		const ranges = RANGE_KEYS.filter((key) => key.startsWith(typed));
		return ranges.length > 0
			? ranges.map((key) => ({ value: key, label: key, description: t(locale, "rangeItem") }))
			: null;
	}

	if (raw.includes(" ")) return null;

	const descriptions: Record<(typeof SUBCOMMANDS)[number], string> = {
		ui: t(locale, "subUi"),
		open: t(locale, "subOpen"),
		port: t(locale, "subPort"),
		refresh: t(locale, "subRefresh"),
		stats: t(locale, "subStats"),
	};
	const items = SUBCOMMANDS.filter((sub) => sub.startsWith(raw)).map((sub) => ({
		value: sub,
		label: sub,
		description: descriptions[sub],
	}));
	return items.length > 0 ? items : null;
}

export default function piInsights(pi: ExtensionAPI): void {
	// RPC mode has no TUI to notify and no user to open a browser for.
	if (process.argv.includes("--mode") && process.argv.includes("rpc")) return;

	pi.on("session_shutdown", () => {
		void stopInsightsServer();
	});

	pi.registerCommand("insights", {
		description: t(resolveCliLocale(), "cmdDesc"),
		getArgumentCompletions: argumentCompletions,
		handler: async (args, ctx) => {
			const locale = resolveCliLocale();
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const sub = (parts[0] ?? "").toLowerCase();

			if (sub === "ui") {
				const url = await startUi(ctx, locale);
				if (url) ctx.ui.notify(t(locale, "uiStarted", { url }), "info");
				return;
			}
			if (sub === "open") return openUi(ctx, locale);
			if (sub === "port") return showOrSetPort(ctx, locale, parts[1]);
			if (sub === "refresh") return refreshCache(ctx, locale);
			if (sub === "stats") return showStats(ctx, locale, parts[1]);

			return showStatus(ctx, locale);
		},
	});
}
