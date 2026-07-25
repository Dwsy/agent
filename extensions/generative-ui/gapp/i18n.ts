/**
 * GAPP user/agent text locale: zh | en, auto from system env.
 * Override: GAPP_LANG=zh|en
 * Detect order: GAPP_LANG → LC_ALL/LC_MESSAGES/LANG/LANGUAGE → Intl
 * Compatible: macOS/Linux (LANG=zh_CN.UTF-8) and Windows (Intl via Node).
 */

export type GappLang = "zh" | "en";

let cached: GappLang | null = null;

/** Force language (tests). Pass null to clear cache and re-detect. */
export function setGappLang(lang: GappLang | null): void {
  cached = lang;
}

export function detectGappLang(): GappLang {
  if (cached) return cached;

  const forced = (process.env.GAPP_LANG || "").trim().toLowerCase();
  if (forced === "zh" || forced.startsWith("zh-") || forced.startsWith("zh_")) {
    cached = "zh";
    return "zh";
  }
  if (forced === "en" || forced.startsWith("en-") || forced.startsWith("en_")) {
    cached = "en";
    return "en";
  }

  const envBlob = [
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    process.env.LANGUAGE,
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ")
    .toLowerCase();

  if (/(^|[\s:._-])zh([_\s:.-]|$)/i.test(envBlob) || envBlob.includes("chinese")) {
    cached = "zh";
    return "zh";
  }

  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    if (locale.toLowerCase().startsWith("zh")) {
      cached = "zh";
      return "zh";
    }
  } catch {
    // ignore
  }

  cached = "en";
  return "en";
}

export function isZh(): boolean {
  return detectGappLang() === "zh";
}

/** Pick zh/en string; optional {var} interpolation. */
export function t(dict: { zh: string; en: string }, vars?: Record<string, string | number>): string {
  let text = dict[detectGappLang()] ?? dict.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}
