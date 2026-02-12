/**
 * SSRF Guard — Outbound URL validation.
 *
 * Blocks requests to private/reserved IP ranges, dangerous schemes,
 * and provides DNS-rebinding-aware validation.
 *
 * Limitation: Bun fetch doesn't support passing resolved IPs directly,
 * so there's a small TOCTOU window between resolve and fetch.
 * Acceptable for our use case (config URLs + Telegram API).
 */

import { resolve as dnsResolve } from "node:dns/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SsrfGuardOptions {
  allowPrivate?: boolean;
  allowedHosts?: string[];
  blockedHosts?: string[];
  allowLocalhost?: boolean;
  maxRedirects?: number;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  resolvedIp?: string;
}

// ---------------------------------------------------------------------------
// Private IP detection
// ---------------------------------------------------------------------------

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/** Parse an IPv4 address into a 32-bit number, or null. */
function parseIpv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    // Block octal notation (leading zeros) — "0177.0.0.1" etc.
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

/** Check if an IPv4 address (as 32-bit number) is in a CIDR range. */
function inCidr(ip: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

// RFC 1918 + RFC 6890 private/reserved ranges
const PRIVATE_CIDRS: [number, number][] = [
  [0x0a000000, 8],   // 10.0.0.0/8
  [0xac100000, 12],  // 172.16.0.0/12
  [0xc0a80000, 16],  // 192.168.0.0/16
  [0x7f000000, 8],   // 127.0.0.0/8
  [0xa9fe0000, 16],  // 169.254.0.0/16 (link-local, AWS metadata)
  [0x00000000, 8],   // 0.0.0.0/8
  [0xc0000000, 24],  // 192.0.0.0/24 (IETF protocol assignments)
  [0xc0000200, 24],  // 192.0.2.0/24 (TEST-NET-1)
  [0xc6336400, 24],  // 198.51.100.0/24 (TEST-NET-2)
  [0xcb007100, 24],  // 203.0.113.0/24 (TEST-NET-3)
  [0xe0000000, 4],   // 224.0.0.0/4 (multicast)
  [0xf0000000, 4],   // 240.0.0.0/4 (reserved)
];

export function isPrivateIpv4(ip: string): boolean {
  const num = parseIpv4(ip);
  if (num === null) return false;
  return PRIVATE_CIDRS.some(([base, bits]) => inCidr(num, base, bits));
}

const PRIVATE_IPV6_PREFIXES = [
  "::1",        // loopback
  "fc",         // fc00::/7 unique local
  "fd",         // fc00::/7 unique local
  "fe80:",      // link-local
  "::ffff:127", // IPv4-mapped loopback
  "::ffff:10.", // IPv4-mapped 10.x
  "::ffff:172.", // IPv4-mapped 172.x (needs further check)
  "::ffff:192.168.", // IPv4-mapped 192.168.x
  "::ffff:169.254.", // IPv4-mapped link-local
  "::ffff:0.",  // IPv4-mapped 0.x
];

export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower === "::") return true;

  // IPv4-mapped IPv6 — dotted form (::ffff:127.0.0.1)
  const v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return isPrivateIpv4(v4mapped[1]);

  // IPv4-mapped IPv6 — hex form (::ffff:7f00:1)
  const v4hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4hex) {
    const hi = parseInt(v4hex[1], 16);
    const lo = parseInt(v4hex[2], 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(dotted);
  }

  return PRIVATE_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function isPrivateIp(ip: string): boolean {
  return isPrivateIpv4(ip) || isPrivateIpv6(ip);
}

// ---------------------------------------------------------------------------
// URL normalization & bypass detection
// ---------------------------------------------------------------------------

/** Block credential-bearing URLs: http://user:pass@host */
function hasCredentials(url: URL): boolean {
  return !!(url.username || url.password);
}

/** Detect decimal IP notation: http://2130706433 = 127.0.0.1 */
function isDecimalIp(hostname: string): string | null {
  if (/^\d+$/.test(hostname)) {
    const num = Number(hostname);
    if (num >= 0 && num <= 0xffffffff) {
      return [
        (num >>> 24) & 0xff,
        (num >>> 16) & 0xff,
        (num >>> 8) & 0xff,
        num & 0xff,
      ].join(".");
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Host matching (supports wildcards: *.example.com)
// ---------------------------------------------------------------------------

function matchesHost(hostname: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".example.com"
    return hostname.endsWith(suffix) || hostname === pattern.slice(2);
  }
  return hostname === pattern;
}

function matchesAnyHost(hostname: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesHost(hostname, p));
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

export async function validateOutboundUrl(
  urlStr: string,
  opts: SsrfGuardOptions = {},
): Promise<ValidationResult> {
  // Parse URL
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }

  // Scheme check
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return { allowed: false, reason: `Blocked scheme: ${url.protocol}` };
  }

  // Credentials check
  if (hasCredentials(url)) {
    return { allowed: false, reason: "URLs with credentials are blocked" };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // Blocked hosts
  if (opts.blockedHosts?.length && matchesAnyHost(hostname, opts.blockedHosts)) {
    return { allowed: false, reason: `Host blocked: ${hostname}` };
  }

  // Allowed hosts bypass (skip IP resolution)
  if (opts.allowedHosts?.length && matchesAnyHost(hostname, opts.allowedHosts)) {
    return { allowed: true };
  }

  // Decimal IP bypass detection
  const decimalIp = isDecimalIp(hostname);
  if (decimalIp) {
    if (!opts.allowPrivate && isPrivateIp(decimalIp)) {
      return { allowed: false, reason: `Decimal IP resolves to private: ${decimalIp}`, resolvedIp: decimalIp };
    }
  }

  // Direct IP check — IPv4, IPv6, or IPv4-mapped IPv6
  if (isPrivateIp(hostname)) {
    if (!opts.allowPrivate) {
      if ((hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost") && opts.allowLocalhost) {
        // allowed by explicit localhost flag
      } else {
        return { allowed: false, reason: `Private IP blocked: ${hostname}`, resolvedIp: hostname };
      }
    }
  }

  // DNS resolution for hostnames (rebinding defense)
  if (!decimalIp && !hostname.match(/^[\d.]+$/) && !hostname.includes(":")) {
    try {
      const addresses = await dnsResolve(hostname);
      for (const addr of addresses) {
        if (!opts.allowPrivate && isPrivateIp(addr)) {
          return {
            allowed: false,
            reason: `DNS rebinding: ${hostname} resolves to private IP ${addr}`,
            resolvedIp: addr,
          };
        }
      }
      return { allowed: true, resolvedIp: addresses[0] };
    } catch {
      return { allowed: false, reason: `DNS resolution failed: ${hostname}` };
    }
  }

  return { allowed: true, resolvedIp: decimalIp ?? hostname };
}

// ---------------------------------------------------------------------------
// safeFetch — drop-in fetch replacement with SSRF guard
// ---------------------------------------------------------------------------

export async function safeFetch(
  url: string,
  init?: RequestInit,
  ssrfOpts?: SsrfGuardOptions,
): Promise<Response> {
  const result = await validateOutboundUrl(url, ssrfOpts);
  if (!result.allowed) {
    throw new Error(`SSRF blocked: ${result.reason} (url: ${url})`);
  }

  // Enforce no-redirect when maxRedirects is 0
  const fetchInit = { ...init };
  if ((ssrfOpts?.maxRedirects ?? 0) === 0) {
    fetchInit.redirect = "error";
  }

  return fetch(url, fetchInit);
}

// ---------------------------------------------------------------------------
// Config-time URL validation (run once at startup)
// ---------------------------------------------------------------------------

export function validateConfigUrl(url: string, fieldName: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid ${fieldName} URL: ${url}`);
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`${fieldName} must use http: or https: (got ${parsed.protocol})`);
  }
  if (hasCredentials(parsed)) {
    throw new Error(`${fieldName} must not contain credentials`);
  }
}
