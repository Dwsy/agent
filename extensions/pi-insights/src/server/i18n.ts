/**
 * Server-side strings for the Pi TUI (`/insights` notifications and completions).
 *
 * The Web UI ships its own strings in `public/js/i18n.js`; the backend never
 * sends prose to the browser.
 */

export type Locale = "zh" | "en";

export const I18N: Record<Locale, Record<string, string>> = {
	zh: {
		cmdDesc: "本地用量分析：会话、令牌、成本、工具、编辑",
		subUi: "启动 Web UI 并打印地址",
		subOpen: "启动 Web UI 并在浏览器中打开",
		subPort: "查看或设置 UI 端口",
		subRefresh: "重建会话缓存",
		subStats: "在 TUI 中打印一行统计（24h|7d|30d|90d|all）",
		portItem: "UI 端口",
		rangeItem: "统计区间",

		statusRunning: "pi-insights · UI {url} · 会话目录 {sessions} · 缓存 {cached} 个会话",
		statusStopped: "pi-insights · UI 未运行（/insights ui 启动） · 会话目录 {sessions} · 缓存 {cached} 个会话",

		uiStarted: "pi-insights UI: {url}",
		uiStartFailed: "启动 pi-insights UI 失败: {message}",
		uiOpened: "已在浏览器中打开 {url}",
		uiOpenFailed: "打开浏览器失败: {message}",

		portShow: "UI 端口 {port}（默认 {defaultPort}）",
		portSet: "UI 端口已设为 {port}，下次启动生效",
		portInvalid: "端口无效，需为 1024-65535 之间的整数",
		portInUse: "端口 {port} 被其它程序占用，请用 /insights port <n> 换一个端口",

		refreshStart: "正在重建缓存…",
		refreshProgress: "{phase} {done}/{total}",
		refreshDone: "缓存已重建：{files} 个文件 · 解析 {parsed} · 跳过 {skipped} · 坏行 {badLines} · 耗时 {seconds}s",
		refreshFailed: "重建缓存失败: {message}",

		statsRangeInvalid: "区间无效，可选 24h | 7d | 30d | 90d | all",
		statsEmpty: "{range} 区间内没有会话记录",
		statsLine:
			"{range} · {sessions} 会话 · 专注 {active} · {tokens} tokens · {cost} · 模型 {model} · 工具 {tool}",
		statsFailed: "统计失败: {message}",
		statsWorking: "正在统计 {range}…",
		valueNone: "—",
	},
	en: {
		cmdDesc: "Local usage analytics: sessions, tokens, cost, tools, edits",
		subUi: "Start the Web UI and print its URL",
		subOpen: "Start the Web UI and open it in a browser",
		subPort: "Show or set the UI port",
		subRefresh: "Rebuild the session cache",
		subStats: "Print a one-line summary in the TUI (24h|7d|30d|90d|all)",
		portItem: "UI port",
		rangeItem: "Stats range",

		statusRunning: "pi-insights · UI {url} · sessions {sessions} · cache {cached} sessions",
		statusStopped:
			"pi-insights · UI not running (/insights ui to start) · sessions {sessions} · cache {cached} sessions",

		uiStarted: "pi-insights UI: {url}",
		uiStartFailed: "Failed to start the pi-insights UI: {message}",
		uiOpened: "Opened {url}",
		uiOpenFailed: "Failed to open a browser: {message}",

		portShow: "UI port {port} (default {defaultPort})",
		portSet: "UI port set to {port}; effective on next start",
		portInvalid: "Invalid port: expected an integer between 1024 and 65535",
		portInUse: "Port {port} is used by another program; pick another with /insights port <n>",

		refreshStart: "Rebuilding cache…",
		refreshProgress: "{phase} {done}/{total}",
		refreshDone:
			"Cache rebuilt: {files} files · parsed {parsed} · skipped {skipped} · bad lines {badLines} · {seconds}s",
		refreshFailed: "Cache rebuild failed: {message}",

		statsRangeInvalid: "Invalid range: expected 24h | 7d | 30d | 90d | all",
		statsEmpty: "No sessions recorded in {range}",
		statsLine:
			"{range} · {sessions} sessions · {active} active · {tokens} tokens · {cost} · model {model} · tool {tool}",
		statsFailed: "Stats failed: {message}",
		statsWorking: "Computing {range}…",
		valueNone: "—",
	},
};

/** Locale for TUI notifications and completions. */
export function resolveCliLocale(): Locale {
	const forced = process.env.PI_INSIGHTS_LOCALE?.trim().toLowerCase();
	if (forced === "zh" || forced === "en") return forced;
	const lang = process.env.LANG || process.env.LC_ALL || "";
	return /^zh/i.test(lang) ? "zh" : "en";
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
	let s = I18N[locale][key] ?? I18N.en[key] ?? key;
	if (!vars) return s;
	for (const [k, v] of Object.entries(vars)) {
		s = s.replace(`{${k}}`, String(v));
	}
	return s;
}
