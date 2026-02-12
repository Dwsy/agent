import { describe, test, expect } from "bun:test";
import {
  isPrivateIp,
  isPrivateIpv4,
  isPrivateIpv6,
  validateOutboundUrl,
  validateConfigUrl,
} from "./ssrf-guard.ts";

// ---------------------------------------------------------------------------
// isPrivateIp
// ---------------------------------------------------------------------------

describe("isPrivateIp", () => {
  test("blocks loopback", () => {
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateIpv4("127.255.255.255")).toBe(true);
  });

  test("blocks RFC 1918 ranges", () => {
    expect(isPrivateIpv4("10.0.0.1")).toBe(true);
    expect(isPrivateIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateIpv4("172.31.255.255")).toBe(true);
    expect(isPrivateIpv4("192.168.1.1")).toBe(true);
  });

  test("blocks link-local / metadata", () => {
    expect(isPrivateIpv4("169.254.169.254")).toBe(true);
    expect(isPrivateIpv4("169.254.0.1")).toBe(true);
  });

  test("blocks 0.0.0.0/8", () => {
    expect(isPrivateIpv4("0.0.0.0")).toBe(true);
    expect(isPrivateIpv4("0.255.255.255")).toBe(true);
  });

  test("allows public IPs", () => {
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("1.1.1.1")).toBe(false);
    expect(isPrivateIpv4("203.0.114.1")).toBe(false);
  });

  test("blocks IPv6 loopback", () => {
    expect(isPrivateIpv6("::1")).toBe(true);
    expect(isPrivateIpv6("::")).toBe(true);
  });

  test("blocks IPv4-mapped IPv6", () => {
    expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:169.254.169.254")).toBe(true);
  });

  test("allows public IPv4-mapped IPv6", () => {
    expect(isPrivateIpv6("::ffff:8.8.8.8")).toBe(false);
  });

  test("blocks unique local (fc/fd)", () => {
    expect(isPrivateIpv6("fc00::1")).toBe(true);
    expect(isPrivateIpv6("fd12:3456::1")).toBe(true);
  });

  test("blocks link-local IPv6", () => {
    expect(isPrivateIpv6("fe80::1")).toBe(true);
  });

  test("isPrivateIp dispatches correctly", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  test("rejects octal notation", () => {
    // 0177.0.0.1 = 127.0.0.1 in octal — parseIpv4 rejects leading zeros
    expect(isPrivateIpv4("0177.0.0.1")).toBe(false); // rejected as invalid
  });
});

// ---------------------------------------------------------------------------
// validateOutboundUrl
// ---------------------------------------------------------------------------

describe("validateOutboundUrl", () => {
  // SSRF-1: AWS metadata
  test("SSRF-1: blocks AWS metadata endpoint", async () => {
    const r = await validateOutboundUrl("http://169.254.169.254/latest/meta-data");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("Private IP");
  });

  // SSRF-2: loopback
  test("SSRF-2: blocks localhost", async () => {
    const r = await validateOutboundUrl("http://127.0.0.1:8080/admin");
    expect(r.allowed).toBe(false);
  });

  // SSRF-3: private network
  test("SSRF-3: blocks private network", async () => {
    const r = await validateOutboundUrl("http://10.0.0.1/internal");
    expect(r.allowed).toBe(false);
  });

  // SSRF-4: IPv6 loopback
  test("SSRF-4: blocks IPv6 loopback", async () => {
    const r = await validateOutboundUrl("http://[::1]/secret");
    expect(r.allowed).toBe(false);
  });

  // SSRF-5: allowed host
  test("SSRF-5: allows Telegram API via allowedHosts", async () => {
    const r = await validateOutboundUrl(
      "https://api.telegram.org/file/bot123/photo.jpg",
      { allowedHosts: ["api.telegram.org"] },
    );
    expect(r.allowed).toBe(true);
  });

  // SSRF-6: blocked scheme
  test("SSRF-6: blocks file:// scheme", async () => {
    const r = await validateOutboundUrl("file:///etc/passwd");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("scheme");
  });

  test("blocks ftp:// scheme", async () => {
    const r = await validateOutboundUrl("ftp://evil.com/file");
    expect(r.allowed).toBe(false);
  });

  test("blocks data: scheme", async () => {
    const r = await validateOutboundUrl("data:text/html,<script>alert(1)</script>");
    expect(r.allowed).toBe(false);
  });

  // SSRF-9: allowPrivate override
  test("SSRF-9: allows private with allowPrivate flag", async () => {
    const r = await validateOutboundUrl("http://192.168.1.1", { allowPrivate: true });
    expect(r.allowed).toBe(true);
  });

  // SSRF-10: redirect blocking
  test("SSRF-10: invalid URL rejected", async () => {
    const r = await validateOutboundUrl("not-a-url");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("Invalid URL");
  });

  // Bypass: credentials in URL
  test("blocks credentials in URL", async () => {
    const r = await validateOutboundUrl("http://admin:password@internal.corp/api");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("credentials");
  });

  // Bypass: decimal IP (2130706433 = 127.0.0.1)
  test("blocks decimal IP notation", async () => {
    const r = await validateOutboundUrl("http://2130706433/");
    expect(r.allowed).toBe(false);
    // URL parser may normalize decimal to dotted — either reason is valid
    expect(r.reason).toMatch(/Decimal IP|Private IP/);
  });

  // Bypass: IPv4-mapped IPv6
  test("blocks IPv4-mapped IPv6 loopback", async () => {
    const r = await validateOutboundUrl("http://[::ffff:127.0.0.1]/");
    expect(r.allowed).toBe(false);
  });

  // Wildcard allowedHosts
  test("wildcard allowedHosts matches subdomains", async () => {
    const r = await validateOutboundUrl(
      "https://files.api.telegram.org/path",
      { allowedHosts: ["*.telegram.org"] },
    );
    expect(r.allowed).toBe(true);
  });

  test("wildcard allowedHosts matches exact domain", async () => {
    const r = await validateOutboundUrl(
      "https://telegram.org/path",
      { allowedHosts: ["*.telegram.org"] },
    );
    expect(r.allowed).toBe(true);
  });

  // Blocked hosts
  test("blockedHosts takes precedence", async () => {
    const r = await validateOutboundUrl(
      "https://evil.com/steal",
      { blockedHosts: ["evil.com"] },
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("blocked");
  });

  // Public URL (DNS resolution — may fail in CI without network)
  test("allows public URL with real DNS", async () => {
    const r = await validateOutboundUrl("https://example.com");
    // In CI without DNS this might fail — that's expected behavior
    if (r.allowed) {
      expect(r.resolvedIp).toBeDefined();
    } else {
      expect(r.reason).toContain("DNS");
    }
  });
});

// ---------------------------------------------------------------------------
// validateConfigUrl
// ---------------------------------------------------------------------------

describe("validateConfigUrl", () => {
  test("accepts valid https URL", () => {
    expect(() => validateConfigUrl("https://api.openai.com/v1", "stt.baseUrl")).not.toThrow();
  });

  test("accepts valid http URL", () => {
    expect(() => validateConfigUrl("http://localhost:8080", "stt.baseUrl")).not.toThrow();
  });

  test("rejects invalid URL", () => {
    expect(() => validateConfigUrl("not-a-url", "stt.baseUrl")).toThrow("Invalid");
  });

  test("rejects non-http scheme", () => {
    expect(() => validateConfigUrl("ftp://files.example.com", "stt.baseUrl")).toThrow("http: or https:");
  });

  test("rejects credentials in URL", () => {
    expect(() => validateConfigUrl("https://user:pass@api.com", "stt.baseUrl")).toThrow("credentials");
  });
});
