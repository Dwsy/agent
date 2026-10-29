/**
 * Shared helpers for the GAPP CLI surface (gapp-cli.ts).
 *
 * The former `registerGappTools` block (nine `gapp_*` tools with full schema +
 * prompt guidelines in every session's system prompt) is gone: the agent now
 * drives GAPPs through `bun gapp-cli.ts <command>` and reads the
 * `gapp` skill for the complete calling system.
 */

export interface GappToolContext {
  activeWindows: any[];
}

/**
 * Normalize a tool `arguments` payload into a plain object.
 *
 * Models routinely send the value as a JSON *string* rather than a nested
 * object. Treating that as invalid and falling back to `{}` silently drops
 * every parameter, which reads as "this tool ignores its arguments" and sends
 * callers chasing a handler bug. Accept both encodings and reject the rest
 * loudly instead of degrading.
 */
export function normalizeToolArguments(raw: unknown): Record<string, unknown> {
  // Absent arguments mean "no parameters" — not a malformed value.
  if (raw === undefined || raw === null || raw === "") return {};
  const parsed = decodeJsonArgument(raw, "call arguments");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `arguments must decode to a JSON object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`,
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * Accept either an already-decoded JSON value or the same value encoded as a
 * JSON string, and report the label in errors so callers know which field failed.
 */
export function decodeJsonArgument(raw: unknown, label: string): unknown {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `${label} must be valid JSON. Received an unparseable string: ${raw.slice(0, 200)}`,
    );
  }
}

/** Record run + project touch via portable gapp-sdk (non-fatal if missing). */
export async function recordGappRun(
  id: string,
  opts: { scope?: "project" | "global"; cwd: string; source: string },
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
