/**
 * Number and time formatting. Every value shown in the UI passes through here
 * so that "no data" looks the same everywhere: an em dash, never a zero.
 */
import { currentLocale } from "./i18n.js";

export const DASH = "—";

function intlLocale() {
	return currentLocale() === "zh" ? "zh-CN" : "en-US";
}

function finite(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
}

/** `12,481`. Zero is a measurement, so it prints as `0`, not a dash. */
export function formatCount(value) {
	const number = finite(value);
	if (number === undefined) return DASH;
	return new Intl.NumberFormat(intlLocale()).format(number);
}

/** `842`, `26.6k`, `1.2M`, `3.4B`. */
export function formatCompact(value) {
	const number = finite(value);
	if (number === undefined) return DASH;
	const sign = number < 0 ? "-" : "";
	const abs = Math.abs(number);
	if (abs < 1_000) return `${sign}${Math.round(abs)}`;
	if (abs < 1_000_000) return `${sign}${trimZero(abs / 1_000)}k`;
	if (abs < 1_000_000_000) return `${sign}${trimZero(abs / 1_000_000)}M`;
	return `${sign}${trimZero(abs / 1_000_000_000)}B`;
}

function trimZero(value) {
	const text = value < 10 ? value.toFixed(1) : value.toFixed(0);
	return text.endsWith(".0") ? text.slice(0, -2) : text;
}

export const formatTokens = formatCompact;

/** Four decimals under a dollar so sub-cent costs stay legible, two above. */
export function formatCost(value) {
	const number = finite(value);
	if (number === undefined) return DASH;
	const digits = Math.abs(number) < 1 ? 4 : 2;
	return `$${number.toFixed(digits)}`;
}

export function formatPercent(value, digits = 1) {
	const number = finite(value);
	if (number === undefined) return DASH;
	return `${(number * 100).toFixed(digits)}%`;
}

/** `2h 14m`, `45m`, `120h 5m`. Minutes in, never rounded up to hide a zero. */
export function formatDuration(minutes) {
	const number = finite(minutes);
	if (number === undefined || number < 0) return DASH;
	const total = Math.round(number);
	if (total < 60) return `${total}m`;
	const hours = Math.floor(total / 60);
	const rest = total % 60;
	return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatHours(minutes) {
	const number = finite(minutes);
	if (number === undefined) return DASH;
	const hours = number / 60;
	if (hours >= 100) return hours.toFixed(0);
	return hours.toFixed(1);
}

export function formatMs(value) {
	const number = finite(value);
	if (number === undefined) return DASH;
	if (number < 1_000) return `${Math.round(number)}ms`;
	if (number < 60_000) return `${(number / 1_000).toFixed(1)}s`;
	return formatDuration(number / 60_000);
}

export function formatBytes(value) {
	const number = finite(value);
	if (number === undefined) return DASH;
	if (number < 1_024) return `${Math.round(number)} B`;
	if (number < 1_048_576) return `${(number / 1_024).toFixed(1)} KB`;
	if (number < 1_073_741_824) return `${(number / 1_048_576).toFixed(1)} MB`;
	return `${(number / 1_073_741_824).toFixed(2)} GB`;
}

/** `+412 / -87`, with the sign carried so a diff never reads as a total. */
export function formatSigned(value) {
	const number = finite(value);
	if (number === undefined) return DASH;
	if (number === 0) return "0";
	return number > 0 ? `+${formatCount(number)}` : `-${formatCount(Math.abs(number))}`;
}

export function parseTime(value) {
	const time = Date.parse(value ?? "");
	return Number.isFinite(time) ? time : undefined;
}

/** `YYYY-MM-DD` is a local calendar day; Date.parse would read it as UTC. */
export function parseLocalDate(value) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
	if (!match) return undefined;
	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatDateTime(value) {
	const time = parseTime(value);
	if (time === undefined) return DASH;
	return new Intl.DateTimeFormat(intlLocale(), {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(time);
}

export function formatDate(value) {
	const time = parseTime(value) ?? parseLocalDate(value)?.getTime();
	if (time === undefined) return DASH;
	return new Intl.DateTimeFormat(intlLocale(), { month: "short", day: "numeric" }).format(time);
}

export function formatDayFull(value) {
	const date = parseLocalDate(value);
	if (!date) return DASH;
	return new Intl.DateTimeFormat(intlLocale(), { month: "short", day: "numeric", weekday: "short" }).format(date);
}

export function formatClock(value) {
	const time = parseTime(value);
	if (time === undefined) return DASH;
	return new Intl.DateTimeFormat(intlLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(time);
}

const RELATIVE_STEPS = [
	["second", 60_000, 1_000],
	["minute", 3_600_000, 60_000],
	["hour", 86_400_000, 3_600_000],
	["day", 2_592_000_000, 86_400_000],
	["month", 31_536_000_000, 2_592_000_000],
];

export function formatRelative(value) {
	const time = parseTime(value);
	if (time === undefined) return DASH;
	const delta = time - Date.now();
	const abs = Math.abs(delta);
	const relative = new Intl.RelativeTimeFormat(intlLocale(), { numeric: "auto" });
	for (const [unit, limit, divisor] of RELATIVE_STEPS) {
		if (abs < limit) return relative.format(Math.round(delta / divisor), unit);
	}
	return relative.format(Math.round(delta / 31_536_000_000), "year");
}

export function formatHourLabel(hour) {
	return `${String(hour).padStart(2, "0")}`;
}

/** Trims a long absolute path to its tail, keeping the parts that identify it. */
export function shortenPath(value, segments = 3) {
	const text = String(value ?? "");
	if (!text) return DASH;
	const parts = text.split("/").filter(Boolean);
	if (parts.length <= segments) return text;
	return `…/${parts.slice(-segments).join("/")}`;
}
