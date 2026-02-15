import zhCN from "./locales/zh-CN";
import enUS from "./locales/en-US";

export type Locale = "zh-CN" | "en-US";
export type Translation = typeof enUS;

const LOCALES: Record<Locale, Translation> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const STORAGE_KEY = "pi-agent-locale";

class I18nManager {
  private currentLocale: Locale = "en-US";
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.detectLocale();
  }

  private detectLocale() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale;
      if (saved && LOCALES[saved]) {
        this.currentLocale = saved;
        return;
      }
    } catch {}
    // Auto-detect from browser
    const lang = navigator.language || "";
    if (lang.startsWith("zh")) {
      this.currentLocale = "zh-CN";
    }
  }

  getCurrentLocale(): Locale { return this.currentLocale; }

  setLocale(locale: Locale) {
    if (LOCALES[locale] && locale !== this.currentLocale) {
      this.currentLocale = locale;
      try { localStorage.setItem(STORAGE_KEY, locale); } catch {}
      document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
      this.listeners.forEach(l => l());
    }
  }

  t(path: string): string {
    const keys = path.split(".");
    let value: any = LOCALES[this.currentLocale];
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return path;
      }
    }
    return typeof value === "string" ? value : path;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getAvailableLocales(): Array<{ code: Locale; label: string }> {
    return [
      { code: "en-US", label: "EN" },
      { code: "zh-CN", label: "中文" },
    ];
  }
}

export const i18n = new I18nManager();
export function t(path: string): string { return i18n.t(path); }
