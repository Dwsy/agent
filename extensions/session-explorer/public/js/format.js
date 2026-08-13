/**
 * Display formatting.
 *
 * A value the server did not send is rendered as an em dash. Nothing here
 * invents a number: absent stays absent.
 */

export const DASH = "—";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Parse the several timestamp shapes the index uses; invalid input yields null. */
export function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Compact relative time for list rows: `14:32` today, `Mon` this week,
 * `3月4日` beyond that. Locale-aware, and precise enough to scan a list by.
 */
export function relativeTime(value, locale) {
  const date = toDate(value);
  if (!date) return DASH;

  const now = Date.now();
  const delta = now - date.getTime();
  const zh = locale === "zh";

  if (delta < MINUTE) return zh ? "刚刚" : "now";
  if (delta < HOUR) {
    const minutes = Math.floor(delta / MINUTE);
    return zh ? `${minutes} 分钟前` : `${minutes}m`;
  }

  const sameDay = new Date().toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(zh ? "zh-CN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  if (delta < 6 * DAY) {
    return date.toLocaleDateString(zh ? "zh-CN" : "en-US", { weekday: "short" });
  }

  const sameYear = new Date().getFullYear() === date.getFullYear();
  return date.toLocaleDateString(zh ? "zh-CN" : "en-US", {
    month: sameYear ? "short" : "numeric",
    day: "numeric",
    year: sameYear ? undefined : "2-digit",
  });
}

/** Full timestamp for tooltips and the reader header. */
export function absoluteTime(value, locale) {
  const date = toDate(value);
  if (!date) return DASH;
  return date.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Clock time only, for the per-message stamp. */
export function clockTime(value) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Elapsed time between two timestamps, as `2h 14m`. */
export function duration(from, to, locale) {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return DASH;

  const ms = Math.max(0, end.getTime() - start.getTime());
  const zh = locale === "zh";
  if (ms < MINUTE) return zh ? "不到 1 分钟" : "<1m";

  const hours = Math.floor(ms / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (hours === 0) return zh ? `${minutes} 分钟` : `${minutes}m`;
  return zh ? `${hours} 小时 ${minutes} 分` : `${hours}h ${minutes}m`;
}

/** Thousands separators. */
export function number(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  return value.toLocaleString("en-US");
}

/** Token counts, shortened past a thousand: `26.6k`, `1.2M`. */
export function compact(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  if (Math.abs(value) < 1000) return String(value);
  if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/**
 * Spend in USD. Sub-dollar amounts keep four decimals so a cheap session does
 * not round away to `$0.00`; zero stays `$0` because providers legitimately
 * report no price.
 */
export function currency(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/** Character counts for truncation notices. */
export function chars(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DASH;
  if (value < 10_000) return number(value);
  return compact(value);
}

/** Last path segment, for showing a model or file without its namespace. */
export function shortModel(value) {
  if (!value) return DASH;
  const slash = value.lastIndexOf("/");
  return slash === -1 ? value : value.slice(slash + 1);
}

/** Collapse a home-relative path for display: `~/Dev/proj`. */
export function tildePath(value, home) {
  if (!value) return DASH;
  return home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
}
