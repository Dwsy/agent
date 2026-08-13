/* Memory viewer app. Single file, no dependencies, DOM-built (never innerHTML
   with untrusted text — the one exception is the markdown preview, which
   escapes its input first). */
(function () {
  "use strict";

  var DATA = JSON.parse(document.getElementById("viewer-data").textContent);
  var LIVE = DATA.mode === "live";
  var PAGE = 200;
  var THEME_KEY = "role-memory-viewer-theme";

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function h(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "on") Object.keys(value).forEach(function (ev) { node.addEventListener(ev, value[ev]); });
        else if (key === "data") Object.keys(value).forEach(function (k) { node.dataset[k] = value[k]; });
        else node.setAttribute(key, value === true ? "" : String(value));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    node.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }

  function icon(name, cls) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", cls || "icon");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + name);
    svg.appendChild(use);
    return svg;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function byId(id) { return document.getElementById(id); }

  var ui = {
    app: byId("app"),
    nav: byId("nav"),
    pane: byId("pane"),
    detail: byId("detail"),
    facets: byId("facets"),
    workspace: byId("workspace"),
    search: byId("search"),
    title: byId("viewTitle"),
    count: byId("viewCount"),
    toasts: byId("toasts"),
    help: byId("help"),
    stamp: byId("footStamp"),
    refresh: byId("refreshBtn"),
    scrim: byId("scrim"),
    newBtn: byId("newBtn"),
    newLabel: byId("newLabel"),
  };

  // ── Formatting ───────────────────────────────────────────────────────────

  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function formatStamp(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso || "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  // ── Item model ───────────────────────────────────────────────────────────
  //  Every list view speaks the same shape: mark + title/text + fields + tags.

  var INDEX = {};

  function buildIndex() {
    INDEX.learnings = DATA.learnings
      .slice()
      .sort(function (a, b) { return b.used - a.used || a.text.localeCompare(b.text); })
      .map(function (l) {
        return {
          id: "learning:" + l.id,
          type: "learning",
          recordId: l.id,
          kind: "Learning",
          text: l.text,
          tags: l.tags || [],
          facet: l.tier,
          mark: { label: l.used + "\u00d7", tone: l.tier },
          fields: compact([
            ["reinforced", l.used + "\u00d7"],
            ["source", l.source],
            ["last used", l.date],
            ["id", l.id],
          ]),
          rowFields: compact([["", l.source], ["", l.date]]),
        };
      });

    INDEX.preferences = DATA.preferences
      .slice()
      .sort(function (a, b) { return a.category.localeCompare(b.category) || a.text.localeCompare(b.text); })
      .map(function (p) {
        return {
          id: "preference:" + p.id,
          type: "preference",
          recordId: p.id,
          kind: "Preference",
          text: p.text,
          category: p.category,
          tags: p.tags || [],
          facet: p.category,
          mark: null, // the category already reads in the meta line

          fields: compact([["category", p.category], ["id", p.id]]),
          rowFields: compact([["", p.category]]),
        };
      });

    INDEX.events = DATA.events
      .slice()
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
      .map(function (e) {
        return {
          id: "event:" + e.id,
          type: "event",
          recordId: e.id,
          kind: "Event",
          title: e.title,
          text: e.body || "",
          date: e.date,
          tags: [],
          facet: (e.date || "").slice(0, 7),
          mark: { label: (e.date || "").slice(5) || "\u2014", tone: "" },
          fields: compact([["date", e.date], ["id", e.id]]),
          rowFields: compact([["", e.date]]),
        };
      });

    INDEX.daily = DATA.daily
      .slice()
      .sort(function (a, b) { return b.date.localeCompare(a.date) || String(b.time).localeCompare(String(a.time)); })
      .map(function (d) {
        return {
          id: "daily:" + d.date + ":" + d.index,
          type: "daily",
          kind: "Journal entry",
          text: d.text,
          date: d.date,
          entryIndex: d.index,
          tags: [],
          facet: d.date,
          mark: { label: d.time || d.date.slice(5), tone: "" },
          fields: compact([["date", d.date], ["time", d.time], ["logged as", d.kind ? d.kind.toLowerCase() : ""]]),
          rowFields: compact([["", d.date], ["", d.kind ? d.kind.toLowerCase() : ""]]),
        };
      });

    INDEX.pending = DATA.pending
      .slice()
      .sort(function (a, b) {
        if (a.promoted !== b.promoted) return a.promoted ? 1 : -1;
        return String(b.createdAt).localeCompare(String(a.createdAt));
      })
      .map(function (p) {
        return {
          id: "pending:" + p.id,
          type: "pending",
          recordId: p.id,
          kind: "Pending memory",
          text: p.text,
          promoted: p.promoted,
          tags: [],
          facet: p.promoted ? "promoted" : "waiting",
          mark: { label: p.promoted ? "kept" : "waiting", tone: p.promoted ? "new" : "waiting" },
          fields: compact([
            ["state", p.promoted ? "promoted" : "waiting"],
            ["source", p.source],
            ["category", p.category],
            ["created", p.createdAt],
            ["id", p.id],
          ]),
          rowFields: compact([["", p.source], ["", p.createdAt]]),
        };
      });
  }

  function compact(pairs) {
    return pairs.filter(function (pair) { return pair[1] !== undefined && pair[1] !== null && pair[1] !== ""; });
  }

  function itemsWithTag(tag) {
    var lower = tag.toLowerCase();
    return INDEX.learnings.concat(INDEX.preferences).filter(function (item) {
      return item.tags.some(function (t) { return t.toLowerCase() === lower; });
    });
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  var SECTIONS = [
    { id: "overview", label: "Overview", icon: "i-overview" },
    { id: "learnings", label: "Learnings", icon: "i-learning", count: function () { return DATA.stats.learnings; } },
    { id: "preferences", label: "Preferences", icon: "i-preference", count: function () { return DATA.stats.preferences; } },
    { id: "events", label: "Events", icon: "i-event", count: function () { return DATA.stats.events; } },
    { id: "daily", label: "Daily", icon: "i-daily", count: function () { return DATA.stats.daily; } },
    { id: "pending", label: "Pending", icon: "i-pending", count: function () { return DATA.stats.pending; } },
    { id: "tags", label: "Tags", icon: "i-tag", count: function () { return DATA.tags.length; }, when: function () { return DATA.tags.length > 0; } },
    { id: "logs", label: "Logs", icon: "i-logs", live: true },
  ];

  function visibleSections() {
    return SECTIONS.filter(function (s) {
      if (s.live && !LIVE) return false;
      return !s.when || s.when();
    });
  }

  var state = {
    section: "overview",
    facet: "all",
    query: "",
    selectedId: null,
    tagFilter: null,
    detailOpen: false,
    limit: PAGE,
    file: null,
    editor: null,
    openDirs: {},
    logs: { status: "idle", entries: [], agg: null, error: "", level: "all" },
    form: null,
    confirmDelete: false,
    busy: false,
  };

  /** Kinds the server can rewrite in place; journal entries included. */
  var EDITABLE_KINDS = { learning: "Learning", preference: "Preference", event: "Event", daily: "Journal entry" };
  /** Only these can be created from scratch — journal entries are appended by the agent. */
  var CREATABLE_SECTIONS = { learnings: "learning", preferences: "preference", events: "event" };
  var KIND_SECTION = { learning: "learnings", preference: "preferences", event: "events", daily: "daily" };
  var SOURCE_FILE = { daily: "memory/daily/<date>.md", other: "memory/consolidated.md" };

  function canEdit(item) {
    return LIVE && !!item && (!!EDITABLE_KINDS[item.type] || item.type === "pending");
  }

  // ── Filtering ────────────────────────────────────────────────────────────

  function buildMatcher(query) {
    var q = query.trim();
    if (!q) return null;
    var re = null;
    var body = q.match(/^\/(.+)\/([gimsuy]*)$/);
    if (body) {
      // Always case-insensitive, never global: `lastIndex` is managed per use.
      var flags = body[2].replace(/[gi]/g, "") + "i";
      try { re = new RegExp(body[1], flags); } catch (err) { re = null; }
    }
    if (re) return { test: function (t) { return re.test(t); }, regex: new RegExp(re.source, re.flags.indexOf("g") < 0 ? re.flags + "g" : re.flags) };
    var lower = q.toLowerCase();
    return {
      test: function (t) { return t.toLowerCase().indexOf(lower) >= 0; },
      regex: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
    };
  }

  function searchable(item) {
    return [item.title || "", item.text].concat(item.tags, item.fields.map(function (f) { return f[1]; })).join(" \u0001 ");
  }

  function currentItems() {
    if (state.tagFilter) return itemsWithTag(state.tagFilter);
    return INDEX[state.section] || [];
  }

  function filteredItems() {
    var matcher = buildMatcher(state.query);
    return currentItems().filter(function (item) {
      if (!state.tagFilter && state.facet !== "all" && item.facet !== state.facet) return false;
      return !matcher || matcher.test(searchable(item));
    });
  }

  function facetsFor(section) {
    var items = INDEX[section] || [];
    if (!items.length) return [];
    var order = [];
    var counts = {};
    items.forEach(function (item) {
      var key = item.facet || "other";
      if (counts[key] === undefined) { counts[key] = 0; order.push(key); }
      counts[key]++;
    });
    if (order.length < 2) return [];
    if (section === "learnings") order = ["reinforced", "active", "new"].filter(function (k) { return counts[k]; });
    else if (section === "pending") order = ["waiting", "promoted"].filter(function (k) { return counts[k]; });
    else if (section === "daily" || section === "events") order.sort().reverse();
    else order.sort();
    return [{ key: "all", label: "All", n: items.length }].concat(order.map(function (key) {
      return { key: key, label: key, n: counts[key] };
    }));
  }

  // ── Highlighted text ─────────────────────────────────────────────────────

  function highlighted(text, matcher) {
    if (!matcher || !matcher.regex) return document.createTextNode(text);
    var frag = document.createDocumentFragment();
    var re = matcher.regex;
    re.lastIndex = 0;
    var last = 0;
    var found;
    var guard = 0;
    while ((found = re.exec(text)) !== null && guard++ < 500) {
      if (found[0] === "") { re.lastIndex++; continue; }
      if (found.index > last) frag.appendChild(document.createTextNode(text.slice(last, found.index)));
      frag.appendChild(h("mark", { text: found[0] }));
      last = found.index + found[0].length;
    }
    if (!last) return document.createTextNode(text);
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  function go(section, options) {
    var opts = options || {};
    if (!confirmLeaveEditor() || !confirmLeaveForm()) return;
    state.section = section;
    state.facet = opts.facet || "all";
    state.tagFilter = opts.tag || null;
    state.selectedId = null;
    state.limit = PAGE;
    state.form = null;
    state.confirmDelete = false;
    if (opts.query !== undefined) { state.query = opts.query; ui.search.value = opts.query; }
    if (section !== "definition") { state.file = null; state.editor = null; }
    if (!opts.keepDetail) state.detailOpen = false;
    closeNavDrawer();
    render();
    ui.pane.scrollTop = 0;
    if (section === "logs" && state.logs.status === "idle") loadLogs();
  }

  function renderNav() {
    clear(ui.nav);
    visibleSections().forEach(function (section) {
      var count = section.count ? section.count() : null;
      ui.nav.appendChild(h("button", {
        class: "nav-item",
        type: "button",
        "aria-current": state.section === section.id ? "true" : null,
        on: { click: function () { go(section.id); } },
      },
        icon(section.icon),
        h("span", { class: "nav-label", text: section.label }),
        count === null ? null : h("span", { class: "nav-count", text: String(count) })
      ));
    });

    if (!LIVE || !DATA.coreFiles.length) return;

    ui.nav.appendChild(h("div", { class: "nav-sep" }));

    var dirs = {};
    DATA.coreFiles.forEach(function (file) { (dirs[file.dir] = dirs[file.dir] || []).push(file); });

    Object.keys(dirs).forEach(function (dir) {
      if (state.openDirs[dir] === undefined) state.openDirs[dir] = true;
      var group = h("details", {
        class: "nav-group",
        open: state.openDirs[dir],
        on: { toggle: function (e) { state.openDirs[dir] = e.target.open; } },
      },
        h("summary", {},
          icon("i-chevron", "icon caret"),
          icon("i-folder"),
          h("span", { class: "nav-label", text: dir }),
          h("span", { class: "nav-count", text: String(dirs[dir].length) })
        ),
        h("div", { class: "nav-files" }, dirs[dir].map(function (file) {
          return h("button", {
            class: "nav-file",
            type: "button",
            "aria-current": state.file === file.path ? "true" : null,
            on: { click: function () { openFile(file.path); } },
          }, icon("i-file"), h("span", { class: "name", text: file.name }));
        }))
      );
      ui.nav.appendChild(group);
    });
  }

  function renderFacets() {
    clear(ui.facets);

    if (state.tagFilter) {
      ui.facets.hidden = false;
      ui.facets.appendChild(h("button", {
        class: "chip", type: "button", "aria-pressed": "true",
        on: { click: function () { go("tags"); } },
      }, "#" + state.tagFilter, icon("i-close", "icon")));
      return;
    }

    if (state.section === "logs") {
      var levels = [
        { key: "all", label: "All" },
        { key: "error", label: "Errors" },
        { key: "warn", label: "Warnings" },
        { key: "info", label: "Info" },
      ];
      ui.facets.hidden = false;
      levels.forEach(function (level) {
        ui.facets.appendChild(h("button", {
          class: "chip", type: "button",
          "aria-pressed": state.logs.level === level.key ? "true" : "false",
          on: { click: function () { state.logs.level = level.key; render(); } },
        }, level.label));
      });
      return;
    }

    var facets = facetsFor(state.section);
    ui.facets.hidden = facets.length === 0;
    facets.forEach(function (facet) {
      ui.facets.appendChild(h("button", {
        class: "chip", type: "button",
        "aria-pressed": state.facet === facet.key ? "true" : "false",
        on: { click: function () { setFacet(facet.key); } },
      }, h("span", { text: facet.label }), h("span", { class: "n", text: String(facet.n) })));
    });
  }

  function setFacet(key) {
    if (state.facet === key) return;
    if (!confirmLeaveForm()) return;
    state.facet = key;
    state.limit = PAGE;
    // The selected record may not survive the new filter.
    state.selectedId = null;
    state.form = null;
    state.confirmDelete = false;
    render();
  }

  function cycleFacet(direction) {
    var facets = facetsFor(state.section);
    if (facets.length < 2) return;
    var current = facets.findIndex(function (f) { return f.key === state.facet; });
    setFacet(facets[(current + direction + facets.length) % facets.length].key);
  }

  // ── List rendering ───────────────────────────────────────────────────────

  function rowNode(item, matcher) {
    var body = h("div", { class: "row-body" });

    if (item.title) {
      var title = h("div", { class: "row-title" });
      title.appendChild(highlighted(item.title, matcher));
      body.appendChild(title);
    }

    if (item.text) {
      var text = h("p", { class: "row-text" });
      text.appendChild(highlighted(item.text, matcher));
      body.appendChild(text);
    }

    var bits = (item.rowFields || []).map(function (f) { return f[1]; });
    if (bits.length || item.tags.length) {
      var meta = h("p", { class: "row-meta" });
      bits.forEach(function (bit, i) {
        if (i) meta.appendChild(h("span", { class: "dot", text: "\u00b7" }));
        meta.appendChild(h("span", { text: bit }));
      });
      item.tags.slice(0, 6).forEach(function (tag) {
        meta.appendChild(h("button", {
          class: "tagchip", type: "button", title: "Filter by " + tag,
          on: { click: function (e) { e.stopPropagation(); go("tags", { tag: tag }); } },
        }, "#" + tag));
      });
      body.appendChild(meta);
    }

    return h("li", {
      class: "row",
      role: "option",
      tabindex: "-1",
      "aria-selected": state.selectedId === item.id ? "true" : "false",
      data: { id: item.id },
      on: { click: function () { select(item.id, true); } },
    },
      item.mark ? h("span", { class: "row-mark", data: { tone: item.mark.tone || "" }, text: item.mark.label }) : null,
      body
    );
  }

  function renderList() {
    var matcher = buildMatcher(state.query);
    var items = filteredItems();

    if (!items.length) {
      ui.pane.appendChild(emptyState(
        state.query ? "No match" : "Nothing here yet",
        state.query
          ? "No item matches \u201c" + state.query + "\u201d. Press Esc to clear the filter."
          : "This section fills up as the role accumulates memory."
      ));
      return items;
    }

    var shown = items.slice(0, state.limit);
    var list = h("ol", {
      class: "rows",
      role: "listbox",
      "aria-label": sectionTitle(),
      data: { marks: shown.some(function (i) { return !!i.mark; }) ? "true" : "false" },
    });
    shown.forEach(function (item) { list.appendChild(rowNode(item, matcher)); });
    ui.pane.appendChild(list);

    if (items.length > shown.length) {
      ui.pane.appendChild(h("button", {
        class: "more", type: "button",
        on: { click: function () { state.limit += PAGE; render(); } },
      }, "Show " + Math.min(PAGE, items.length - shown.length) + " more of " + items.length));
    }
    return items;
  }

  function emptyState(title, note) {
    return h("div", { class: "empty" },
      icon("i-search"),
      h("strong", { text: title }),
      note ? h("span", { text: note }) : null
    );
  }

  // ── Detail panel ─────────────────────────────────────────────────────────

  function findItem(id) {
    var pool = currentItems();
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
    return null;
  }

  function select(id, openDetail) {
    if (state.selectedId !== id) {
      if (!confirmLeaveForm()) return;
      state.confirmDelete = false;
      state.form = null;
    }
    state.selectedId = id;
    if (openDetail) state.detailOpen = true;
    Array.prototype.forEach.call(ui.pane.querySelectorAll(".row"), function (row) {
      row.setAttribute("aria-selected", row.dataset.id === id ? "true" : "false");
    });
    renderDetail();
  }

  function renderDetail() {
    if (state.form) return renderForm();

    var item = state.selectedId ? findItem(state.selectedId) : null;
    var open = state.detailOpen && !!item;
    ui.workspace.classList.toggle("with-detail", open);
    ui.detail.hidden = !open;

    // Emptying on close matters: a hidden panel keeps live handlers otherwise.
    clear(ui.detail);
    if (!open) return;

    ui.detail.appendChild(h("div", { class: "detail-head" },
      h("span", { class: "detail-kind", text: item.kind }),
      h("button", {
        class: "icon-btn", type: "button", title: "Copy text (c)", "aria-label": "Copy text",
        on: { click: function () { copyText(item.title ? item.title + "\n\n" + item.text : item.text); } },
      }, icon("i-copy")),
      h("button", {
        class: "icon-btn", type: "button", title: "Close (d)", "aria-label": "Close detail",
        on: { click: function () { closeDetail(); } },
      }, icon("i-close"))
    ));

    var body = h("div", { class: "detail-body" });
    if (item.title) body.appendChild(h("h2", { class: "detail-title", text: item.title }));
    if (item.text) body.appendChild(h("div", { class: "detail-text", text: item.text }));

    if (item.tags.length) {
      body.appendChild(h("div", { class: "detail-tags" }, item.tags.map(function (tag) {
        return h("button", {
          class: "tagchip", type: "button",
          on: { click: function () { go("tags", { tag: tag }); } },
        }, "#" + tag);
      })));
    }

    if (item.fields.length) {
      var dl = h("dl", { class: "meta-list" });
      item.fields.forEach(function (field) {
        dl.appendChild(h("dt", { text: field[0] }));
        dl.appendChild(h("dd", { class: field[0] === "id" ? "mono" : "", text: String(field[1]) }));
      });
      body.appendChild(dl);
    }

    ui.detail.appendChild(body);
    if (canEdit(item)) ui.detail.appendChild(detailActions(item));
  }

  function closeDetail() {
    state.detailOpen = false;
    state.confirmDelete = false;
    renderDetail();
  }

  function detailActions(item) {
    if (state.confirmDelete) {
      var file = item.type === "daily" ? "memory/daily/" + item.date + ".md" : SOURCE_FILE.other;
      return h("div", { class: "detail-foot" }, h("div", { class: "confirm" },
        h("p", { text: "Delete this " + item.kind.toLowerCase() + "? This rewrites " + file + "." }),
        h("div", { class: "actions" },
          h("button", { class: "btn", type: "button", on: { click: function () { state.confirmDelete = false; renderDetail(); } } }, "Cancel"),
          h("button", {
            class: "btn btn-danger", type: "button",
            on: { click: function () { mutate(deletePayload(item), { clearSelection: true }); } },
          }, icon("i-trash"), "Delete")
        )
      ));
    }

    var foot = h("div", { class: "detail-foot" });

    if (item.type === "pending") {
      foot.appendChild(h("button", {
        class: "btn btn-primary", type: "button", title: "Move into long-term memory",
        on: { click: function () { mutate({ action: "promote", id: item.recordId }, { clearSelection: true }); } },
      }, icon("i-promote"), "Promote"));
      foot.appendChild(h("span", { class: "spacer" }));
      foot.appendChild(h("button", {
        class: "btn", type: "button", title: "Drop this candidate",
        on: { click: function () { mutate({ action: "discard", id: item.recordId }, { clearSelection: true }); } },
      }, icon("i-close"), "Discard"));
      return foot;
    }

    foot.appendChild(h("button", {
      class: "btn", type: "button", title: "Edit (e)",
      on: { click: function () { openEditForm(item); } },
    }, icon("i-edit"), "Edit"));

    if (item.type === "learning") {
      foot.appendChild(h("button", {
        class: "btn", type: "button", title: "Count one more use",
        on: { click: function () { mutate({ action: "reinforce", id: item.recordId }, {}); } },
      }, icon("i-check"), "Reinforce"));
    }

    foot.appendChild(h("span", { class: "spacer" }));
    foot.appendChild(h("button", {
      class: "btn btn-danger", type: "button", title: "Delete",
      on: { click: function () { state.confirmDelete = true; renderDetail(); } },
    }, icon("i-trash"), "Delete"));

    return foot;
  }

  /** Journal entries are addressed by day and position, records by id. */
  function deletePayload(item) {
    if (item.type === "daily") {
      return { action: "delete", kind: "daily", date: item.date, index: item.entryIndex, previous: item.text };
    }
    return { action: "delete", kind: item.type, id: item.recordId };
  }

  // ── Create / edit form ───────────────────────────────────────────────────

  function openForm(values) {
    var form = { error: "", busy: false, focusPending: true, text: "", title: "", category: "", date: "" };
    Object.keys(values).forEach(function (key) { form[key] = values[key]; });
    // Snapshot for the dirty check that guards navigation away from the form.
    form.initial = { text: form.text, title: form.title, category: form.category, date: form.date };

    state.form = form;
    state.detailOpen = true;
    state.confirmDelete = false;
    renderDetail();
  }

  function openEditForm(item) {
    openForm({
      mode: "edit",
      kind: item.type,
      id: item.recordId,
      entryIndex: item.entryIndex,
      text: item.text || "",
      title: item.title || "",
      category: item.category || "",
      date: item.date || "",
    });
  }

  function openCreateForm(kind) {
    if (!kind || !CREATABLE_SECTIONS[KIND_SECTION[kind]]) return;
    openForm({
      mode: "create",
      kind: kind,
      category: state.section === "preferences" && state.facet !== "all" ? state.facet : "",
      date: kind === "event" ? new Date().toISOString().slice(0, 10) : "",
    });
  }

  function closeForm() {
    state.form = null;
    renderDetail();
  }

  function formIsDirty() {
    var form = state.form;
    if (!form || !form.initial) return false;
    return ["text", "title", "category", "date"].some(function (key) {
      return (form[key] || "") !== (form.initial[key] || "");
    });
  }

  /** Guards the implicit paths out of an open form; explicit Cancel just closes. */
  function confirmLeaveForm() {
    if (!formIsDirty()) return true;
    return window.confirm("Discard your unsaved changes to this " + EDITABLE_KINDS[state.form.kind].toLowerCase() + "?");
  }

  // Wrapping <label> implicitly labels the control, so no id/for bookkeeping.
  function field(label, control, hint) {
    return h("label", { class: "field" },
      h("span", { class: "field-label", text: label }),
      control,
      hint ? h("span", { class: "field-hint", text: hint }) : null
    );
  }

  function renderForm() {
    var form = state.form;
    ui.workspace.classList.add("with-detail");
    ui.detail.hidden = false;
    clear(ui.detail);

    ui.detail.appendChild(h("div", { class: "detail-head" },
      h("span", { class: "detail-kind", text: (form.mode === "create" ? "New " : "Edit ") + EDITABLE_KINDS[form.kind].toLowerCase() }),
      h("button", {
        class: "icon-btn", type: "button", title: "Cancel (Esc)", "aria-label": "Cancel",
        on: { click: closeForm },
      }, icon("i-close"))
    ));

    var body = h("form", {
      class: "form",
      on: { submit: function (e) { e.preventDefault(); submitForm(); } },
    });

    if (form.error) body.appendChild(h("p", { class: "form-error", text: form.error }));

    if (form.kind === "event") {
      body.appendChild(field("Title", h("input", {
        type: "text", value: form.title, required: true,
        on: { input: function (e) { form.title = e.target.value; } },
      })));
      body.appendChild(field("Date", h("input", {
        type: "date", value: form.date,
        on: { input: function (e) { form.date = e.target.value; } },
      })));
    }

    if (form.kind === "daily") {
      body.appendChild(h("p", { class: "field-hint", text: "Entry " + (form.entryIndex + 1) + " of memory/daily/" + form.date + ".md — the timestamp stays as logged." }));
    }

    if (form.kind === "preference") {
      var categories = Object.keys(DATA.stats.byCategory);
      var input = h("input", {
        type: "text", value: form.category, list: "category-options", placeholder: "General",
        on: { input: function (e) { form.category = e.target.value; } },
      });
      body.appendChild(field("Category", input, categories.length ? "Existing: " + categories.join(", ") : null));
      body.appendChild(h("datalist", { id: "category-options" }, categories.map(function (c) {
        return h("option", { value: c });
      })));
    }

    var area = h("textarea", {
      spellcheck: "false",
      on: { input: function (e) { form.text = e.target.value; } },
    });
    area.value = form.text;
    body.appendChild(field(form.kind === "event" ? "Details" : "Text", area));

    ui.detail.appendChild(body);
    ui.detail.appendChild(h("div", { class: "detail-foot" },
      h("span", { class: "field-hint", text: form.busy ? "Saving\u2026" : "\u2318Enter to save" }),
      h("span", { class: "spacer" }),
      h("button", { class: "btn", type: "button", disabled: form.busy, on: { click: closeForm } }, "Cancel"),
      h("button", { class: "btn btn-primary", type: "button", disabled: form.busy, on: { click: submitForm } }, icon("i-check"), form.mode === "create" ? "Create" : "Save")
    ));

    // Focus on open only: a re-render triggered elsewhere must not grab it.
    if (form.focusPending) {
      form.focusPending = false;
      setTimeout(function () {
        var target = ui.detail.querySelector(form.kind === "event" && form.mode === "create" ? "input" : "textarea");
        if (target) target.focus();
      }, 0);
    }
  }

  function submitForm() {
    var form = state.form;
    if (!form || form.busy) return;

    var text = (form.text || "").trim();
    var title = (form.title || "").trim();
    if (form.kind === "event" ? !title && !text : !text) {
      form.error = form.kind === "event" ? "A title or some details are required." : "Text is required.";
      renderForm();
      return;
    }

    var payload = { action: form.mode === "create" ? "create" : "update", kind: form.kind, text: text };
    if (form.kind === "daily") {
      payload.date = form.date;
      payload.index = form.entryIndex;
      payload.previous = form.initial.text;
    } else {
      if (form.mode === "edit") payload.id = form.id;
      if (form.kind === "preference") payload.category = (form.category || "").trim() || "General";
      if (form.kind === "event") { payload.title = title; payload.date = (form.date || "").trim(); }
    }

    form.busy = true;
    renderForm();
    mutate(payload, { closeForm: true });
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  function mutate(payload, options) {
    var opts = options || {};
    return fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error(t || "HTTP " + res.status); });
        return res.json();
      })
      .then(function (result) {
        if (opts.closeForm) state.form = null;
        state.confirmDelete = false;
        if (opts.clearSelection) state.selectedId = null;
        else if (result.id && payload.kind) state.selectedId = payload.kind + ":" + result.id;
        // A fresh record can easily fall outside the active section or facet.
        if (payload.action === "create") {
          state.section = KIND_SECTION[payload.kind];
          state.facet = "all";
          state.tagFilter = null;
        }
        return refreshData().then(function () { toast(result.message || "Saved", "ok"); });
      })
      .catch(function (err) {
        var message = String(err.message || err);
        if (state.form) { state.form.busy = false; state.form.error = message; renderForm(); }
        else toast(message, "error");
      });
  }

  // ── Overview ─────────────────────────────────────────────────────────────

  function statCard(value, label, tone, target) {
    var props = { class: "stat", data: { tone: tone || "" } };
    if (target) {
      props.type = "button";
      props.on = { click: function () { go(target.section, target); } };
    }
    return h(target ? "button" : "div", props,
      h("div", { class: "stat-value num", text: String(value) }),
      h("div", { class: "stat-label", text: label })
    );
  }

  function card(title, note, content) {
    return h("section", { class: "card" },
      h("div", { class: "card-head" },
        h("h2", { class: "card-title", text: title }),
        note ? h("span", { class: "card-note", text: note }) : null
      ),
      content
    );
  }

  function barRows(entries, tone, onPick) {
    var max = entries.reduce(function (m, e) { return Math.max(m, e[1]); }, 0) || 1;
    return h("div", { class: "bars" }, entries.map(function (entry) {
      var pct = Math.max(2, Math.round((entry[1] / max) * 100));
      var props = { class: "bar-row" };
      if (onPick) { props.type = "button"; props.on = { click: function () { onPick(entry[0]); } }; }
      return h(onPick ? "button" : "div", props,
        h("span", { class: "bar-name", text: entry[0], title: entry[0] }),
        h("span", { class: "bar-track" }, h("span", { class: "bar-fill", data: { tone: tone || "" }, style: "width:" + pct + "%" })),
        h("span", { class: "bar-value", text: String(entry[1]) })
      );
    }));
  }

  function renderOverview() {
    var s = DATA.stats;
    var board = h("div", { class: "board" });

    board.appendChild(h("div", { class: "stat-grid" },
      statCard(s.total, "Total items", "accent"),
      statCard(s.learnings, "Learnings", "", { section: "learnings" }),
      statCard(s.preferences, "Preferences", "", { section: "preferences" }),
      statCard(s.events, "Events", "", { section: "events" }),
      statCard(s.daily, "Daily entries", "", { section: "daily" }),
      statCard(s.waiting, "Awaiting review", s.waiting ? "warn" : "", { section: "pending", facet: "waiting" })
    ));

    var tiers = [["reinforced", s.byTier.reinforced], ["active", s.byTier.active], ["new", s.byTier.new]]
      .filter(function (t) { return t[1] > 0; });
    if (tiers.length) {
      board.appendChild(card("Learning strength", plural(s.learnings, "learning"), barRows(tiers, "", function (tier) {
        go("learnings", { facet: tier });
      })));
    }

    var categories = Object.keys(s.byCategory)
      .map(function (key) { return [key, s.byCategory[key]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    if (categories.length) {
      board.appendChild(card("Preference categories", plural(categories.length, "category", "categories"),
        barRows(categories, "info", function (category) { go("preferences", { facet: category }); })));
    }

    if (DATA.tags.length) {
      board.appendChild(card("Tags", plural(DATA.tags.length, "tag"),
        h("div", { class: "tag-grid" }, DATA.tags.slice(0, 18).map(tagCard))));
    }

    var recent = INDEX.daily.slice(0, 6);
    if (recent.length) {
      var digest = h("div", { class: "digest" }, recent.map(function (item) {
        return h("button", {
          class: "digest-row", type: "button", title: item.text,
          on: { click: function () { go("daily", { facet: item.facet }); } },
        },
          h("span", { class: "when", text: item.facet }),
          h("span", { class: "what", text: item.text }),
          h("span", { class: "at", text: item.mark.label })
        );
      }));
      board.appendChild(card("Recent daily entries", plural(DATA.stats.daily, "entry", "entries"), digest));
    }

    ui.pane.appendChild(board);
  }

  function tagCard(tag) {
    // Only tags still attached to items can be used as a filter; historical
    // vocabulary entries stay informative but inert.
    var filterable = tag.items > 0;
    var note = [
      tag.count + (tag.count === 1 ? " use" : " uses"),
      filterable ? tag.items + " in memory now" : "not on any current item",
      "strength " + tag.strength + "%",
    ].join(" \u00b7 ");

    var props = { class: "tag-card", title: "#" + tag.name + " \u2014 " + note, data: { idle: filterable ? "false" : "true" } };
    if (filterable) {
      props.type = "button";
      props.on = { click: function () { go("tags", { tag: tag.name }); } };
    }

    return h(filterable ? "button" : "div", props,
      h("span", { class: "tag-card-top" },
        h("span", { class: "label", text: "#" + tag.name }),
        h("span", { class: "n num", text: String(tag.count) })
      ),
      h("span", { class: "bar-track" },
        h("span", { class: "bar-fill", data: { tone: filterable ? "" : "info" }, style: "width:" + Math.max(3, Math.min(100, tag.strength)) + "%" })
      )
    );
  }

  function renderTags() {
    if (!DATA.tags.length) {
      ui.pane.appendChild(emptyState("No tags yet", "Tags appear once learnings or preferences are tagged."));
      return;
    }
    var matcher = buildMatcher(state.query);
    var tags = DATA.tags.filter(function (tag) { return !matcher || matcher.test(tag.name); });
    if (!tags.length) {
      ui.pane.appendChild(emptyState("No match", "No tag matches \u201c" + state.query + "\u201d."));
      return;
    }
    ui.pane.appendChild(h("div", { class: "board" },
      h("div", { class: "tag-grid" }, tags.map(tagCard))
    ));
  }

  // ── Role definition files ────────────────────────────────────────────────

  function openFile(path) {
    if (!confirmLeaveEditor()) return;
    state.section = "definition";
    state.file = path;
    state.editor = null;
    state.detailOpen = false;
    closeNavDrawer();
    render();
    fetchFile(path);
  }

  function fetchFile(path) {
    fetch("/api/core?file=" + encodeURIComponent(path))
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error(t || "HTTP " + res.status); });
        return res.text();
      })
      .then(function (text) {
        if (state.file !== path) return;
        state.editor = { path: path, original: text, value: text, mode: "preview", status: "", statusKind: "" };
        render();
      })
      .catch(function (err) {
        if (state.file !== path) return;
        state.editor = { path: path, original: "", value: "", mode: "preview", status: String(err.message || err), statusKind: "error", failed: true };
        render();
      });
  }

  function saveFile() {
    var editor = state.editor;
    if (!editor || editor.failed) return;
    setEditorStatus("Saving\u2026", "");
    fetch("/api/core", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: editor.path, content: editor.value }),
    })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error(t || "HTTP " + res.status); });
        return res.json();
      })
      .then(function () {
        editor.original = editor.value;
        var meta = DATA.coreFiles.find(function (f) { return f.path === editor.path; });
        if (meta) meta.size = new Blob([editor.value]).size;
        setEditorStatus("Saved " + formatStamp(new Date().toISOString()), "ok");
        refreshDirtyState();
        toast("Saved " + editor.path, "ok");
      })
      .catch(function (err) {
        setEditorStatus("Save failed: " + String(err.message || err), "error");
        toast("Save failed", "error");
      });
  }

  function setEditorStatus(text, kind) {
    if (state.editor) { state.editor.status = text; state.editor.statusKind = kind; }
    var foot = ui.pane.querySelector(".editor-foot");
    if (foot) { foot.textContent = text; foot.dataset.state = kind || ""; }
  }

  function isDirty() { return !!state.editor && state.editor.value !== state.editor.original; }

  function refreshDirtyState() {
    var dot = ui.pane.querySelector(".dirty-dot");
    if (dot) dot.hidden = !isDirty();
    var save = ui.pane.querySelector("[data-role=save]");
    if (save) save.disabled = !isDirty();
  }

  function confirmLeaveEditor() {
    if (!isDirty()) return true;
    return window.confirm("Discard unsaved changes to " + state.editor.path + "?");
  }

  function renderFileList() {
    if (!DATA.coreFiles.length) {
      ui.pane.appendChild(emptyState("No definition files", "Add markdown under core/, context/ or knowledge/ in the role directory."));
      return;
    }
    var matcher = buildMatcher(state.query);
    var files = DATA.coreFiles.filter(function (file) { return !matcher || matcher.test(file.path); });
    if (!files.length) {
      ui.pane.appendChild(emptyState("No match", "No file matches \u201c" + state.query + "\u201d."));
      return;
    }
    var dirs = {};
    files.forEach(function (file) { (dirs[file.dir] = dirs[file.dir] || []).push(file); });
    var wrap = h("div", { class: "file-list" });
    Object.keys(dirs).forEach(function (dir) {
      wrap.appendChild(h("h2", { class: "file-group-title", text: dir }));
      dirs[dir].forEach(function (file) {
        wrap.appendChild(h("button", { class: "file-item", type: "button", on: { click: function () { openFile(file.path); } } },
          icon("i-file"),
          h("span", { class: "file-name", text: file.name + ".md" }),
          h("span", { class: "file-size num", text: formatBytes(file.size) })
        ));
      });
    });
    ui.pane.appendChild(wrap);
  }

  function renderEditor() {
    var editor = state.editor;
    if (!editor) {
      ui.pane.appendChild(h("div", { class: "loading" }, icon("i-refresh", "icon spin"), "Loading " + state.file));
      return;
    }

    if (editor.failed) {
      ui.pane.appendChild(h("div", { class: "empty" },
        icon("i-file"),
        h("strong", { text: "Could not open " + editor.path }),
        h("span", { text: editor.status }),
        h("button", { class: "btn", type: "button", on: { click: function () { state.editor = null; render(); fetchFile(editor.path); } } }, icon("i-refresh"), "Try again")
      ));
      return;
    }

    var previewing = editor.mode === "preview";

    var content = previewing
      ? h("div", { class: "md", html: renderMarkdown(editor.value) })
      : h("textarea", {
        class: "code-editor",
        spellcheck: "false",
        "aria-label": editor.path,
        on: {
          input: function (e) { editor.value = e.target.value; refreshDirtyState(); if (editor.statusKind === "ok") setEditorStatus("", ""); },
        },
      });

    if (!previewing) content.value = editor.value;

    var head = h("div", { class: "editor-head" },
      h("div", { class: "editor-path" },
        icon("i-file"),
        h("span", { text: editor.path }),
        h("span", { class: "dirty-dot", hidden: !isDirty(), title: "Unsaved changes" })
      ),
      h("div", { class: "segmented" },
        h("button", {
          type: "button", "aria-pressed": previewing ? "true" : "false",
          on: { click: function () { editor.mode = "preview"; render(); } },
        }, icon("i-eye"), "Read"),
        h("button", {
          type: "button", "aria-pressed": previewing ? "false" : "true",
          on: { click: function () { editor.mode = "edit"; editor.focusPending = true; render(); } },
        }, icon("i-edit"), "Edit")
      ),
      h("button", {
        class: "btn", type: "button",
        on: { click: function () { if (confirmLeaveEditor()) { state.editor = null; render(); fetchFile(editor.path); } } },
      }, icon("i-refresh"), "Reload"),
      h("button", {
        class: "btn btn-primary", type: "button", data: { role: "save" }, disabled: !isDirty(),
        on: { click: saveFile },
      }, icon("i-check"), "Save")
    );

    ui.pane.appendChild(h("div", { class: "editor" },
      head,
      content,
      h("div", { class: "editor-foot", data: { state: editor.statusKind || "" }, text: editor.status || (previewing ? "Read-only preview \u2014 switch to Edit to change this file" : "\u2318S / Ctrl+S to save") })
    ));

    // Only steal focus on an explicit switch into edit mode, never on a
    // re-render triggered from elsewhere (e.g. typing in the filter box).
    if (editor.focusPending) {
      editor.focusPending = false;
      setTimeout(function () { content.focus(); }, 0);
    }
  }

  // ── Minimal markdown (input is escaped before any markup is added) ───────

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function inlineMarkdown(text) {
    return text
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function renderMarkdown(source) {
    var lines = escapeHtml(source).split("\n");
    var out = [];
    var listType = null;
    var paragraph = [];
    var fence = null;

    function flushParagraph() {
      if (!paragraph.length) return;
      out.push("<p>" + inlineMarkdown(paragraph.join(" ")) + "</p>");
      paragraph = [];
    }
    function closeList() {
      if (listType) { out.push("</" + listType + ">"); listType = null; }
    }
    function openList(type) {
      if (listType !== type) { closeList(); out.push("<" + type + ">"); listType = type; }
    }

    lines.forEach(function (line) {
      var fenceMatch = line.match(/^\s*```/);
      if (fenceMatch) {
        if (fence === null) { flushParagraph(); closeList(); fence = []; }
        else { out.push("<pre><code>" + fence.join("\n") + "</code></pre>"); fence = null; }
        return;
      }
      if (fence !== null) { fence.push(line); return; }

      var heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        flushParagraph(); closeList();
        out.push("<h" + heading[1].length + ">" + inlineMarkdown(heading[2]) + "</h" + heading[1].length + ">");
        return;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushParagraph(); closeList(); out.push("<hr>"); return; }
      if (/^&gt;\s?/.test(line)) {
        flushParagraph(); closeList();
        out.push("<blockquote>" + inlineMarkdown(line.replace(/^&gt;\s?/, "")) + "</blockquote>");
        return;
      }
      var bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bullet) { flushParagraph(); openList("ul"); out.push("<li>" + inlineMarkdown(bullet[1]) + "</li>"); return; }
      var numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (numbered) { flushParagraph(); openList("ol"); out.push("<li>" + inlineMarkdown(numbered[1]) + "</li>"); return; }
      if (!line.trim()) { flushParagraph(); closeList(); return; }
      paragraph.push(line.trim());
    });

    if (fence !== null) out.push("<pre><code>" + fence.join("\n") + "</code></pre>");
    flushParagraph();
    closeList();
    return out.join("\n");
  }

  // ── Logs ─────────────────────────────────────────────────────────────────

  function loadLogs() {
    state.logs.status = "loading";
    render();
    fetch("/api/logs")
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (payload) {
        state.logs.status = "ready";
        state.logs.entries = payload.entries || [];
        state.logs.agg = payload.agg || null;
        if (state.section === "logs") render();
      })
      .catch(function (err) {
        state.logs.status = "error";
        state.logs.error = String(err.message || err);
        if (state.section === "logs") render();
      });
  }

  function renderLogs() {
    if (state.logs.status === "loading") {
      ui.pane.appendChild(h("div", { class: "loading" }, icon("i-refresh", "icon spin"), "Reading log files\u2026"));
      return;
    }
    if (state.logs.status === "error") {
      ui.pane.appendChild(emptyState("Logs unavailable", state.logs.error));
      return;
    }

    var agg = state.logs.agg || { total: 0, errors: 0, warns: 0, tags: {}, hourly: {}, roles: {} };
    var board = h("div", { class: "board" });

    board.appendChild(h("div", { class: "stat-grid" },
      statCard(agg.total, "Log events", "accent"),
      statCard(agg.errors, "Errors", agg.errors ? "danger" : ""),
      statCard(agg.warns, "Warnings", agg.warns ? "warn" : ""),
      statCard(Object.keys(agg.roles || {}).length, "Roles seen", "")
    ));

    var hourly = Object.keys(agg.hourly || {}).sort().map(function (k) { return [k, agg.hourly[k]]; });
    if (hourly.length > 1) {
      var max = hourly.reduce(function (m, e) { return Math.max(m, e[1]); }, 0) || 1;
      board.appendChild(card("Activity", "last 48 hours", h("div", {},
        h("div", { class: "spark" }, hourly.map(function (entry) {
          return h("span", {
            class: "spark-bar",
            style: "height:" + Math.max(4, Math.round((entry[1] / max) * 100)) + "%",
            title: entry[0].replace("T", " ") + ":00 \u00b7 " + plural(entry[1], "event"),
          });
        })),
        h("div", { class: "spark-axis" },
          h("span", { text: hourly[0][0].replace("T", " ") + ":00" }),
          h("span", { text: hourly[hourly.length - 1][0].replace("T", " ") + ":00" })
        )
      )));
    }

    var tags = Object.keys(agg.tags || {}).map(function (k) { return [k, agg.tags[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 12);
    if (tags.length) board.appendChild(card("Top log tags", null, barRows(tags, "")));

    var roles = Object.keys(agg.roles || {}).map(function (k) { return [k, agg.roles[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    if (roles.length) board.appendChild(card("By role", null, barRows(roles, "info")));

    var matcher = buildMatcher(state.query);
    var entries = state.logs.entries.filter(function (entry) {
      if (state.logs.level !== "all" && (entry.level || "info") !== state.logs.level) return false;
      return !matcher || matcher.test([entry.tag, entry.message, entry.role].join(" "));
    }).slice(-PAGE).reverse();

    if (!entries.length) {
      board.appendChild(emptyState("No log entries", "Nothing matches the current filter."));
      ui.pane.appendChild(board);
      return;
    }

    var table = h("table", { class: "log-table" },
      h("thead", {}, h("tr", {},
        h("th", { text: "Time" }), h("th", { text: "Level" }), h("th", { text: "Tag" }),
        h("th", { text: "Message" }), h("th", { text: "Role" }), h("th", { class: "t-dur", text: "ms" })
      )),
      h("tbody", {}, entries.map(function (entry) {
        var level = entry.level || "info";
        return h("tr", {},
          h("td", { class: "t-time", text: String(entry.timestamp || "").slice(11, 19) }),
          h("td", {}, h("span", { class: "level", data: { level: level }, text: level })),
          h("td", {}, h("span", { class: "tagchip", text: entry.tag || "\u2014" })),
          h("td", { class: "t-msg" }, highlighted(String(entry.message || ""), matcher)),
          h("td", { class: "t-role", text: entry.role || "" }),
          h("td", { class: "t-dur", text: entry.duration_ms == null ? "" : String(Math.round(entry.duration_ms)) })
        );
      }))
    );

    board.appendChild(card("Recent events", plural(entries.length, "row"), table));
    ui.pane.appendChild(board);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function sectionTitle() {
    if (state.tagFilter) return "#" + state.tagFilter;
    if (state.section === "definition") return state.file || "Role definition";
    var section = SECTIONS.find(function (s) { return s.id === state.section; });
    return section ? section.label : "Memory";
  }

  function render() {
    var reachable = visibleSections().some(function (s) { return s.id === state.section; });
    if (!reachable) { state.section = "overview"; state.tagFilter = null; state.facet = "all"; }

    renderNav();
    renderFacets();
    renderNewButton();
    ui.title.textContent = sectionTitle();
    clear(ui.pane);

    var items = null;
    if (state.section === "overview") renderOverview();
    else if (state.section === "tags" && !state.tagFilter) renderTags();
    else if (state.section === "logs") renderLogs();
    else if (state.section === "definition") { if (state.file) renderEditor(); else renderFileList(); }
    else items = renderList();

    ui.count.textContent = countLabel(items);
    renderDetail();
  }

  function creatableKind() {
    if (!LIVE || state.tagFilter) return null;
    return CREATABLE_SECTIONS[state.section] || null;
  }

  function renderNewButton() {
    var kind = creatableKind();
    ui.newBtn.hidden = !kind;
    if (kind) {
      ui.newLabel.textContent = "New " + EDITABLE_KINDS[kind].toLowerCase();
      ui.newBtn.title = "Add a " + EDITABLE_KINDS[kind].toLowerCase() + " (n)";
    }
  }

  function countLabel(items) {
    if (state.section === "overview") return "updated " + DATA.updatedAt;
    if (state.section === "definition") return state.file ? "" : plural(DATA.coreFiles.length, "file");
    if (state.section === "tags" && !state.tagFilter) return plural(DATA.tags.length, "tag");
    if (state.section === "logs") return state.logs.agg ? plural(state.logs.agg.total, "event") : "";
    if (!items) return "";
    var total = currentItems().length;
    return items.length === total ? plural(total, "item") : items.length + " of " + total;
  }

  // ── Interaction ──────────────────────────────────────────────────────────

  function visibleRowIds() {
    return Array.prototype.map.call(ui.pane.querySelectorAll(".row"), function (row) { return row.dataset.id; });
  }

  function moveSelection(delta) {
    var ids = visibleRowIds();
    if (!ids.length) return;
    var index = ids.indexOf(state.selectedId);
    var next = index < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, index + delta));
    select(ids[next], state.detailOpen);
    var row = ui.pane.querySelector('.row[data-id="' + cssEscape(ids[next]) + '"]');
    if (row) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: "nearest" }); }
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
  }

  function jumpEdge(toEnd) {
    var ids = visibleRowIds();
    if (!ids.length) return;
    state.selectedId = null;
    moveSelection(toEnd ? -1 : 1);
    ui.pane.scrollTop = toEnd ? ui.pane.scrollHeight : 0;
  }

  function copyText(text) {
    if (!text) return;
    var done = function () { toast("Copied", "ok"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast("Copy blocked by browser", "error"); });
    } else {
      toast("Copy unavailable", "error");
    }
  }

  function toast(message, tone) {
    var node = h("div", { class: "toast", data: { tone: tone || "" } },
      tone === "ok" ? icon("i-check") : null,
      h("span", { text: message })
    );
    ui.toasts.appendChild(node);
    setTimeout(function () {
      node.classList.add("out");
      setTimeout(function () { node.remove(); }, 200);
    }, 2200);
  }

  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }

  function toggleTheme() {
    var explicit = document.documentElement.getAttribute("data-theme");
    var effective = explicit || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = effective === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* private mode */ }
  }

  function closeNavDrawer() {
    ui.app.classList.remove("nav-open");
    ui.scrim.hidden = true;
  }

  function refreshData(options) {
    var opts = options || {};
    if (!LIVE || state.busy) return Promise.resolve();
    if (opts.notify && !confirmLeaveEditor()) return Promise.resolve();

    state.busy = true;
    ui.refresh.querySelector(".icon").classList.add("spin");

    return fetch("/api/data")
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(function (fresh) {
        DATA = fresh;
        buildIndex();
        state.limit = PAGE;
        if (state.logs.status !== "idle") { state.logs.status = "idle"; state.logs.entries = []; state.logs.agg = null; }
        if (state.section === "logs") loadLogs();
        if (state.file && !DATA.coreFiles.some(function (f) { return f.path === state.file; })) { state.file = null; state.editor = null; }
        renderStamp();
        render();
        if (opts.notify) toast("Reloaded from disk", "ok");
      })
      .catch(function (err) { toast("Reload failed: " + String(err.message || err), "error"); })
      .finally(function () {
        state.busy = false;
        ui.refresh.querySelector(".icon").classList.remove("spin");
      });
  }

  function renderStamp() {
    ui.stamp.textContent = (LIVE ? "read " : "exported ") + formatStamp(DATA.generatedAt);
    ui.stamp.title = "Memory updated " + DATA.updatedAt;
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  function isTypingTarget(target) {
    return target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  }

  document.addEventListener("keydown", function (e) {
    var save = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
    if (save && state.editor && !state.editor.failed) { e.preventDefault(); saveFile(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && state.form) { e.preventDefault(); submitForm(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (isTypingTarget(e.target)) {
      if (e.key === "Escape") {
        if (state.form) { closeForm(); return; }
        if (e.target === ui.search) { ui.search.value = ""; state.query = ""; state.limit = PAGE; render(); }
        e.target.blur();
      }
      return;
    }

    if (state.form && e.key === "Escape") { closeForm(); return; }

    if (ui.help.open) {
      if (e.key === "Escape") ui.help.close();
      return;
    }

    switch (e.key) {
      case "/":
        e.preventDefault();
        ui.search.focus();
        ui.search.select();
        break;
      case "j": case "ArrowDown": e.preventDefault(); moveSelection(1); break;
      case "k": case "ArrowUp": e.preventDefault(); moveSelection(-1); break;
      case "g": jumpEdge(false); break;
      case "G": jumpEdge(true); break;
      case "[": cycleFacet(-1); break;
      case "]": cycleFacet(1); break;
      case "c": if (state.selectedId) { var item = findItem(state.selectedId); if (item) copyText(item.title ? item.title + "\n\n" + item.text : item.text); } break;
      case "d": state.detailOpen = !state.detailOpen; renderDetail(); break;
      case "e": {
        var selected = state.selectedId ? findItem(state.selectedId) : null;
        if (selected && EDITABLE_KINDS[selected.type] && LIVE) { e.preventDefault(); openEditForm(selected); }
        break;
      }
      case "n": if (creatableKind()) { e.preventDefault(); openCreateForm(creatableKind()); } break;
      case "t": toggleTheme(); break;
      case "r": if (LIVE) refreshData({ notify: true }); break;
      case "?": ui.help.showModal(); break;
      case "Escape":
        if (state.query) { ui.search.value = ""; state.query = ""; render(); }
        else if (state.detailOpen) closeDetail();
        else if (state.tagFilter) go("tags");
        break;
      default:
        if (/^[1-9]$/.test(e.key)) {
          var sections = visibleSections();
          var target = sections[Number(e.key) - 1];
          if (target) go(target.id);
        }
    }
  });

  // ── Wiring ───────────────────────────────────────────────────────────────

  var searchTimer = null;
  ui.search.addEventListener("input", function (e) {
    var value = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = value;
      state.limit = PAGE;
      state.selectedId = null;
      render();
    }, 90);
  });

  byId("themeBtn").addEventListener("click", toggleTheme);
  byId("helpBtn").addEventListener("click", function () { ui.help.showModal(); });
  ui.help.querySelector("[data-close-help]").addEventListener("click", function () { ui.help.close(); });
  ui.help.addEventListener("click", function (e) { if (e.target === ui.help) ui.help.close(); });
  ui.refresh.addEventListener("click", function () { refreshData({ notify: true }); });
  ui.newBtn.addEventListener("click", function () { openCreateForm(creatableKind()); });
  ui.scrim.addEventListener("click", closeNavDrawer);
  byId("navToggle").addEventListener("click", function () {
    var open = ui.app.classList.toggle("nav-open");
    ui.scrim.hidden = !open;
  });
  window.addEventListener("beforeunload", function (e) {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // ── Boot ─────────────────────────────────────────────────────────────────

  try {
    var stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") applyTheme(stored);
  } catch (err) { /* private mode */ }

  byId("brandRole").textContent = DATA.roleName;
  byId("brandRole").title = DATA.roleName;
  byId("brandMode").textContent = LIVE ? "live" : "snapshot";
  document.title = DATA.title;
  ui.refresh.hidden = !LIVE;

  if (LIVE && DATA.coreFiles.length) SECTIONS.push({ id: "definition", label: "Role definition", icon: "i-folder", live: true });

  buildIndex();
  renderStamp();
  render();
})();
