import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  gappDir,
  listGapps,
  resolveGappRef,
  type GappBundle,
  type GappMeta,
} from "./storage.js";
import {
  invokeGappTool,
  type GappRuntimeAdapter,
} from "./service.js";

export const GAPP_TUI_ENTRY = "tui.mjs";

export interface GappTuiPalette {
  accent(text: string): string;
  dim(text: string): string;
  muted(text: string): string;
  warning(text: string): string;
  success(text: string): string;
  error(text: string): string;
  text(text: string): string;
  border(text: string): string;
  bold(text: string): string;
}

export const plainGappTuiPalette: GappTuiPalette = {
  accent: (text) => text,
  dim: (text) => text,
  muted: (text) => text,
  warning: (text) => text,
  success: (text) => text,
  error: (text) => text,
  text: (text) => text,
  border: (text) => text,
  bold: (text) => text,
};

export type GappTuiKeyName =
  | "up"
  | "down"
  | "left"
  | "right"
  | "enter"
  | "escape"
  | "tab"
  | "backspace";

export interface GappTuiPromptRequest {
  title: string;
  initial?: string;
  submit(value: string): void | Promise<void>;
}

export type GappTuiHostAction =
  | { kind: "exit" }
  | {
      kind: "prompt";
      title: string;
      initial: string;
      submit(value: string): Promise<void>;
    };

export interface GappTuiRuntime {
  readonly app: Readonly<{
    id: string;
    name: string;
    description: string;
    scope: string;
  }>;
  readonly palette: GappTuiPalette;
  getState<T = unknown>(): T;
  getStatus(): string;
  isBusy(): boolean;
  notify(message: string): void;
  refresh(): Promise<unknown>;
  call(tool: string, args?: Record<string, unknown>): Promise<unknown>;
  prompt(request: GappTuiPromptRequest): void;
  close(): void;
  key(data: string, name: GappTuiKeyName): boolean;
  truncate(text: string, width: number): string;
  pad(text: string, width: number): string;
}

export interface GappTuiAppSession {
  readonly component: Component;
  readonly bundle: GappBundle;
  setRequestRender(requestRender: () => void): void;
  setHostActionHandler(handler: (action: GappTuiHostAction) => void): void;
  setPalette(palette: GappTuiPalette): void;
  refresh(): Promise<unknown>;
}

type GappTuiFactory = (
  runtime: GappTuiRuntime,
) => Component | Promise<Component>;

function keyValue(name: GappTuiKeyName): string {
  return Key[name] as string;
}

export function matchesGappTuiKey(data: string, name: GappTuiKeyName): boolean {
  return matchesKey(data, keyValue(name));
}

export function padGappTuiText(text: string, width: number): string {
  const safeWidth = Math.max(0, width);
  const hadAnsi = text.includes("\u001b[");
  let clipped = truncateToWidth(text, safeWidth);
  if (!hadAnsi) clipped = clipped.replace(/\u001b\[0m/g, "");
  return clipped + " ".repeat(Math.max(0, safeWidth - visibleWidth(clipped)));
}

export async function hasGappTuiRenderer(bundle: GappBundle): Promise<boolean> {
  try {
    await access(join(bundle.dir, GAPP_TUI_ENTRY));
    return true;
  } catch {
    return false;
  }
}

export async function listGappTuiApps(cwd: string): Promise<GappMeta[]> {
  const apps = await listGapps({ cwd, includeArchived: true, includeDisabled: true });
  const supported: GappMeta[] = [];
  for (const meta of apps) {
    const dir = gappDir(meta.scope, meta.id, meta.cwd || cwd);
    try {
      await access(join(dir, GAPP_TUI_ENTRY));
      supported.push(meta);
    } catch {
      // Browser-only GAPPs are intentionally absent from the TUI app picker.
    }
  }
  return supported;
}

export async function createGappTuiAppSession(options: {
  ref: string;
  cwd: string;
  adapter?: GappRuntimeAdapter;
  palette?: GappTuiPalette;
}): Promise<GappTuiAppSession> {
  let bundle = await resolveGappRef(options.ref, {
    cwd: options.cwd,
    includeArchived: true,
  });
  if (!bundle) throw new Error(`GAPP not found: ${options.ref}`);

  const entry = join(bundle.dir, GAPP_TUI_ENTRY);
  let entryStat;
  try {
    entryStat = await stat(entry);
  } catch {
    throw new Error(
      `GAPP "${bundle.meta.id}" has no TUI renderer. Add ${GAPP_TUI_ENTRY} exporting createGappTui(runtime).`,
    );
  }

  let palette = options.palette ?? plainGappTuiPalette;
  let requestRender = () => {};
  let handleHostAction = (_action: GappTuiHostAction) => {};
  let status = "";
  let busy = false;
  let appComponent: Component | undefined;

  const invalidateAndRender = () => {
    appComponent?.invalidate?.();
    requestRender();
  };

  const refresh = async (): Promise<unknown> => {
    const next = await resolveGappRef(bundle.meta.id, {
      cwd: bundle.meta.cwd || options.cwd,
      includeArchived: true,
    });
    if (!next) throw new Error(`GAPP disappeared: ${bundle.meta.id}`);
    bundle = next;
    invalidateAndRender();
    return bundle.state;
  };

  const runtime: GappTuiRuntime = {
    get app() {
      return {
        id: bundle.meta.id,
        name: bundle.meta.name,
        description: bundle.meta.description,
        scope: bundle.meta.scope,
      };
    },
    get palette() {
      return palette;
    },
    getState<T = unknown>() {
      return bundle.state as T;
    },
    getStatus() {
      return status;
    },
    isBusy() {
      return busy;
    },
    notify(message: string) {
      status = message;
      invalidateAndRender();
    },
    async refresh() {
      status = "refreshing…";
      invalidateAndRender();
      try {
        const state = await refresh();
        status = "refreshed";
        invalidateAndRender();
        return state;
      } catch (error) {
        status = `error: ${error instanceof Error ? error.message : String(error)}`;
        invalidateAndRender();
        throw error;
      }
    },
    async call(tool, args = {}) {
      if (busy) throw new Error("A GAPP action is already running");
      busy = true;
      status = `${tool}…`;
      invalidateAndRender();
      try {
        const result = await invokeGappTool(
          {
            ref: bundle.meta.id,
            tool,
            arguments: args,
            // A TUI-rendered app must never open a browser window as a side effect.
            openIfNeeded: false,
          },
          {
            cwd: bundle.meta.cwd || options.cwd,
            adapter: options.adapter,
          },
        );
        await refresh();
        status = `✓ ${tool}`;
        invalidateAndRender();
        return result.result;
      } catch (error) {
        status = `✗ ${tool}: ${error instanceof Error ? error.message : String(error)}`;
        invalidateAndRender();
        throw error;
      } finally {
        busy = false;
        invalidateAndRender();
      }
    },
    prompt(request) {
      handleHostAction({
        kind: "prompt",
        title: request.title,
        initial: request.initial ?? "",
        async submit(value) {
          await request.submit(value);
        },
      });
    },
    close() {
      handleHostAction({ kind: "exit" });
    },
    key(data, name) {
      return matchesGappTuiKey(data, name);
    },
    truncate(text, width) {
      return truncateToWidth(String(text), Math.max(0, width));
    },
    pad(text, width) {
      return padGappTuiText(String(text), width);
    },
  };

  const href = `${pathToFileURL(entry).href}?mtime=${entryStat.mtimeMs}`;
  const module = await import(href);
  const factory = (module.createGappTui ?? module.default) as GappTuiFactory | undefined;
  if (typeof factory !== "function") {
    throw new Error(
      `${GAPP_TUI_ENTRY} must export default or createGappTui(runtime)`,
    );
  }

  const rawComponent = await factory(runtime);
  if (!rawComponent || typeof rawComponent.render !== "function") {
    throw new Error(`${GAPP_TUI_ENTRY} factory did not return a pi-tui Component`);
  }
  if (typeof rawComponent.invalidate !== "function") {
    rawComponent.invalidate = () => {};
  }

  appComponent = {
    invalidate() {
      rawComponent.invalidate();
    },
    render(width: number) {
      try {
        const lines = rawComponent.render(width);
        if (!Array.isArray(lines)) throw new Error("render() must return string[]");
        return lines.map((line) => truncateToWidth(String(line), Math.max(1, width)));
      } catch (error) {
        return [
          palette.error(
            `TUI render error: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ];
      }
    },
    handleInput(data: string) {
      try {
        rawComponent.handleInput?.(data);
        // App-local selection/navigation state is not necessarily persisted.
        rawComponent.invalidate();
        requestRender();
      } catch (error) {
        status = `input error: ${error instanceof Error ? error.message : String(error)}`;
        invalidateAndRender();
      }
    },
  };

  return {
    component: appComponent,
    get bundle() {
      return bundle;
    },
    setRequestRender(next) {
      requestRender = next;
    },
    setHostActionHandler(next) {
      handleHostAction = next;
    },
    setPalette(next) {
      palette = next;
      invalidateAndRender();
    },
    refresh,
  };
}
