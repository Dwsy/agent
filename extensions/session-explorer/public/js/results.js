/**
 * The results pane: either the filtered session list or, once a query is
 * typed, matching sessions above matching messages.
 *
 * Rows are plain buttons in document order so keyboard navigation and screen
 * readers get the same sequence the eye does.
 */

import { api } from "./api.js";
import { fill, h, highlighted, icon } from "./dom.js";
import * as fmt from "./format.js";
import { locale, t } from "./i18n.js";

const PAGE = 50;
const SEARCH_PAGE = 40;

function skeleton(rows = 7) {
  const wrap = h("div");
  for (let i = 0; i < rows; i += 1) {
    wrap.append(
      h(
        "div.skeleton",
        null,
        h("div.skeleton__line", { style: { width: `${55 + ((i * 13) % 35)}%` } }),
        h("div.skeleton__line", { style: { width: `${70 + ((i * 7) % 25)}%`, height: "8px" } }),
        h("div.skeleton__line", { style: { width: "35%", height: "7px", marginBottom: "0" } }),
      ),
    );
  }
  return wrap;
}

function emptyState(message, hint) {
  return h(
    "div.state",
    null,
    icon("search", "state__mark"),
    h("p", { style: { margin: "0" } }, message),
    hint ? h("p", { class: "state__detail", style: { margin: "0" } }, hint) : null,
  );
}

function errorState(message, onRetry) {
  return h(
    "div.state.state--error",
    null,
    icon("warn", "state__mark"),
    h("p", { style: { margin: "0" } }, t("error.title")),
    h("p.state__detail", null, message),
    h("button.load-more", { type: "button", onclick: onRetry }, t("error.retry")),
  );
}

/** Pi's index also covers Codex rollouts; the path is what distinguishes them. */
function isCodex(path) {
  return typeof path === "string" && path.includes("/.codex/");
}

function sessionTitle(session) {
  if (session.name) return { text: session.name, untitled: false };
  if (session.firstMessage) return { text: session.firstMessage, untitled: false };
  return { text: t("results.untitled"), untitled: true };
}

/** A row in the session list. */
function sessionCard(session, onOpen) {
  const title = sessionTitle(session);
  const loc = locale();

  const foot = h(
    "div.card__foot",
    null,
    isCodex(session.path) ? h("span.badge.badge--source", null, "Codex") : null,
    h("span.badge", { title: session.cwd }, icon("folder"), session.project),
    h("span", null, t("results.hitCount", session.messageCount)),
  );

  if (session.model) {
    foot.append(h("span.dot"), h("span", null, fmt.shortModel(session.model)));
  }
  if (session.usage && session.usage.cost > 0) {
    foot.append(h("span.dot"), h("span", null, fmt.currency(session.usage.cost)));
  }

  return h(
    "button.card",
    {
      type: "button",
      dataset: { path: session.path },
      onclick: () => onOpen(session.path),
    },
    h(
      "div.card__top",
      null,
      h(
        "span",
        { class: `card__title${title.untitled ? " card__title--untitled" : ""}` },
        title.text,
      ),
      h(
        "time.card__time",
        { datetime: session.modifiedAt, title: fmt.absoluteTime(session.modifiedAt, loc) },
        fmt.relativeTime(session.modifiedAt, loc),
      ),
    ),
    session.lastMessage && !title.untitled
      ? h("div.card__preview", null, session.lastMessage)
      : null,
    foot,
  );
}

/** A row for one matching message. */
function hitCard(hit, onOpen) {
  const loc = locale();
  const roleKey =
    hit.sourceType === "thinking" ? "thinking" : hit.role === "user" ? "user" : "assistant";

  const preview = h("div.card__preview");
  preview.append(highlighted(hit.snippet, hit.highlights));

  return h(
    "button.card",
    {
      type: "button",
      dataset: { path: hit.sessionPath, entry: hit.entryId },
      onclick: () => onOpen(hit.sessionPath, hit.entryId),
    },
    h(
      "div.card__top",
      null,
      h(
        "span",
        { class: `card__title${hit.sessionName ? "" : " card__title--untitled"}` },
        hit.sessionName || t("results.untitled"),
      ),
      h(
        "time.card__time",
        { datetime: hit.timestamp, title: fmt.absoluteTime(hit.timestamp, loc) },
        fmt.relativeTime(hit.timestamp, loc),
      ),
    ),
    preview,
    h(
      "div.card__foot",
      null,
      h("span", { class: `badge badge--role-${roleKey}` }, t(`role.${roleKey}`)),
      isCodex(hit.sessionPath) ? h("span.badge.badge--source", null, "Codex") : null,
      h("span.badge", { title: hit.cwd }, icon("folder"), hit.project),
    ),
  );
}

export class Results {
  #elements;
  #onOpen;
  #controller = null;
  /** Paging cursor for whichever mode is active. */
  #offset = 0;
  #total = 0;
  #mode = "list";
  #params = {};

  constructor(elements, { onOpen }) {
    this.#elements = elements;
    this.#onOpen = onOpen;
  }

  /**
   * Load the first page for the current filters.
   * @param {{query?: string, cwd?: string, range?: string, sort?: string, scope?: string}} params
   */
  async load(params) {
    this.#params = params;
    this.#mode = params.query ? "search" : "list";
    this.#offset = 0;

    this.#controller?.abort();
    this.#controller = new AbortController();
    const { signal } = this.#controller;

    this.#elements.title.textContent = t(
      this.#mode === "search" ? "results.searchTitle" : "results.sessions",
    );
    this.#elements.meta.textContent = "";
    fill(this.#elements.body, skeleton());

    try {
      if (this.#mode === "search") await this.#loadSearch(signal, true);
      else await this.#loadList(signal, true);
    } catch (error) {
      if (error.name === "AbortError") return;
      fill(this.#elements.body, errorState(error.message, () => this.load(this.#params)));
    }
  }

  async #loadList(signal, reset) {
    const data = await api.sessions(
      {
        cwd: this.#params.cwd,
        range: this.#params.range,
        sort: this.#params.sort,
        limit: PAGE,
        offset: this.#offset,
      },
      signal,
    );
    if (signal.aborted) return;

    this.#total = data.total;
    this.#elements.meta.textContent = t("results.count", data.total);

    if (reset) fill(this.#elements.body);
    if (data.sessions.length === 0 && reset) {
      fill(this.#elements.body, emptyState(t("results.empty"), t("results.emptyHint")));
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const session of data.sessions) fragment.append(sessionCard(session, this.#onOpen));
    this.#appendPage(fragment, data.sessions.length);
  }

  async #loadSearch(signal, reset) {
    const started = performance.now();
    const data = await api.search(
      {
        q: this.#params.query,
        scope: this.#params.scope,
        cwd: this.#params.cwd,
        limit: SEARCH_PAGE,
        offset: this.#offset,
      },
      signal,
    );
    if (signal.aborted) return;

    this.#total = data.total;
    const elapsed = Math.max(data.tookMs, Math.round(performance.now() - started));
    this.#elements.meta.textContent = `${t("results.hitCount", data.total)} · ${t("results.took", elapsed)}`;

    if (reset) fill(this.#elements.body);

    const fragment = document.createDocumentFragment();

    if (reset && data.sessions.length > 0) {
      fragment.append(h("div.group-label", null, t("results.matchedSessions")));
      for (const session of data.sessions) fragment.append(sessionCard(session, this.#onOpen));
    }

    if (reset && data.hits.length > 0 && data.sessions.length > 0) {
      fragment.append(h("div.group-label", null, t("results.matchedMessages")));
    }

    for (const hit of data.hits) fragment.append(hitCard(hit, this.#onOpen));

    if (reset && data.sessions.length === 0 && data.hits.length === 0) {
      fill(this.#elements.body, emptyState(t("results.searchEmpty"), t("results.emptyHint")));
      return;
    }

    this.#appendPage(fragment, data.hits.length);
  }

  #appendPage(fragment, added) {
    this.#elements.body.querySelector(".load-more")?.remove();
    this.#elements.body.append(fragment);
    this.#offset += added;

    if (this.#offset >= this.#total || added === 0) return;

    const button = h(
      "button.load-more",
      {
        type: "button",
        onclick: async () => {
          button.disabled = true;
          button.textContent = t("results.loading");
          try {
            const controller = new AbortController();
            if (this.#mode === "search") await this.#loadSearch(controller.signal, false);
            else await this.#loadList(controller.signal, false);
          } catch (error) {
            button.disabled = false;
            button.textContent = t("error.retry");
            void error;
          }
        },
      },
      t("results.loadMore"),
    );

    this.#elements.body.append(button);
  }

  /** Rows in visual order, for keyboard navigation. */
  #rows() {
    return [...this.#elements.body.querySelectorAll(".card")];
  }

  /** Highlight the row matching an open session. */
  markCurrent(path, entryId) {
    for (const row of this.#rows()) {
      const match =
        row.dataset.path === path && (entryId === undefined || row.dataset.entry === entryId);
      if (match) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  }

  /** Move the selection by `delta` rows and open the newly selected one. */
  move(delta) {
    const rows = this.#rows();
    if (rows.length === 0) return;

    const index = rows.findIndex((row) => row.getAttribute("aria-current") === "true");
    const next = index === -1 ? (delta > 0 ? 0 : rows.length - 1) : index + delta;
    const target = rows[Math.max(0, Math.min(rows.length - 1, next))];
    if (!target) return;

    target.scrollIntoView({ block: "nearest" });
    target.click();
  }
}
