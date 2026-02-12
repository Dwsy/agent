# S2: SSRF Guard — Outbound URL Validation

**Status:** Draft
**Author:** JadeHawk (SwiftQuartz)
**Date:** 2026-02-12
**PRD Ref:** v3.4 P2-S2

---

## 1. Problem

pi-gateway makes outbound HTTP requests in several paths:
- Telegram media download (`media-download.ts`) — fetches from Telegram file API
- Audio transcription (`audio-transcribe.ts`) — fetches from configured STT endpoint
- Future: `send_message` tool, webhook delivery, plugin-initiated fetches

An agent or malicious input could craft URLs targeting internal services (169.254.169.254 metadata, localhost services, private network hosts). Without validation, the gateway becomes an SSRF proxy.

## 2. Current Attack Surface

| Path | URL Source | Risk |
|---|---|---|
| `media-download.ts` | Telegram API `getFile` response | Low — Telegram controls the URL |
| `audio-transcribe.ts` | `config.stt.baseUrl` | Low — config-controlled |
| Plugin HTTP handlers | Plugin code | Medium — third-party plugins |
| Future tools (web_fetch, send_message) | Agent output | High — agent-controlled |

## 3. Design

### 3.1 Core: `validateOutboundUrl(url: string, opts?): ValidationResult`

Location: `src/core/ssrf-guard.ts`

```typescript
interface SsrfGuardOptions {
  allowPrivate?: boolean;       // default: false
  allowedHosts?: string[];      // explicit allowlist (e.g., ["api.telegram.org"])
  blockedCidrs?: string[];      // additional blocked ranges
  allowLocalhost?: boolean;     // default: false
  maxRedirects?: number;        // default: 0 (no redirects)
}

interface ValidationResult {
  allowed: boolean;
  reason?: string;              // human-readable block reason
  resolvedIp?: string;          // resolved IP for logging
}

export function validateOutboundUrl(
  url: string,
  opts?: SsrfGuardOptions,
): ValidationResult;
```

### 3.2 Blocked by Default

**Private/reserved IP ranges (RFC 1918 + RFC 6890):**
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `127.0.0.0/8` (loopback)
- `169.254.0.0/16` (link-local, AWS metadata)
- `0.0.0.0/8`
- `::1`, `fc00::/7`, `fe80::/10` (IPv6 equivalents)

**Dangerous schemes:**
- Only `http:` and `https:` allowed
- Block `file:`, `ftp:`, `gopher:`, `data:`, `javascript:`, etc.

**DNS rebinding defense:**
- Resolve hostname → IP before request
- Validate resolved IP against blocked ranges
- Pass resolved IP to fetch (avoid TOCTOU)

### 3.3 Config Integration

```jsonc
// pi-gateway.jsonc
{
  "security": {
    "ssrf": {
      "enabled": true,                    // default: true
      "allowPrivateNetworks": false,      // default: false
      "allowedHosts": [                   // bypass SSRF check entirely
        "api.telegram.org",
        "api.openai.com"
      ],
      "blockedHosts": [],                 // additional blocks
      "maxRedirects": 0                   // redirect following
    }
  }
}
```

### 3.4 Integration Points

**Immediate (v3.4):**
1. Wrap `audio-transcribe.ts` fetch with guard (config URL validated once at startup)
2. Export `safeFetch(url, init, ssrfOpts)` — drop-in replacement for `fetch` that validates first
3. Plugin API: `pluginApi.safeFetch(url, init)` — plugins use this instead of raw fetch

**Future:**
4. `send_message` tool URL validation (if URLs in messages)
5. Webhook delivery URL validation
6. Agent web_fetch tool

### 3.5 Bypass for Trusted Sources

Telegram media download uses Telegram API URLs (`api.telegram.org`) — these are in the default `allowedHosts`. No code change needed there.

Config-controlled URLs (STT endpoint) are validated once at startup, not per-request.

## 4. Implementation Plan

1. `src/core/ssrf-guard.ts` — pure functions, zero deps
   - `isPrivateIp(ip: string): boolean`
   - `validateOutboundUrl(url, opts): ValidationResult`
   - `safeFetch(url, init, opts): Promise<Response>`
2. `src/core/config.ts` — add `security.ssrf` section
3. `src/plugins/types.ts` — add `safeFetch` to `GatewayPluginApi`
4. `src/core/bbd-v34-ssrf-guard.test.ts` — unit tests
5. Wire into `audio-transcribe.ts` (startup validation)

## 5. Test Cases

| ID | Case | Expected |
|---|---|---|
| SSRF-1 | `http://169.254.169.254/latest/meta-data` | Blocked (link-local) |
| SSRF-2 | `http://127.0.0.1:8080/admin` | Blocked (loopback) |
| SSRF-3 | `http://10.0.0.1/internal` | Blocked (private) |
| SSRF-4 | `http://[::1]/secret` | Blocked (IPv6 loopback) |
| SSRF-5 | `https://api.telegram.org/file/bot123/photo.jpg` | Allowed (allowedHosts) |
| SSRF-6 | `file:///etc/passwd` | Blocked (scheme) |
| SSRF-7 | `http://evil.com` (resolves to 127.0.0.1) | Blocked (DNS rebinding) |
| SSRF-8 | `https://api.openai.com/v1/audio` | Allowed (allowedHosts) |
| SSRF-9 | `http://192.168.1.1` with `allowPrivateNetworks: true` | Allowed |
| SSRF-10 | Redirect to private IP | Blocked (maxRedirects: 0) |

## 6. Non-Goals

- Full WAF / request body inspection
- Rate limiting outbound requests (separate concern)
- TLS certificate pinning
