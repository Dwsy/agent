# PRD: pi-gateway v3.2 — Operational Maturity

**Status:** Draft
**Author:** pi-zero (PM), DarkFalcon (architecture)
**Date:** 2026-02-11
**Baseline:** v3.1 (240/240 pass, heartbeat/cron/media delivered)

---

## 1. Overview

v3.2 focuses on operational maturity: making existing features usable (system prompts, cron management), extending media support to WebChat, and hardening media security. No new architectural patterns — this is a "make it work properly" release.

## 2. Target Users

Technical solo devs and 2-5 person teams running pi-gateway for Telegram/Discord/WebChat agent workflows.

## 3. Scope

### Confirmed (v3.2)

| ID | Feature | Priority | Owner | Status |
|---|---|---|---|---|
| F1 | System Prompt Injection | P0 | GoldJaguar | ✅ Done (8759c2e) |
| F2 | Cron CLI Management | P1 | SwiftQuartz | Assigned |
| F3 | WebChat Image Send/Receive | P2 | KeenUnion | Assigned |
| F4 | MEDIA Path Security Hardening | P2.5 | KeenDragon | Assigned |

### Deferred

| Feature | Target | Reason |
|---|---|---|
| WEBP Sticker Understanding | v3.3 | Nice-to-have, not blocking |
| TTS (Text-to-Speech) | v3.3 | Heavy dependency (provider selection) |
| Auth Hardening (fail-closed) | v3.3 Security | Needs dedicated spec |
| SSRF Guard (media fetch) | v3.3 Security | Needs dedicated spec |
| Exec Safety (allowlist + audit) | v3.3 Security | Needs dedicated spec |

---

## 4. Feature Specs

### F1: System Prompt Injection ✅

**Status:** Delivered (8759c2e), pending review by KeenDragon.

Conditionally injects heartbeat/cron/media protocol documentation into agent system prompt via `buildGatewaySystemPrompt(config)`. See `docs/SYSTEM-PROMPT-INJECTION-SPEC.md`.

**Files:** `system-prompts.ts` (new), `capability-profile.ts`, `config.ts`, `telegram/handlers.ts`
**Tests:** SP-1 ~ SP-6, 246/246 pass

---

### F2: Cron CLI Management

**Owner:** SwiftQuartz
**Priority:** P1
**Complexity:** L2 (~150 lines)

#### Problem

Cron engine (`src/core/cron.ts`) supports job execution but has no user-facing CRUD. Users must manually edit `jobs.json` and restart the gateway.

#### Requirements

Expose cron job management via:
1. **Slash commands** (Telegram/Discord): `/cron list`, `/cron add`, `/cron remove`, `/cron pause`, `/cron resume`
2. **HTTP API**: `GET/POST/DELETE /api/cron/jobs`
3. **WebSocket**: `cron.list`, `cron.add`, `cron.remove`, `cron.pause`, `cron.resume`

#### Job CRUD Operations

| Operation | Input | Behavior |
|---|---|---|
| `list` | — | Return all jobs with status (active/paused/completed) |
| `add` | `{ id, schedule, task, agentId?, mode?, deleteAfterRun? }` | Validate schedule, persist to jobs.json, register with croner |
| `remove` | `{ id }` | Stop croner instance, remove from jobs.json |
| `pause` | `{ id }` | Stop croner instance, set `paused: true` in jobs.json |
| `resume` | `{ id }` | Re-register with croner, set `paused: false` |
| `run` | `{ id }` | Manually trigger job execution immediately (for debugging) |

#### HTTP API

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/cron/jobs` | List all jobs |
| `POST` | `/api/cron/jobs` | Add new job |
| `DELETE` | `/api/cron/jobs/:id` | Remove job |
| `PATCH` | `/api/cron/jobs/:id` | Pause/resume (`{ action: "pause" \| "resume" }`) |
| `POST` | `/api/cron/jobs/:id/run` | Manual trigger |

#### Schedule Formats

Already supported by cron.ts:
- `cron`: standard cron expression (e.g., `"0 */6 * * *"`)
- `every`: interval string (e.g., `"30m"`, `"2h"`)
- `at`: one-shot ISO datetime (e.g., `"2026-02-12T10:00:00+08:00"`)

#### Validation Rules

- `id`: alphanumeric + hyphens, 1-64 chars, unique
- `schedule`: must parse without error (croner validates cron, parseInterval for every)
- `task`: non-empty string, max 2000 chars
- `agentId`: must exist in `config.agents.list` (or omit for default)
- `mode`: `"isolated"` (default) or `"main"`

#### Files to Change

| File | Change |
|---|---|
| `src/core/cron.ts` | Add `addJob()`, `removeJob()`, `pauseJob()`, `resumeJob()`, `listJobs()` public methods |
| `src/core/cron-api.ts` | **New** — HTTP route handlers for `/api/cron/jobs` |
| `src/plugins/builtin/telegram/commands.ts` | Add `/cron` command handler |
| `src/plugins/builtin/discord/commands.ts` | Add `/cron` command handler |
| `src/server.ts` | Register cron API routes |

#### Test Scenarios

| ID | Scenario | Expected |
|---|---|---|
| CR-1 | `cron list` with 0 jobs | Empty list response |
| CR-2 | `cron add` valid every job | Job persisted, croner registered |
| CR-3 | `cron add` invalid schedule | Validation error returned |
| CR-4 | `cron add` duplicate id | Conflict error |
| CR-5 | `cron remove` existing job | Job stopped and removed from file |
| CR-6 | `cron remove` non-existent | Not found error |
| CR-7 | `cron pause` active job | Croner stopped, paused flag set |
| CR-8 | `cron resume` paused job | Croner re-registered, paused cleared |
| CR-9 | `cron add` with `deleteAfterRun` | Job self-removes after first execution |
| CR-10 | `cron list` shows run history | Last run time and status visible |
| CR-11 | `cron run <id>` manual trigger | Job executes immediately, result returned |

#### Acceptance Criteria

- [ ] All 5 operations work via HTTP API
- [ ] Telegram `/cron` command functional
- [ ] Jobs survive gateway restart (persisted to jobs.json)
- [ ] Invalid input returns clear error messages
- [ ] CR-1 ~ CR-10 pass

---

### F3: WebChat Image Send/Receive

**Owner:** KeenUnion
**Priority:** P2
**Complexity:** L2 (~120 lines)

#### Problem

WebChat frontend has inbound image support (base64 upload via `chat.send.images`) but lacks:
1. Outbound image rendering — agent replies containing `MEDIA:` directives or image URLs aren't displayed
2. Message history persistence — image messages aren't stored/restored across sessions

#### Requirements

##### Outbound Image Rendering

1. Parse `MEDIA:<path>` directives in agent responses
2. Resolve relative paths against agent workspace
3. Serve images via signed URL: `GET /api/media/:token/:filename` where token = `HMAC(sessionKey + filename + expiry)` — avoids exposing session keys in browser history/Referer/logs
4. Render `<img>` elements in chat message bubbles
5. Support click-to-expand (lightbox)
6. Token expiry: 1 hour default, configurable via `channels.webchat.mediaTokenTtlMs`

##### Inbound Image Display

1. Show thumbnail preview for uploaded images in sent messages
2. Display image dimensions and file size

##### History Persistence

1. Store image references (path, mime, size) in session message history
2. Restore image display when loading previous sessions
3. Clean up orphaned media files on session delete (optional, v3.3 ok)

#### Security

- Serve only files within agent workspace (no path traversal)
- Validate MIME type before serving (image/* only)
- Max file size: `channels.webchat.mediaMaxMb` (default 10MB)

#### Files to Change

| File | Change |
|---|---|
| `src/plugins/builtin/gw-chat/index.ts` | Parse MEDIA directives, serve media endpoint |
| `src/plugins/builtin/gw-chat/web/` | Image rendering components, lightbox |
| `src/core/session-store.ts` | Store image references in message history |

#### Test Scenarios

| ID | Scenario | Expected |
|---|---|---|
| WI-1 | Agent replies with `MEDIA:./output.png` | Image rendered in chat |
| WI-2 | Agent replies with text + MEDIA mixed | Text and image both rendered |
| WI-3 | MEDIA path outside workspace | Blocked, error shown |
| WI-4 | User sends image, reloads session | Image visible in history |
| WI-5 | Non-image MEDIA type | Shown as download link |

#### Acceptance Criteria

- [ ] Agent MEDIA replies render as images in WebChat
- [ ] Uploaded images persist across session reload
- [ ] Path traversal blocked
- [ ] WI-1 ~ WI-5 pass

---

### F4: MEDIA Path Security Hardening

**Owner:** KeenDragon
**Priority:** P2.5
**Complexity:** L1 (~30 lines)

#### Problem

`media-send.ts` has basic path checks but may be insufficient:
- Need to verify: absolute path block, `~` block, `../` traversal block, symlink resolution
- OpenClaw uses `MEDIA_TOKEN_RE` + sandbox root validation

#### Requirements

1. **Audit** existing `media-send.ts` path validation
2. **Add** if missing:
   - `path.resolve()` + check result is within workspace root
   - Symlink resolution (`fs.realpathSync`) before workspace check
   - Block `..` segments after normalization
   - Block null bytes in path
   - Block URL schemes (`://`) — prevents `file:///`, `data:`, etc. (relative paths never contain schemes)
3. **Extract** path validation to reusable `validateMediaPath(path, workspaceRoot): boolean`
4. **Reuse** in WebChat media serving (F3)

#### Files to Change

| File | Change |
|---|---|
| `src/core/media-security.ts` | **New** — `validateMediaPath()` |
| `src/plugins/builtin/telegram/media-send.ts` | Use `validateMediaPath()` |
| `src/plugins/builtin/gw-chat/index.ts` | Use `validateMediaPath()` for serving |

#### Test Scenarios

| ID | Scenario | Expected |
|---|---|---|
| MS-1 | `MEDIA:./output.png` (valid relative) | Allowed |
| MS-2 | `MEDIA:/etc/passwd` (absolute) | Blocked |
| MS-3 | `MEDIA:~/secret.txt` (home) | Blocked |
| MS-4 | `MEDIA:../../etc/passwd` (traversal) | Blocked |
| MS-5 | `MEDIA:./link` where link → /etc/passwd (symlink) | Blocked |
| MS-6 | `MEDIA:./file\x00.png` (null byte) | Blocked |
| MS-7 | `MEDIA:file:///etc/passwd` (file scheme) | Blocked |
| MS-8 | `MEDIA:data:text/html,<script>` (data scheme) | Blocked |

#### Acceptance Criteria

- [ ] `validateMediaPath()` extracted and reusable
- [ ] All 8 attack vectors blocked
- [ ] MS-1 ~ MS-8 pass

---

## 5. Milestones

| Milestone | Content | Target |
|---|---|---|
| M1 | F1 System Prompt Injection | ✅ Done |
| M2 | F4 MEDIA Security + F2 Cron CLI | +2 days |
| M3 | F3 WebChat Images | +3 days |
| M4 | Full test suite green + release | +4 days |

## 6. Roadmap

| Version | Theme | Key Features |
|---|---|---|
| v3.2 | Operational Maturity | System prompts, Cron CLI, WebChat images, MEDIA security |
| v3.3 | Security Hardening | Auth fail-closed, SSRF guard, Exec safety, WEBP stickers, TTS |
| v3.4 | Polish | Session reset policy, Markdown per-channel, Plugin schema, Link understanding |

## 7. Team

| Agent | v3.2 Role |
|---|---|
| pi-zero | PM, coordination |
| DarkFalcon | Architecture review, v3.3 Security spec |
| GoldJaguar | F1 implementation (done) |
| SwiftQuartz | F2 Cron CLI |
| KeenDragon | F1 review + F4 MEDIA security |
| KeenUnion | F3 WebChat images |
| MintTiger | Test suite maintenance |

---

*「段取り八分、仕事二分」— 准备占八分，执行占两分。*
