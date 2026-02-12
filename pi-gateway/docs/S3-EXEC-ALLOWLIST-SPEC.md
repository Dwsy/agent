# S3: Exec Allowlist — Command Execution Restrictions

**Status:** Implemented
**Author:** JadeHawk (SwiftQuartz)
**Date:** 2026-02-12
**PRD Ref:** v3.4 P2-S3

---

## 1. Problem

pi-gateway spawns subprocesses (`Bun.spawn`) in several paths:
- `rpc-client.ts` — spawns `pi` CLI (main attack surface)
- `daemon.ts` — launchctl/systemctl (system management)
- `metrics.ts` — `ps` for RSS monitoring

Without an allowlist, a malicious plugin or config injection could spawn arbitrary executables.

## 2. Design

### ExecGuard class (`src/core/exec-guard.ts`)

- **Allowlist**: Default `["pi", "ps"]`, configurable
- **Fail-closed**: `blockUnlisted: true` by default
- **Audit log**: All spawn attempts (allowed + blocked) recorded with timestamps, args, caller
- **Arg sanitization**: Sensitive flags (`--token`, `--key`, `--secret`, `--password`) auto-redacted in audit
- **Listener API**: `onAudit(callback)` for external logging/metrics integration
- **Startup validation**: `validatePiCliPath()` checks config `piCliPath` against allowlist

### Config

```jsonc
{
  "security": {
    "exec": {
      "enabled": true,
      "allowedExecutables": ["pi", "ps"],
      "auditLog": true,
      "blockUnlisted": true
    }
  }
}
```

## 3. Integration Points

- `rpc-pool.ts` → `guard.check("pi", args, { caller: "rpc-pool" })` before `Bun.spawn`
- `metrics.ts` → `guard.check("ps", ...)` before RSS sampling
- `GatewayPluginApi` → expose `execGuard.check()` so plugins can validate before spawning
- Cron isolated mode → guard check before spawning isolated pi process

## 4. Test Coverage

20 tests in `bbd-v34-exec-guard.test.ts`:
- Allowlist: default, custom, absolute path (basename + full), disabled, warn mode
- Audit: recording, max entries, listeners, unsubscribe, no-audit mode
- Sanitization: sensitive flags (two-pass), inline key=value
- Stats, caller tracking, piCliPath validation

## 5. Cron Intersection

S3 naturally gates cron dispatch — `CronEngine.triggerJob` isolated mode spawns a pi process via the pool, which goes through `ExecGuard.check()`. No separate cron-specific guard needed.
