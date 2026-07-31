import type { GappTool } from "./protocol.js";
import type { GappBundle } from "./storage.js";
import {
  loadGappToolsFromDir,
  resolveGappRef,
  setGappState,
} from "./storage.js";
import { applyStateOps } from "./stateops.js";
import { executeGappToolModule } from "./tool-module.js";

export type GappToolSource = "disk" | "live" | "host";

export interface GappToolEntry {
  tool: GappTool;
  source: GappToolSource;
}

export interface GappToolCatalog {
  bundle: GappBundle;
  live: boolean;
  entries: GappToolEntry[];
}

export interface InvokeGappToolInput {
  ref: string;
  tool: string;
  arguments?: Record<string, unknown>;
  openIfNeeded?: boolean;
}

export interface GappRuntimeAdapter {
  listTools?(bundle: GappBundle, cwd: string): Promise<GappToolEntry[]>;
  invoke?(
    bundle: GappBundle,
    tool: GappTool,
    args: Record<string, unknown>,
    options: { cwd: string; openIfNeeded: boolean },
  ): Promise<{ via: "host" | "live"; result: unknown } | null>;
  onStateChanged?(bundle: GappBundle, state: unknown): void | Promise<void>;
}

export interface InvokeGappToolContext {
  cwd: string;
  adapter?: GappRuntimeAdapter;
}

export interface InvokeGappToolResult {
  appId: string;
  tool: string;
  via: "host" | "module" | "stateOps" | "live";
  result: unknown;
}

export async function loadGappToolCatalog(
  ref: string,
  cwd: string,
  adapter?: GappRuntimeAdapter,
): Promise<GappToolCatalog> {
  const bundle = await resolveGappRef(ref, { cwd, includeArchived: true });
  if (!bundle) throw new Error(`GAPP not found: ${ref}`);

  const disk = await loadGappToolsFromDir(bundle.dir);
  const merged = new Map<string, GappToolEntry>(
    disk.map((tool) => [tool.name, { tool, source: "disk" as const }]),
  );
  const runtimeEntries = adapter?.listTools
    ? await adapter.listTools(bundle, cwd).catch(() => [])
    : [];
  for (const entry of runtimeEntries) merged.set(entry.tool.name, entry);

  const entries = [...merged.values()];
  return {
    bundle,
    live: entries.some((entry) => entry.source === "live" || entry.source === "host"),
    entries,
  };
}

async function persistDiskExecution(
  bundle: GappBundle,
  state: unknown,
  context: InvokeGappToolContext,
): Promise<void> {
  await setGappState(bundle.meta.id, state, {
    scope: bundle.meta.scope,
    cwd: bundle.meta.cwd || context.cwd,
    merge: false,
  });
  await context.adapter?.onStateChanged?.(bundle, state);
}

export async function invokeGappTool(
  input: InvokeGappToolInput,
  context: InvokeGappToolContext,
): Promise<InvokeGappToolResult> {
  const catalog = await loadGappToolCatalog(input.ref, context.cwd, context.adapter);
  const { bundle } = catalog;
  const appId = bundle.meta.id;
  const args = input.arguments ?? {};
  const entry = catalog.entries.find((item) => item.tool.name === input.tool);

  if (!entry) {
    const names = catalog.entries.map((item) => item.tool.name).join(", ") || "(none)";
    throw new Error(`Tool "${input.tool}" not found on ${appId}. Available: ${names}`);
  }

  // v2: an app-owned tools.mjs handler is the shared implementation for
  // WebView, TUI, agent calls, and host fallback. It takes precedence over
  // legacy stateOps and live handlers for the same declared tool name.
  const moduleOutput = await executeGappToolModule(bundle, input.tool, args);
  if (moduleOutput) {
    await persistDiskExecution(bundle, moduleOutput.state, context);
    return {
      appId,
      tool: input.tool,
      via: "module",
      result: moduleOutput.result,
    };
  }

  if (entry.source === "disk" && entry.tool.stateOps?.length) {
    const applied = applyStateOps(bundle.state, entry.tool.stateOps, args);
    await persistDiskExecution(bundle, applied.state, context);
    return {
      appId,
      tool: input.tool,
      via: "stateOps",
      result: applied.result,
    };
  }

  const runtimeResult = await context.adapter?.invoke?.(
    bundle,
    entry.tool,
    args,
    {
      cwd: context.cwd,
      openIfNeeded: input.openIfNeeded !== false,
    },
  );
  if (runtimeResult) {
    return {
      appId,
      tool: input.tool,
      via: runtimeResult.via,
      result: runtimeResult.result,
    };
  }

  // A host can disappear between catalog and invocation. Declarative stateOps
  // remain the backward-compatible fallback for v0.1 bundles.
  if (entry.tool.stateOps?.length) {
    const applied = applyStateOps(bundle.state, entry.tool.stateOps, args);
    await persistDiskExecution(bundle, applied.state, context);
    return {
      appId,
      tool: input.tool,
      via: "stateOps",
      result: applied.result,
    };
  }

  throw new Error(
    `Tool "${input.tool}" needs tools.mjs or a live GAPP handler. Open the app in Pi or add the shared module.`,
  );
}
