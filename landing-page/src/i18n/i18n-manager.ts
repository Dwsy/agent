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
  private currentLocale: Locale = "zh-CN";
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale;
      if (saved && LOCALES[saved]) {
        this.currentLocale = saved;
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, this.currentLocale);
    } catch {
      // Ignore storage errors
    }
  }

  getCurrentLocale(): Locale {
    return this.currentLocale;
  }

  setLocale(locale: Locale) {
    if (LOCALES[locale] && locale !== this.currentLocale) {
      this.currentLocale = locale;
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  t(path: string): string {
    const keys = path.split(".");
    let value: any = LOCALES[this.currentLocale];

    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return path; // Return key if translation not found
      }
    }

    return typeof value === "string" ? value : path;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }

  getAvailableLocales(): Array<{ code: Locale; label: string }> {
    return [
      { code: "zh-CN", label: "中文" },
      { code: "en-US", label: "English" },
    ];
  }
}

export const i18n = new I18nManager();

export function t(path: string): string {
  return i18n.t(path);
}
