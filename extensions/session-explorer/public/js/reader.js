/**
 * The transcript reader.
 *
 * Reading a session means following the conversation, not wading through tool
 * output: calls are collapsed to one scannable line each — name plus the
 * argument that identifies it — and expand on demand. Thinking is folded the
 * same way. Everything else in the file (compactions, branch points, model
 * switches) appears as a quiet rule so the timeline stays honest.
 */

import { api } from "./api.js";
import { append, fill, h, icon } from "./dom.js";
import * as fmt from "./format.js";
import { locale, t } from "./i18n.js";
import { renderProse } from "./prose.js";

/** How many transcript items to request per page. */
const PAGE = 300;

/**
 * The argument worth showing next to a tool name.
 * These keys cover the tools Pi ships; anything else falls back to the first
 * short string in the payload, which is usually the subject of the call.
 */
const SIGNATURE_KEYS = [
  "path",
  "file_path",
  "command",
  "pattern",
  "query",
  "url",
  "prompt",
  "name",
  "description",
];

function toolSignature(args) {
  if (!args || typeof args !== "object") return "";

  for (const key of SIGNATURE_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) {
      return value.replace(/\s+/g, " ").trim();
    }
  }

  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.trim() && value.length < 200) {
      return value.replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function copyToClipboard(text, onToast) {
  navigator.clipboard
    .writeText(text)
    .then(() => onToast(t("reader.copied")))
    .catch(() => onToast(t("reader.copyFailed")));
}

function copyButton(getText, onToast, label) {
  return h(
    "button.icon-btn",
    {
      type: "button",
      title: label,
      "aria-label": label,
      onclick: (event) => {
        event.stopPropagation();
        copyToClipboard(getText(), onToast);
      },
    },
    icon("copy"),
  );
}

function truncationNote(fullLength) {
  return h("span.truncated", null, t("block.truncated", fmt.chars(fullLength)));
}

/** One tool call plus the result it produced. */
function renderToolCall(block, onToast) {
  const signature = toolSignature(block.arguments);
  const failed = block.result?.isError === true;

  const tail = h("span.fold__tail");
  if (failed) tail.append(h("span.badge.badge--danger", null, t("block.error")));
  if (block.result?.truncated) {
    tail.append(h("span.badge.badge--mono", null, fmt.chars(block.result.fullLength)));
  }

  const summary = h(
    "summary.fold__summary",
    null,
    icon("chevron", "fold__chevron"),
    icon(failed ? "warn" : "tool", "fold__icon"),
    h("span.fold__name", null, block.toolName ?? "tool"),
    signature ? h("span.fold__hint", { title: signature }, signature) : null,
    tail,
  );

  const body = h("div.fold__body");

  if (block.arguments !== undefined && block.arguments !== null) {
    const json = JSON.stringify(block.arguments, null, 2);
    body.append(
      h(
        "div.field",
        null,
        h(
          "span.field__label",
          null,
          t("block.arguments"),
          " ",
          copyButton(() => json, onToast, t("reader.copyText")),
        ),
        h("pre.code", null, json),
      ),
    );
  }

  if (block.result) {
    const text = block.result.text || t("block.noOutput");
    body.append(
      h(
        "div.field",
        null,
        h("span.field__label", null, t("block.toolResult")),
        h("pre.code.code--out", null, text),
        block.result.truncated ? truncationNote(block.result.fullLength) : null,
      ),
    );
  }

  return h("details", { class: `fold fold--tool${failed ? " fold--error" : ""}` }, summary, body);
}

function renderThinking(block) {
  return h(
    "details.fold.fold--thinking",
    null,
    h(
      "summary.fold__summary",
      null,
      icon("chevron", "fold__chevron"),
      icon("spark", "fold__icon"),
      h("span.fold__name", null, t("block.thinking")),
      h("span.fold__hint", null, (block.text ?? "").replace(/\s+/g, " ").slice(0, 120)),
    ),
    h(
      "div.fold__body",
      null,
      renderProse(block.text ?? ""),
      block.truncated ? truncationNote(block.fullLength) : null,
    ),
  );
}

/** An inline rule for a non-message transcript event. */
function renderEvent(iconName, label, detail) {
  return h(
    "div.event",
    null,
    h(
      "span.event__body",
      null,
      icon(iconName, "event__icon"),
      h("span.event__text", { title: detail ?? label }, detail ? `${label} · ${detail}` : label),
    ),
  );
}

/** A block-level event that carries text worth reading, such as a summary. */
function renderEventBlock(iconName, label, text) {
  return h(
    "div.event--block",
    null,
    h("div.event__head", null, icon(iconName, "event__icon"), label),
    renderProse(text),
  );
}

function renderUsage(usage) {
  if (!usage) return null;

  const parts = [];
  if (usage.input || usage.output) {
    parts.push(`↑${fmt.compact(usage.input)} ↓${fmt.compact(usage.output)}`);
  }
  if (usage.cacheRead) parts.push(`cache ${fmt.compact(usage.cacheRead)}`);
  if (usage.cost) parts.push(fmt.currency(usage.cost));
  if (parts.length === 0) return null;

  return h("div.usage", null, ...parts.map((part) => h("span", null, part)));
}

function renderMessage(item, onToast) {
  const isUser = item.kind === "user";

  const head = h(
    "div.msg__head",
    null,
    h("span.msg__who", null, t(isUser ? "role.user" : "role.assistant")),
    h("time.msg__time", { datetime: item.timestamp }, fmt.clockTime(item.timestamp)),
    !isUser && item.model ? h("span.badge.badge--mono", null, fmt.shortModel(item.model)) : null,
    !isUser && item.stopReason === "aborted"
      ? h("span.badge.badge--danger", null, item.stopReason)
      : null,
  );

  const body = h("div.msg__body", null, head);
  const actions = h("div.msg__actions");
  head.append(actions);

  if (isUser) {
    actions.append(copyButton(() => item.text, onToast, t("reader.copyText")));
    append(body, [renderProse(item.text)]);
    if (item.truncated) body.append(truncationNote(item.fullLength));
    if (item.images > 0) body.append(h("span.badge", null, t("block.images", item.images)));
  } else {
    const texts = item.blocks.filter((b) => b.type === "text").map((b) => b.text ?? "");
    if (texts.length > 0) {
      actions.append(copyButton(() => texts.join("\n\n"), onToast, t("reader.copyText")));
    }

    for (const block of item.blocks) {
      if (block.type === "text") {
        append(body, [renderProse(block.text ?? "")]);
        if (block.truncated) body.append(truncationNote(block.fullLength));
      } else if (block.type === "thinking") {
        body.append(renderThinking(block));
      } else if (block.type === "toolCall") {
        body.append(renderToolCall(block, onToast));
      } else if (block.type === "image") {
        body.append(h("span.badge", null, t("block.image")));
      }
    }

    const usage = renderUsage(item.usage);
    if (usage) body.append(usage);
  }

  return h(
    "article",
    { class: `msg msg--${isUser ? "user" : "assistant"}`, id: `entry-${item.id}` },
    h(
      "div.msg__gutter",
      null,
      h("span.msg__avatar", null, isUser ? "U" : "A"),
      h("span.msg__rule"),
    ),
    body,
  );
}

function renderItem(item, onToast) {
  switch (item.kind) {
    case "user":
    case "assistant":
      return renderMessage(item, onToast);
    case "compaction":
      return renderEventBlock("compact", t("event.compaction"), item.summary);
    case "branchSummary":
      return renderEventBlock("branch", t("event.branchSummary"), item.summary);
    case "label":
      return renderEvent("tag", t("event.label"), item.label);
    case "modelChange":
      return renderEvent("spark", t("event.modelChange"), fmt.shortModel(item.modelId));
    case "sessionInfo":
      return renderEvent("doc", t("event.sessionInfo"), item.name);
    case "custom":
      return renderEvent("doc", item.customType, item.text.slice(0, 120));
    default:
      return null;
  }
}

function stat(label, value, danger = false) {
  return h(
    "div.stat",
    null,
    h("span.stat__label", null, label),
    h("span", { class: `stat__value${danger ? " stat__value--danger" : ""}` }, value),
  );
}

/**
 * The reader pane.
 *
 * Owns its own DOM and request lifecycle: opening a new session aborts the
 * previous fetch so a slow large transcript cannot land after a later click.
 */
export class Reader {
  #elements;
  #onToast;
  #onClose;
  #controller = null;
  #data = null;
  #observer = null;

  constructor(elements, { onToast, onClose }) {
    this.#elements = elements;
    this.#onToast = onToast;
    this.#onClose = onClose;
  }

  get path() {
    return this.#data?.summary.path ?? null;
  }

  clear() {
    this.#controller?.abort();
    this.#controller = null;
    this.#data = null;
    this.#observer?.disconnect();
    this.#elements.inner.hidden = true;
    this.#elements.empty.hidden = false;
  }

  /**
   * Load a transcript and, when given, scroll to a specific entry.
   * @param {string} path
   * @param {string} [entryId]
   */
  async open(path, entryId) {
    this.#controller?.abort();
    this.#controller = new AbortController();
    const { signal } = this.#controller;

    this.#elements.empty.hidden = true;
    this.#elements.inner.hidden = false;
    fill(this.#elements.head, h("div.state", null, t("reader.loading")));
    fill(this.#elements.transcript);
    fill(this.#elements.outline);

    try {
      const data = await api.session({ path, limit: PAGE, offset: 0 }, signal);
      if (signal.aborted) return;
      this.#data = data;
      this.#render();
      if (entryId) this.#scrollTo(entryId);
    } catch (error) {
      if (error.name === "AbortError") return;
      fill(this.#elements.head, h("div.state.state--error", null, t("error.title")));
      fill(
        this.#elements.transcript,
        h("div.state.state--error", null, h("span.state__detail", null, error.message)),
      );
    }
  }

  #render() {
    const { summary, stats, items, outline, total } = this.#data;
    const loc = locale();
    const tokens = summary.usage
      ? summary.usage.inputTokens + summary.usage.outputTokens
      : 0;

    // An unnamed session is identified by its opening prompt, which is more
    // use than "Untitled" and is still something the user actually wrote. Only
    // a genuine absence of both gets the placeholder styling.
    const title = summary.name || outline[0]?.title;
    fill(
      this.#elements.head,
      h(
        "div.reader__title-row",
        null,
        h(
          "button.icon-btn.reader__back",
          {
            type: "button",
            title: t("reader.back"),
            "aria-label": t("reader.back"),
            onclick: () => this.#onClose(),
          },
          icon("back"),
        ),
          h(
            "div",
            { style: { flex: "1", minWidth: "0" } },
            h(
              "h2.reader__title",
              { class: title ? "" : "card__title--untitled" },
              title || t("results.untitled"),
              this.#data.format === "codex"
                ? h("span.badge.badge--source", { title: t("source.codexHint") }, "Codex")
                : null,
            ),
          h(
            "span.reader__path",
            { title: summary.path },
            icon("folder"),
            " ",
            fmt.tildePath(summary.cwd, this.#home()),
          ),
        ),
        copyButton(() => summary.path, this.#onToast, t("reader.copyPath")),
      ),
      h(
        "div.reader__stats",
        null,
        stat(t("stats.messages"), fmt.number(stats.userMessages + stats.assistantMessages)),
        stat(t("stats.tools"), fmt.number(stats.toolCalls)),
        stats.toolErrors > 0 ? stat(t("stats.errors"), fmt.number(stats.toolErrors), true) : null,
        stats.compactions > 0 ? stat(t("stats.compactions"), fmt.number(stats.compactions)) : null,
        // A session with no recorded usage shows nothing rather than a
        // confident "$0" — the index has no figures for it, which is not the
        // same as it having been free.
        tokens > 0 ? stat(t("stats.tokens"), fmt.compact(tokens)) : null,
        tokens > 0 ? stat(t("stats.cost"), fmt.currency(summary.usage.cost)) : null,
        stat(t("stats.duration"), fmt.duration(summary.createdAt, summary.modifiedAt, loc)),
        summary.model ? stat(t("stats.model"), fmt.shortModel(summary.model)) : null,
      ),
    );

    this.#renderOutline(outline);
    fill(this.#elements.transcript);
    this.#appendItems(items, 0);
    this.#renderPager(items.length, total);
    this.#elements.transcript.scrollTop = 0;
    this.#watchOutline();
  }

  #home() {
    // `~` collapsing needs the home prefix; derive it from any absolute cwd.
    const cwd = this.#data?.summary.cwd ?? "";
    const match = /^(\/(?:Users|home)\/[^/]+)/.exec(cwd);
    return match ? match[1] : null;
  }

  #renderOutline(outline) {
    const nav = this.#elements.outline;
    fill(nav, h("h3.outline__title", null, t("reader.outline")));

    for (const entry of outline) {
      nav.append(
        h(
          "button.outline__item",
          {
            type: "button",
            dataset: { entry: entry.id },
            onclick: () => this.#scrollTo(entry.id),
          },
          entry.title,
        ),
      );
    }
  }

  #appendItems(items, from) {
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const node = renderItem(item, this.#onToast);
      if (node) fragment.append(node);
    }
    this.#elements.transcript.append(fragment);
    void from;
  }

  /** Large sessions load a page at a time rather than freezing the pane. */
  #renderPager(loaded, total) {
    const existing = this.#elements.transcript.querySelector(".load-more");
    existing?.remove();
    if (loaded >= total) return;

    const button = h(
      "button.load-more",
      {
        type: "button",
        onclick: async () => {
          button.disabled = true;
          button.textContent = t("results.loading");
          try {
            const next = await api.session({
              path: this.#data.summary.path,
              offset: loaded,
              limit: PAGE,
            });
            button.remove();
            this.#appendItems(next.items, loaded);
            this.#renderPager(loaded + next.items.length, next.total);
            this.#watchOutline();
          } catch (error) {
            button.disabled = false;
            button.textContent = t("error.retry");
            this.#onToast(error.message);
          }
        },
      },
      t("reader.loadMore", total - loaded),
    );

    this.#elements.transcript.append(button);
  }

  /** Mark the outline entry whose message is currently in view. */
  #watchOutline() {
    this.#observer?.disconnect();

    const entries = [...this.#elements.transcript.querySelectorAll(".msg--user")];
    if (entries.length === 0) return;

    this.#observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) continue;
          const id = record.target.id.replace(/^entry-/, "");
          for (const item of this.#elements.outline.querySelectorAll(".outline__item")) {
            const active = item.dataset.entry === id;
            if (active) item.setAttribute("aria-current", "true");
            else item.removeAttribute("aria-current");
            if (active) item.scrollIntoView({ block: "nearest" });
          }
          break;
        }
      },
      { root: this.#elements.transcript, rootMargin: "0px 0px -75% 0px", threshold: 0 },
    );

    for (const entry of entries) this.#observer.observe(entry);
  }

  /**
   * Scroll to a transcript entry. When the entry is on a page that has not
   * loaded yet the request is deferred until the user pages that far, which is
   * rare enough that silently doing nothing is better than jumping elsewhere.
   */
  #scrollTo(entryId) {
    const target = this.#elements.transcript.querySelector(`#entry-${CSS.escape(entryId)}`);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.remove("msg--flash");
    // Reflow so the animation restarts when the same entry is targeted twice.
    void target.offsetWidth;
    target.classList.add("msg--flash");
  }
}
