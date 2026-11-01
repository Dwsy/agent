/*
 * pi-mesh — session file-change review (browser module).
 *
 * Self-contained vanilla JS (no build step). Renders a review of the files a
 * session modified: collapsible file tree + per-file hunks as syntax-highlighted
 * diffs via @pierre/diffs (loaded lazily through the page import map).
 *
 * Exposes window.PiMeshReview = { render, open }.
 *
 * Safety: all hand-built DOM goes through createElement/textContent or the
 * local esc(); the only innerHTML sink is @pierre/diffs HTML, sanitized with an
 * ISOLATED DOMPurify instance using the same policy as app.js (expressive-code
 * style exception generalized to the diffs style markers data-core-css /
 * data-theme-css / data-unsafe-css).
 */
(function () {
	"use strict";

	/* ----------------------------- helpers ----------------------------- */
	function esc(v) {
		return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
	}

	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = String(text);
		return node;
	}

	function fmtTime(iso) {
		const t = Date.parse(String(iso ?? ""));
		if (Number.isNaN(t)) return "—";
		return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
	}

	function currentTheme() {
		return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
	}

	/* ----------------------------- sanitization ----------------------------- */
	/**
	 * Isolated DOMPurify instance (own hook list) so app.js's shared instance
	 * hooks cannot strip the diffs <style> payloads. Policy mirrored from app.js:
	 * drop every <style> except the ones @pierre/diffs tags with its style
	 * markers (the analogue of app.js's .expressive-code exception).
	 */
	let _purifyPromise = null;
	function loadSanitizer() {
		if (_purifyPromise) return _purifyPromise;
		_purifyPromise = (async function () {
			const mod = await import("dompurify");
			const factory = mod.default ?? mod;
			let purify = null;
			if (typeof factory === "function") {
				try {
					purify = factory(window);
				} catch (_) {
					purify = null;
				}
			}
			purify = purify || factory;
			if (purify && typeof purify.addHook === "function") {
				purify.addHook("uponSanitizeElement", (node, data) => {
					if (data.tagName === "style" && node && node.removeAttribute && node.hasAttribute) {
						const tagged =
							node.hasAttribute("data-core-css") || node.hasAttribute("data-theme-css") || node.hasAttribute("data-unsafe-css");
						if (!tagged && node.parentNode) node.parentNode.removeChild(node);
					}
				});
			}
			return purify;
		})();
		return _purifyPromise;
	}

	async function sanitizeDiffsHtml(html) {
		try {
			const purify = await loadSanitizer();
			if (purify && typeof purify.sanitize === "function") {
				return purify.sanitize(html, { USE_PROFILES: { html: true, svg: true, svgFilters: true } });
			}
		} catch (_) {
			/* fall through to rejection below */
		}
		return null; // no sanitizer -> never inject raw HTML (caller renders text fallback)
	}

	/* ----------------------------- @pierre/diffs glue ----------------------------- */
	const THEME_NAME = "pimesh-review";
	/**
	 * Syntax palette mapped onto the page's CSS custom properties (review.css
	 * may override the --diffs-* variables again). No hard-coded colors here.
	 */
	const THEME_VAR_DEFAULTS = {
		foreground: "var(--text)",
		background: "var(--panel)",
		"token-comment": "var(--muted)",
		"token-string": "var(--running)",
		"token-string-expression": "var(--running)",
		"token-keyword": "var(--accent)",
		"token-constant": "var(--waiting)",
		"token-parameter": "var(--text)",
		"token-function": "var(--text)",
		"token-punctuation": "var(--muted)",
		"token-link": "var(--accent)",
		"token-inserted": "var(--running)",
		"token-deleted": "var(--closed)",
		"ansi-black": "var(--text)",
		"ansi-red": "var(--closed)",
		"ansi-green": "var(--running)",
		"ansi-yellow": "var(--waiting)",
		"ansi-blue": "var(--accent)",
		"ansi-magenta": "var(--accent)",
		"ansi-cyan": "var(--accent)",
		"ansi-white": "var(--text)",
		"ansi-bright-black": "var(--muted)",
		"ansi-bright-red": "var(--closed)",
		"ansi-bright-green": "var(--running)",
		"ansi-bright-yellow": "var(--waiting)",
		"ansi-bright-blue": "var(--accent)",
		"ansi-bright-magenta": "var(--accent)",
		"ansi-bright-cyan": "var(--accent)",
		"ansi-bright-white": "var(--text)",
	};

	let _themeReady = null;
	function ensureDiffsTheme() {
		if (_themeReady) return _themeReady;
		_themeReady = (async function () {
			const diffs = await import("@pierre/diffs");
			if (typeof diffs.registerCustomCSSVariableTheme === "function") {
				diffs.registerCustomCSSVariableTheme(THEME_NAME, THEME_VAR_DEFAULTS, true);
			}
			return diffs;
		})();
		return _themeReady;
	}

	/** Render one change hunk to sanitized @pierre/diffs HTML (or null). */
	async function renderHunkHtml(hunk, theme, fileName) {
		const [ssr] = await Promise.all([import("@pierre/diffs/ssr"), ensureDiffsTheme()]);
		const name = fileName || "file";
		const html = await ssr.preloadDiffHTML({
			oldFile: { name, contents: String(hunk.oldText ?? "") },
			newFile: { name, contents: String(hunk.newText ?? "") },
			options: {
				theme: { dark: THEME_NAME, light: THEME_NAME },
				themeType: theme === "dark" ? "dark" : "light",
				preferredHighlighter: "highlights",
				diffStyle: "unified",
				disableFileHeader: true,
				overflow: "wrap",
			},
		});
		return sanitizeDiffsHtml(html);
	}

	function baseName(path) {
		const p = String(path || "file");
		return p.split(/[\\/]/).pop() || "file";
	}

	/* ----------------------------- domain UI bits ----------------------------- */
	const STATUS_META = {
		added: { letter: "A", label: "新增" },
		modified: { letter: "M", label: "修改" },
		deleted: { letter: "D", label: "删除" },
		renamed: { letter: "R", label: "重命名" },
	};

	function statusChip(status) {
		const meta = STATUS_META[status] || STATUS_META.modified;
		const chip = el("span", "pm-chip pm-status pm-status-" + status);
		chip.appendChild(el("span", "pm-chip-letter", meta.letter));
		chip.appendChild(el("span", "pm-chip-label", meta.label));
		return chip;
	}

	function countSpans(additions, deletions) {
		const wrap = el("span", "pm-counts");
		if (additions > 0) wrap.appendChild(el("span", "pm-add", "+" + additions));
		if (deletions > 0) wrap.appendChild(el("span", "pm-del", "−" + deletions));
		return wrap;
	}

	/* ----------------------------- tree ----------------------------- */
	function buildTreeDom(tree, state) {
		const group = el("div", "pm-tree-group");
		group.setAttribute("role", "group");
		const appendNode = (node, parentEl, depth) => {
			for (const dir of node.dirs) {
				const collapsed = !!state.collapsed[dir.path];
				const row = el("div", "pm-tree-row pm-tree-dir");
				row.setAttribute("role", "treeitem");
				row.setAttribute("aria-expanded", collapsed ? "false" : "true");
				row.setAttribute("data-kind", "dir");
				row.setAttribute("data-path", dir.path);
				row.style.setProperty("--pm-depth", String(depth));
				const twisty = el("span", "pm-twisty", collapsed ? "▸" : "▾");
				twisty.setAttribute("aria-hidden", "true");
				row.appendChild(twisty);
				row.appendChild(el("span", "pm-name", dir.name));
				const dirFiles = flattenFiles(dir);
				const adds = dirFiles.reduce((s, f) => s + f.additions, 0);
				const dels = dirFiles.reduce((s, f) => s + f.deletions, 0);
				row.appendChild(countSpans(adds, dels));
				parentEl.appendChild(row);
				const childGroup = el("div", "pm-tree-group");
				childGroup.setAttribute("role", "group");
				childGroup.hidden = collapsed;
				parentEl.appendChild(childGroup);
				appendNode(dir, childGroup, depth + 1);
			}
			for (const file of node.files) {
				const row = el("div", "pm-tree-row pm-tree-file");
				const fileKey = String(file.fileKey || file.canonicalPath || file.path || "");
				const displayPath = String(file.displayPath || file.path || fileKey);
				row.setAttribute("role", "treeitem");
				row.setAttribute("data-kind", "file");
				row.setAttribute("data-path", fileKey);
				row.setAttribute("aria-selected", fileKey === state.selectedPath ? "true" : "false");
				row.tabIndex = -1;
				row.style.setProperty("--pm-depth", String(depth));
				row.title = displayPath;
				row.appendChild(statusChip(file.status));
				row.appendChild(el("span", "pm-name", file.displayName || file.name));
				row.appendChild(countSpans(file.additions, file.deletions));
				if (fileKey === state.selectedPath) row.classList.add("pm-selected");
				parentEl.appendChild(row);
			}
		};
		appendNode(tree, group, 0);
		return group;
	}

	function flattenFiles(node) {
		const out = node.files.slice();
		for (const dir of node.dirs) out.push(...flattenFiles(dir));
		return out;
	}

	function visibleRows(root) {
		return Array.prototype.filter.call(root.querySelectorAll('[role="treeitem"]'), (row) => !row.closest("[hidden]"));
	}

	/* ----------------------------- diff pane ----------------------------- */
	function buildDiffPane(file, state) {
		const pane = el("div", "pm-diff-pane");
		if (!file) {
			pane.appendChild(el("div", "pm-empty", "从左侧选择一个文件查看变更"));
			return pane;
		}
		const head = el("div", "pm-diff-head");
		head.appendChild(statusChip(file.status));
		const displayPath = String(file.displayPath || file.path || file.canonicalPath || "");
		const pathEl = el("span", "pm-diff-path", displayPath);
		pathEl.title = displayPath;
		head.appendChild(pathEl);
		head.appendChild(countSpans(file.additions, file.deletions));
		head.appendChild(el("span", "pm-diff-meta", file.toolCalls.length + " 次工具调用"));
		const copyBtn = el("button", "pm-btn", "复制补丁");
		copyBtn.type = "button";
		copyBtn.addEventListener("click", async () => {
			try {
				await navigator.clipboard.writeText(String(file.patch || ""));
				copyBtn.textContent = "已复制";
			} catch (_) {
				copyBtn.textContent = "复制失败";
			}
			setTimeout(() => {
				copyBtn.textContent = "复制补丁";
			}, 1500);
		});
		head.appendChild(copyBtn);
		pane.appendChild(head);

		if (!file.hunks || file.hunks.length === 0) {
			pane.appendChild(el("div", "pm-empty", "没有可展示的差异"));
			return pane;
		}

		for (const hunk of file.hunks) {
			const block = el("section", "pm-hunk");
			const meta = el("div", "pm-hunk-meta");
			const toolChip = el("span", "pm-chip pm-tool pm-tool-" + (hunk.toolName === "write" ? "write" : "edit"), hunk.toolName === "write" ? "write" : "edit");
			meta.appendChild(toolChip);
			meta.appendChild(el("span", "pm-hunk-seq", "#" + hunk.sequence));
			const time = el("time", "pm-hunk-time", fmtTime(hunk.timestamp));
			time.dateTime = String(hunk.timestamp || "");
			meta.appendChild(time);
			const outcome = hunk.outcome || (hunk.isError ? "failed" : "succeeded");
			const outcomeLabels = { succeeded: "成功", failed: "失败", pending: "待回执" };
			meta.appendChild(el("span", "pm-chip pm-outcome pm-outcome-" + outcome, outcomeLabels[outcome] || "待回执"));
			if (outcome === "succeeded") meta.appendChild(countSpans(hunk.additions, hunk.deletions));
			else if (hunk.additions || hunk.deletions) {
				const attempt = el("span", "pm-attempt-counts", "尝试 " + (hunk.additions ? "+" + hunk.additions : "") + (hunk.deletions ? " −" + hunk.deletions : ""));
				meta.appendChild(attempt);
			}
			block.appendChild(meta);

			const diffHost = el("div", "pm-hunk-diff");
			diffHost.setAttribute("data-sequence", String(hunk.sequence));
			block.appendChild(diffHost);
			pane.appendChild(block);

			// Async fill; token guards against stale renders during fast navigation.
			const token = state.renderToken;
			const fileName = baseName(displayPath);
			diffHost.appendChild(el("div", "pm-empty", "渲染差异中…"));
			renderHunkHtml(hunk, state.theme, fileName).then((html) => {
				if (state.renderToken !== token || !diffHost.isConnected) return;
				diffHost.replaceChildren();
				if (html == null) {
					// Sanitizer unavailable: plain-text fallback via textContent (never raw HTML).
					const pre = el("pre", "pm-plain-diff");
					pre.textContent = String(hunk.patch || "");
					diffHost.appendChild(pre);
					return;
				}
				const shadow = diffHost.attachShadow ? diffHost.attachShadow({ mode: "open" }) : diffHost;
				shadow.innerHTML = html;
			}).catch((err) => {
				if (state.renderToken !== token || !diffHost.isConnected) return;
				diffHost.replaceChildren();
				diffHost.appendChild(el("div", "pm-empty", "差异渲染失败：" + String(err && err.message ? err.message : err)));
			});
		}
		return pane;
	}

	/* ----------------------------- shell notes ----------------------------- */
	function buildShellList(shell) {
		const wrap = el("details", "pm-shell");
		const summary = el("summary", "pm-shell-summary", "外部命令（bash）· " + shell.length);
		wrap.appendChild(summary);
		const list = el("ol", "pm-shell-list");
		for (const note of shell) {
			const item = el("li", "pm-shell-item");
			const meta = el("div", "pm-shell-meta");
			meta.appendChild(el("span", "pm-hunk-seq", "#" + esc(note.id || "")));
			const time = el("time", "pm-hunk-time", fmtTime(note.timestamp));
			time.dateTime = String(note.timestamp || "");
			meta.appendChild(time);
			const outcome = note.outcome || (note.isError ? "failed" : "succeeded");
			const labels = { succeeded: "成功", failed: "失败", pending: "待回执" };
			meta.appendChild(el("span", "pm-chip pm-outcome pm-outcome-" + outcome, labels[outcome] || "待回执"));
			item.appendChild(meta);
			const cmd = el("code", "pm-shell-cmd", note.command || "");
			cmd.title = note.command || "";
			item.appendChild(cmd);
			list.appendChild(item);
		}
		wrap.appendChild(list);
		return wrap;
	}

	/* ----------------------------- render ----------------------------- */
	function render(container, reviewData, opts) {
		if (!container) throw new Error("PiMeshReview.render: container is required");
		const data = reviewData || { files: [], tree: { name: "", path: "", dirs: [], files: [] }, stats: null, shell: [] };
		const options = opts || {};
		const theme = options.theme === "dark" ? "dark" : options.theme === "light" ? "light" : currentTheme();

		const state = {
			theme,
			selectedPath: null,
			collapsed: {},
			renderToken: (container.getAttribute("data-pm-token") ? Number(container.getAttribute("data-pm-token")) : 0) + 1,
		};
		const focusedFile = options.focusPath ? findFile(data, options.focusPath) : null;
		const initialFile = focusedFile || (data.files && data.files[0]) || null;
		state.selectedPath = initialFile ? fileKeyOf(initialFile) : null;
		container.setAttribute("data-pm-token", String(state.renderToken));
		if (container._pmAbort) container._pmAbort.abort();
		const abort = new AbortController();
		container._pmAbort = abort;

		const root = el("div", "pm-review");
		root.setAttribute("data-theme", theme);

		/* toolbar */
		const toolbar = el("div", "pm-review-toolbar");
		toolbar.appendChild(el("span", "pm-review-title", "文件变更评审"));
		const stats = data.stats || {};
		const chips = el("span", "pm-review-stats");
		chips.appendChild(el("span", "pm-chip pm-stat", (stats.files || 0) + " 文件"));
		// Zero values are noise (review spec: hide zeros, color only on +/−).
		if (stats.additions) chips.appendChild(el("span", "pm-chip pm-stat pm-add", "+" + stats.additions));
		if (stats.deletions) chips.appendChild(el("span", "pm-chip pm-stat pm-del", "−" + stats.deletions));
		if (stats.successfulToolCalls) chips.appendChild(el("span", "pm-chip pm-stat pm-outcome-succeeded", "成功 " + stats.successfulToolCalls));
		if (stats.failedToolCalls) chips.appendChild(el("span", "pm-chip pm-stat pm-outcome-failed", "失败 " + stats.failedToolCalls));
		if (stats.pendingToolCalls) chips.appendChild(el("span", "pm-chip pm-stat pm-outcome-pending", "待回执 " + stats.pendingToolCalls));
		if (stats.shell) chips.appendChild(el("span", "pm-chip pm-stat", "外部命令 " + stats.shell));
		toolbar.appendChild(chips);
		toolbar.appendChild(el("span", "pm-review-note", "增删仅统计成功操作片段，不代表磁盘最终净差异"));
		root.appendChild(toolbar);

		/* body: tree + diff */
		const body = el("div", "pm-review-body");
		const treePane = el("div", "pm-tree");
		treePane.setAttribute("role", "tree");
		treePane.setAttribute("aria-label", "变更文件树");
		body.appendChild(treePane);
		const diffWrap = el("div", "pm-diff");
		body.appendChild(diffWrap);
		root.appendChild(body);

		if (!data.files || data.files.length === 0) {
			treePane.appendChild(el("div", "pm-empty", "本会话没有文件变更"));
			diffWrap.appendChild(el("div", "pm-empty", "没有可评审的差异"));
		} else {
			treePane.appendChild(buildTreeDom(data.tree, state));
			diffWrap.appendChild(buildDiffPane(findFile(data, state.selectedPath), state));
		}

		if (data.shell && data.shell.length > 0) root.appendChild(buildShellList(data.shell));

		container.replaceChildren(root);
		if (state.selectedPath) {
			const initialRow = Array.from(treePane.querySelectorAll('[role="treeitem"][data-kind="file"]'))
				.find((row) => row.getAttribute("data-path") === state.selectedPath);
			if (initialRow) {
				initialRow.tabIndex = 0;
				if (options.focusPath && initialRow.scrollIntoView) initialRow.scrollIntoView({ block: "nearest" });
			}
		}
		if (focusedFile && typeof options.onSelectFile === "function") options.onSelectFile(focusedFile);

		/* ------------------------- interaction ------------------------- */
		function selectPath(path, focusRow) {
			if (!path) return;
			state.selectedPath = path;
			const selectedFile = findFile(data, path);
			if (selectedFile && typeof options.onSelectFile === "function") options.onSelectFile(selectedFile);
			state.renderToken += 1;
			container.setAttribute("data-pm-token", String(state.renderToken));
			const rows = treePane.querySelectorAll('[role="treeitem"][data-kind="file"]');
			for (const row of rows) {
				const selected = row.getAttribute("data-path") === path;
				row.setAttribute("aria-selected", selected ? "true" : "false");
				row.classList.toggle("pm-selected", selected);
				row.tabIndex = selected ? 0 : -1;
				if (selected && focusRow) row.focus();
			}
			diffWrap.replaceChildren(buildDiffPane(findFile(data, path), state));
		}

		function toggleDir(row, forceOpen) {
			const path = row.getAttribute("data-path");
			const group = row.nextElementSibling;
			const isCollapsed = row.getAttribute("aria-expanded") === "false";
			const open = forceOpen != null ? forceOpen : isCollapsed;
			row.setAttribute("aria-expanded", open ? "true" : "false");
			if (group) group.hidden = !open;
			if (open) delete state.collapsed[path];
			else state.collapsed[path] = true;
			const twisty = row.querySelector(".pm-twisty");
			if (twisty) twisty.textContent = open ? "▾" : "▸";
		}

		container.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const dirRow = target.closest('.pm-tree-row[data-kind="dir"]');
			if (dirRow && treePane.contains(dirRow)) {
				toggleDir(dirRow);
				return;
			}
			const fileRow = target.closest('.pm-tree-row[data-kind="file"]');
			if (fileRow && treePane.contains(fileRow)) {
				selectPath(fileRow.getAttribute("data-path"), true);
			}
		}, { signal: abort.signal });

		container.addEventListener("keydown", (event) => {
			const rows = visibleRows(treePane);
			if (rows.length === 0) return;
			const active = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[role="treeitem"]') : null;
			const idx = active ? rows.indexOf(active) : rows.findIndex((r) => r.getAttribute("data-path") === state.selectedPath && r.getAttribute("data-kind") === "file");
			const cur = idx >= 0 ? rows[idx] : rows[0];
			const focusRow = (row) => {
				for (const r of rows) r.tabIndex = -1;
				row.tabIndex = 0;
				row.focus();
			};
			switch (event.key) {
				case "ArrowDown": {
					event.preventDefault();
					focusRow(rows[Math.min(rows.length - 1, (idx >= 0 ? idx : 0) + 1)]);
					break;
				}
				case "ArrowUp": {
					event.preventDefault();
					focusRow(rows[Math.max(0, (idx >= 0 ? idx : 0) - 1)]);
					break;
				}
				case "Home": {
					event.preventDefault();
					focusRow(rows[0]);
					break;
				}
				case "End": {
					event.preventDefault();
					focusRow(rows[rows.length - 1]);
					break;
				}
				case "ArrowRight": {
					if (cur && cur.getAttribute("data-kind") === "dir" && cur.getAttribute("aria-expanded") === "false") {
						event.preventDefault();
						toggleDir(cur, true);
					}
					break;
				}
				case "ArrowLeft": {
					if (cur && cur.getAttribute("data-kind") === "dir" && cur.getAttribute("aria-expanded") === "true") {
						event.preventDefault();
						toggleDir(cur, false);
					}
					break;
				}
				case "Enter":
				case " ": {
					if (cur && cur.getAttribute("data-kind") === "file") {
						event.preventDefault();
						selectPath(cur.getAttribute("data-path"), true);
					} else if (cur && cur.getAttribute("data-kind") === "dir") {
						event.preventDefault();
						toggleDir(cur);
					}
					break;
				}
				default:
					break;
			}
		}, { signal: abort.signal });

		// roving tabindex on the first visible row
		const initial = visibleRows(treePane)[0];
		if (initial) initial.tabIndex = 0;
	}

	function fileKeyOf(file) {
		return String(file && (file.fileKey || file.canonicalPath || file.path) || "");
	}

	function findFile(data, path) {
		if (!data.files) return null;
		const needle = String(path || "");
		if (!needle) return null;
		for (const file of data.files) {
			if (fileKeyOf(file) === needle || String(file.canonicalPath || "") === needle) return file;
		}
		const slashNeedle = needle.replace(/\\/g, "/");
		for (const file of data.files) {
			const aliases = Array.isArray(file.sourcePaths) ? file.sourcePaths : [];
			if (aliases.some((alias) => String(alias) === needle || String(alias).replace(/\\/g, "/") === slashNeedle)) return file;
		}
		for (const file of data.files) {
			if (String(file.displayPath || file.path || "") === needle) return file;
		}
		return null;
	}

	/* ----------------------------- open (fetch + render) ----------------------------- */
	function showNotice(container, className, text) {
		const root = el("div", "pm-review");
		root.appendChild(el("div", className, text));
		container.replaceChildren(root);
	}

	async function open(container, opts) {
		if (!container) throw new Error("PiMeshReview.open: container is required");
		const options = opts || {};
		const sessionId = options.sessionId;
		const baseUrl = String(options.baseUrl || "").replace(/\/+$/, "");
		const theme = options.theme === "dark" || options.theme === "light" ? options.theme : currentTheme();
		showNotice(container, "pm-empty", "加载变更评审…");
		if (!sessionId) {
			showNotice(container, "pm-error-block", "缺少 sessionId");
			return;
		}
		try {
			const res = await fetch(baseUrl + "/api/peers/" + encodeURIComponent(sessionId) + "/review");
			let payload = null;
			try {
				payload = await res.json();
			} catch (_) {
				payload = null;
			}
			if (!res.ok || !payload || payload.ok !== true) {
				const message = (payload && payload.error) || "HTTP " + res.status;
				showNotice(container, "pm-error-block", "评审加载失败：" + String(message));
				return;
			}
			render(container, payload.data, {
				theme,
				focusPath: options.focusPath,
				onSelectFile: options.onSelectFile,
			});
		} catch (err) {
			showNotice(container, "pm-error-block", "评审加载失败：" + String(err && err.message ? err.message : err));
		}
	}

	window.PiMeshReview = { render, open };
})();
