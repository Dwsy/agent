import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@earendil-works/pi-tui";
import {
  GappValidationError,
  listGapps,
  listOnlineGapps,
  loadGappBundle,
  loadGappState,
  resolveGapp,
  resolveGappRef,
  setGappState,
  setGappStatus,
  upsertGapp,
  type GappScope,
} from "./storage.js";
import { openGappBundle, GappOpenError, notifyLiveState } from "./open.js";
import { detectDarkMode } from "../html-helpers.js";
import {
  getLiveApp,
  getMergedTools,
  listLiveApps,
} from "./registry.js";
import { loadGappToolsFromDir, loadGappToolsFile } from "./storage.js";
import { invokeGappTool } from "./service.js";
import { createPiGappRuntimeAdapter } from "./runtime-pi.js";

export interface GappToolContext {
  activeWindows: any[];
}

function okText(text: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function scopeOf(v: unknown): GappScope | undefined {
  return v === "global" ? "global" : v === "project" ? "project" : undefined;
}

/** Record run + project touch via portable gapp-sdk (non-fatal if missing). */
async function recordGappRun(
  id: string,
  opts: { scope?: GappScope; cwd: string; source: string },
) {
  try {
    const { pathToFileURL } = await import("node:url");
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const entry = join(homedir(), "Dev/AI/glimpse/gapp-sdk/src/index.mjs");
    if (!existsSync(entry)) return;
    const sdk = await import(pathToFileURL(entry).href);
    if (sdk.recordRun) {
      await sdk.recordRun(id, { scope: opts.scope, cwd: opts.cwd, source: opts.source });
    }
    if (opts.scope !== "global" && sdk.touchProject) {
      await sdk.touchProject(opts.cwd, { name: opts.cwd.split("/").pop() });
    }
  } catch {
    // ignore
  }
}

export function registerGappTools(pi: ExtensionAPI, ctx: GappToolContext) {
  pi.registerTool({
    name: "gapp_upsert",
    label: "Upsert GAPP",
    description:
      "Create or update a Glimpse-APP when the user requests a temporary interactive UI or the active task explicitly requires one. Writes meta.json + state.json + index.html under .pi/gapp/<id>/ (project) or ~/.pi/gapp/<id>/ (global).",
    promptSnippet: "Create/update a requested temporary interactive GAPP (html + state.json + meta).",
    promptGuidelines: [
      "When a temporary board/todo UI is requested, use gapp_upsert instead of chat-only HTML.",
      "state.json is SSOT. After create, domain actions: gapp_list_tools → gapp_call (not bulk set_state).",
      "Default scope=project, instances=single. Prefer tools.json / registerTools for progressive gapp_call.",
      "GAPP is a native-window WebView: use --gapp-system-accent / --gapp-font-sans, keyboard-first semantics, native scrolling, and no fake title bars, web toasts, or cursor:pointer.",
    ],
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Stable id [a-z0-9_-]. Derived from name if omitted." })),
      name: Type.String({ description: "Display name" }),
      description: Type.Optional(Type.String({ description: "One-line description" })),
      scope: Type.Optional(Type.Union([Type.Literal("project"), Type.Literal("global")])),
      enabled: Type.Optional(Type.Boolean({ description: "Default true" })),
      width: Type.Optional(Type.Number()),
      height: Type.Optional(Type.Number()),
      instances: Type.Optional(
        Type.Union([Type.Literal("single"), Type.Literal("multi")], {
          description:
            "single (default): one live window across sessions (todo/strong-state). multi: allow concurrent opens.",
        }),
      ),
      state: Type.Optional(Type.Unknown({ description: "Initial/full state object written to state.json" })),
      html: Type.String({
        description:
          "Full HTML document or body fragment. Runtime injects window.GappStore and __GAPP_STATE__.",
      }),
      open: Type.Optional(Type.Boolean({ description: "Open in Glimpse after save. Default true." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd || process.cwd();
        const bundle = await upsertGapp({
          id: params.id,
          name: params.name,
          description: params.description,
          scope: scopeOf(params.scope),
          enabled: params.enabled,
          width: params.width,
          height: params.height,
          instances: params.instances === "multi" ? "multi" : params.instances === "single" ? "single" : undefined,
          state: params.state,
          html: params.html,
          cwd,
        });

        const shouldOpen = params.open !== false;
        if (shouldOpen) {
          void detectDarkMode();
          try {
            await openGappBundle(bundle, ctx.activeWindows, cwd);
          } catch (e) {
            if (e instanceof GappOpenError && e.code === "already_connected") {
              return okText(
                `GAPP "${bundle.meta.id}" saved but not opened:\n${e.message}`,
                { id: bundle.meta.id, scope: bundle.meta.scope, dir: bundle.dir, opened: false, error: e.code },
              );
            }
            throw e;
          }
          void recordGappRun(bundle.meta.id, {
            scope: bundle.meta.scope,
            cwd,
            source: "pi-gapp_upsert",
          });
        }

        return okText(
          `GAPP "${bundle.meta.id}" saved (${bundle.meta.scope}, enabled=${bundle.meta.enabled}, instances=${bundle.meta.instances || "single"}) → ${bundle.dir}` +
            (shouldOpen ? " and opened." : ".") +
            ` Use /gapp open ${bundle.meta.id}  or /gapp open 1`,
          {
            id: bundle.meta.id,
            scope: bundle.meta.scope,
            dir: bundle.dir,
            meta: bundle.meta,
            opened: shouldOpen,
          },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(msg);
      }
    },
    renderCall(args: any, theme: any) {
      return new Text(
        theme.fg("toolTitle", theme.bold("gapp_upsert ")) + theme.fg("accent", args?.name || args?.id || ""),
        0,
        0,
      );
    },
    renderResult(result: any, { isPartial }: any, theme: any) {
      if (isPartial) return new Text(theme.fg("warning", "saving…"), 0, 0);
      const id = result?.details?.id ?? "";
      return new Text(theme.fg("success", "✓ ") + theme.fg("accent", id), 0, 0);
    },
  });

  pi.registerTool({
    name: "gapp_list",
    label: "List GAPPs",
    description: "List Glimpse-APPs (project + global). Online = enabled && !archived. Indices work with /gapp open N and gapp_call id.",
    promptSnippet: "List GAPPs; use returned index or id for open/call.",
    parameters: Type.Object({
      includeArchived: Type.Optional(Type.Boolean()),
      includeDisabled: Type.Optional(Type.Boolean()),
      onlineOnly: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd || process.cwd();
      const apps = params.onlineOnly
        ? await listOnlineGapps(cwd)
        : await listGapps({
            cwd,
            includeArchived: params.includeArchived === true,
            includeDisabled: params.includeDisabled !== false,
          });
      if (apps.length === 0) return okText("No GAPPs found.");
      const lines = apps.map((m, i) => {
        const flags = [
          m.enabled ? "on" : "off",
          m.archived ? "archived" : null,
          m.scope,
        ]
          .filter(Boolean)
          .join(",");
        return `${i + 1}. ${m.id} — ${m.name} [${flags}] ${m.description || ""}`.trim();
      });
      return okText(lines.join("\n") + "\n\nOpen: /gapp open <n|id>", { apps });
    },
    renderCall(_a: any, theme: any) {
      return new Text(theme.fg("toolTitle", theme.bold("gapp_list")), 0, 0);
    },
    renderResult(_r: any, { isPartial }: any, theme: any) {
      return new Text(isPartial ? theme.fg("warning", "…") : theme.fg("dim", "done"), 0, 0);
    },
  });

  pi.registerTool({
    name: "gapp_open",
    label: "Open GAPP",
    description: "Open a Glimpse-APP by id or 1-based list index when the user asks to view/interact with it or a requested live tool requires its handler. Single-instance apps refuse if another session already holds the live window.",
    promptSnippet: "Open a GAPP for requested user-visible interaction or a required live handler.",
    parameters: Type.Object({
      id: Type.String({ description: "App id or 1-based index from gapp_list" }),
      scope: Type.Optional(Type.Union([Type.Literal("project"), Type.Literal("global")])),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd || process.cwd();
      let bundle = params.scope
        ? await loadGappBundle(params.scope as GappScope, params.id, cwd)
        : await resolveGappRef(params.id, { cwd });
      // if scope given but id is numeric index, still allow index within that scope list
      if (!bundle && params.scope && /^#?\d+$/.test(params.id.trim())) {
        const apps = (await listGapps({ cwd, includeDisabled: true })).filter(
          (a) => a.scope === params.scope,
        );
        const n = Number(params.id.replace(/^#/, ""));
        const meta = apps[n - 1];
        if (meta) bundle = await loadGappBundle(meta.scope, meta.id, cwd);
      }
      if (!bundle) throw new Error(`GAPP not found: ${params.id}`);
      if (bundle.meta.archived) throw new Error(`GAPP archived: ${bundle.meta.id}. Unarchive first.`);

      void detectDarkMode();
      try {
        await openGappBundle(bundle, ctx.activeWindows, cwd);
      } catch (e) {
        if (e instanceof GappOpenError) throw new Error(e.message);
        throw e;
      }
      void recordGappRun(bundle.meta.id, {
        scope: bundle.meta.scope,
        cwd,
        source: "pi-gapp_open",
      });
      return okText(`Opened ${bundle.meta.id} (${bundle.meta.scope}, instances=${bundle.meta.instances || "single"})`, {
        id: bundle.meta.id,
        scope: bundle.meta.scope,
        dir: bundle.dir,
      });
    },
    renderCall(args: any, theme: any) {
      return new Text(theme.fg("toolTitle", theme.bold("gapp_open ")) + theme.fg("accent", args?.id || ""), 0, 0);
    },
    renderResult(result: any, { isPartial }: any, theme: any) {
      if (isPartial) return new Text(theme.fg("warning", "opening…"), 0, 0);
      return new Text(theme.fg("success", "✓ ") + theme.fg("accent", result?.details?.id || ""), 0, 0);
    },
  });

  pi.registerTool({
    name: "gapp_list_tools",
    label: "List GAPP Tools",
    description:
      "Progressive catalog: list domain tools (tools.json schema + optional tools.mjs/live implementation) for one app or all live. REQUIRED before gapp_call when system only shows app ids.",
    promptSnippet: "Progressive: fetch domain tool catalog for an app before gapp_call.",
    promptGuidelines: [
      "System only lists app ids — ALWAYS gapp_list_tools({ id }) before inventing or calling domain tools.",
      "Then gapp_call with short tool name. Prefer call over gapp_set_state when a tool fits.",
      "After [GAPP event], list_tools / get_state before claiming progress.",
    ],
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "App id or list index; omit for all live apps" })),
      openOnly: Type.Optional(Type.Boolean({ description: "Only apps with live windows. Default false." })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd || process.cwd();
      const lines: string[] = [];
      const details: any[] = [];

      if (params.id) {
        const ref = await resolveGappRef(params.id, { cwd });
        if (!ref) throw new Error(`GAPP not found: ${params.id}`);
        const live = getLiveApp(ref.meta.id);
        const tools = live
          ? getMergedTools(ref.meta.id)
          : await loadGappToolsFromDir(ref.dir);
        const flag = live ? "live" : "disk";
        lines.push(`${ref.meta.id} — ${ref.meta.name} [${flag}]`);
        if (tools.length === 0) lines.push("  (no tools)");
        else for (const t of tools) lines.push(`  - ${t.name}: ${t.description}`);
        details.push({ id: ref.meta.id, live: !!live, tools });
      } else {
        const lives = listLiveApps();
        if (params.openOnly || lives.length > 0) {
          for (const live of lives) {
            const tools = getMergedTools(live.appId);
            lines.push(`${live.appId} [live]`);
            if (tools.length === 0) lines.push("  (no tools)");
            else for (const t of tools) lines.push(`  - ${t.name}: ${t.description}`);
            details.push({ id: live.appId, live: true, tools });
          }
        }
        if (!params.openOnly) {
          const online = await listOnlineGapps(cwd);
          for (const m of online) {
            if (lives.some((l) => l.appId === m.id)) continue;
            const tools = await loadGappToolsFile(m.id, m.cwd || cwd);
            if (tools.length === 0) continue;
            lines.push(`${m.id} [disk]`);
            for (const t of tools) lines.push(`  - ${t.name}: ${t.description}`);
            details.push({ id: m.id, live: false, tools });
          }
        }
        if (lines.length === 0) lines.push("No GAPP tools registered. Apps may call GappHost.registerTools or ship tools.json.");
      }

      lines.push("", "Invoke: gapp_call({ id, tool, arguments })");
      return okText(lines.join("\n"), { apps: details });
    },
    renderCall(args: any, theme: any) {
      return new Text(
        theme.fg("toolTitle", theme.bold("gapp_list_tools ")) + theme.fg("accent", args?.id || "all"),
        0,
        0,
      );
    },
    renderResult(_r: any, { isPartial }: any, theme: any) {
      return new Text(isPartial ? "…" : theme.fg("dim", "tools"), 0, 0);
    },
  });

  pi.registerTool({
    name: "gapp_call",
    label: "Call GAPP Tool",
    description:
      "Invoke a GAPP domain tool (shared tools.mjs, live onToolCall, or legacy disk stateOps). Preferred over gapp_set_state for structured actions. Use short tool name from gapp_list_tools.",
    promptSnippet: "Call domain tool after gapp_list_tools (preferred write path).",
    promptGuidelines: [
      "Only use tool names returned by gapp_list_tools for that app — never invent names.",
      "openIfNeeded defaults true when a live handler is required.",
    ],
    parameters: Type.Object({
      id: Type.String({ description: "App id or 1-based list index" }),
      tool: Type.String({ description: "Short tool name (not gapp__app__tool)" }),
      arguments: Type.Optional(Type.Unknown({ description: "JSON arguments object" })),
      openIfNeeded: Type.Optional(
        Type.Boolean({ description: "Open the app if tool needs live handler. Default true." }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd || process.cwd();
      const args =
        params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      const result = await invokeGappTool(
        {
          ref: params.id,
          tool: params.tool,
          arguments: args,
          openIfNeeded: params.openIfNeeded !== false,
        },
        {
          cwd,
          adapter: createPiGappRuntimeAdapter({ activeWindows: ctx.activeWindows }),
        },
      );
      return okText(JSON.stringify(result.result, null, 2), result);
    },
    renderCall(args: any, theme: any) {
      return new Text(
        theme.fg("toolTitle", theme.bold("gapp_call ")) +
          theme.fg("accent", `${args?.id || ""}.${args?.tool || ""}`),
        0,
        0,
      );
    },
    renderResult(_r: any, { isPartial }: any, theme: any) {
      return new Text(isPartial ? "…" : theme.fg("success", "✓ call"), 0, 0);
    },
  });

  pi.registerTool({
    name: "gapp_get_state",
    label: "Get GAPP State",
    description: "Read state.json (SSOT). Use after events or when no read tool exists.",
    promptSnippet: "Read GAPP state.json (SSOT).",
    parameters: Type.Object({
      id: Type.String(),
      scope: Type.Optional(Type.Union([Type.Literal("project"), Type.Literal("global")])),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd || process.cwd();
      const bundle = await resolveGappRef(params.id, { cwd }) || await resolveGapp(params.id, cwd).catch(() => null);
      if (!bundle) throw new Error(`GAPP not found: ${params.id}`);
      if (params.scope && bundle.meta.scope !== params.scope) {
        const state = await loadGappState(params.scope, params.id, cwd);
        return okText(JSON.stringify(state, null, 2), { id: params.id, scope: params.scope, state });
      }
      return okText(JSON.stringify(bundle.state, null, 2), {
        id: bundle.meta.id,
        scope: bundle.meta.scope,
        state: bundle.state,
      });
    },
    renderCall(args: any, theme: any) {
      return new Text(theme.fg("toolTitle", theme.bold("gapp_get_state ")) + theme.fg("accent", args?.id || ""), 0, 0);
    },
    renderResult(_r: any, { isPartial }: any, theme: any) {
      return new Text(isPartial ? "…" : theme.fg("dim", "state"), 0, 0);
    },
  });

  pi.registerTool({
    name: "gapp_set_state",
    label: "Set GAPP State",
    description:
      "Write state.json. Prefer gapp_call when domain tools exist. Use merge=true for shallow object merge; avoid clobbering unknown keys.",
    promptSnippet: "Write state.json (fallback when no domain tool fits).",
    promptGuidelines: [
      "If gapp_list_tools shows a fitting tool, use gapp_call instead of hand-editing arrays.",
      "Use merge=true for partial updates on object state.",
    ],
    parameters: Type.Object({
      id: Type.String(),
      state: Type.Unknown({ description: "Full state or partial object when merge=true" }),
      merge: Type.Optional(Type.Boolean({ description: "Shallow-merge into existing object state. Default false (replace)." })),
      scope: Type.Optional(Type.Union([Type.Literal("project"), Type.Literal("global")])),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      try {
        const cwd = ctx.cwd || process.cwd();
        const ref = await resolveGappRef(params.id, { cwd });
        const id = ref?.meta.id ?? params.id;
        const result = await setGappState(id, params.state, {
          scope: scopeOf(params.scope) ?? ref?.meta.scope,
          cwd,
          merge: params.merge === true,
        });
        notifyLiveState(result.meta.id, result.state);
        return okText(
          `State updated for ${result.meta.id}`,
          { id: result.meta.id, scope: result.meta.scope, state: result.state, dir: result.dir },
        );
      } catch (e) {
        throw new Error(e instanceof GappValidationError ? e.message : String(e));
      }
    },
    renderCall(args: any, theme: any) {
      return new Text(theme.fg("toolTitle", theme.bold("gapp_set_state ")) + theme.fg("accent", args?.id || ""), 0, 0);
    },
    renderResult(_r: any, { isPartial }: any, theme: any) {
      return new Text(isPartial ? "…" : theme.fg("success", "✓ state"), 0, 0);
    },
  });

  pi.registerTool({
    name: "gapp_set_status",
    label: "Set GAPP Status",
    description: "Enable, disable, or archive a Glimpse-APP. This mutates app lifecycle state; use only when the user explicitly requests that status change. Archive sets enabled=false.",
    promptSnippet: "Change GAPP lifecycle status only on explicit user request.",
    parameters: Type.Object({
      id: Type.String(),
      enabled: Type.Optional(Type.Boolean()),
      archived: Type.Optional(Type.Boolean()),
      scope: Type.Optional(Type.Union([Type.Literal("project"), Type.Literal("global")])),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (params.enabled === undefined && params.archived === undefined) {
        throw new Error("Provide enabled and/or archived");
      }
      const cwd = ctx.cwd || process.cwd();
      const ref = await resolveGappRef(params.id, {
        cwd,
        includeArchived: true,
      });
      const id = ref?.meta.id ?? params.id;
      const meta = await setGappStatus(
        id,
        { enabled: params.enabled, archived: params.archived },
        { scope: scopeOf(params.scope) ?? ref?.meta.scope, cwd },
      );
      return okText(
        `${meta.id}: enabled=${meta.enabled} archived=${meta.archived}`,
        { meta },
      );
    },
    renderCall(args: any, theme: any) {
      return new Text(theme.fg("toolTitle", theme.bold("gapp_set_status ")) + theme.fg("accent", args?.id || ""), 0, 0);
    },
    renderResult(result: any, { isPartial }: any, theme: any) {
      if (isPartial) return new Text("…", 0, 0);
      const m = result?.details?.meta;
      return new Text(
        theme.fg("success", "✓ ") +
          theme.fg("accent", m?.id || "") +
          theme.fg("dim", m ? ` on=${m.enabled} arch=${m.archived}` : ""),
        0,
        0,
      );
    },
  });
}
