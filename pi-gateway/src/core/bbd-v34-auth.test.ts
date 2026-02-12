/**
 * BBD tests for v3.4 S1: Auth Fail-Closed
 */
import { describe, test, expect } from "bun:test";
import {
  resolveAuthConfig,
  authenticateRequest,
  isAuthExempt,
  buildAuthExemptPrefixes,
  safeTokenCompare,
} from "./auth.ts";

// ============================================================================
// resolveAuthConfig
// ============================================================================

describe("v3.4 S1: resolveAuthConfig", () => {
  const mockLog = { info: () => {}, warn: () => {} };

  test("S1-1: mode=off without allowUnauthenticated throws", () => {
    expect(() =>
      resolveAuthConfig({ mode: "off" }, mockLog),
    ).toThrow("allowUnauthenticated");
  });

  test("S1-2: mode=off with allowUnauthenticated=true succeeds", () => {
    const result = resolveAuthConfig({ mode: "off", allowUnauthenticated: true }, mockLog);
    expect(result.resolvedToken).toBeUndefined();
  });

  test("S1-3: mode=token with explicit token returns it", () => {
    const result = resolveAuthConfig({ mode: "token", token: "my-secret" }, mockLog);
    expect(result.resolvedToken).toBe("my-secret");
  });

  test("S1-4: mode=token without token auto-generates one", () => {
    const result = resolveAuthConfig({ mode: "token" }, mockLog);
    expect(result.resolvedToken).toBeDefined();
    expect(result.resolvedToken!.length).toBeGreaterThan(16);
  });

  test("S1-5: mode=password without password throws", () => {
    expect(() =>
      resolveAuthConfig({ mode: "password" }, mockLog),
    ).toThrow("password");
  });

  test("S1-6: auto-generated tokens are unique per call", () => {
    const a = resolveAuthConfig({ mode: "token" }, mockLog);
    const b = resolveAuthConfig({ mode: "token" }, mockLog);
    expect(a.resolvedToken).not.toBe(b.resolvedToken);
  });

  test("S1-7: logToken=false suppresses token in log", () => {
    const logs: string[] = [];
    const capLog = { info: (m: string) => logs.push(m), warn: () => {} };
    resolveAuthConfig({ mode: "token", logToken: false }, capLog);
    expect(logs.some((l) => l.includes("hidden by logToken=false"))).toBe(true);
    expect(logs.some((l) => /^.*Auto-generated token: [A-Za-z0-9_-]+$/.test(l))).toBe(false);
  });
});

// ============================================================================
// isAuthExempt + buildAuthExemptPrefixes
// ============================================================================

describe("v3.4 S1: isAuthExempt", () => {
  test("S1-10: /health is exempt", () => {
    expect(isAuthExempt("/health")).toBe(true);
  });

  test("S1-11: /api/health is exempt", () => {
    expect(isAuthExempt("/api/health")).toBe(true);
  });

  test("S1-12: / is exempt", () => {
    expect(isAuthExempt("/")).toBe(true);
  });

  test("S1-13: /web/* is exempt (default prefixes)", () => {
    expect(isAuthExempt("/web/index.html")).toBe(true);
  });

  test("S1-14: /api/* is NOT exempt", () => {
    expect(isAuthExempt("/api/chat")).toBe(false);
  });

  test("S1-15: /webhook/unknown is NOT exempt without channel config", () => {
    // Default prefixes only include /web/
    expect(isAuthExempt("/webhook/unknown")).toBe(false);
  });

  test("S1-16: /webhook/telegram exempt when telegram enabled", () => {
    const prefixes = buildAuthExemptPrefixes({ channels: { telegram: { enabled: true } } });
    expect(isAuthExempt("/webhook/telegram", prefixes)).toBe(true);
    expect(isAuthExempt("/webhook/telegram/abc123", prefixes)).toBe(true);
  });

  test("S1-17: /webhook/discord exempt when discord enabled", () => {
    const prefixes = buildAuthExemptPrefixes({ channels: { discord: { enabled: true } } });
    expect(isAuthExempt("/webhook/discord", prefixes)).toBe(true);
  });

  test("S1-18: /webhook/telegram NOT exempt when no telegram config", () => {
    const prefixes = buildAuthExemptPrefixes({ channels: {} });
    expect(isAuthExempt("/webhook/telegram", prefixes)).toBe(false);
  });

  test("S1-19: /webhook/evil NOT exempt even with channels enabled", () => {
    const prefixes = buildAuthExemptPrefixes({ channels: { telegram: { enabled: true }, discord: { enabled: true } } });
    expect(isAuthExempt("/webhook/evil", prefixes)).toBe(false);
  });
});

// ============================================================================
// authenticateRequest (unified HTTP + WS)
// ============================================================================

describe("v3.4 S1: authenticateRequest", () => {
  const token = "test-token-abc";

  function makeReq(path: string, headers: Record<string, string> = {}, query = ""): { req: Request; url: URL } {
    const urlStr = `http://localhost:18789${path}${query}`;
    const req = new Request(urlStr, { headers });
    return { req, url: new URL(urlStr) };
  }

  test("S1-20: mode=off always passes", () => {
    const { req, url } = makeReq("/api/chat");
    expect(authenticateRequest(req, url, { mode: "off", allowUnauthenticated: true })).toBeNull();
  });

  test("S1-21: mode=token rejects missing token", () => {
    const { req, url } = makeReq("/api/chat");
    const res = authenticateRequest(req, url, { mode: "token" }, token);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  test("S1-22: mode=token accepts Bearer header", () => {
    const { req, url } = makeReq("/api/chat", { authorization: `Bearer ${token}` });
    expect(authenticateRequest(req, url, { mode: "token" }, token)).toBeNull();
  });

  test("S1-23: mode=token accepts query param (WS upgrade path)", () => {
    const { req, url } = makeReq("/ws", {}, `?token=${token}`);
    expect(authenticateRequest(req, url, { mode: "token" }, token)).toBeNull();
  });

  test("S1-24: mode=token rejects wrong token", () => {
    const { req, url } = makeReq("/api/chat", { authorization: "Bearer wrong" });
    const res = authenticateRequest(req, url, { mode: "token" }, token);
    expect(res!.status).toBe(401);
  });

  test("S1-25: exempt paths bypass auth", () => {
    const { req, url } = makeReq("/health");
    expect(authenticateRequest(req, url, { mode: "token" }, token)).toBeNull();
  });

  test("S1-26: /api/health bypasses auth", () => {
    const { req, url } = makeReq("/api/health");
    expect(authenticateRequest(req, url, { mode: "token" }, token)).toBeNull();
  });

  test("S1-27: webhook with channel prefix bypasses auth", () => {
    const prefixes = buildAuthExemptPrefixes({ channels: { telegram: { enabled: true } } });
    const { req, url } = makeReq("/webhook/telegram/secret123");
    expect(authenticateRequest(req, url, { mode: "token" }, token, prefixes)).toBeNull();
  });

  test("S1-28: webhook without channel prefix blocked", () => {
    const prefixes = buildAuthExemptPrefixes({ channels: {} });
    const { req, url } = makeReq("/webhook/telegram");
    const res = authenticateRequest(req, url, { mode: "token" }, token, prefixes);
    expect(res!.status).toBe(401);
  });
});

// ============================================================================
// safeTokenCompare edge cases
// ============================================================================

describe("v3.4 S1: safeTokenCompare", () => {
  test("S1-30: equal strings match", () => {
    expect(safeTokenCompare("abc123", "abc123")).toBe(true);
  });

  test("S1-31: different lengths reject", () => {
    expect(safeTokenCompare("short", "longer-string")).toBe(false);
  });

  test("S1-32: same length different content reject", () => {
    expect(safeTokenCompare("aaaaaa", "bbbbbb")).toBe(false);
  });

  test("S1-33: empty strings match", () => {
    expect(safeTokenCompare("", "")).toBe(true);
  });
});
