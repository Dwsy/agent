/**
 * Media Token — HMAC-SHA256 signed URLs for serving media files.
 *
 * Token format: base64url(HMAC(secret, sessionKey + ":" + filePath + ":" + expiry))
 * URL: /api/media/{token}/{filename}?sk={sessionKey}&path={filePath}&exp={expiry}
 *
 * Avoids exposing session keys in browser history/Referer/logs.
 */

import { createHmac, randomBytes } from "node:crypto";

let _secret: string | null = null;

/** Get or generate the media signing secret. */
export function getMediaSecret(configSecret?: string): string {
  if (configSecret) return configSecret;
  if (!_secret) {
    _secret = randomBytes(32).toString("hex");
  }
  return _secret;
}

/** Sign a media URL. Returns the full relative URL path. */
export function signMediaUrl(
  sessionKey: string,
  filePath: string,
  secret: string,
  ttlMs = 3600_000,
): string {
  const expiry = Date.now() + ttlMs;
  const payload = `${sessionKey}:${filePath}:${expiry}`;
  const token = createHmac("sha256", secret).update(payload).digest("base64url");
  const filename = filePath.split("/").pop() || "file";
  const params = new URLSearchParams({
    sk: sessionKey,
    path: filePath,
    exp: String(expiry),
  });
  return `/api/media/${token}/${encodeURIComponent(filename)}?${params}`;
}

/** Verify a media token. Returns { sessionKey, filePath } or null if invalid. */
export function verifyMediaToken(
  token: string,
  sessionKey: string,
  filePath: string,
  expiry: string,
  secret: string,
): { sessionKey: string; filePath: string } | null {
  const exp = Number(expiry);
  if (!exp || Date.now() > exp) return null; // Expired

  const payload = `${sessionKey}:${filePath}:${exp}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");

  // Constant-time comparison
  if (token.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  return { sessionKey, filePath };
}
