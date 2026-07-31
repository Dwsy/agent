import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { GappBundle } from "./storage.js";

export const GAPP_TOOL_MODULE_ENTRY = "tools.mjs";

export interface GappExecutableToolContext {
  app: Readonly<{
    id: string;
    name: string;
    description: string;
    scope: string;
  }>;
  now(): string;
  uuid(): string;
}

export interface GappExecutableToolInput {
  state: unknown;
  arguments: Record<string, unknown>;
  context: GappExecutableToolContext;
}

export interface GappExecutableToolOutput {
  state: unknown;
  result?: unknown;
}

export type GappExecutableToolHandler = (
  input: GappExecutableToolInput,
) => GappExecutableToolOutput | Promise<GappExecutableToolOutput>;

export interface GappExecutableToolModule {
  entry: string;
  handlers: Record<string, GappExecutableToolHandler>;
}

export async function loadGappExecutableToolModule(
  dir: string,
): Promise<GappExecutableToolModule | null> {
  const entry = join(dir, GAPP_TOOL_MODULE_ENTRY);
  let entryStat;
  try {
    entryStat = await stat(entry);
  } catch {
    return null;
  }

  const href = `${pathToFileURL(entry).href}?mtime=${entryStat.mtimeMs}`;
  const loaded = await import(href);
  const handlers = loaded.gappToolHandlers;
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    throw new Error(
      `${GAPP_TOOL_MODULE_ENTRY} must export a gappToolHandlers object`,
    );
  }
  for (const [name, handler] of Object.entries(handlers)) {
    if (typeof handler !== "function") {
      throw new Error(
        `${GAPP_TOOL_MODULE_ENTRY} handler "${name}" must be a function`,
      );
    }
  }
  return {
    entry,
    handlers: handlers as Record<string, GappExecutableToolHandler>,
  };
}

export async function executeGappToolModule(
  bundle: GappBundle,
  tool: string,
  args: Record<string, unknown>,
): Promise<GappExecutableToolOutput | null> {
  const module = await loadGappExecutableToolModule(bundle.dir);
  const handler = module?.handlers[tool];
  if (!handler) return null;

  const output = await handler({
    state: bundle.state,
    arguments: args,
    context: {
      app: {
        id: bundle.meta.id,
        name: bundle.meta.name,
        description: bundle.meta.description,
        scope: bundle.meta.scope,
      },
      now: () => new Date().toISOString(),
      uuid: () => randomUUID(),
    },
  });

  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error(
      `${GAPP_TOOL_MODULE_ENTRY} handler "${tool}" must return { state, result? }`,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(output, "state")) {
    throw new Error(
      `${GAPP_TOOL_MODULE_ENTRY} handler "${tool}" returned no state`,
    );
  }
  return output;
}
