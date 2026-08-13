/**
 * Application shell: state, URL sync, keyboard, theme, and wiring between the
 * three panes.
 */

import { api } from "./api.js";
import { debounce, fill, h, icon } from "./dom.js";
import { applyStatic, locale, t, toggleLocale } from "./i18n.js";
import { Reader } from "./reader.js";
import { Results } from "./results.js";

const THEME_KEY = "session-explorer-theme";
const THEMES = ["system", "light", "dark"];
const RANGES = ["24h", "7d", "30d", "90d", "all"];
const SORTS = ["recent", "oldest", "messages", "cost", "tokens"];

const el = (id) => document.getElementById(id);

const dom = {
  app: el("app"),
  menuToggle: el("menu-toggle"),
  searchForm: el("search-form"),
  searchInput: el("search-input"),
  searchClear: el("search-clear"),
  themeToggle: el("theme-toggle"),
  localeToggle: el("locale-toggle"),
  sidebar: el("sidebar"),
  sidebarScrim: el("sidebar-scrim"),
  rangeChips: el("range-chips"),
  sortChips: el("sort-chips"),
  projectFilter: el("project-filter"),
  projectList: el("project-list"),
  projectClear: el("project-clear"),
  statusBar: el("status-bar"),
  resultsTitle: el("results-title"),
  resultsMeta: el("results-meta"),
  resultsBody: el("results-body"),
  readerEmpty: el("reader-empty"),
  readerInner: el("reader-inner"),
  readerHead: el("reader-head"),
  outline: el("outline"),
  transcript: el("transcript"),
  toast: el("toast"),
};

const state = {
  query: "",
  scope: "all",
  cwd: null,
  range: "all",
  sort: "recent",
  path: null,
  entry: null,
};

let projects = [];
let toastTimer = null;

/* ------------------------------------------------------------------ toast */

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.hidden = true;
  }, 2200);
}

/* ------------------------------------------------------------------ theme */

function currentTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return THEMES.includes(saved) ? saved : "system";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);

  const iconName = theme === "light" ? "sun" : theme === "dark" ? "moon" : "auto";
  const label = t(`theme.${theme}`);
  fill(dom.themeToggle, icon(iconName));
  dom.themeToggle.title = label;
  dom.themeToggle.setAttribute("aria-label", label);
}

/* -------------------------------------------------------------------- url */

/** Mirror state into the hash so a reload or a shared link restores the view. */
function syncUrl() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.scope !== "all") params.set("scope", state.scope);
  if (state.cwd) params.set("cwd", state.cwd);
  if (state.range !== "all") params.set("range", state.range);
  if (state.sort !== "recent") params.set("sort", state.sort);
  if (state.path) params.set("path", state.path);
  if (state.entry) params.set("entry", state.entry);

  const hash = params.toString();
  history.replaceState(null, "", hash ? `#${hash}` : location.pathname);
}

function readUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  state.query = params.get("q") ?? "";
  state.scope = params.get("scope") ?? "all";
  state.cwd = params.get("cwd");
  state.range = RANGES.includes(params.get("range")) ? params.get("range") : "all";
  state.sort = SORTS.includes(params.get("sort")) ? params.get("sort") : "recent";
  state.path = params.get("path");
  state.entry = params.get("entry");
}

/* ----------------------------------------------------------------- panes */

const results = new Results(
  { title: dom.resultsTitle, meta: dom.resultsMeta, body: dom.resultsBody },
  {
    onOpen: (path, entry) => {
      state.path = path;
      state.entry = entry ?? null;
      syncUrl();
      results.markCurrent(path, entry);
      dom.app.dataset.reader = "open";
      void reader.open(path, entry);
    },
  },
);

const reader = new Reader(
  {
    empty: dom.readerEmpty,
    inner: dom.readerInner,
    head: dom.readerHead,
    outline: dom.outline,
    transcript: dom.transcript,
  },
  {
    onToast: showToast,
    onClose: () => {
      delete dom.app.dataset.reader;
    },
  },
);

function refreshResults() {
  syncUrl();
  void results
    .load({
      query: state.query,
      scope: state.scope,
      cwd: state.cwd,
      range: state.range,
      sort: state.sort,
    })
    .then(() => {
      if (state.path) results.markCurrent(state.path, state.entry ?? undefined);
    });
}

/* --------------------------------------------------------------- sidebar */

function renderChips(container, keys, active, prefix, onPick) {
  fill(container);
  for (const key of keys) {
    container.append(
      h(
        "button.chip",
        {
          type: "button",
          "aria-pressed": String(key === active),
          onclick: () => onPick(key),
        },
        t(`${prefix}.${key}`),
      ),
    );
  }
}

function renderProjects() {
  const filter = dom.projectFilter.value.trim().toLowerCase();
  const visible = filter
    ? projects.filter(
        (p) => p.project.toLowerCase().includes(filter) || p.cwd.toLowerCase().includes(filter),
      )
    : projects;

  fill(dom.projectList);
  dom.projectClear.hidden = !state.cwd;

  for (const project of visible.slice(0, 300)) {
    dom.projectList.append(
      h(
        "button.project",
        {
          type: "button",
          title: project.cwd,
          "aria-pressed": String(state.cwd === project.cwd),
          onclick: () => {
            state.cwd = state.cwd === project.cwd ? null : project.cwd;
            renderProjects();
            refreshResults();
          },
        },
        icon("folder", "project__icon"),
        h("span.project__name", null, project.project),
        h("span.project__count", null, String(project.sessionCount)),
      ),
    );
  }
}

/* ------------------------------------------------------------- keyboard */

function isTyping(target) {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function onKeydown(event) {
  const typing = isTyping(event.target);

  if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    dom.searchInput.focus();
    dom.searchInput.select();
    return;
  }

  if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    dom.searchInput.focus();
    dom.searchInput.select();
    return;
  }

  if (event.key === "Escape") {
    if (typing && dom.searchInput.value) {
      dom.searchInput.value = "";
      onSearchInput();
      return;
    }
    if (typing) {
      dom.searchInput.blur();
      return;
    }
    if (dom.app.dataset.reader === "open") {
      delete dom.app.dataset.reader;
      return;
    }
    if (dom.app.dataset.sidebar === "open") delete dom.app.dataset.sidebar;
    return;
  }

  if (typing) return;

  if (event.key === "j" || event.key === "ArrowDown") {
    event.preventDefault();
    results.move(1);
  } else if (event.key === "k" || event.key === "ArrowUp") {
    event.preventDefault();
    results.move(-1);
  }
}

/* --------------------------------------------------------------- search */

/**
 * Chinese input goes through a composition buffer; searching on every
 * keystroke would fire on half-formed pinyin. Requests wait for composition
 * to end.
 */
let composing = false;

const runSearch = debounce(() => {
  if (composing) return;
  refreshResults();
}, 260);

function onSearchInput() {
  state.query = dom.searchInput.value.trim();
  dom.searchClear.hidden = dom.searchInput.value === "";
  runSearch();
}

/* ----------------------------------------------------------------- boot */

function applyLocaleToChrome() {
  applyStatic();
  dom.searchInput.placeholder = t("search.placeholder");
  dom.searchInput.setAttribute("aria-label", t("search.placeholder"));
  dom.projectFilter.placeholder = t("filters.projectPlaceholder");
  dom.searchClear.title = t("search.clear");
  dom.searchClear.setAttribute("aria-label", t("search.clear"));
  dom.localeToggle.textContent = locale() === "zh" ? "EN" : "中";
  dom.localeToggle.title = t("locale.toggle");
  dom.menuToggle.title = t("menu.toggle");
  dom.menuToggle.setAttribute("aria-label", t("menu.toggle"));

  applyTheme(currentTheme());
}

/** Chips re-render themselves on pick, so the callback has to be self-referential. */
function mountChips() {
  const rerender = () => {
    renderChips(dom.rangeChips, RANGES, state.range, "range", (key) => {
      state.range = key;
      rerender();
      refreshResults();
    });
    renderChips(dom.sortChips, SORTS, state.sort, "sort", (key) => {
      state.sort = key;
      rerender();
      refreshResults();
    });
  };
  rerender();
}

async function loadStatus() {
  try {
    const status = await api.status();
    if (!status.indexAvailable) {
      fill(
        dom.statusBar,
        h("span", { style: { color: "var(--danger)" } }, t("status.indexMissing")),
      );
      return;
    }
    fill(
      dom.statusBar,
      h("span", null, t("status.indexed", status.sessionCount, status.messageCount)),
    );
  } catch {
    fill(dom.statusBar, h("span", { style: { color: "var(--danger)" } }, t("status.offline")));
  }
}

async function loadProjects() {
  try {
    const data = await api.projects();
    projects = data.projects;
    renderProjects();
  } catch {
    projects = [];
  }
}

function mountEvents() {
  dom.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = dom.searchInput.value.trim();
    refreshResults();
  });

  dom.searchInput.addEventListener("input", onSearchInput);
  dom.searchInput.addEventListener("compositionstart", () => {
    composing = true;
  });
  dom.searchInput.addEventListener("compositionend", () => {
    composing = false;
    onSearchInput();
  });

  dom.searchClear.addEventListener("click", () => {
    dom.searchInput.value = "";
    onSearchInput();
    dom.searchInput.focus();
  });

  dom.projectFilter.addEventListener("input", renderProjects);
  dom.projectClear.addEventListener("click", () => {
    state.cwd = null;
    renderProjects();
    refreshResults();
  });

  dom.themeToggle.addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    applyTheme(next);
    showToast(t(`theme.${next}`));
  });

  dom.localeToggle.addEventListener("click", () => {
    toggleLocale();
    applyLocaleToChrome();
    mountChips();
    renderProjects();
    void loadStatus();
    refreshResults();
    if (state.path) void reader.open(state.path, state.entry ?? undefined);
  });

  dom.menuToggle.addEventListener("click", () => {
    if (dom.app.dataset.sidebar === "open") delete dom.app.dataset.sidebar;
    else dom.app.dataset.sidebar = "open";
  });

  dom.sidebarScrim.addEventListener("click", () => {
    delete dom.app.dataset.sidebar;
  });

  document.addEventListener("keydown", onKeydown);
}

function boot() {
  readUrl();

  fill(dom.menuToggle, icon("menu"));
  fill(dom.searchClear, icon("close"));

  applyLocaleToChrome();
  mountChips();
  mountEvents();

  dom.searchInput.value = state.query;
  dom.searchClear.hidden = state.query === "";

  void loadStatus();
  void loadProjects();
  refreshResults();

  if (state.path) {
    dom.app.dataset.reader = "open";
    void reader.open(state.path, state.entry ?? undefined);
  }
}

boot();
