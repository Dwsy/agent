import { describe, test, expect } from "bun:test";
import { ExecGuard, DEFAULT_EXEC_GUARD_CONFIG } from "./exec-guard.ts";

describe("ExecGuard", () => {
  // -------------------------------------------------------------------------
  // Allowlist
  // -------------------------------------------------------------------------

  test("allows default executables (pi, ps)", () => {
    const guard = new ExecGuard();
    expect(guard.check("pi").allowed).toBe(true);
    expect(guard.check("ps").allowed).toBe(true);
  });

  test("blocks unlisted executables", () => {
    const guard = new ExecGuard();
    const r = guard.check("curl", ["http://evil.com"]);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("not in allowlist");
  });

  test("allows custom executables in config", () => {
    const guard = new ExecGuard({ allowedExecutables: ["pi", "ps", "node"] });
    expect(guard.check("node", ["script.js"]).allowed).toBe(true);
  });

  test("matches absolute path by basename", () => {
    const guard = new ExecGuard();
    expect(guard.check("/usr/local/bin/pi", ["--mode", "rpc"]).allowed).toBe(true);
  });

  test("matches absolute path by full path", () => {
    const guard = new ExecGuard({ allowedExecutables: ["/opt/custom/pi-agent"] });
    expect(guard.check("/opt/custom/pi-agent").allowed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Disabled guard
  // -------------------------------------------------------------------------

  test("allows everything when disabled", () => {
    const guard = new ExecGuard({ enabled: false });
    expect(guard.check("rm", ["-rf", "/"]).allowed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // blockUnlisted: false (warn mode)
  // -------------------------------------------------------------------------

  test("warns but allows when blockUnlisted is false", () => {
    const guard = new ExecGuard({ blockUnlisted: false });
    const r = guard.check("curl");
    expect(r.allowed).toBe(true);
    expect(r.reason).toContain("Warning");
  });

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  test("records audit entries", () => {
    const guard = new ExecGuard();
    guard.check("pi", ["--mode", "rpc"]);
    guard.check("curl", ["http://evil.com"]);

    const log = guard.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0].allowed).toBe(true);
    expect(log[1].allowed).toBe(false);
  });

  test("audit log respects max entries", () => {
    const guard = new ExecGuard({}, 10);
    for (let i = 0; i < 15; i++) {
      guard.check("pi", [`arg-${i}`]);
    }
    const log = guard.getAuditLog(100);
    expect(log.length).toBeLessThanOrEqual(10);
  });

  test("audit listener receives entries", () => {
    const guard = new ExecGuard();
    const entries: any[] = [];
    guard.onAudit((e) => entries.push(e));

    guard.check("pi");
    guard.check("curl");

    expect(entries).toHaveLength(2);
  });

  test("audit listener unsubscribe works", () => {
    const guard = new ExecGuard();
    const entries: any[] = [];
    const unsub = guard.onAudit((e) => entries.push(e));

    guard.check("pi");
    unsub();
    guard.check("pi");

    expect(entries).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Arg sanitization
  // -------------------------------------------------------------------------

  test("redacts sensitive args", () => {
    const guard = new ExecGuard();
    guard.check("pi", ["--token", "secret123", "--mode", "rpc"]);

    const log = guard.getAuditLog();
    expect(log[0].args).toEqual(["--token", "[REDACTED]", "--mode", "rpc"]);
  });

  test("redacts inline key=value", () => {
    const guard = new ExecGuard();
    guard.check("pi", ["token=abc123", "--verbose"]);

    const log = guard.getAuditLog();
    expect(log[0].args[0]).toBe("token=[REDACTED]");
    expect(log[0].args[1]).toBe("--verbose");
  });

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  test("getStats returns correct counts", () => {
    const guard = new ExecGuard();
    guard.check("pi");
    guard.check("ps");
    guard.check("curl");
    guard.check("wget");

    const stats = guard.getStats();
    expect(stats.total).toBe(4);
    expect(stats.allowed).toBe(2);
    expect(stats.blocked).toBe(2);
  });

  // -------------------------------------------------------------------------
  // validatePiCliPath
  // -------------------------------------------------------------------------

  test("validatePiCliPath accepts default pi", () => {
    const guard = new ExecGuard();
    expect(() => guard.validatePiCliPath("pi")).not.toThrow();
    expect(() => guard.validatePiCliPath("/usr/local/bin/pi")).not.toThrow();
  });

  test("validatePiCliPath rejects unknown executable", () => {
    const guard = new ExecGuard();
    expect(() => guard.validatePiCliPath("/tmp/malicious")).toThrow("not in exec allowlist");
  });

  test("validatePiCliPath accepts custom allowlisted path", () => {
    const guard = new ExecGuard({ allowedExecutables: ["pi", "ps", "custom-pi"] });
    expect(() => guard.validatePiCliPath("/opt/custom-pi")).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Caller tracking
  // -------------------------------------------------------------------------

  test("records caller in audit entry", () => {
    const guard = new ExecGuard();
    guard.check("pi", [], { caller: "rpc-pool.acquire" });

    const log = guard.getAuditLog();
    expect(log[0].caller).toBe("rpc-pool.acquire");
  });

  // -------------------------------------------------------------------------
  // No audit log mode
  // -------------------------------------------------------------------------

  test("skips audit log when auditLog is false", () => {
    const guard = new ExecGuard({ auditLog: false });
    guard.check("pi");
    guard.check("curl");

    expect(guard.getAuditLog()).toHaveLength(0);
  });

  test("still fires listeners when auditLog is false", () => {
    const guard = new ExecGuard({ auditLog: false });
    const entries: any[] = [];
    guard.onAudit((e) => entries.push(e));

    guard.check("pi");
    expect(entries).toHaveLength(1);
  });
});
