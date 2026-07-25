/**
 * Safe declarative stateOps executor (no arbitrary code).
 * Spec: PROTOCOL.md §4.5
 */

import { randomUUID } from "node:crypto";
import type { GappStateOp } from "./protocol.js";

function getPath(root: unknown, path?: string): unknown {
  if (!path || path === "" || path === ".") return root;
  const parts = path.split(".").filter(Boolean);
  let cur: any = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function setPath(root: unknown, path: string, value: unknown): unknown {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return value;
  const base =
    root && typeof root === "object" && !Array.isArray(root)
      ? { ...(root as Record<string, unknown>) }
      : {};
  let cur: any = base;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    cur[p] =
      next && typeof next === "object" && !Array.isArray(next)
        ? { ...next }
        : {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return base;
}

/**
 * Resolve templates in op fields:
 * - `$uuid` / `$now`
 * - bare `$args.key` → arg value
 * - path segments: `statusMap.$args.id` → `statusMap.<id>`
 */
function resolveTemplates(value: unknown, args: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    return expandStringTemplate(value, args);
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplates(v, args));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveTemplates(v, args);
    }
    return out;
  }
  return value;
}

function expandStringTemplate(template: string, args: Record<string, unknown>): unknown {
  if (template === "$uuid") return randomUUID();
  if (template === "$now") return new Date().toISOString();

  // bare $args.key → real value (may be non-string)
  const bare = template.match(/^\$args\.([a-zA-Z0-9_]+)$/);
  if (bare) return getPath(args, bare[1]);

  if (!template.includes("$args.") && !template.includes("$uuid") && !template.includes("$now")) {
    return template;
  }

  // path / mixed string: expand each $args.x segment to string
  let out = template;
  out = out.replace(/\$args\.([a-zA-Z0-9_]+)/g, (_m, key: string) => {
    const v = getPath(args, key);
    if (v === undefined || v === null) {
      throw new Error(`stateOps template missing arg: ${key}`);
    }
    return String(v);
  });
  if (out.includes("$uuid")) out = out.split("$uuid").join(randomUUID());
  if (out.includes("$now")) out = out.split("$now").join(new Date().toISOString());
  return out;
}

function matchObject(item: unknown, match: Record<string, unknown>): boolean {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  for (const [k, v] of Object.entries(match)) {
    if (obj[k] !== v) return false;
  }
  return true;
}

export function applyStateOps(
  state: unknown,
  ops: GappStateOp[],
  args: Record<string, unknown> = {},
): { state: unknown; result: unknown } {
  let current = state;
  let lastResult: unknown = state;

  for (const rawOp of ops) {
    const op = resolveTemplates(rawOp, args) as GappStateOp;
    switch (op.op) {
      case "get": {
        lastResult = getPath(current, op.path);
        break;
      }
      case "set": {
        if (typeof op.path !== "string" || !op.path) {
          throw new Error("stateOps set requires string path");
        }
        current = setPath(current, op.path, op.value);
        lastResult = { path: op.path, value: op.value };
        break;
      }
      case "merge": {
        const base =
          current && typeof current === "object" && !Array.isArray(current)
            ? { ...(current as Record<string, unknown>) }
            : {};
        current = { ...base, ...(op.value || {}) };
        lastResult = current;
        break;
      }
      case "push": {
        const arr = getPath(current, op.path);
        const next = Array.isArray(arr) ? [...arr, op.value] : [op.value];
        current = setPath(current, op.path, next);
        lastResult = op.value;
        break;
      }
      case "removeWhere": {
        const arr = getPath(current, op.path);
        if (!Array.isArray(arr)) {
          lastResult = { removed: 0 };
          break;
        }
        const match = (op.match || {}) as Record<string, unknown>;
        const next = arr.filter((item) => !matchObject(item, match));
        current = setPath(current, op.path, next);
        lastResult = { removed: arr.length - next.length };
        break;
      }
      case "updateWhere": {
        const arr = getPath(current, op.path);
        if (!Array.isArray(arr)) {
          lastResult = { updated: 0 };
          break;
        }
        const match = (op.match || {}) as Record<string, unknown>;
        const set = (op.set || {}) as Record<string, unknown>;
        let updated = 0;
        const next = arr.map((item) => {
          if (!matchObject(item, match)) return item;
          updated++;
          return { ...(item as object), ...set };
        });
        current = setPath(current, op.path, next);
        lastResult = { updated };
        break;
      }
      default:
        throw new Error(`Unknown stateOp: ${(op as any).op}`);
    }
  }

  return { state: current, result: lastResult };
}
