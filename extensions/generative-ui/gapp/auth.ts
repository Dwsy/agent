/**
 * GAPP host token auth.
 *
 * The daemon/launcher creates one random token at ~/.pi/gapp/host-token (0600). Every local
 * client (pi client processes, WebViews via injected runtime, native isolated
 * runners) reads or receives that token and sends it as `Authorization:
 * Bearer <token>`. Browser pages cannot read local files, so this closes the
 * "any webpage can drive the agent through :54888" channel while CORS stays
 * permissive for null-origin WebViews.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gappGlobalRoot } from "./storage.js";

const TOKEN_FILE = "host-token";

let cachedToken: string | null = null;
let cachedTokenPath: string | null = null;

function isValidToken(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function hostTokenPath(): string {
  return join(gappGlobalRoot(), TOKEN_FILE);
}

/** Create the token file once across competing Pi/daemon processes and return it. */
export async function ensureHostToken(): Promise<string> {
  const existing = await readHostToken();
  if (existing) return existing;
  const token = randomBytes(32).toString("hex");
  await mkdir(gappGlobalRoot(), { recursive: true });
  try {
    const handle = await open(hostTokenPath(), "wx", 0o600);
    try {
      await handle.writeFile(token, { encoding: "utf-8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    cachedToken = token;
    cachedTokenPath = hostTokenPath();
    return token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  // Another Pi/daemon won the exclusive create. Its file can exist for a few
  // milliseconds before the 64-byte write is visible, so wait for a complete
  // token rather than generating or caching a competing value.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const winner = await readHostToken();
    if (winner) return winner;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`GAPP host token exists but is incomplete: ${hostTokenPath()}`);
}

/** Client-side: read the shared token. Not cached when absent so late daemon startup is picked up. */
export async function readHostToken(): Promise<string | null> {
  const path = hostTokenPath();
  // Key the cache by path: GAPP_GLOBAL_DIR can change (tests, side-by-side hosts)
  // and a token from another root is simply the wrong credential.
  if (cachedToken && cachedTokenPath === path) return cachedToken;
  cachedToken = null;
  cachedTokenPath = path;
  try {
    const raw = (await readFile(path, "utf-8")).trim();
    cachedToken = isValidToken(raw) ? raw : null;
  } catch {
    return null;
  }
  return cachedToken;
}

/** Constant-time check of an Authorization header value against the hub token. */
export function verifyHostToken(header: string | string[] | undefined, token: string): boolean {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return false;
  const presented = (value.startsWith("Bearer ") ? value.slice(7) : value).trim();
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
