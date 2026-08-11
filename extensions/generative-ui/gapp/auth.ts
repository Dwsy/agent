/**
 * GAPP host token auth.
 *
 * The hub writes a random token to ~/.pi/gapp/host-token (0600). Every local
 * client (pi client processes, WebViews via injected runtime, native isolated
 * runners) reads or receives that token and sends it as `Authorization:
 * Bearer <token>`. Browser pages cannot read local files, so this closes the
 * "any webpage can drive the agent through :54888" channel while CORS stays
 * permissive for null-origin WebViews.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gappGlobalRoot } from "./storage.js";

const TOKEN_FILE = "host-token";

let cachedToken: string | null = null;

export function hostTokenPath(): string {
  return join(gappGlobalRoot(), TOKEN_FILE);
}

/** Hub-side: create the token file if missing and return the token. */
export async function ensureHostToken(): Promise<string> {
  const existing = await readHostToken();
  if (existing) return existing;
  const token = randomBytes(32).toString("hex");
  await mkdir(gappGlobalRoot(), { recursive: true });
  await writeFile(hostTokenPath(), token, { encoding: "utf-8", mode: 0o600 });
  cachedToken = token;
  return token;
}

/** Client-side: read the token the hub wrote. Not cached when absent so late hub startup is picked up. */
export async function readHostToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    const raw = (await readFile(hostTokenPath(), "utf-8")).trim();
    cachedToken = raw || null;
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
