# Heartbeat & Cron Implementation Spec (v3.1)

**Status:** Approved — ready for implementation
**Author:** DarkFalcon (based on OpenClaw source analysis)
**Date:** 2026-02-11
**Implements:** `docs/HEARTBEAT-CRON-DESIGN.md`
**Assignees:** GoldJaguar (Heartbeat), SwiftQuartz (Cron)

---

## 1. HeartbeatExecutor Improvements

### 1.1 Default Prompt

**Current (insufficient):**
```
Check HEARTBEAT.md. If nothing needs attention, reply HEARTBEAT_OK.
```

**New default:**
```
Read HEARTBEAT.md if it exists. Follow it strictly — do not infer or repeat tasks from prior conversations. If nothing needs attention, reply HEARTBEAT_OK.
```

**Rationale:** Without "do not infer" guard, models hallucinate old tasks from session context. OpenClaw uses identical phrasing (`src/auto-reply/heartbeat.ts:HEARTBEAT_PROMPT`).

**Location:** `heartbeat-executor.ts` constant `DEFAULT_HEARTBEAT_PROMPT`.

### 1.2 `isHeartbeatContentEffectivelyEmpty(content: string): boolean`

Skip API calls when HEARTBEAT.md exists but has no actionable content.

**Rules — a line is "empty" if it matches ANY of:**
- Whitespace-only or blank
- ATX heading: `/^#+(\s|$)/` (e.g. `# Heartbeat`, `## Tasks`)
- Empty list item: `/^[-*+]\s*(\[[\sXx]?\]\s*)?$/` (e.g. `- [ ]`, `* `)

**A file is effectively empty when ALL lines are "empty".**

```ts
export function isHeartbeatContentEffectivelyEmpty(content: string | null | undefined): boolean {
  if (content == null) return false; // missing file ≠ empty (let agent decide)
  if (typeof content !== "string") return false;

  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^#+(\s|$)/.test(t)) continue;
    if (/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(t)) continue;
    return false; // found actionable content
  }
  return true;
}
```

**Integration point:** `HeartbeatExecutor.runOnce()`, after reading HEARTBEAT.md, before `findBestMatch`:
```ts
const content = readFileSync(heartbeatPath, "utf-8");
if (isHeartbeatContentEffectivelyEmpty(content)) {
  this.events.onHeartbeatSkip?.(agentId, "empty-heartbeat-file");
  return { status: "skipped" };
}
```

**Edge case:** `null`/`undefined` (file missing) returns `false` — let the agent decide what to do when no HEARTBEAT.md exists.

### 1.3 `stripHeartbeatToken(raw: string, ackMaxChars: number)`

Replace the current `response.includes("HEARTBEAT_OK")` + `replace()` with edge-strip logic.

**Algorithm:**
1. Trim input. Empty → `{ shouldSkip: true, text: "" }`
2. Strip HTML tags and markdown wrappers (`**HEARTBEAT_OK**` → `HEARTBEAT_OK`)
3. Iteratively strip `HEARTBEAT_OK` from start and end (loop until stable)
4. Collapse whitespace
5. If `didStrip && remaining.length <= ackMaxChars` → suppress (status: "ok")
6. If `didStrip && remaining.length > ackMaxChars` → alert (meaningful content beyond ack)
7. If `!didStrip` → alert (no token found)

```ts
const HEARTBEAT_TOKEN = "HEARTBEAT_OK";

function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/^[*`~_]+/, "")
    .replace(/[*`~_]+$/, "");
}

export function stripHeartbeatToken(
  raw: string | null | undefined,
  ackMaxChars = 300,
): { shouldSkip: boolean; text: string; didStrip: boolean } {
  if (!raw?.trim()) return { shouldSkip: true, text: "", didStrip: false };

  let text = stripMarkup(raw).trim();
  if (!text.includes(HEARTBEAT_TOKEN)) {
    return { shouldSkip: false, text: raw.trim(), didStrip: false };
  }

  let didStrip = false;
  let changed = true;
  while (changed) {
    changed = false;
    const next = text.trim();
    if (next.startsWith(HEARTBEAT_TOKEN)) {
      text = next.slice(HEARTBEAT_TOKEN.length).trimStart();
      didStrip = true;
      changed = true;
      continue;
    }
    if (next.endsWith(HEARTBEAT_TOKEN)) {
      text = next.slice(0, next.length - HEARTBEAT_TOKEN.length).trimEnd();
      didStrip = true;
      changed = true;
    }
  }

  text = text.replace(/\s+/g, " ").trim();

  if (didStrip && text.length <= ackMaxChars) {
    return { shouldSkip: true, text, didStrip: true };
  }
  return { shouldSkip: false, text: text || raw.trim(), didStrip };
}
```

**Replace `processResponse` in heartbeat-executor.ts:**
```ts
private processResponse(response: string, hbConfig: HeartbeatConfig): HeartbeatResult {
  const { shouldSkip, text, didStrip } = stripHeartbeatToken(response, hbConfig.ackMaxChars);
  if (shouldSkip) {
    return { status: "ok", response: text || undefined };
  }
  return { status: "alert", response: text };
}
```

### 1.4 Pool min=1 Degradation Strategy

**Problem:** When `pool.min=1` and the single process is busy, `findBestMatch` always returns null → heartbeat never executes.

**Strategy: Bounded retry with backoff.**

```ts
private async acquireForHeartbeat(agentId: string): Promise<RpcClient | null> {
  const profile = buildCapabilityProfile({ config: this.config, role: "default", cwd: ".", sessionKey: "" });

  // Attempt 1: immediate
  let rpc = this.pool.findBestMatch(profile);
  if (rpc) return rpc;

  // Attempt 2-3: short waits (only if pool.min >= 2 or pool has capacity)
  const maxRetries = 2;
  const retryDelayMs = 5000; // 5s between retries
  for (let i = 0; i < maxRetries; i++) {
    await sleep(retryDelayMs);
    rpc = this.pool.findBestMatch(profile);
    if (rpc) return rpc;
  }

  // All retries exhausted
  this.log.info(`[heartbeat] No idle RPC after ${maxRetries + 1} attempts, skipping`);
  this.events.onHeartbeatSkip?.(agentId, "no-idle-rpc");
  return null;
}
```

**Constraints:**
- Total wait ≤ 10s (2 retries × 5s). Heartbeat must not block queue processing.
- Never call `pool.acquire()` (which spawns). Always `findBestMatch()` (opportunistic).
- Log skip events for observability.

**Config recommendation in docs:** `pool.min >= 2` when heartbeat is enabled.

---

## 2. Cron Main Mode

### 2.1 System Events Queue

Gateway-layer in-memory queue for cross-cutting events (cron results, exec completions).

**Location:** New file `src/core/system-events.ts`

```ts
export class SystemEventsQueue {
  private events = new Map<string, { text: string; createdAt: number }[]>();
  private maxPerSession = 20;
  private maxAgeSec = 3600; // 1 hour TTL

  inject(sessionKey: string, eventText: string): void {
    if (!this.events.has(sessionKey)) {
      this.events.set(sessionKey, []);
    }
    const queue = this.events.get(sessionKey)!;
    queue.push({ text: eventText, createdAt: Date.now() });

    // Evict oldest if over limit
    while (queue.length > this.maxPerSession) {
      queue.shift();
    }
  }

  peek(sessionKey: string): string[] {
    this.evictExpired(sessionKey);
    return (this.events.get(sessionKey) ?? []).map(e => e.text);
  }

  consume(sessionKey: string): string[] {
    const items = this.peek(sessionKey);
    this.events.delete(sessionKey);
    return items;
  }

  private evictExpired(sessionKey: string): void {
    const queue = this.events.get(sessionKey);
    if (!queue) return;
    const cutoff = Date.now() - this.maxAgeSec * 1000;
    const filtered = queue.filter(e => e.createdAt > cutoff);
    if (filtered.length === 0) {
      this.events.delete(sessionKey);
    } else {
      this.events.set(sessionKey, filtered);
    }
  }

  /** Cleanup all expired entries (call periodically). */
  gc(): void {
    for (const key of this.events.keys()) {
      this.evictExpired(key);
    }
  }
}
```

**Lifecycle:** Instantiated in `Gateway` constructor, passed to both `HeartbeatExecutor` and `CronEngine`.

### 2.2 Cron Main Mode Flow

When `job.mode === "main"`:

```
CronEngine.triggerJob(job)
  → systemEvents.inject(mainSessionKey, `[CRON:${job.id}] ${job.payload.text}`)
  → if heartbeat enabled: requestHeartbeatNow(agentId)  // wake heartbeat immediately
  → if heartbeat disabled: log warning (main mode requires heartbeat)
```

**CronEngine changes (`cron.ts`):**

```ts
// Add to constructor
constructor(
  private dataDir: string,
  private dispatcher: CronDispatcher,
  private config?: Config,
  private announcer?: CronAnnouncer,
  private systemEvents?: SystemEventsQueue,  // NEW
  private heartbeatWake?: (agentId: string) => void,  // NEW
) { ... }

// In triggerJob, before dispatch:
private triggerJob(job: CronJob): void {
  const agentId = job.agentId ?? this.config?.agents?.default ?? "main";

  if (job.mode === "main") {
    // Main mode: inject system event, let heartbeat handle it
    const mainSessionKey = resolveMainSessionKey(agentId, this.config);
    this.systemEvents?.inject(mainSessionKey, `[CRON:${job.id}] ${job.payload.text}`);
    this.log.info(`[cron:${job.id}] Injected system event for main session ${mainSessionKey}`);

    // Wake heartbeat to process the event
    this.heartbeatWake?.(agentId);

    // Record run as "injected" (actual execution happens via heartbeat)
    this.recordRun({
      jobId: job.id, startedAt: Date.now(), finishedAt: Date.now(),
      durationMs: 0, status: "completed",
      resultPreview: "(injected to main session via system event)",
    });
    return;
  }

  // Isolated mode: existing dispatch logic (unchanged)
  // ...
}
```

### 2.3 Heartbeat System Events Integration

**HeartbeatExecutor changes:**

```ts
constructor(
  private config: Config,
  private pool: RpcPool,
  private events: HeartbeatExecutorEvents = {},
  private systemEvents?: SystemEventsQueue,  // NEW
) { ... }

// In runOnce, after reading HEARTBEAT.md:
async runOnce(agentId: string = "default"): Promise<HeartbeatResult> {
  // ... existing checks ...

  // Check for pending system events
  const sessionKey = resolveMainSessionKey(agentId, this.config);
  const pendingEvents = this.systemEvents?.peek(sessionKey) ?? [];
  const hasCronEvents = pendingEvents.length > 0;

  // Select prompt based on pending events
  let prompt: string;
  if (hasCronEvents) {
    prompt = CRON_EVENT_PROMPT;
    // Prepend events as context
    const eventsBlock = pendingEvents.map(e => `- ${e}`).join("\n");
    prompt = `${eventsBlock}\n\n${prompt}`;
  } else {
    prompt = hbConfig.prompt;
  }

  // ... acquire RPC, send prompt ...

  // After successful response: consume events
  if (hasCronEvents) {
    this.systemEvents?.consume(sessionKey);
  }

  return this.processResponse(response, hbConfig);
}
```

### 2.4 Prompt Templates

```ts
export const DEFAULT_HEARTBEAT_PROMPT =
  "Read HEARTBEAT.md if it exists. Follow it strictly — do not infer or repeat tasks from prior conversations. If nothing needs attention, reply HEARTBEAT_OK.";

export const CRON_EVENT_PROMPT =
  "Scheduled tasks have fired and their details are shown above. " +
  "Process each task and relay the results. " +
  "If you completed all tasks successfully, include HEARTBEAT_OK at the end.";

export const EXEC_EVENT_PROMPT =
  "An async command you ran earlier has completed. The result is shown above. " +
  "Relay the output to the user — share relevant output on success, explain what went wrong on failure.";
```

### 2.5 `requestHeartbeatNow(agentId)`

Allow cron (or other subsystems) to wake heartbeat outside its normal schedule.

```ts
// In HeartbeatExecutor:
private wakeRequests = new Set<string>();

requestNow(agentId: string): void {
  this.wakeRequests.add(agentId);
  // If timer is running, don't interrupt — the next tick will check wakeRequests
  // For immediate wake, schedule a one-shot:
  setTimeout(() => this.checkWakeRequests(), 1000);
}

private async checkWakeRequests(): Promise<void> {
  for (const agentId of this.wakeRequests) {
    this.wakeRequests.delete(agentId);
    await this.runOnce(agentId);
  }
}
```

**Exposed to CronEngine via callback:** `heartbeatWake: (agentId) => heartbeat.requestNow(agentId)`

---

## 3. Configuration

### 3.1 Heartbeat Config (add to `Config` interface)

```ts
// In config.ts — add to Config interface:
export interface Config {
  // ... existing fields ...
  heartbeat: HeartbeatConfig;
}

export interface HeartbeatConfig {
  /** Enable heartbeat. Default: false */
  enabled: boolean;
  /** Interval between heartbeats. Format: "30m", "1h", "5m". Default: "30m" */
  every: string;
  /** Active hours window. Heartbeat skipped outside this range. */
  activeHours?: {
    start: string;   // "HH:MM" format, e.g. "08:00"
    end: string;     // "HH:MM" format, e.g. "23:00"
    timezone: string; // IANA timezone, e.g. "Asia/Shanghai"
  };
  /** Prompt sent to agent. Default: see DEFAULT_HEARTBEAT_PROMPT */
  prompt: string;
  /** Max chars of remaining text after stripping HEARTBEAT_OK to still suppress. Default: 300 */
  ackMaxChars: number;
  /** Skip heartbeat when session has pending messages. Default: true */
  skipWhenBusy: boolean;
  /** Max retry attempts when no idle RPC available. Default: 2 */
  maxRetries: number;
  /** Delay between retries in ms. Default: 5000 */
  retryDelayMs: number;
}
```

**Per-agent override:** `agents.list[].heartbeat` — same shape, partial. Merged with global defaults.

**Defaults:**
```ts
// In DEFAULT_CONFIG:
heartbeat: {
  enabled: false,
  every: "30m",
  prompt: DEFAULT_HEARTBEAT_PROMPT,
  ackMaxChars: 300,
  skipWhenBusy: true,
  maxRetries: 2,
  retryDelayMs: 5000,
},
```

### 3.2 Cron Config (already exists, extend)

```ts
export interface CronJob {
  id: string;
  schedule: CronSchedule;
  payload: { text: string };
  enabled?: boolean;           // Default: true
  agentId?: string;            // Default: config.agents.default
  sessionKey?: string;         // Default: "cron:{id}" for isolated, main session key for main
  mode?: "isolated" | "main";  // Default: "isolated"
  delivery?: "announce" | "silent"; // Default: "silent"
  timeoutMs?: number;          // Default: config.delegation.timeoutMs (120000)
  deleteAfterRun?: boolean;    // Default: false. If true, remove job after first execution (for "at" jobs)
}

export type CronSchedule =
  | { kind: "cron"; expr: string; timezone?: string }  // "0 9 * * *"
  | { kind: "every"; expr: string }                     // "30m", "1h", "5s"
  | { kind: "at"; expr: string };                       // ISO 8601 timestamp
```

### 3.3 Example Configuration (production-ready)

```jsonc
// pi-gateway.jsonc
{
  "heartbeat": {
    "enabled": true,
    "every": "30m",
    "activeHours": {
      "start": "08:00",
      "end": "23:00",
      "timezone": "Asia/Shanghai"
    },
    "skipWhenBusy": true
    // prompt, ackMaxChars, maxRetries, retryDelayMs use defaults
  },

  "cron": {
    "enabled": true,
    "jobs": [
      {
        "id": "daily-status",
        "schedule": { "kind": "cron", "expr": "0 9 * * *", "timezone": "Asia/Shanghai" },
        "payload": { "text": "Generate a brief daily status report of recent activity." },
        "agentId": "main",
        "mode": "isolated",
        "delivery": "announce",
        "timeoutMs": 180000
      },
      {
        "id": "hourly-check",
        "schedule": { "kind": "every", "expr": "1h" },
        "payload": { "text": "Check system health and report any anomalies." },
        "mode": "main",
        "delivery": "silent"
      },
      {
        "id": "one-shot-reminder",
        "schedule": { "kind": "at", "expr": "2026-02-12T14:00:00+08:00" },
        "payload": { "text": "Remind user about the 2pm meeting." },
        "mode": "isolated",
        "delivery": "announce",
        "deleteAfterRun": true
      }
    ]
  },

  "agent": {
    "pool": {
      "min": 2,
      "max": 4,
      "idleTimeoutMs": 300000
    }
  }
}
```

---

## 4. Test Scenario Matrix

### 4.1 Heartbeat Tests

| # | Scenario | Input | Expected | Priority |
|---|----------|-------|----------|----------|
| H1 | Normal suppress | Agent replies "HEARTBEAT_OK" | status: "ok", no delivery | P0 |
| H2 | Suppress with ack text | "HEARTBEAT_OK\nAll good, 3 tasks done" (< 300 chars) | status: "ok", text: "All good, 3 tasks done" | P0 |
| H3 | Alert — meaningful content | "Disk usage at 95%, action needed" | status: "alert", deliver to channel | P0 |
| H4 | Alert — token + long text | "HEARTBEAT_OK\n{500 chars of report}" (> ackMaxChars) | status: "alert", deliver full text | P0 |
| H5 | Token in markdown | "**HEARTBEAT_OK**" | Strip markup → suppress | P1 |
| H6 | Token in HTML | "<b>HEARTBEAT_OK</b>" | Strip markup → suppress | P1 |
| H7 | Empty HEARTBEAT.md | File contains only `# Heartbeat\n- [ ]\n` | Skip (no API call) | P0 |
| H8 | Missing HEARTBEAT.md | File doesn't exist | Execute heartbeat (let agent decide) | P0 |
| H9 | activeHours — inside | Current time 14:00, window 08:00-23:00 | Execute | P0 |
| H10 | activeHours — outside | Current time 03:00, window 08:00-23:00 | Skip | P0 |
| H11 | Pool full (min=1, busy) | findBestMatch returns null × 3 | Skip after retries, log event | P0 |
| H12 | Pool retry success | findBestMatch null → null → returns client | Execute on 3rd attempt | P1 |
| H13 | skipWhenBusy | Session has pending queue items | Skip | P1 |
| H14 | Per-agent override | Agent "code" has custom every: "10m" | Use agent-specific interval | P1 |
| H15 | Error handling | RPC prompt throws | status: "error", schedule next | P0 |
| H16 | Concurrent guard | Timer fires while previous heartbeat still running | Skip (don't stack) | P1 |

### 4.2 Cron Tests

| # | Scenario | Input | Expected | Priority |
|---|----------|-------|----------|----------|
| C1 | Isolated — basic | cron job fires, mode=isolated | New session "cron:{id}", dispatch, record run | P0 |
| C2 | Isolated — announce | delivery=announce, agent responds | Response sent to bound channel | P0 |
| C3 | Isolated — silent | delivery=silent | Response logged only, no channel delivery | P1 |
| C4 | Isolated — timeout | Agent takes > timeoutMs | status: "timeout" in run history | P0 |
| C5 | Main — inject | mode=main, cron fires | System event injected, heartbeat woken | P0 |
| C6 | Main — heartbeat consumes | Heartbeat runs with pending cron events | CRON_EVENT_PROMPT used, events consumed after response | P0 |
| C7 | Main — no heartbeat | mode=main but heartbeat disabled | Log warning, event injected but may not be consumed | P1 |
| C8 | Schedule — cron expr | "0 9 * * *" | Fires at 09:00 daily | P0 |
| C9 | Schedule — every | "30m" | Fires every 30 minutes | P0 |
| C10 | Schedule — at (future) | ISO timestamp in future | Fires once at target time, auto-removes | P0 |
| C11 | Schedule — at (past) | ISO timestamp in past | Fires immediately, auto-removes | P1 |
| C12 | Job CRUD | addJob / removeJob / listJobs | Persisted to jobs.json, schedule updated | P0 |
| C13 | Run history | Multiple executions | JSONL appended, getRunHistory returns last N | P1 |
| C14 | Disabled job | enabled: false | Not scheduled | P1 |

### 4.3 Integration / Linkage Tests

| # | Scenario | Flow | Expected | Priority |
|---|----------|------|----------|----------|
| L1 | Cron main → heartbeat | Cron fires (main) → injects event → heartbeat wakes → consumes | Agent receives CRON_EVENT_PROMPT with event details | P0 |
| L2 | Multiple cron events | 3 cron jobs fire before heartbeat runs | All 3 events in prompt, all consumed after response | P0 |
| L3 | Event TTL expiry | Event injected, heartbeat doesn't run for 2 hours | Event expired, not delivered | P1 |
| L4 | Event queue overflow | 25 events injected (max 20) | Oldest 5 evicted | P1 |
| L5 | Heartbeat + normal message | Heartbeat running when user sends message | Heartbeat completes, message queued normally (no interference) | P0 |
| L6 | Cron isolated + heartbeat | Isolated cron and heartbeat fire simultaneously | Both acquire separate RPC processes (or one waits) | P1 |
| L7 | Gateway restart | Jobs in jobs.json, gateway restarts | Jobs re-scheduled on start() | P0 |

---

## 5. File Change Summary

| File | Change | Assignee |
|------|--------|----------|
| `src/core/heartbeat-executor.ts` | Rewrite processResponse, add isHeartbeatContentEffectivelyEmpty, add retry logic, add requestNow, integrate systemEvents | GoldJaguar |
| `src/core/system-events.ts` | **New file** — SystemEventsQueue class | GoldJaguar |
| `src/core/cron.ts` | Add main mode (inject + heartbeat wake), accept systemEvents + heartbeatWake deps | SwiftQuartz |
| `src/core/config.ts` | Add HeartbeatConfig to Config interface + DEFAULT_CONFIG | GoldJaguar |
| `src/server.ts` | Instantiate SystemEventsQueue, wire to HeartbeatExecutor + CronEngine | GoldJaguar |
| `src/core/bbd-v31-heartbeat-cron-media.test.ts` | Expand with all scenarios from §4 matrix | MintTiger |

---

*Based on OpenClaw source analysis (src/auto-reply/heartbeat.ts, src/infra/heartbeat-runner.ts, src/cron/, src/infra/system-events.ts). DarkFalcon, 2026-02-11.*
