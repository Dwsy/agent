// Cursor-compatible Canvas SDK source bundled into @gen-ui/canvas.
// Keep this module standalone: canvas.ts owns compilation/host mounting, while
// this file owns the author-facing SDK surface and Pi-specific host adapters.

export const CANVAS_SDK_SOURCE = String.raw`
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const h = React.createElement;

export const canvasTypography = {
  h1: { fontSize: "24px", lineHeight: "30px", fontWeight: 590 },
  h2: { fontSize: "18px", lineHeight: "24px", fontWeight: 590 },
  h3: { fontSize: "16px", lineHeight: "22px", fontWeight: 590 },
  body: { fontSize: "14px", lineHeight: "20px", fontWeight: 400 },
  small: { fontSize: "12px", lineHeight: "16px", fontWeight: 400 },
};

export const canvasSpacing = { 0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14, 4: 16, 4.5: 18, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40 };
export const canvasRadius = { none: 0, xs: 2, sm: 4, md: 6, lg: 8, xl: 12, full: 9999 };

export const categoryPaletteLight = {
  gray: "#888780", purple: "#534AB7", green: "#3B6D11", yellow: "#854F0B", cyan: "#0F6E56",
  pink: "#993556", blue: "#185FA5", orange: "#993C1D", red: "#A32D2D",
};
export const categoryPaletteDark = {
  gray: "#A0A0A0", purple: "#AFA9EC", green: "#97C459", yellow: "#EF9F27", cyan: "#5DCAA5",
  pink: "#ED93B1", blue: "#85B7EB", orange: "#F0997B", red: "#F09595",
};
export const colorPalette = categoryPaletteDark;
export const usageColorSequence = ["gray", "purple", "green", "yellow", "cyan", "pink", "blue", "orange", "red"];

export const canvasPaletteLight = {
  foreground: "#1a1a1a", foregroundSecondary: "#5f5e5a", foregroundTertiary: "#888780", foregroundQuaternary: "#888780",
  editor: "#ffffff", chrome: "#f1efe8", sidebar: "#f1efe8", elevated: "#ffffff",
  fillPrimary: "rgba(0,0,0,0.20)", fillSecondary: "rgba(0,0,0,0.14)", fillTertiary: "#e8e6de", fillQuaternary: "#f1efe8",
  strokePrimary: "rgba(0,0,0,0.40)", strokeSecondary: "rgba(0,0,0,0.30)", strokeTertiary: "rgba(0,0,0,0.15)", strokeFocused: "#185FA5",
  accent: "#185FA5", buttonBackground: "#185FA5", buttonForeground: "#ffffff", buttonHoverBackground: "#185FA5", link: "#185FA5",
  diffInsertedLine: "#EAF3DE", diffRemovedLine: "#FCEBEB", diffStripAdded: "#639922", diffStripRemoved: "#E24B4A",
};
export const canvasPaletteDark = {
  foreground: "#e0e0e0", foregroundSecondary: "#a0a0a0", foregroundTertiary: "#707070", foregroundQuaternary: "#707070",
  editor: "#1a1a1a", chrome: "#2a2a2a", sidebar: "#2a2a2a", elevated: "#1a1a1a",
  fillPrimary: "rgba(255,255,255,0.20)", fillSecondary: "rgba(255,255,255,0.14)", fillTertiary: "#111111", fillQuaternary: "#2a2a2a",
  strokePrimary: "rgba(255,255,255,0.40)", strokeSecondary: "rgba(255,255,255,0.30)", strokeTertiary: "rgba(255,255,255,0.15)", strokeFocused: "#85B7EB",
  accent: "#85B7EB", buttonBackground: "#85B7EB", buttonForeground: "#1a1a1a", buttonHoverBackground: "#85B7EB", link: "#85B7EB",
  diffInsertedLine: "#27500A", diffRemovedLine: "#791F1F", diffStripAdded: "#97C459", diffStripRemoved: "#F09595",
};

function tokensFromPalette(palette, category) {
  return {
    bg: { editor: palette.editor, chrome: palette.chrome, elevated: palette.elevated },
    text: { primary: palette.foreground, secondary: palette.foregroundSecondary, tertiary: palette.foregroundTertiary, quaternary: palette.foregroundQuaternary, link: palette.link, onAccent: palette.buttonForeground },
    stroke: { primary: palette.strokePrimary, secondary: palette.strokeSecondary, tertiary: palette.strokeTertiary, focused: palette.strokeFocused },
    fill: { primary: palette.fillPrimary, secondary: palette.fillSecondary, tertiary: palette.fillTertiary, quaternary: palette.fillQuaternary },
    accent: { primary: palette.accent, control: palette.buttonBackground, controlHover: palette.buttonHoverBackground },
    diff: { insertedLine: palette.diffInsertedLine, removedLine: palette.diffRemovedLine, stripAdded: palette.diffStripAdded, stripRemoved: palette.diffStripRemoved },
    category,
  };
}

export const canvasTokens = tokensFromPalette(canvasPaletteDark, categoryPaletteDark);
export const canvasTokensLight = tokensFromPalette(canvasPaletteLight, categoryPaletteLight);

function cssVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch (_) {
    return fallback;
  }
}

function currentTheme() {
  const fallbackDark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  const fromHost = typeof window !== "undefined" && typeof window._themeVars === "function" ? window._themeVars() : {};
  const forcedDark = typeof window !== "undefined" && typeof window.__hostDarkMode === "boolean" ? window.__hostDarkMode : undefined;
  const dark = forcedDark !== undefined ? forcedDark : (typeof fromHost.dark === "boolean" ? fromHost.dark : fallbackDark);
  const staticPalette = dark ? canvasPaletteDark : canvasPaletteLight;
  const category = dark ? categoryPaletteDark : categoryPaletteLight;
  const palette = {
    ...staticPalette,
    foreground: fromHost.text || cssVar("--color-text-primary", staticPalette.foreground),
    foregroundSecondary: fromHost.textSecondary || cssVar("--color-text-secondary", staticPalette.foregroundSecondary),
    foregroundTertiary: fromHost.textTertiary || cssVar("--color-text-tertiary", staticPalette.foregroundTertiary),
    foregroundQuaternary: fromHost.textTertiary || cssVar("--color-text-tertiary", staticPalette.foregroundQuaternary),
    editor: fromHost.bg || cssVar("--color-background-primary", staticPalette.editor),
    chrome: fromHost.bgSecondary || cssVar("--color-background-secondary", staticPalette.chrome),
    sidebar: fromHost.bgSecondary || cssVar("--color-background-secondary", staticPalette.sidebar),
    elevated: fromHost.bgSecondary || cssVar("--color-background-secondary", staticPalette.elevated),
    fillPrimary: fromHost.bgSecondary || cssVar("--color-background-secondary", staticPalette.fillPrimary),
    fillSecondary: fromHost.bgSecondary || cssVar("--color-background-secondary", staticPalette.fillSecondary),
    fillTertiary: fromHost.bgTertiary || cssVar("--color-background-tertiary", staticPalette.fillTertiary),
    fillQuaternary: fromHost.bgTertiary || cssVar("--color-background-tertiary", staticPalette.fillQuaternary),
    strokePrimary: fromHost.borderSecondary || cssVar("--color-border-primary", staticPalette.strokePrimary),
    strokeSecondary: fromHost.borderSecondary || cssVar("--color-border-secondary", staticPalette.strokeSecondary),
    strokeTertiary: fromHost.border || cssVar("--color-border-tertiary", staticPalette.strokeTertiary),
    strokeFocused: fromHost.textInfo || cssVar("--color-border-info", staticPalette.strokeFocused),
    accent: fromHost.textInfo || cssVar("--color-text-info", staticPalette.accent),
    buttonBackground: fromHost.textInfo || cssVar("--color-text-info", staticPalette.buttonBackground),
    buttonForeground: dark ? cssVar("--color-background-primary", staticPalette.buttonForeground) : "#ffffff",
    buttonHoverBackground: fromHost.textInfo || cssVar("--color-border-info", staticPalette.buttonHoverBackground),
    link: fromHost.textInfo || cssVar("--color-text-info", staticPalette.link),
    diffInsertedLine: cssVar("--color-background-success", staticPalette.diffInsertedLine),
    diffRemovedLine: cssVar("--color-background-danger", staticPalette.diffRemovedLine),
    diffStripAdded: fromHost.textSuccess || cssVar("--color-border-success", staticPalette.diffStripAdded),
    diffStripRemoved: fromHost.textDanger || cssVar("--color-border-danger", staticPalette.diffStripRemoved),
  };
  const tokens = tokensFromPalette(palette, category);
  return { kind: dark ? "dark" : "light", ...tokens, tokens, palette };
}

export function useHostTheme() {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => {
    const onChange = () => setTheme(currentTheme());
    const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    if (mq && mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq && mq.addListener) mq.addListener(onChange);
    if (typeof window !== "undefined") window.addEventListener("gen-ui-canvas-theme-change", onChange);
    return () => {
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq && mq.removeListener) mq.removeListener(onChange);
      if (typeof window !== "undefined") window.removeEventListener("gen-ui-canvas-theme-change", onChange);
    };
  }, []);
  return theme;
}

function canvasStorageKey(key) {
  const canvasId = typeof window !== "undefined" && window.__canvasId ? String(window.__canvasId) : (typeof location !== "undefined" ? location.pathname : "canvas");
  return "__gen_ui_canvas_state_v1__:" + canvasId + ":" + key;
}

export function useCanvasState(key, defaultValue) {
  const storageKey = canvasStorageKey(key);
  const mutationVersion = useRef(0);
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw == null ? defaultValue : JSON.parse(raw);
    } catch (_) {
      return defaultValue;
    }
  });
  useEffect(() => {
    const bridge = typeof window !== "undefined" ? window.__canvasHostBridge : null;
    if (!bridge || typeof bridge.requestState !== "function" || !bridge.isAvailable || !bridge.isAvailable()) return;
    let active = true;
    const version = mutationVersion.current;
    bridge.requestState(key).then((result) => {
      if (!active || mutationVersion.current !== version || !result || result.found !== true) return;
      setValue(result.value);
    }).catch(() => {});
    return () => { active = false; };
  }, [key]);
  const setPersistent = useCallback((action) => {
    mutationVersion.current += 1;
    setValue((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (_) {}
      const bridge = typeof window !== "undefined" ? window.__canvasHostBridge : null;
      if (bridge && typeof bridge.setState === "function" && (!bridge.isAvailable || bridge.isAvailable())) {
        try { bridge.setState(key, next); } catch (_) {}
      }
      return next;
    });
  }, [key, storageKey]);
  return [value, setPersistent];
}

export function useCanvasAction() {
  return useCallback((action) => {
    if (typeof window !== "undefined" && typeof window.sendWidgetEvent === "function") {
      window.sendWidgetEvent({ type: "canvas_action", action });
    }
  }, []);
}

export function sendToAgent(data) { return window.sendWidgetEvent(data); }
export function sendPrompt(prompt) { return window.sendPrompt(prompt); }
export function sendAnnotation(targetId, comment, stateId) { return window.sendAnnotation(targetId, comment, stateId); }

export function mergeStyle(base, override) { return override ? { ...base, ...override } : { ...base }; }

function toneColor(theme, tone) {
  if (tone === "success") return cssVar("--color-text-success", theme.category.green);
  if (tone === "danger") return cssVar("--color-text-danger", theme.category.red);
  if (tone === "warning") return cssVar("--color-text-warning", theme.category.yellow);
  if (tone === "info") return cssVar("--color-text-info", theme.category.blue);
  return theme.text.secondary;
}

export function Stack({ children, gap = 12, style }) {
  return h("div", { style: mergeStyle({ display: "flex", flexDirection: "column", gap, minWidth: 0 }, style) }, children);
}

export function Row({ children, gap = 8, align = "start", justify = "start", wrap = false, style }) {
  const alignMap = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
  const justifyMap = { start: "flex-start", center: "center", end: "flex-end", "space-between": "space-between" };
  return h("div", { style: mergeStyle({ display: "flex", flexDirection: "row", gap, alignItems: alignMap[align], justifyContent: justifyMap[justify], flexWrap: wrap ? "wrap" : "nowrap", minWidth: 0 }, style) }, children);
}

export function Grid({ children, columns, gap = 12, align = "stretch", style }) {
  return h("div", { style: mergeStyle({ display: "grid", gridTemplateColumns: typeof columns === "number" ? "repeat(" + columns + ", minmax(0, 1fr))" : columns, gap, alignItems: align, minWidth: 0 }, style) }, children);
}

export function Divider({ style }) {
  const t = useHostTheme();
  return h("div", { role: "separator", style: mergeStyle({ height: 1, width: "100%", background: t.stroke.tertiary, flexShrink: 0 }, style) });
}

export function Spacer() { return h("div", { "aria-hidden": true, style: { flex: 1, minWidth: 0 } }); }

const TypographyContext = createContext(false);
const weightMap = { normal: 400, medium: 500, semibold: 590, bold: 700 };

export function Text({ children, tone = "primary", size = "body", as, weight = "normal", italic = false, truncate = false, style }) {
  const t = useHostTheme();
  const nested = useContext(TypographyContext);
  const tag = as || (nested ? "span" : "p");
  const truncateStyle = truncate ? { overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", direction: truncate === "start" ? "rtl" : "ltr", textAlign: truncate === "start" ? "left" : undefined } : {};
  const node = h(tag, { style: mergeStyle({ margin: 0, color: t.text[tone] || t.text.primary, ...(size === "small" ? canvasTypography.small : canvasTypography.body), fontWeight: weightMap[weight] || 400, fontStyle: italic ? "italic" : undefined, ...truncateStyle }, style) }, children);
  return h(TypographyContext.Provider, { value: true }, node);
}

function Heading({ level, children, style }) {
  const t = useHostTheme();
  const preset = level === 1 ? canvasTypography.h1 : level === 2 ? canvasTypography.h2 : canvasTypography.h3;
  return h("h" + level, { style: mergeStyle({ ...preset, margin: 0, color: t.text.primary, letterSpacing: "-0.01em" }, style) }, children);
}
export function H1(props) { return h(Heading, { ...props, level: 1 }); }
export function H2(props) { return h(Heading, { ...props, level: 2 }); }
export function H3(props) { return h(Heading, { ...props, level: 3 }); }

export function Code({ children, style }) {
  const t = useHostTheme();
  return h("code", { style: mergeStyle({ fontFamily: "var(--font-mono)", fontSize: "0.92em", color: t.text.primary, background: t.fill.tertiary, borderRadius: canvasRadius.sm, padding: "1px 4px" }, style) }, children);
}

export function Link({ children, href, style }) {
  const t = useHostTheme();
  return h("a", { href, target: "_blank", rel: "noreferrer", style: mergeStyle({ color: t.text.link, textDecoration: "none" }, style) }, children);
}

function rowToneDot(t, tone) {
  return tone ? h("span", { "aria-hidden": true, style: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: toneColor(t, tone), marginRight: 8, flexShrink: 0 } }) : null;
}

export function Table({ headers = [], rows = [], columnAlign = [], rowTone = [], framed = true, striped = false, stickyHeader = false, style, emptyMessage = "No data" }) {
  const t = useHostTheme();
  const table = h("table", { style: { borderCollapse: "collapse", width: "100%", minWidth: "max-content", fontSize: canvasTypography.body.fontSize, lineHeight: canvasTypography.body.lineHeight } },
    h("thead", null, h("tr", null, headers.map((header, index) => h("th", { key: index, style: { position: stickyHeader ? "sticky" : undefined, top: stickyHeader ? 0 : undefined, zIndex: stickyHeader ? 1 : undefined, background: stickyHeader ? t.bg.editor : undefined, textAlign: columnAlign[index] || "left", color: t.text.secondary, fontWeight: 500, padding: "7px 10px", borderBottom: "1px solid " + t.stroke.tertiary, whiteSpace: "nowrap" } }, header))),
    h("tbody", null,
      rows.length === 0 ? h("tr", null, h("td", { colSpan: Math.max(1, headers.length), style: { padding: 12, color: t.text.tertiary, borderBottom: "1px solid " + t.stroke.tertiary } }, emptyMessage)) :
      rows.map((row, rowIndex) => h("tr", { key: rowIndex, style: striped && rowIndex % 2 === 1 ? { background: t.fill.quaternary } : undefined },
        headers.map((_, colIndex) => h("td", { key: colIndex, style: { textAlign: columnAlign[colIndex] || "left", padding: "7px 10px", color: t.text.primary, borderBottom: rowIndex === rows.length - 1 ? "none" : "1px solid " + t.stroke.tertiary, fontVariantNumeric: columnAlign[colIndex] === "right" ? "tabular-nums" : undefined } },
          colIndex === 0 && rowToneDot(t, rowTone[rowIndex]), row[colIndex] == null ? null : row[colIndex]
        ))
      ))
    )
  ));
  if (!framed) return h("div", { style: mergeStyle({ overflowX: "auto" }, style) }, table);
  return h("div", { style: mergeStyle({ overflow: "auto", border: "1px solid " + t.stroke.tertiary, borderRadius: canvasRadius.lg }, style) }, table);
}

export function DataTable({ columns = [], rows = [], style }) {
  return h(Table, {
    headers: columns.map((c) => c.label),
    rows: rows.map((row) => columns.map((c) => c.render ? c.render(row) : row[c.key])),
    columnAlign: columns.map((c) => c.align || "left"),
    style,
  });
}

export function CanvasChevron({ expanded }) {
  return h("svg", { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", "aria-hidden": true, style: { display: "block", flexShrink: 0, transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" } }, h("path", { d: "M4.5 2.5 8 6 4.5 9.5", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" }));
}

const CardContext = createContext(null);

export function Card({ children, title, variant = "default", size = "base", stickyHeader = false, collapsible = false, defaultOpen = true, open: openProp, onOpenChange, style }) {
  const t = useHostTheme();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : internalOpen;
  const toggle = useCallback(() => {
    const next = !open;
    if (!controlled) setInternalOpen(next);
    if (onOpenChange) onOpenChange(next);
  }, [open, controlled, onOpenChange]);
  const context = useMemo(() => ({ open, collapsible, stickyHeader, size, toggle }), [open, collapsible, stickyHeader, size, toggle]);
  const cardStyle = variant === "borderless" ? { width: "100%" } : { width: "100%", border: "1px solid " + t.stroke.tertiary, borderRadius: canvasRadius.lg, overflow: "hidden", background: "transparent" };
  const content = title != null ? [h(CardHeader, { key: "__title" }, title), children] : children;
  return h(CardContext.Provider, { value: context }, h("section", { style: mergeStyle(cardStyle, style) }, content));
}

export function CardHeader({ children, trailing, style }) {
  const t = useHostTheme();
  const ctx = useContext(CardContext);
  const base = { display: "flex", alignItems: "center", gap: 8, minHeight: ctx && ctx.size === "lg" ? 32 : 28, padding: ctx && ctx.size === "lg" ? "0 12px" : "0 10px", color: t.text.secondary, fontSize: "12px", lineHeight: "16px", fontWeight: 500, borderBottom: ctx && ctx.open !== false ? "1px solid " + t.stroke.tertiary : undefined, position: ctx && ctx.stickyHeader ? "sticky" : undefined, top: ctx && ctx.stickyHeader ? 0 : undefined, zIndex: ctx && ctx.stickyHeader ? 2 : undefined, background: ctx && ctx.stickyHeader ? t.bg.editor : undefined };
  const inner = [ctx && ctx.collapsible ? h(CanvasChevron, { key: "chev", expanded: !!ctx.open }) : null, h("span", { key: "label", style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, children), trailing != null ? h("span", { key: "trail", style: { marginLeft: "auto", color: t.text.tertiary, display: "inline-flex", alignItems: "center", minWidth: 0 } }, trailing) : null];
  if (ctx && ctx.collapsible) return h("button", { type: "button", onClick: ctx.toggle, "aria-expanded": !!ctx.open, style: mergeStyle({ ...base, width: "100%", border: "none", borderBottom: base.borderBottom, borderRadius: 0, background: base.background || "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }, style) }, inner);
  return h("div", { style: mergeStyle(base, style) }, inner);
}

export function CardBody({ children, style }) {
  const ctx = useContext(CardContext);
  if (ctx && ctx.collapsible && !ctx.open) return null;
  return h("div", { style: mergeStyle({ padding: 12, minWidth: 0 }, style) }, children);
}

export function Button({ children, variant = "secondary", disabled = false, type = "button", style, onClick }) {
  const t = useHostTheme();
  const variants = {
    primary: { background: t.accent.control, color: t.text.onAccent, border: "1px solid " + t.accent.control },
    secondary: { background: t.fill.quaternary, color: t.text.primary, border: "1px solid " + t.stroke.secondary },
    ghost: { background: "transparent", color: t.text.secondary, border: "1px solid transparent" },
  };
  return h("button", { type, disabled, onClick: disabled ? undefined : onClick, style: mergeStyle({ boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", height: 24, width: "fit-content", padding: "0 9px", borderRadius: canvasRadius.md, fontFamily: "inherit", fontSize: "12px", lineHeight: "16px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...variants[variant] }, style) }, children);
}

export function Pill({ children, active = false, size = "md", leadingContent, keyboardHint, disabled = false, title, style, onClick }) {
  const t = useHostTheme();
  const compact = size === "sm";
  const Tag = onClick ? "button" : "span";
  return h(Tag, { type: onClick ? "button" : undefined, disabled: onClick ? disabled : undefined, title, onClick: disabled ? undefined : onClick, style: mergeStyle({ boxSizing: "border-box", display: "inline-flex", alignItems: "center", gap: compact ? 4 : 6, minHeight: compact ? 18 : 22, padding: compact ? "1px 5px" : "2px 7px", borderRadius: canvasRadius.full, border: compact ? "none" : "1px solid " + (active ? t.stroke.secondary : t.stroke.tertiary), background: active ? t.fill.secondary : t.fill.quaternary, color: disabled ? t.text.quaternary : t.text.secondary, fontFamily: "inherit", fontSize: compact ? "11px" : "12px", lineHeight: compact ? "14px" : "16px", cursor: onClick && !disabled ? "pointer" : "default", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap" }, style) }, leadingContent, children, keyboardHint ? h("span", { style: { color: t.text.tertiary, marginLeft: 2 } }, keyboardHint) : null);
}

export function Stat({ value, label, tone, hint, style }) {
  const t = useHostTheme();
  return h("div", { style: mergeStyle({ minWidth: 0 }, style) },
    h("div", { style: { color: tone ? toneColor(t, tone) : t.text.primary, fontSize: "22px", lineHeight: "28px", fontWeight: 590, fontVariantNumeric: "tabular-nums" } }, value),
    h("div", { style: { color: t.text.secondary, fontSize: "12px", lineHeight: "16px" } }, label),
    hint != null ? h("div", { style: { color: t.text.tertiary, fontSize: "11px", lineHeight: "15px", marginTop: 2 } }, hint) : null
  );
}

export function Callout({ children, tone = "neutral", title, icon, style }) {
  const t = useHostTheme();
  const color = toneColor(t, tone);
  const defaultIcon = tone === "success" ? "✓" : tone === "danger" ? "×" : tone === "warning" ? "!" : tone === "info" ? "i" : "·";
  return h("div", { role: tone === "danger" || tone === "warning" ? "alert" : "note", style: mergeStyle({ display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 10px", border: "1px solid " + t.stroke.tertiary, borderRadius: canvasRadius.lg, background: t.fill.quaternary, color: t.text.primary }, style) },
    h("span", { "aria-hidden": true, style: { width: 16, height: 16, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", color, border: "1px solid " + color, fontSize: "11px", lineHeight: 1, marginTop: 1 } }, icon == null ? defaultIcon : icon),
    h("div", { style: { minWidth: 0, fontSize: "13px", lineHeight: "18px" } }, title != null ? h("div", { style: { fontWeight: 590, marginBottom: 2 } }, title) : null, children)
  );
}

export function TextInput({ value = "", onChange, placeholder, disabled = false, type = "text", style }) {
  const t = useHostTheme();
  return h("input", { type, value, onChange: onChange ? (e) => onChange(e.target.value) : undefined, placeholder, disabled, style: mergeStyle({ boxSizing: "border-box", width: "100%", height: 28, padding: "4px 8px", border: "1px solid " + t.stroke.secondary, borderRadius: canvasRadius.md, background: t.fill.tertiary, color: t.text.primary, fontSize: "13px", lineHeight: "18px", fontFamily: "inherit", outline: "none", opacity: disabled ? 0.5 : 1 }, style) });
}

export function TextArea({ value = "", onChange, placeholder, disabled = false, rows = 3, style }) {
  const t = useHostTheme();
  const ref = useRef(null);
  const resize = useCallback(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, []);
  useLayoutEffect(resize, [value, resize]);
  return h("textarea", { ref, value, onChange: onChange ? (e) => onChange(e.target.value) : undefined, onInput: resize, placeholder, disabled, rows, style: mergeStyle({ boxSizing: "border-box", width: "100%", minHeight: 28, padding: "4px 8px", border: "1px solid " + t.stroke.secondary, borderRadius: canvasRadius.md, background: t.fill.tertiary, color: t.text.primary, fontSize: "13px", lineHeight: "18px", fontFamily: "inherit", outline: "none", resize: "none", overflow: "hidden", opacity: disabled ? 0.5 : 1 }, style) });
}

export function Checkbox({ checked = false, onChange, disabled = false, label, style }) {
  const t = useHostTheme();
  return h("label", { style: mergeStyle({ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", userSelect: "none", fontSize: "13px", lineHeight: "18px", color: t.text.primary, opacity: disabled ? 0.5 : 1 }, style) },
    h("input", { type: "checkbox", checked, disabled, onChange: (e) => onChange && onChange(e.target.checked), style: { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" } }),
    h("span", { "aria-hidden": true, style: { boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: canvasRadius.sm, border: "1px solid " + (checked ? t.accent.control : t.stroke.primary), background: checked ? t.accent.control : t.fill.tertiary, color: t.text.onAccent, flexShrink: 0 } }, checked ? "✓" : null),
    label != null ? h("span", null, label) : null
  );
}

export function Toggle({ checked = false, onChange, disabled = false, size = "sm", style }) {
  const t = useHostTheme();
  const track = size === "md" ? 20 : 16;
  const width = size === "md" ? 32 : 26;
  const offset = size === "md" ? 3 : 2;
  const knob = track - 2 * offset;
  return h("button", { type: "button", role: "switch", "aria-checked": checked, disabled, onClick: disabled ? undefined : () => onChange && onChange(!checked), style: mergeStyle({ boxSizing: "border-box", position: "relative", display: "inline-flex", alignItems: "center", width, height: track, borderRadius: canvasRadius.full, background: checked ? t.accent.control : t.fill.secondary, border: "none", padding: 0, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, flexShrink: 0 }, style) }, h("span", { "aria-hidden": true, style: { position: "absolute", width: knob, height: knob, borderRadius: canvasRadius.full, background: t.text.onAccent, left: offset, transform: checked ? "translateX(" + (width - track) + "px)" : "translateX(0)", transition: "transform 150ms ease" } }));
}

export function Select({ value, onChange, options = [], placeholder, disabled = false, style }) {
  const t = useHostTheme();
  return h("select", { value: value == null ? "" : value, onChange: onChange ? (e) => onChange(e.target.value) : undefined, disabled, style: mergeStyle({ boxSizing: "border-box", minHeight: 28, padding: "4px 24px 4px 6px", border: "1px solid " + t.stroke.tertiary, borderRadius: canvasRadius.md, background: t.bg.elevated, color: value ? t.text.primary : t.text.tertiary, fontSize: "13px", lineHeight: "18px", fontFamily: "inherit", outline: "none", opacity: disabled ? 0.5 : 1 }, style) }, placeholder != null ? h("option", { value: "", disabled: true }, placeholder) : null, options.map((option) => h("option", { key: option.value, value: option.value, disabled: option.disabled }, option.label)));
}

export function IconButton({ children, onClick, disabled = false, title, variant = "default", size = "md", style }) {
  const t = useHostTheme();
  const px = size === "sm" ? 16 : 20;
  return h("button", { type: "button", title, "aria-label": title, disabled, onClick: disabled ? undefined : onClick, style: mergeStyle({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: px, height: px, padding: 0, border: "none", borderRadius: variant === "circle" ? canvasRadius.full : canvasRadius.sm, background: variant === "circle" ? t.fill.quaternary : "transparent", color: t.text.secondary, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, flexShrink: 0, fontFamily: "inherit", fontSize: size === "sm" ? "11px" : "12px", lineHeight: 1 }, style) }, children);
}

export function CollapsibleSection({ title, leading, count, trailing, children, defaultOpen = false, style }) {
  const t = useHostTheme();
  const [open, setOpen] = useState(defaultOpen);
  return h("section", { style: mergeStyle({ width: "100%", minWidth: 0 }, style) },
    h("button", { type: "button", onClick: () => setOpen((v) => !v), "aria-expanded": open, style: { width: "100%", display: "flex", alignItems: "center", gap: 7, minHeight: 28, padding: "3px 0", border: "none", background: "transparent", color: t.text.secondary, fontFamily: "inherit", textAlign: "left", cursor: "pointer" } },
      h(CanvasChevron, { expanded: open }), leading, h("span", { style: { color: t.text.primary, fontSize: "13px", lineHeight: "18px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, title),
      count != null ? h("span", { style: { color: t.text.tertiary, fontSize: "12px" } }, count) : null,
      trailing != null ? h("span", { style: { marginLeft: "auto", color: t.text.tertiary, display: "inline-flex", alignItems: "center" } }, trailing) : null
    ),
    open ? h("div", { style: { paddingLeft: 19, paddingTop: 4, paddingBottom: 4 } }, children) : null
  );
}

export function Swatch({ color, style }) {
  const t = useHostTheme();
  return h("span", { "aria-hidden": true, style: mergeStyle({ boxSizing: "border-box", flexShrink: 0, display: "inline-block", width: 24, height: 24, borderRadius: canvasRadius.sm, background: t.category[color] || t.category.gray }, style) });
}

function todoStatus(status) { return status === "in_progress" || status === "completed" || status === "cancelled" ? status : "pending"; }
function todoGlyph(t, status) {
  const s = todoStatus(status);
  const color = s === "in_progress" ? t.text.secondary : s === "completed" || s === "cancelled" ? t.text.tertiary : t.text.quaternary;
  const label = s === "completed" ? "✓" : s === "cancelled" ? "×" : s === "in_progress" ? "→" : "";
  return h("span", { "aria-hidden": true, style: { width: 14, height: 14, borderRadius: "50%", border: "1px solid " + color, color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "10px", lineHeight: 1 } }, label);
}

export function TodoList({ todos = [], dimmedTodoIds, onTodoClick, style }) {
  const t = useHostTheme();
  if (!todos.length) return null;
  return h("ul", { style: mergeStyle({ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, width: "100%" }, style) }, todos.map((todo) => {
    const status = todoStatus(todo.status);
    const done = status === "completed" || status === "cancelled";
    const dimmed = dimmedTodoIds && dimmedTodoIds.has(todo.id);
    return h("li", { key: todo.id, id: "todo-" + todo.id, style: { margin: 0, padding: 0 } }, h("button", { type: "button", onClick: () => onTodoClick && onTodoClick(todo), style: { width: "100%", display: "flex", alignItems: "flex-start", gap: 8, padding: 0, border: "none", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: onTodoClick ? "pointer" : "default", color: done ? t.text.quaternary : dimmed ? t.text.secondary : t.text.primary } }, todoGlyph(t, status), h("span", { style: { flex: 1, minWidth: 0, fontSize: "13px", lineHeight: "18px", textDecoration: done ? "line-through" : undefined } }, todo.content)));
  }));
}

export function TodoListCard({ todos = [], dimmedTodoIds, defaultExpanded = true, onTodoClick, style }) {
  const t = useHostTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!todos.length) return null;
  const done = todos.filter((todo) => { const s = todoStatus(todo.status); return s === "completed" || s === "cancelled"; }).length;
  return h("div", { style: mergeStyle({ width: "100%", background: t.fill.quaternary, border: "1px solid " + t.stroke.tertiary, borderRadius: canvasRadius.lg, overflow: "hidden" }, style) },
    h("button", { type: "button", onClick: () => setExpanded((v) => !v), "aria-expanded": expanded, style: { width: "100%", minHeight: 28, padding: "0 12px", display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: t.text.secondary, fontFamily: "inherit", cursor: "pointer", textAlign: "left" } }, h(CanvasChevron, { expanded }), h("span", { style: { fontSize: "13px" } }, done > 0 ? done + " of " + todos.length + " Done" : "To-dos " + todos.length)),
    expanded ? h("div", { style: { padding: "8px 16px" } }, h(TodoList, { todos, dimmedTodoIds, onTodoClick })) : null
  );
}

function safePositive(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
export function UsageBar({ segments = [], total, topLeftLabel, topRightLabel, style }) {
  const t = useHostTheme();
  const max = safePositive(total);
  const used = segments.reduce((sum, segment) => sum + safePositive(segment.value), 0);
  const remaining = Math.max(0, max - used);
  return h("div", { style: mergeStyle({ display: "flex", flexDirection: "column", gap: 8, width: "100%", minWidth: 0 }, style) },
    topLeftLabel != null || topRightLabel != null ? h("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, color: t.text.secondary, fontSize: "12px", lineHeight: "16px", fontVariantNumeric: "tabular-nums" } }, h("span", null, topLeftLabel), h("span", { style: { textAlign: "right" } }, topRightLabel)) : null,
    h("div", { role: "img", "aria-label": "Usage bar: " + used + " of " + max + " used", style: { width: "100%", overflow: "hidden", borderRadius: 1 } }, h("div", { style: { display: "flex", gap: 1, minWidth: 0 } }, segments.map((segment, index) => h("span", { key: segment.id, "aria-hidden": true, style: { height: 5, flexBasis: 0, flexGrow: safePositive(segment.value), minWidth: segment.value > 0 ? 4 : 0, background: t.category[segment.color || usageColorSequence[index % usageColorSequence.length]] } })), h("span", { "aria-hidden": true, style: { height: 5, flexBasis: 0, flexGrow: remaining, minWidth: remaining > 0 ? 4 : 0, background: t.fill.tertiary } })))
  );
}

export function DiffStats({ additions = 0, deletions = 0, style }) {
  const t = useHostTheme();
  if (additions <= 0 && deletions <= 0) return null;
  return h("span", { style: mergeStyle({ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, fontVariantNumeric: "tabular-nums", fontSize: "12px", lineHeight: "16px" }, style) }, additions > 0 ? h("span", { style: { color: cssVar("--color-text-success", t.category.green) } }, "+" + additions) : null, deletions > 0 ? h("span", { style: { color: cssVar("--color-text-danger", t.category.red) } }, "-" + deletions) : null);
}

export function DiffView({ lines = [], path, language, showLineNumbers = true, coloredLineNumbers = true, showAccentStrip = true, style }) {
  const t = useHostTheme();
  return h("div", { "data-language": language || path || undefined, style: mergeStyle({ boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: "20px", background: t.bg.editor, overflow: "auto", tabSize: 4 }, style) }, h("div", { style: { minWidth: "100%", width: "max-content", paddingBlock: 2 } }, lines.map((line, index) => {
    const bg = line.type === "added" ? t.diff.insertedLine : line.type === "removed" ? t.diff.removedLine : "transparent";
    const strip = line.type === "added" ? t.diff.stripAdded : line.type === "removed" ? t.diff.stripRemoved : "transparent";
    const numberColor = coloredLineNumbers ? (line.type === "added" ? cssVar("--color-text-success", t.category.green) : line.type === "removed" ? cssVar("--color-text-danger", t.category.red) : t.text.tertiary) : t.text.tertiary;
    return h("div", { key: index, style: { display: "flex", minWidth: "100%", minHeight: 20, background: bg } }, showAccentStrip ? h("span", { style: { width: 3, flexShrink: 0, background: strip } }) : null, showLineNumbers ? h("span", { style: { boxSizing: "content-box", minWidth: "4ch", textAlign: "right", paddingLeft: 4, paddingRight: 8, color: numberColor, fontVariantNumeric: "tabular-nums", fontSize: "11px", userSelect: "none" } }, line.lineNumber == null ? "" : line.lineNumber) : null, h("span", { style: { flex: 1, paddingLeft: showLineNumbers ? 0 : 8, paddingRight: 8, whiteSpace: "pre", color: t.text.primary } }, line.content));
  })));
}

export function computeDAGLayout(options) {
  const nodes = Array.isArray(options && options.nodes) ? options.nodes : [];
  const rawEdges = Array.isArray(options && options.edges) ? options.edges : [];
  const direction = options && options.direction === "horizontal" ? "horizontal" : "vertical";
  const nodeWidth = Number.isFinite(options && options.nodeWidth) ? options.nodeWidth : 160;
  const nodeHeight = Number.isFinite(options && options.nodeHeight) ? options.nodeHeight : 40;
  const rankGap = Number.isFinite(options && options.rankGap) ? options.rankGap : 64;
  const nodeGap = Number.isFinite(options && options.nodeGap) ? options.nodeGap : 48;
  const padding = Number.isFinite(options && options.padding) ? options.padding : 24;
  const ids = new Set(nodes.map((node) => node.id));
  const edges = rawEdges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge, index) => adjacency.get(edge.from).push({ edge, index }));
  const state = new Map();
  const back = new Set();
  function dfs(id) {
    state.set(id, 1);
    for (const item of adjacency.get(id) || []) {
      const next = item.edge.to;
      const s = state.get(next) || 0;
      if (s === 1) back.add(item.index);
      else if (s === 0) dfs(next);
    }
    state.set(id, 2);
  }
  nodes.forEach((node) => { if (!state.get(node.id)) dfs(node.id); });
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge, index) => { if (!back.has(index)) indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1); });
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let cursor = 0;
  while (cursor < queue.length) {
    const id = queue[cursor++];
    for (const item of adjacency.get(id) || []) {
      if (back.has(item.index)) continue;
      rank.set(item.edge.to, Math.max(rank.get(item.edge.to) || 0, (rank.get(id) || 0) + 1));
      indegree.set(item.edge.to, (indegree.get(item.edge.to) || 0) - 1);
      if (indegree.get(item.edge.to) === 0) queue.push(item.edge.to);
    }
  }
  const groups = new Map();
  nodes.forEach((node) => { const r = rank.get(node.id) || 0; if (!groups.has(r)) groups.set(r, []); groups.get(r).push(node.id); });
  const rankIndexes = Array.from(groups.keys()).sort((a, b) => a - b);
  const rankSpans = rankIndexes.map((r) => { const count = groups.get(r).length; return count * (direction === "vertical" ? nodeWidth : nodeHeight) + Math.max(0, count - 1) * nodeGap; });
  const maxSpan = Math.max(0, ...rankSpans);
  const mainNode = direction === "vertical" ? nodeHeight : nodeWidth;
  const crossNode = direction === "vertical" ? nodeWidth : nodeHeight;
  const mainSpan = rankIndexes.length ? rankIndexes.length * mainNode + (rankIndexes.length - 1) * rankGap : 0;
  const width = direction === "vertical" ? maxSpan + padding * 2 : mainSpan + padding * 2;
  const height = direction === "vertical" ? mainSpan + padding * 2 : maxSpan + padding * 2;
  const positioned = [];
  const byId = new Map();
  const ranks = [];
  rankIndexes.forEach((r, rankOrder) => {
    const idsInRank = groups.get(r);
    const span = rankSpans[rankOrder];
    const crossStart = padding + (maxSpan - span) / 2;
    idsInRank.forEach((id, order) => {
      const cross = crossStart + order * (crossNode + nodeGap);
      const main = padding + rankOrder * (mainNode + rankGap);
      const node = direction === "vertical" ? { id, x: cross, y: main, rank: r, order } : { id, x: main, y: cross, rank: r, order };
      positioned.push(node); byId.set(id, node);
    });
    if (direction === "vertical") ranks.push({ rank: r, x: crossStart, y: padding + rankOrder * (nodeHeight + rankGap), width: span, height: nodeHeight, nodeIds: [...idsInRank] });
    else ranks.push({ rank: r, x: padding + rankOrder * (nodeWidth + rankGap), y: crossStart, width: nodeWidth, height: span, nodeIds: [...idsInRank] });
  });
  const laidEdges = edges.map((edge, index) => {
    const a = byId.get(edge.from); const b = byId.get(edge.to);
    if (direction === "vertical") return { from: edge.from, to: edge.to, sourceX: a.x + nodeWidth / 2, sourceY: a.y + nodeHeight, targetX: b.x + nodeWidth / 2, targetY: b.y, isBackEdge: back.has(index) };
    return { from: edge.from, to: edge.to, sourceX: a.x + nodeWidth, sourceY: a.y + nodeHeight / 2, targetX: b.x, targetY: b.y + nodeHeight / 2, isBackEdge: back.has(index) };
  });
  return { nodes: positioned, edges: laidEdges, ranks, direction, width, height };
}

const chartColorSequence = ["blue", "green", "purple", "orange", "cyan", "pink", "yellow", "red", "gray"];
function seriesColor(t, series, index) { return series && series.tone ? toneColor(t, series.tone) : t.category[chartColorSequence[index % chartColorSequence.length]]; }
function pointColor(t, point, index) { return point && point.tone ? toneColor(t, point.tone) : t.category[chartColorSequence[index % chartColorSequence.length]]; }
function finite(value) { return Number.isFinite(value) ? value : 0; }
function formatValue(value, prefix, suffix) { return (prefix || "") + (Math.round(value * 100) / 100) + (suffix || ""); }
function chartDomain(series, beginAtZero, yMin, yMax, referenceLines) {
  const values = [];
  series.forEach((s) => (s.data || []).forEach((value) => { if (Number.isFinite(value)) values.push(value); }));
  (referenceLines || []).forEach((line) => { if (Number.isFinite(line.value)) values.push(line.value); });
  let min = yMin != null ? yMin : (beginAtZero === false && values.length ? Math.min(...values) : 0);
  let max = yMax != null ? yMax : (values.length ? Math.max(...values) : 1);
  if (min === max) { const pad = Math.abs(min || 1) * 0.1; min -= pad; max += pad; }
  if (max < min) { const tmp = max; max = min; min = tmp; }
  return [min, max];
}
function ChartLegend({ series, colors }) {
  const t = useHostTheme();
  if (!series || series.length < 2) return null;
  return h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 8, color: t.text.secondary, fontSize: "11px", lineHeight: "14px" } }, series.map((item, index) => h("span", { key: item.name + index, style: { display: "inline-flex", alignItems: "center", gap: 5 } }, h("span", { "aria-hidden": true, style: { width: 8, height: 8, borderRadius: 2, background: colors[index] } }), item.name)));
}
function RefLines({ lines, scale, horizontal, plot, theme }) {
  if (!lines || !lines.length) return null;
  return lines.map((line, index) => {
    const pos = scale(line.value); const color = toneColor(theme, line.tone || "neutral");
    if (horizontal) return h("g", { key: index }, h("line", { x1: pos, x2: pos, y1: plot.top, y2: plot.bottom, stroke: color, strokeWidth: 1, strokeDasharray: "4 3" }), line.label ? h("text", { x: pos + 4, y: plot.top + 10, fill: color, fontSize: 10 }, line.label) : null);
    return h("g", { key: index }, h("line", { x1: plot.left, x2: plot.right, y1: pos, y2: pos, stroke: color, strokeWidth: 1, strokeDasharray: "4 3" }), line.label ? h("text", { x: plot.right - 2, y: pos - 4, fill: color, fontSize: 10, textAnchor: "end" }, line.label) : null);
  });
}

export function BarChart({ categories = [], series = [], height = 260, stacked = false, horizontal = false, normalized = false, valueSuffix = "", valuePrefix = "", showValues, beginAtZero = true, yMin, yMax, referenceLines = [], style }) {
  const t = useHostTheme();
  const W = 640; const H = Math.max(140, height); const plot = { left: horizontal ? 100 : 46, right: W - 16, top: 16, bottom: H - 42 };
  const plotW = plot.right - plot.left; const plotH = plot.bottom - plot.top;
  const stackMode = stacked || normalized;
  const transformed = series.map((s) => ({ ...s, data: (s.data || []).map((value, i) => { if (!normalized) return finite(value); const total = series.reduce((sum, item) => sum + Math.max(0, finite(item.data && item.data[i])), 0); return total > 0 ? Math.max(0, finite(value)) / total * 100 : 0; }) }));
  let domain;
  if (stackMode) {
    const maxima = categories.map((_, i) => transformed.reduce((sum, s) => sum + Math.max(0, finite(s.data[i])), 0));
    domain = [0, normalized ? 100 : Math.max(1, ...maxima, ...(referenceLines || []).map((r) => finite(r.value)))];
  } else domain = chartDomain(transformed, beginAtZero, yMin, yMax, referenceLines);
  const [min, max] = domain;
  const scale = horizontal ? (value) => plot.left + (value - min) / (max - min) * plotW : (value) => plot.bottom - (value - min) / (max - min) * plotH;
  const colors = transformed.map((s, i) => seriesColor(t, s, i));
  const shouldShow = showValues === undefined ? transformed.length === 1 && categories.length <= 8 : showValues;
  const bars = [];
  categories.forEach((category, ci) => {
    if (horizontal) {
      const band = plotH / Math.max(1, categories.length); const center = plot.top + band * (ci + 0.5); const groupH = Math.min(28, band * 0.66); let acc = 0;
      transformed.forEach((s, si) => {
        const value = finite(s.data[ci]); const startValue = stackMode ? acc : Math.max(min, 0); const endValue = stackMode ? acc + Math.max(0, value) : value; const x1 = scale(startValue); const x2 = scale(endValue); const itemH = stackMode ? groupH : groupH / Math.max(1, transformed.length); const y = stackMode ? center - groupH / 2 : center - groupH / 2 + si * itemH;
        bars.push(h("g", { key: ci + ":" + si }, h("rect", { x: Math.min(x1, x2), y, width: Math.max(1, Math.abs(x2 - x1)), height: Math.max(2, itemH - (stackMode ? 0 : 2)), rx: 2, fill: transformed.length === 1 ? t.category[chartColorSequence[ci % chartColorSequence.length]] : colors[si] }, h("title", null, s.name + ": " + formatValue(value, normalized ? "" : valuePrefix, normalized ? "%" : valueSuffix))), shouldShow && !stackMode ? h("text", { x: x2 + 4, y: y + itemH / 2 + 3, fill: t.text.secondary, fontSize: 10 }, formatValue(value, valuePrefix, valueSuffix)) : null));
        if (stackMode) acc += Math.max(0, value);
      });
      bars.push(h("text", { key: "label:" + ci, x: plot.left - 8, y: center + 4, fill: t.text.secondary, fontSize: 10, textAnchor: "end" }, category));
    } else {
      const band = plotW / Math.max(1, categories.length); const center = plot.left + band * (ci + 0.5); const groupW = Math.min(44, band * 0.66); let acc = 0;
      transformed.forEach((s, si) => {
        const value = finite(s.data[ci]); const startValue = stackMode ? acc : Math.max(min, 0); const endValue = stackMode ? acc + Math.max(0, value) : value; const y1 = scale(startValue); const y2 = scale(endValue); const itemW = stackMode ? groupW : groupW / Math.max(1, transformed.length); const x = stackMode ? center - groupW / 2 : center - groupW / 2 + si * itemW;
        bars.push(h("g", { key: ci + ":" + si }, h("rect", { x, y: Math.min(y1, y2), width: Math.max(2, itemW - (stackMode ? 0 : 2)), height: Math.max(1, Math.abs(y2 - y1)), rx: 2, fill: transformed.length === 1 ? t.category[chartColorSequence[ci % chartColorSequence.length]] : colors[si] }, h("title", null, s.name + ": " + formatValue(value, normalized ? "" : valuePrefix, normalized ? "%" : valueSuffix))), shouldShow && !stackMode ? h("text", { x: x + itemW / 2, y: Math.min(y1, y2) - 4, fill: t.text.secondary, fontSize: 10, textAnchor: "middle" }, formatValue(value, valuePrefix, valueSuffix)) : null));
        if (stackMode) acc += Math.max(0, value);
      });
      bars.push(h("text", { key: "label:" + ci, x: center, y: plot.bottom + 16, fill: t.text.secondary, fontSize: 10, textAnchor: "middle" }, category));
    }
  });
  const axis = horizontal ? h("line", { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, stroke: t.stroke.tertiary }) : h("line", { x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom, stroke: t.stroke.tertiary });
  return h("div", { style: mergeStyle({ width: "100%", minWidth: 0 }, style) }, h("svg", { role: "img", "aria-label": "Bar chart", viewBox: "0 0 " + W + " " + H, style: { display: "block", width: "100%", height: H } }, axis, h(RefLines, { lines: referenceLines, scale, horizontal, plot, theme: t }), bars), h(ChartLegend, { series: transformed, colors }));
}

export function LineChart({ categories = [], series = [], height = 260, fill = false, valueSuffix = "", valuePrefix = "", showValues = false, showHoverGuide = true, beginAtZero = true, yMin, yMax, referenceLines = [], style }) {
  const t = useHostTheme();
  const W = 640; const H = Math.max(140, height); const plot = { left: 46, right: W - 16, top: 16, bottom: H - 42 }; const plotW = plot.right - plot.left; const plotH = plot.bottom - plot.top;
  const [min, max] = chartDomain(series, beginAtZero, yMin, yMax, referenceLines); const x = (i) => categories.length <= 1 ? plot.left + plotW / 2 : plot.left + i / (categories.length - 1) * plotW; const y = (value) => plot.bottom - (finite(value) - min) / (max - min) * plotH;
  const colors = series.map((s, i) => seriesColor(t, s, i));
  const lines = series.map((s, si) => {
    const points = categories.map((_, i) => [x(i), y(s.data && s.data[i])]); const pointString = points.map((p) => p[0] + "," + p[1]).join(" "); const baseline = y(Math.max(min, 0));
    return h("g", { key: s.name + si }, fill ? h("polygon", { points: pointString + " " + x(categories.length - 1) + "," + baseline + " " + x(0) + "," + baseline, fill: colors[si], opacity: 0.12 }) : null, h("polyline", { points: pointString, fill: "none", stroke: colors[si], strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }), points.map((p, i) => h("g", { key: i }, h("circle", { cx: p[0], cy: p[1], r: 3, fill: t.bg.editor, stroke: colors[si], strokeWidth: 2 }, h("title", null, categories[i] + " — " + s.name + ": " + formatValue(finite(s.data && s.data[i]), valuePrefix, valueSuffix))), showValues && categories.length <= 20 ? h("text", { x: p[0], y: p[1] - 7, fill: t.text.secondary, fontSize: 9, textAnchor: "middle" }, formatValue(finite(s.data && s.data[i]), valuePrefix, valueSuffix)) : null)));
  });
  const labels = categories.map((label, i) => h("text", { key: i, x: x(i), y: plot.bottom + 16, fill: t.text.secondary, fontSize: 10, textAnchor: "middle" }, label));
  return h("div", { "data-hover-guide": showHoverGuide ? "enabled" : "disabled", style: mergeStyle({ width: "100%", minWidth: 0 }, style) }, h("svg", { role: "img", "aria-label": "Line chart", viewBox: "0 0 " + W + " " + H, style: { display: "block", width: "100%", height: H } }, h("line", { x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, stroke: t.stroke.tertiary }), h(RefLines, { lines: referenceLines, scale: y, horizontal: false, plot, theme: t }), lines, labels), h(ChartLegend, { series, colors }));
}

function polar(cx, cy, r, angle) { const rad = (angle - 90) * Math.PI / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; }
function arcPath(cx, cy, outer, inner, start, end) {
  const a = polar(cx, cy, outer, end); const b = polar(cx, cy, outer, start); const large = end - start <= 180 ? 0 : 1;
  if (!inner) return "M " + cx + " " + cy + " L " + b[0] + " " + b[1] + " A " + outer + " " + outer + " 0 " + large + " 1 " + a[0] + " " + a[1] + " Z";
  const c = polar(cx, cy, inner, start); const d = polar(cx, cy, inner, end); return "M " + b[0] + " " + b[1] + " A " + outer + " " + outer + " 0 " + large + " 1 " + a[0] + " " + a[1] + " L " + d[0] + " " + d[1] + " A " + inner + " " + inner + " 0 " + large + " 0 " + c[0] + " " + c[1] + " Z";
}
export function PieChart({ data = [], size = 200, donut = false, style }) {
  const t = useHostTheme(); const total = data.reduce((sum, point) => sum + Math.max(0, finite(point.value)), 0); const radius = size / 2 - 4; const inner = donut ? radius * 0.55 : 0; let angle = 0;
  const slices = data.map((point, index) => { const value = Math.max(0, finite(point.value)); const sweep = total > 0 ? value / total * 360 : 0; const start = angle; const end = angle + sweep; angle = end; const color = pointColor(t, point, index); return h("path", { key: point.label + index, d: arcPath(size / 2, size / 2, radius, inner, start, end), fill: color, stroke: t.bg.editor, strokeWidth: 1 }, h("title", null, point.label + ": " + value + " (" + (total > 0 ? Math.round(value / total * 1000) / 10 : 0) + "%)")); });
  const legend = h("div", { style: { display: "flex", flexDirection: "column", gap: 5, minWidth: 120 } }, data.map((point, index) => h("div", { key: point.label + index, style: { display: "flex", alignItems: "center", gap: 6, color: t.text.secondary, fontSize: "11px", lineHeight: "14px" } }, h("span", { style: { width: 8, height: 8, borderRadius: 2, background: pointColor(t, point, index), flexShrink: 0 } }), h("span", { style: { minWidth: 0 } }, point.label), h("span", { style: { marginLeft: "auto", color: t.text.tertiary, fontVariantNumeric: "tabular-nums" } }, total > 0 ? Math.round(Math.max(0, finite(point.value)) / total * 1000) / 10 + "%" : "0%"))));
  return h("div", { style: mergeStyle({ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }, style) }, h("svg", { role: "img", "aria-label": donut ? "Donut chart" : "Pie chart", viewBox: "0 0 " + size + " " + size, width: size, height: size, style: { flexShrink: 0 } }, slices, donut ? h("text", { x: size / 2, y: size / 2 + 5, fill: t.text.primary, fontSize: 16, fontWeight: 590, textAnchor: "middle" }, Math.round(total * 100) / 100) : null), legend);
}
`;
