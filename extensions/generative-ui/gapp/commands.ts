// ── /gapp Command ─────────────────────────────────────────────────────────
// TUI pattern mirrors /widgets (ctx.ui.custom + string[] render).
// Lifecycle: open / close / enable / disable / archive. Tab: all|project|global.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { resolve as resolvePath, basename } from "node:path";
import {
  listGapps,
  resolveGappRef,
  setGappStatus,
  gappProjectRoot,
  touchGappProject,
  type GappMeta,
} from "./storage.js";
import { closeGappWindow, getOpenGappWindow, openGappBundle, GappOpenError } from "./open.js";
import { runPiGappTuiApp } from "./tui-pi.js";

type ScopeFilter = "all" | "project" | "global";
type AppAction = "open" | "close" | "enable" | "disable" | "archive" | "unarchive";

const LIST_ROWS = 12;
const ACTION_ROWS = 8;

function sessionCwd(ctx: any): string {
  for (const c of [ctx?.cwd, process.cwd(), process.env.PWD]) {
    if (typeof c === "string" && c.trim()) {
      try {
        return resolvePath(c.trim());
      } catch {
        return c.trim();
      }
    }
  }
  return process.cwd();
}

function formatTextList(apps: GappMeta[]): string {
  if (apps.length === 0) return "No GAPPs.";
  return apps
    .map((m, i) => {
      const flags = [m.enabled ? "on" : "off", m.archived ? "archived" : null, m.scope]
        .filter(Boolean)
        .join(",");
      const proj = m.cwd ? basename(m.cwd) : m.scope;
      return `${i + 1}. ${m.id} — ${m.name} [${flags}] · ${proj}`;
    })
    .join("\n");
}

async function loadApps(cwd: string, includeArchived: boolean): Promise<GappMeta[]> {
  void touchGappProject(cwd, basename(cwd)).catch(() => {});
  return listGapps({ cwd, includeArchived, includeDisabled: true });
}

function filterByScope(apps: GappMeta[], scope: ScopeFilter, session: string): GappMeta[] {
  if (scope === "all") return apps;
  if (scope === "global") return apps.filter((a) => a.scope === "global");
  // project = apps belonging to this session project (cwd match), or project-scope with no cwd
  return apps.filter(
    (a) => a.scope === "project" && (!a.cwd || a.cwd === session),
  );
}

/** Stable scroll: no windowing when n <= LIST_ROWS (fixes 2-item “first vanishes”). */
function windowRange(count: number, selected: number, rows: number): { start: number; end: number } {
  if (count <= rows) return { start: 0, end: count };
  const maxStart = count - rows;
  const start = Math.min(maxStart, Math.max(0, selected - Math.floor(rows / 2)));
  return { start, end: start + rows };
}

async function openByRef(
  ref: string,
  ctx: any,
  activeWindows: any[],
  opts?: { includeArchived?: boolean },
): Promise<void> {
  const cwd = sessionCwd(ctx);
  const bundle = await resolveGappRef(ref, {
    cwd,
    includeArchived: opts?.includeArchived ?? true,
  });
  if (!bundle) {
    const apps = await loadApps(cwd, true);
    ctx.ui.notify(
      [
        `GAPP not found: ${ref}`,
        `session=${cwd}`,
        `gappRoot=${gappProjectRoot(cwd)}`,
        `listed=${apps.map((a) => a.id).join(", ") || "(none)"}`,
      ].join("\n"),
      "error",
    );
    return;
  }
  const appCwd = bundle.meta.cwd || cwd;
  if (bundle.meta.archived) {
    ctx.ui.notify(`已归档: ${bundle.meta.id} — 先 unarchive`, "warning");
    return;
  }
  if (!bundle.meta.enabled) {
    await setGappStatus(bundle.meta.id, { enabled: true, archived: false }, {
      scope: bundle.meta.scope,
      cwd: appCwd,
    });
  }
  try {
    await openGappBundle(bundle, activeWindows, appCwd);
  } catch (e) {
    if (e instanceof GappOpenError) {
      ctx.ui.notify(e.message, "warning");
      return;
    }
    throw e;
  }
  void touchGappProject(appCwd, basename(appCwd)).catch(() => {});
  ctx.ui.notify(`Opened ${bundle.meta.id}`, "success");
}

async function applyAction(
  action: AppAction,
  app: GappMeta,
  ctx: any,
  activeWindows: any[],
): Promise<"exit" | "stay"> {
  const cwd = sessionCwd(ctx);
  const appCwd = app.cwd || cwd;
  try {
    if (action === "open") {
      await openByRef(app.id, ctx, activeWindows, { includeArchived: true });
      return "exit";
    }
    if (action === "close") {
      const ok = closeGappWindow(app.id);
      ctx.ui.notify(ok ? `Closed: ${app.id}` : `无窗口: ${app.id}`, ok ? "success" : "info");
      return "stay";
    }
    if (action === "enable" || action === "unarchive") {
      const meta = await setGappStatus(
        app.id,
        { enabled: true, archived: false },
        { scope: app.scope, cwd: appCwd },
      );
      ctx.ui.notify(`${meta.id}: 已上线`, "success");
      return "stay";
    }
    if (action === "disable") {
      closeGappWindow(app.id);
      const meta = await setGappStatus(app.id, { enabled: false }, { scope: app.scope, cwd: appCwd });
      ctx.ui.notify(`${meta.id}: 已下线`, "success");
      return "stay";
    }
    if (action === "archive") {
      closeGappWindow(app.id);
      const meta = await setGappStatus(
        app.id,
        { archived: true, enabled: false },
        { scope: app.scope, cwd: appCwd },
      );
      ctx.ui.notify(`${meta.id}: 已归档`, "success");
      return "stay";
    }
  } catch (e) {
    ctx.ui.notify(e instanceof Error ? e.message : String(e), "error");
  }
  return "stay";
}

function actionItems(app: GappMeta): { value: AppAction; label: string }[] {
  const isOpen = Boolean(getOpenGappWindow(app.id));
  if (app.archived) {
    return [{ value: "unarchive", label: "取消归档并上线 (enable)" }];
  }
  const items: { value: AppAction; label: string }[] = [
    { value: "open", label: isOpen ? "重新打开窗口" : "打开" },
  ];
  if (isOpen) items.push({ value: "close", label: "关闭窗口" });
  if (app.enabled) items.push({ value: "disable", label: "下线 (disable)" });
  else items.push({ value: "enable", label: "上线 (enable)" });
  items.push({ value: "archive", label: "归档 (archive)" });
  return items;
}

/** Step 2 — action menu (same shape as /widgets action picker). */
async function pickAction(ctx: any, app: GappMeta): Promise<AppAction | null> {
  const actions = actionItems(app);
  return ctx.ui.custom<AppAction | null>((tui, theme, _kb, done) => {
    let selectedIndex = 0;
    let cached: string[] | undefined;
    const refresh = () => {
      cached = undefined;
      tui.requestRender();
    };

    return {
      render(width: number) {
        if (cached) return cached;
        const lines: string[] = [];
        const add = (text: string) => lines.push(truncateToWidth(text, width));

        add(theme.fg("accent", theme.bold("  " + app.name)));
        const st = app.archived ? "arch" : app.enabled ? "on" : "off";
        const win = getOpenGappWindow(app.id) ? " · window open" : "";
        add(theme.fg("dim", `  ${app.id}  [${st}]  ${app.scope}${win}`));
        if (app.cwd) add(theme.fg("dim", `  ${app.cwd}`));
        add(theme.fg("border", "─".repeat(Math.max(8, width))));
        add("");

        for (let i = 0; i < actions.length; i++) {
          const sel = i === selectedIndex;
          const prefix = sel ? theme.fg("accent", " ▸ ") : "   ";
          const label = sel
            ? theme.fg("accent", theme.bold(actions[i].label))
            : theme.fg("text", actions[i].label);
          add(prefix + label);
        }
        for (let p = actions.length; p < ACTION_ROWS; p++) add("");

        add(theme.fg("dim", "  ↑↓  Enter  Esc:返回列表"));
        cached = lines;
        return lines;
      },
      invalidate() {
        cached = undefined;
      },
      handleInput(data: string) {
        if (matchesKey(data, Key.up)) {
          if (selectedIndex > 0) selectedIndex--;
          refresh();
          return;
        }
        if (matchesKey(data, Key.down)) {
          if (selectedIndex < actions.length - 1) selectedIndex++;
          refresh();
          return;
        }
        if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
          done(actions[selectedIndex]?.value ?? null);
          return;
        }
        if (matchesKey(data, Key.escape)) {
          done(null);
        }
      },
    };
  });
}

/**
 * Full manager TUI (widgets-style).
 * Tab: all ↔ project ↔ global
 * Enter: action menu (open/close/enable/disable/archive)
 * Hotkeys on list: o open · c close · e enable · d disable · a archive
 */
async function pickAndAct(
  ctx: any,
  activeWindows: any[],
  includeArchived: boolean,
): Promise<void> {
  const cwd = sessionCwd(ctx);
  const root = gappProjectRoot(cwd);

  if (!ctx.hasUI) {
    const apps = await loadApps(cwd, includeArchived);
    ctx.ui.notify(
      [
        formatTextList(apps),
        "",
        `session=${cwd}`,
        `gappRoot=${root}`,
        "TUI 需要交互模式；或 /gapp open <n|id>",
      ].join("\n"),
      "info",
    );
    return;
  }

  // Outer loop: reload after lifecycle changes
  for (;;) {
    const allApps = await loadApps(cwd, includeArchived);
    if (allApps.length === 0) {
      ctx.ui.notify(
        [
          "无 GAPP",
          `session=${cwd}`,
          `gappRoot=${root}`,
          "期望: <project>/.pi/gapp/<id>/{meta,state,index}",
        ].join("\n"),
        "warning",
      );
      return;
    }

    type ListResult =
      | { kind: "select"; id: string }
      | { kind: "hot"; action: AppAction; id: string }
      | { kind: "quit" };

    const result = await ctx.ui.custom<ListResult>((tui, theme, _kb, done) => {
      let selectedIndex = 0;
      // Default ALL — never hide project apps behind empty global tab
      let scope: ScopeFilter = "all";
      let cached: string[] | undefined;
      const refresh = () => {
        cached = undefined;
        tui.requestRender();
      };

      function filtered(): GappMeta[] {
        return filterByScope(allApps, scope, cwd);
      }

      function clamp() {
        const len = filtered().length;
        if (len === 0) selectedIndex = 0;
        else selectedIndex = Math.max(0, Math.min(selectedIndex, len - 1));
      }

      function cycleScope() {
        scope = scope === "all" ? "project" : scope === "project" ? "global" : "all";
        selectedIndex = 0;
        refresh();
      }

      return {
        render(width: number) {
          if (cached) return cached;
          clamp();
          const lines: string[] = [];
          const add = (text: string) => lines.push(truncateToWidth(text, width));

          const mark = (s: ScopeFilter, label: string) =>
            scope === s
              ? theme.fg("accent", ` ● ${label} `)
              : theme.fg("dim", ` ○ ${label} `);
          const items = filtered();
          add(
            mark("all", "all") +
              mark("project", "project") +
              mark("global", "global") +
              theme.fg("muted", `  ${items.length}/${allApps.length}`),
          );
          add(theme.fg("dim", `  ${root}`));
          add(theme.fg("border", "─".repeat(Math.max(8, width))));
          add("");

          if (items.length === 0) {
            add(theme.fg("warning", "  此 scope 无 GAPP"));
            add(theme.fg("dim", "  Tab 切换 all / project / global"));
            for (let p = 2; p < LIST_ROWS; p++) add("");
          } else {
            const { start, end } = windowRange(items.length, selectedIndex, LIST_ROWS);
            for (let i = start; i < end; i++) {
              const m = items[i];
              const listIdx = allApps.indexOf(m) + 1;
              const sel = i === selectedIndex;
              const prefix = sel ? theme.fg("accent", " ▸ ") : "   ";
              const idx = theme.fg("dim", String(listIdx).padStart(2, " ") + ". ");
              const name = sel
                ? theme.fg("accent", theme.bold(m.name))
                : theme.fg("text", m.name);
              const id = theme.fg("dim", ` ${m.id}`);
              const badge = m.archived
                ? theme.fg("warning", " arch")
                : m.enabled
                  ? theme.fg("success", " on")
                  : theme.fg("muted", " off");
              const win = getOpenGappWindow(m.id)
                ? theme.fg("accent", " ●")
                : "";
              const proj =
                m.scope === "project" && m.cwd
                  ? theme.fg("dim", ` · ${basename(m.cwd)}`)
                  : theme.fg("dim", ` ${m.scope}`);
              add(prefix + idx + name + id + badge + win + proj);
            }
            for (let p = end - start; p < LIST_ROWS; p++) add("");
            if (items.length > LIST_ROWS) {
              add(theme.fg("dim", `  ${start + 1}–${end} / ${items.length}`));
            }
          }

          add("");
          add(
            theme.fg(
              "dim",
              "  Tab:scope  ↑↓  Enter:菜单  o开 c关 e上线 d下线 a归档  Esc",
            ),
          );
          cached = lines;
          return lines;
        },
        invalidate() {
          cached = undefined;
        },
        handleInput(data: string) {
          const items = filtered();

          if (matchesKey(data, Key.tab)) {
            cycleScope();
            return;
          }
          if (matchesKey(data, Key.up)) {
            if (selectedIndex > 0) selectedIndex--;
            refresh();
            return;
          }
          if (matchesKey(data, Key.down)) {
            if (selectedIndex < items.length - 1) selectedIndex++;
            refresh();
            return;
          }
          if (matchesKey(data, Key.escape)) {
            done({ kind: "quit" });
            return;
          }

          const cur = items[selectedIndex];
          if (!cur) return;

          if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
            done({ kind: "select", id: cur.id });
            return;
          }

          const hot: Record<string, AppAction> = {
            o: "open",
            O: "open",
            c: "close",
            C: "close",
            e: "enable",
            E: "enable",
            d: "disable",
            D: "disable",
            a: "archive",
            A: "archive",
          };
          if (hot[data]) {
            done({ kind: "hot", action: hot[data], id: cur.id });
          }
        },
      };
    });

    if (!result || result.kind === "quit") return;

    const app = allApps.find((a) => a.id === result.id);
    if (!app) continue;

    if (result.kind === "hot") {
      // archive hotkey on already-archived → unarchive
      let action = result.action;
      if (action === "enable" && app.archived) action = "unarchive";
      if (action === "archive" && app.archived) action = "unarchive";
      const next = await applyAction(action, app, ctx, activeWindows);
      if (next === "exit") return;
      continue;
    }

    // Enter → action menu
    const action = await pickAction(ctx, app);
    if (!action) continue; // back to list
    const next = await applyAction(action, app, ctx, activeWindows);
    if (next === "exit") return;
  }
}

export function registerGappCommand(pi: ExtensionAPI, activeWindows: any[]) {
  pi.registerCommand("gapp", {
    description: "Glimpse-APP: lifecycle list plus shared gapp-tui control center",
    getArgumentCompletions: (prefix: string) => {
      const items = [
        { value: "list", label: "TUI 列表（Tab scope · Enter 菜单）" },
        { value: "list --text", label: "纯文本列表" },
        { value: "tui ", label: "渲染 TUI 应用（可选 app id）" },
        { value: "open ", label: "open <序号|id>" },
        { value: "enable ", label: "上线" },
        { value: "disable ", label: "下线" },
        { value: "archive ", label: "归档" },
        { value: "state ", label: "state.json" },
        { value: "generate ", label: "生成" },
      ];
      return items.filter(
        (i) =>
          i.value.startsWith(prefix) ||
          i.label.toLowerCase().includes(prefix.toLowerCase()),
      );
    },
    handler: async (args: string, ctx) => {
      const cwd = sessionCwd(ctx);
      const raw = (args ?? "").trim();
      const parts = raw.split(/\s+/).filter(Boolean);
      const cmd = parts[0] || "";
      const rest = parts.slice(1);
      const ref = rest[0] || "";

      // bare /gapp → full TUI
      if (!raw) {
        await pickAndAct(ctx, activeWindows, true);
        return;
      }

      if (cmd === "help") {
        ctx.ui.notify(
          [
            "/gapp                  完整 TUI",
            "/gapp list             同上",
            "/gapp list --text      纯文本 + 路径",
            "/gapp tui [n|id]       用 GAPP 自己的 tui.mjs 渲染应用",
            "/gapp-tui [n|id]       同一 TUI APP 渲染入口",
            "/gapp open <n|id>",
            "/gapp enable|disable|archive <n|id>",
            "/gapp state <n|id>",
            "/gapp generate <描述>",
            "TUI: Tab=all/project/global  Enter=菜单  o/c/e/d/a 快捷键",
            `session=${cwd}`,
            `gappRoot=${gappProjectRoot(cwd)}`,
          ].join("\n"),
          "info",
        );
        return;
      }

      if (cmd === "tui") {
        await runPiGappTuiApp(ctx, activeWindows, ref || undefined);
        return;
      }

      if (cmd === "list") {
        if (rest.includes("--text") || rest.includes("-t") || !ctx.hasUI) {
          const apps = await loadApps(cwd, true);
          ctx.ui.notify(
            [
              formatTextList(apps),
              "",
              `session=${cwd}`,
              `gappRoot=${gappProjectRoot(cwd)}`,
              `count=${apps.length}`,
            ].join("\n"),
            "info",
          );
          return;
        }
        await pickAndAct(ctx, activeWindows, true);
        return;
      }

      if (cmd === "generate") {
        const desc = rest.join(" ").trim();
        if (!desc) {
          ctx.ui.notify("Usage: /gapp generate <description>", "warning");
          return;
        }
        ctx.sendUserMessage(
          `请创建一个 Glimpse-APP：${desc}\n\n要求：使用 gapp_upsert 写入（index.html + state.json + meta），scope 默认 project，enabled=true，完成后 gapp_open 打开。状态走 GappStore / state.json。它运行在原生窗口 WebView 中：使用 --gapp-system-accent / --gapp-font-sans、语义 HTML 和键盘操作；不要伪造标题栏或系统控件，不用 web toast / 模态遮罩、cursor:pointer、平滑滚动或装饰性动画。`,
        );
        return;
      }

      if (cmd === "open") {
        if (!ref) {
          await pickAndAct(ctx, activeWindows, true);
          return;
        }
        await openByRef(ref, ctx, activeWindows);
        return;
      }

      if (cmd === "state") {
        if (!ref) {
          ctx.ui.notify("Usage: /gapp state <n|id>", "warning");
          return;
        }
        const bundle = await resolveGappRef(ref, { cwd, includeArchived: true });
        if (!bundle) {
          ctx.ui.notify(`not found: ${ref}`, "error");
          return;
        }
        ctx.ui.notify(JSON.stringify(bundle.state, null, 2), "info");
        return;
      }

      if (cmd === "enable" || cmd === "disable" || cmd === "archive") {
        if (!ref) {
          ctx.ui.notify(`Usage: /gapp ${cmd} <n|id>`, "warning");
          return;
        }
        const bundle = await resolveGappRef(ref, { cwd, includeArchived: true });
        if (!bundle) {
          ctx.ui.notify(`not found: ${ref}`, "error");
          return;
        }
        await applyAction(cmd, bundle.meta, ctx, activeWindows);
        return;
      }

      // /gapp 1  or /gapp kanban-08
      await openByRef(raw, ctx, activeWindows);
    },
  });

  pi.registerCommand("gapp-tui", {
    description: "Render a GAPP through its tui.mjs application component",
    handler: async (args: string, ctx) => {
      await runPiGappTuiApp(ctx, activeWindows, (args ?? "").trim() || undefined);
    },
  });
}
