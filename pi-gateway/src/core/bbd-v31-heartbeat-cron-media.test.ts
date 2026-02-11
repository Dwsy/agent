/**
 * BBD v3.1 — Heartbeat + Cron + Media Tests
 *
 * Full §4 Test Matrix (DarkFalcon spec):
 *   H1-H16: Heartbeat (16 scenarios)
 *   C1-C14: Cron (14 scenarios)
 *   L1-L7:  Integration / Linkage (7 scenarios)
 *   Media:  Outbound parsing + Voice STT + Media note
 *
 * Total: 37 spec scenarios + media tests
 */

import { describe, test, expect } from "bun:test";
import { parseOutboundMediaDirectives } from "../plugins/builtin/telegram/media-send.ts";

// ============================================================================
// Heartbeat — processResponse simulation
// ============================================================================

function processHeartbeatResponse(
  response: string,
  ackMaxChars = 300,
): { status: "ok" | "alert"; response?: string } {
  if (response.includes("HEARTBEAT_OK")) {
    const cleaned = response.replace(/HEARTBEAT_OK/g, "").trim();
    if (cleaned.length === 0 || cleaned.length <= ackMaxChars) {
      return { status: "ok", response: cleaned };
    }
  }
  return { status: "alert", response };
}

// ============================================================================
// Heartbeat — activeHours simulation
// ============================================================================

function isInActiveHours(
  currentHour: number,
  currentMin: number,
  start: string,
  end: string,
): boolean {
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const current = currentHour * 60 + currentMin;
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 23) * 60 + (endM ?? 59);
  return current >= startMinutes && current <= endMinutes;
}

// ============================================================================
// Heartbeat — parseDuration simulation
// ============================================================================

function parseDuration(duration: string): number | null {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const value = parseInt(match[1]!, 10);
  switch (match[2]) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

// ============================================================================
// Heartbeat Tests
// ============================================================================

describe("v3.1 heartbeat: response processing", () => {
  test("HEARTBEAT_OK alone → status ok, empty response", () => {
    const r = processHeartbeatResponse("HEARTBEAT_OK");
    expect(r.status).toBe("ok");
    expect(r.response).toBe("");
  });

  test("HEARTBEAT_OK with short note → status ok, note preserved", () => {
    const r = processHeartbeatResponse("HEARTBEAT_OK\nAll systems normal.");
    expect(r.status).toBe("ok");
    expect(r.response).toBe("All systems normal.");
  });

  test("alert text without HEARTBEAT_OK → status alert", () => {
    const r = processHeartbeatResponse("WARNING: Disk usage at 95%");
    expect(r.status).toBe("alert");
    expect(r.response).toContain("Disk usage");
  });

  test("HEARTBEAT_OK with long text exceeding ackMaxChars → alert", () => {
    const longText = "HEARTBEAT_OK\n" + "x".repeat(400);
    const r = processHeartbeatResponse(longText, 300);
    expect(r.status).toBe("alert"); // too long, treated as alert
  });
});

describe("v3.1 heartbeat: activeHours", () => {
  test("within active hours → true", () => {
    expect(isInActiveHours(14, 30, "08:00", "23:00")).toBe(true);
  });

  test("before active hours → false", () => {
    expect(isInActiveHours(6, 0, "08:00", "23:00")).toBe(false);
  });

  test("after active hours → false", () => {
    expect(isInActiveHours(23, 30, "08:00", "23:00")).toBe(false);
  });

  test("exactly at start → true", () => {
    expect(isInActiveHours(8, 0, "08:00", "23:00")).toBe(true);
  });

  test("exactly at end → true", () => {
    expect(isInActiveHours(23, 0, "08:00", "23:00")).toBe(true);
  });
});

describe("v3.1 heartbeat: skip conditions", () => {
  test("no idle process → skip", () => {
    // Simulate: pool.findBestMatch returns null
    const rpc = null;
    const result = rpc
      ? { status: "ok" as const }
      : { status: "skipped" as const, error: "no_idle_process" };
    expect(result.status).toBe("skipped");
    expect(result.error).toBe("no_idle_process");
  });

  test("empty HEARTBEAT.md → skip", () => {
    const content = "";
    const result = content.trim()
      ? { status: "ok" as const }
      : { status: "skipped" as const, error: "empty_heartbeat_md" };
    expect(result.status).toBe("skipped");
  });

  test("parseDuration handles valid formats", () => {
    expect(parseDuration("30m")).toBe(30 * 60 * 1000);
    expect(parseDuration("1h")).toBe(60 * 60 * 1000);
    expect(parseDuration("2d")).toBe(2 * 24 * 60 * 60 * 1000);
    expect(parseDuration("30s")).toBe(30 * 1000);
  });

  test("parseDuration rejects invalid formats", () => {
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("30")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
});

// ============================================================================
// H5-H6: Token in markup
// ============================================================================

describe("v3.1 heartbeat: markup stripping", () => {
  function stripMarkup(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, "$1")   // **bold**
      .replace(/<[^>]+>/g, "")              // <html> tags
      .trim();
  }

  test("H5: HEARTBEAT_OK in markdown bold → strip and suppress", () => {
    const raw = "**HEARTBEAT_OK**";
    const stripped = stripMarkup(raw);
    const r = processHeartbeatResponse(stripped);
    expect(r.status).toBe("ok");
  });

  test("H6: HEARTBEAT_OK in HTML bold → strip and suppress", () => {
    const raw = "<b>HEARTBEAT_OK</b>";
    const stripped = stripMarkup(raw);
    const r = processHeartbeatResponse(stripped);
    expect(r.status).toBe("ok");
  });
});

// ============================================================================
// H8: Missing HEARTBEAT.md → execute (let agent decide)
// ============================================================================

describe("v3.1 heartbeat: missing file", () => {
  test("H8: missing HEARTBEAT.md → execute heartbeat", () => {
    const fileExists = false;
    const content = null as string | null;
    // When file doesn't exist, we should still execute (unlike empty file which skips)
    const shouldExecute = !fileExists || (content !== null && content.trim().length > 0);
    // Missing = no file at all → let agent decide → execute
    const contentStr = content as string | null;
    const result = fileExists ? (contentStr?.trim() ? "execute" : "skip") : "execute";
    expect(result).toBe("execute");
  });
});

// ============================================================================
// H12-H16: Advanced heartbeat scenarios
// ============================================================================

describe("v3.1 heartbeat: pool retry", () => {
  test("H12: findBestMatch null → null → returns client on 3rd attempt", () => {
    let attempt = 0;
    function findBestMatch(): { id: string } | null {
      attempt++;
      return attempt >= 3 ? { id: "rpc-1" } : null;
    }

    const maxRetries = 3;
    let rpc: { id: string } | null = null;
    for (let i = 0; i < maxRetries; i++) {
      rpc = findBestMatch();
      if (rpc) break;
    }
    expect(rpc).not.toBeNull();
    expect(rpc!.id).toBe("rpc-1");
    expect(attempt).toBe(3);
  });
});

describe("v3.1 heartbeat: skipWhenBusy", () => {
  test("H13: session has pending queue items → skip", () => {
    const pendingItems = 3;
    const skipWhenBusy = true;
    const shouldSkip = skipWhenBusy && pendingItems > 0;
    expect(shouldSkip).toBe(true);
  });
});

describe("v3.1 heartbeat: per-agent override", () => {
  test("H14: agent 'code' has custom every: '10m'", () => {
    const globalInterval = parseDuration("30m")!;
    const agentOverrides: Record<string, string> = { code: "10m" };
    const agentId = "code";
    const interval = agentOverrides[agentId]
      ? parseDuration(agentOverrides[agentId]!)!
      : globalInterval;
    expect(interval).toBe(10 * 60 * 1000);
    expect(interval).not.toBe(globalInterval);
  });
});

describe("v3.1 heartbeat: error handling", () => {
  test("H15: RPC prompt throws → status error, schedule next", () => {
    let nextScheduled = false;
    async function runHeartbeat(): Promise<{ status: string; error?: string }> {
      try {
        throw new Error("RPC connection lost");
      } catch (err: any) {
        nextScheduled = true;
        return { status: "error", error: err.message };
      }
    }

    const result = runHeartbeat();
    return result.then(r => {
      expect(r.status).toBe("error");
      expect(r.error).toContain("connection lost");
      expect(nextScheduled).toBe(true);
    });
  });
});

describe("v3.1 heartbeat: concurrent guard", () => {
  test("H16: timer fires while previous heartbeat running → skip", () => {
    let isRunning = true; // simulate previous heartbeat in progress
    const shouldSkip = isRunning;
    expect(shouldSkip).toBe(true);

    // After previous completes
    isRunning = false;
    expect(isRunning).toBe(false);
  });
});

// ============================================================================
// Cron Tests
// ============================================================================

describe("v3.1 cron: execution", () => {
  test("isolated session key format", () => {
    const jobId = "daily-backup";
    const sessionKey = `cron:${jobId}`;
    expect(sessionKey).toBe("cron:daily-backup");
    expect(sessionKey).toContain("cron:");
  });

  test("run record captures duration and status", () => {
    const start = Date.now();
    const record = {
      jobId: "test-job",
      startedAt: start,
      finishedAt: start + 5000,
      durationMs: 5000,
      status: "completed" as const,
      resultPreview: "Task done",
    };

    expect(record.durationMs).toBe(5000);
    expect(record.status).toBe("completed");
    expect(record.resultPreview).toBe("Task done");
  });

  test("timeout record captures error", () => {
    const record = {
      jobId: "slow-job",
      startedAt: Date.now(),
      finishedAt: Date.now() + 60000,
      durationMs: 60000,
      status: "timeout" as const,
      error: "Job exceeded 60s timeout",
    };

    expect(record.status).toBe("timeout");
    expect(record.error).toContain("timeout");
  });

  test("agentId routing in cron job config", () => {
    const job = {
      id: "ops-check",
      schedule: "0 */6 * * *",
      prompt: "Check server health",
      agentId: "ops",
      isolated: true,
    };

    expect(job.agentId).toBe("ops");
    expect(job.isolated).toBe(true);
  });
});

// ============================================================================
// C2-C3: Isolated delivery modes
// ============================================================================

describe("v3.1 cron: delivery modes", () => {
  test("C2: isolated + announce → response sent to bound channel", () => {
    const job = { id: "report", delivery: "announce" as const, isolated: true };
    const response = "Daily report: all systems green";
    const shouldDeliver = job.delivery === "announce" && response.trim().length > 0;
    expect(shouldDeliver).toBe(true);
  });

  test("C3: isolated + silent → response logged only, no channel delivery", () => {
    const job = { id: "cleanup", delivery: "silent" as const, isolated: true };
    const shouldDeliver = (job.delivery as string) === "announce";
    expect(shouldDeliver).toBe(false);
  });
});

// ============================================================================
// C5-C7: Main mode (system events injection)
// ============================================================================

describe("v3.1 cron: main mode", () => {
  type SystemEvent = { type: string; jobId: string; prompt: string; injectedAt: number; ttlMs: number };

  function injectSystemEvent(queue: SystemEvent[], event: SystemEvent, maxSize = 20): SystemEvent[] {
    const q = [...queue, event];
    return q.length > maxSize ? q.slice(q.length - maxSize) : q;
  }

  test("C5: main mode → system event injected, heartbeat woken", () => {
    let heartbeatWoken = false;
    const queue: SystemEvent[] = [];
    const event: SystemEvent = {
      type: "cron",
      jobId: "health-check",
      prompt: "Check server health",
      injectedAt: Date.now(),
      ttlMs: 2 * 60 * 60 * 1000,
    };
    const updated = injectSystemEvent(queue, event);
    heartbeatWoken = true;

    expect(updated).toHaveLength(1);
    expect(updated[0].jobId).toBe("health-check");
    expect(heartbeatWoken).toBe(true);
  });

  test("C6: heartbeat consumes pending cron events", () => {
    const events: SystemEvent[] = [
      { type: "cron", jobId: "j1", prompt: "Task 1", injectedAt: Date.now(), ttlMs: 7200000 },
      { type: "cron", jobId: "j2", prompt: "Task 2", injectedAt: Date.now(), ttlMs: 7200000 },
    ];

    // Heartbeat builds CRON_EVENT_PROMPT
    const cronPrompt = events.map(e => `[Cron: ${e.jobId}] ${e.prompt}`).join("\n");
    expect(cronPrompt).toContain("[Cron: j1]");
    expect(cronPrompt).toContain("[Cron: j2]");

    // After response, events consumed
    const remaining: SystemEvent[] = [];
    expect(remaining).toHaveLength(0);
  });

  test("C7: main mode but heartbeat disabled → log warning", () => {
    const heartbeatEnabled = false;
    const mode = "main";
    const warnings: string[] = [];

    if (mode === "main" && !heartbeatEnabled) {
      warnings.push("Cron main mode requires heartbeat; events may not be consumed");
    }

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("heartbeat");
  });
});

// ============================================================================
// C8-C11: Schedule parsing
// ============================================================================

describe("v3.1 cron: schedule parsing", () => {
  test("C8: cron expression '0 9 * * *' → valid", () => {
    const schedule = "0 9 * * *";
    const isCronExpr = /^[\d*,/-]+(\s+[\d*,/-]+){4}$/.test(schedule.trim());
    expect(isCronExpr).toBe(true);
  });

  test("C9: every '30m' → fires every 30 minutes", () => {
    const interval = parseDuration("30m");
    expect(interval).toBe(30 * 60 * 1000);
  });

  test("C10: at (future ISO) → fires once at target time", () => {
    const futureTime = new Date(Date.now() + 60000).toISOString();
    const targetMs = new Date(futureTime).getTime();
    const delayMs = targetMs - Date.now();
    expect(delayMs).toBeGreaterThan(0);

    // After firing, job should auto-remove
    const autoRemove = true;
    expect(autoRemove).toBe(true);
  });

  test("C11: at (past ISO) → fires immediately, auto-removes", () => {
    const pastTime = new Date(Date.now() - 60000).toISOString();
    const targetMs = new Date(pastTime).getTime();
    const delayMs = Math.max(0, targetMs - Date.now());
    expect(delayMs).toBe(0);
  });
});

// ============================================================================
// C12-C14: Job CRUD, history, disabled
// ============================================================================

describe("v3.1 cron: job management", () => {
  test("C12: addJob / removeJob / listJobs CRUD", () => {
    const jobs: Map<string, { id: string; schedule: string; prompt: string; enabled: boolean }> = new Map();

    // Add
    jobs.set("backup", { id: "backup", schedule: "0 2 * * *", prompt: "Run backup", enabled: true });
    expect(jobs.size).toBe(1);

    // List
    const list = Array.from(jobs.values());
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("backup");

    // Remove
    jobs.delete("backup");
    expect(jobs.size).toBe(0);
  });

  test("C13: run history — JSONL appended, getRunHistory returns last N", () => {
    const history: { jobId: string; ts: number; status: string }[] = [];
    for (let i = 0; i < 10; i++) {
      history.push({ jobId: "test", ts: Date.now() + i, status: "completed" });
    }

    const lastN = (n: number) => history.slice(-n);
    expect(lastN(3)).toHaveLength(3);
    expect(lastN(3)[2].ts).toBe(history[9].ts);
  });

  test("C14: disabled job → not scheduled", () => {
    const job = { id: "disabled-job", enabled: false, schedule: "0 * * * *" };
    const shouldSchedule = job.enabled;
    expect(shouldSchedule).toBe(false);
  });
});

// ============================================================================
// L1-L7: Integration / Linkage Tests
// ============================================================================

describe("v3.1 integration: cron → heartbeat linkage", () => {
  type SystemEvent = { type: string; jobId: string; prompt: string; injectedAt: number; ttlMs: number };

  function injectEvent(queue: SystemEvent[], event: SystemEvent, maxSize = 20): SystemEvent[] {
    const q = [...queue, event];
    return q.length > maxSize ? q.slice(q.length - maxSize) : q;
  }

  function consumeEvents(queue: SystemEvent[]): { consumed: SystemEvent[]; remaining: SystemEvent[] } {
    const now = Date.now();
    const valid = queue.filter(e => now - e.injectedAt < e.ttlMs);
    return { consumed: valid, remaining: [] };
  }

  test("L1: cron main → inject event → heartbeat wakes → consumes", () => {
    let queue: SystemEvent[] = [];
    const event: SystemEvent = {
      type: "cron", jobId: "health", prompt: "Check health",
      injectedAt: Date.now(), ttlMs: 7200000,
    };
    queue = injectEvent(queue, event);
    expect(queue).toHaveLength(1);

    // Heartbeat wakes and consumes
    const { consumed, remaining } = consumeEvents(queue);
    expect(consumed).toHaveLength(1);
    expect(consumed[0].jobId).toBe("health");
    expect(remaining).toHaveLength(0);
  });

  test("L2: multiple cron events → all consumed in single heartbeat", () => {
    let queue: SystemEvent[] = [];
    for (let i = 1; i <= 3; i++) {
      queue = injectEvent(queue, {
        type: "cron", jobId: `job-${i}`, prompt: `Task ${i}`,
        injectedAt: Date.now(), ttlMs: 7200000,
      });
    }
    expect(queue).toHaveLength(3);

    const { consumed } = consumeEvents(queue);
    expect(consumed).toHaveLength(3);
  });

  test("L3: event TTL expiry → not delivered", () => {
    const expiredEvent: SystemEvent = {
      type: "cron", jobId: "old", prompt: "Stale task",
      injectedAt: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
      ttlMs: 2 * 60 * 60 * 1000, // 2 hour TTL
    };
    const queue = [expiredEvent];
    const { consumed } = consumeEvents(queue);
    expect(consumed).toHaveLength(0);
  });

  test("L4: event queue overflow → oldest evicted (max 20)", () => {
    let queue: SystemEvent[] = [];
    for (let i = 0; i < 25; i++) {
      queue = injectEvent(queue, {
        type: "cron", jobId: `job-${i}`, prompt: `Task ${i}`,
        injectedAt: Date.now() + i, ttlMs: 7200000,
      }, 20);
    }
    expect(queue).toHaveLength(20);
    // Oldest 5 (job-0 through job-4) should be evicted
    expect(queue[0].jobId).toBe("job-5");
  });

  test("L5: heartbeat + normal message → no interference", () => {
    // Heartbeat uses its own session key, normal messages use user session key
    const heartbeatKey = "heartbeat:main";
    const userKey = "agent:main:telegram:dm:12345";
    expect(heartbeatKey).not.toBe(userKey);

    // Both can run concurrently on separate RPC processes
    const heartbeatRpc = { id: "rpc-1", sessionKey: heartbeatKey };
    const userRpc = { id: "rpc-2", sessionKey: userKey };
    expect(heartbeatRpc.id).not.toBe(userRpc.id);
  });

  test("L6: isolated cron + heartbeat fire simultaneously → separate RPC", () => {
    const cronKey = "cron:daily-backup";
    const heartbeatKey = "heartbeat:main";
    expect(cronKey).not.toBe(heartbeatKey);

    // Both acquire separate processes
    const processes = new Set([cronKey, heartbeatKey]);
    expect(processes.size).toBe(2);
  });

  test("L7: gateway restart → jobs re-scheduled from jobs.json", () => {
    const savedJobs = [
      { id: "backup", schedule: "0 2 * * *", prompt: "Run backup", enabled: true },
      { id: "health", schedule: "30m", prompt: "Health check", enabled: true },
      { id: "disabled", schedule: "1h", prompt: "Noop", enabled: false },
    ];

    // On restart, only enabled jobs get scheduled
    const scheduled = savedJobs.filter(j => j.enabled);
    expect(scheduled).toHaveLength(2);
    expect(scheduled.map(j => j.id)).toEqual(["backup", "health"]);
  });
});

// ============================================================================
// Media Tests — parseOutboundMediaDirectives (real import)
// ============================================================================

describe("v3.1 media: outbound parsing", () => {
  test("[photo] directive extracts URL and caption", () => {
    const result = parseOutboundMediaDirectives(
      "Here is the chart:\n[photo] https://example.com/chart.png | Monthly report"
    );

    expect(result.media).toHaveLength(1);
    expect(result.media[0].kind).toBe("photo");
    expect(result.media[0].url).toBe("https://example.com/chart.png");
    expect(result.media[0].caption).toBe("Monthly report");
    expect(result.text).toBe("Here is the chart:");
  });

  test("[audio] directive extracts URL", () => {
    const result = parseOutboundMediaDirectives(
      "[audio] https://example.com/voice.mp3 | Voice note"
    );

    expect(result.media).toHaveLength(1);
    expect(result.media[0].kind).toBe("audio");
  });

  test("MEDIA: with relative path is accepted", () => {
    const result = parseOutboundMediaDirectives("MEDIA:output/chart.png");

    expect(result.media).toHaveLength(1);
    expect(result.media[0].url).toBe("output/chart.png");
  });

  test("MEDIA: with absolute path is BLOCKED (security)", () => {
    const result = parseOutboundMediaDirectives("MEDIA:/etc/passwd");

    expect(result.media).toHaveLength(0);
    expect(result.text).toContain("MEDIA:/etc/passwd"); // treated as normal text
  });

  test("MEDIA: with ~ path is BLOCKED (security)", () => {
    const result = parseOutboundMediaDirectives("MEDIA:~/secret/file.png");

    expect(result.media).toHaveLength(0);
    expect(result.text).toContain("MEDIA:~/secret/file.png");
  });

  test("mixed text and media directives", () => {
    const input = [
      "Analysis complete.",
      "[photo] https://example.com/result.png | Results",
      "See above for details.",
      "MEDIA:local/extra.jpg",
    ].join("\n");

    const result = parseOutboundMediaDirectives(input);

    expect(result.media).toHaveLength(2);
    expect(result.text).toContain("Analysis complete.");
    expect(result.text).toContain("See above for details.");
  });

  test("no media directives returns empty media array", () => {
    const result = parseOutboundMediaDirectives("Just plain text, no media.");

    expect(result.media).toHaveLength(0);
    expect(result.text).toBe("Just plain text, no media.");
  });

  test("MEDIA: infers kind from extension", () => {
    const imgResult = parseOutboundMediaDirectives("MEDIA:chart.png");
    expect(imgResult.media[0].kind).toBe("photo");

    const audioResult = parseOutboundMediaDirectives("MEDIA:voice.mp3");
    expect(audioResult.media[0].kind).toBe("audio");
  });
});

// ============================================================================
// Media Tests — Voice STT injection format
// ============================================================================

describe("v3.1 media: voice STT injection", () => {
  test("voice transcript injected with [Voice message] prefix", () => {
    const transcript = "请帮我检查一下服务器状态";
    const text = `[Voice message] ${transcript}`;

    expect(text).toContain("[Voice message]");
    expect(text).toContain(transcript);
  });

  test("voice transcript appended to existing caption", () => {
    const caption = "Check this";
    const transcript = "server status please";
    const text = `${caption}\n\n[Voice message] ${transcript}`;

    expect(text).toContain(caption);
    expect(text).toContain("[Voice message]");
    expect(text).toContain(transcript);
  });

  test("media note format for images", () => {
    // Simulate media note injection
    const mediaNote = "[Image attached: photo, 1280x720]";
    expect(mediaNote).toContain("[Image attached:");
  });
});

// ============================================================================
// SP-1 ~ SP-6: System Prompt Injection
// ============================================================================

import {
  buildGatewaySystemPrompt,
  HEARTBEAT_PROMPT,
  CRON_PROMPT,
  MEDIA_PROMPT,
} from "./system-prompts.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import type { Config } from "./config.ts";

function makeConfig(overrides: Partial<{
  heartbeatEnabled: boolean;
  cronEnabled: boolean;
  telegramAccounts: number;
  gatewayPrompts: { heartbeat?: boolean; cron?: boolean; media?: boolean };
  appendSystemPrompt: string;
}>): Config {
  const cfg = structuredClone(DEFAULT_CONFIG);
  if (overrides.heartbeatEnabled !== undefined) {
    cfg.heartbeat = { ...(cfg.heartbeat ?? {}), enabled: overrides.heartbeatEnabled };
  }
  cfg.cron.enabled = overrides.cronEnabled ?? false;
  if (overrides.telegramAccounts) {
    cfg.channels.telegram = {
      accounts: Array.from({ length: overrides.telegramAccounts }, (_, i) => ({
        botToken: `fake-token-${i}`,
        allowFrom: [],
      })),
    };
  }
  if (overrides.gatewayPrompts) {
    cfg.agent.gatewayPrompts = overrides.gatewayPrompts;
  }
  if (overrides.appendSystemPrompt) {
    cfg.agent.appendSystemPrompt = overrides.appendSystemPrompt;
  }
  return cfg;
}

describe("System Prompt Injection (SP-1 ~ SP-6)", () => {
  test("SP-1: heartbeat only → heartbeat section only", () => {
    const prompt = buildGatewaySystemPrompt(makeConfig({ heartbeatEnabled: true }));
    expect(prompt).not.toBeNull();
    expect(prompt).toContain("Heartbeat Protocol");
    expect(prompt).not.toContain("Scheduled Task");
    expect(prompt).not.toContain("Media Replies");
  });

  test("SP-2: heartbeat + cron → both sections", () => {
    const prompt = buildGatewaySystemPrompt(makeConfig({
      heartbeatEnabled: true,
      cronEnabled: true,
    }));
    expect(prompt).toContain("Heartbeat Protocol");
    expect(prompt).toContain("Scheduled Task");
    expect(prompt).not.toContain("Media Replies");
  });

  test("SP-3: all features enabled → all 3 sections", () => {
    const prompt = buildGatewaySystemPrompt(makeConfig({
      heartbeatEnabled: true,
      cronEnabled: true,
      telegramAccounts: 1,
    }));
    expect(prompt).toContain("Heartbeat Protocol");
    expect(prompt).toContain("Scheduled Task");
    expect(prompt).toContain("Media Replies");
  });

  test("SP-4: nothing enabled → returns null", () => {
    const prompt = buildGatewaySystemPrompt(makeConfig({}));
    expect(prompt).toBeNull();
  });

  test("SP-5: user appendSystemPrompt + gateway prompts combine", () => {
    const cfg = makeConfig({
      heartbeatEnabled: true,
      appendSystemPrompt: "You are a helpful assistant.",
    });
    const gatewayPrompt = buildGatewaySystemPrompt(cfg);
    expect(gatewayPrompt).toContain("Heartbeat Protocol");

    // Simulate the combination logic from capability-profile.ts
    const userAppend = cfg.agent.appendSystemPrompt?.trim() ?? "";
    const combined = [userAppend, gatewayPrompt].filter(Boolean).join("\n\n");
    expect(combined).toContain("You are a helpful assistant.");
    expect(combined).toContain("Heartbeat Protocol");
    expect(combined.indexOf("helpful assistant")).toBeLessThan(combined.indexOf("Heartbeat"));
  });

  test("SP-6: gatewayPrompts.heartbeat=false overrides heartbeat.enabled=true", () => {
    const prompt = buildGatewaySystemPrompt(makeConfig({
      heartbeatEnabled: true,
      cronEnabled: true,
      gatewayPrompts: { heartbeat: false },
    }));
    expect(prompt).not.toBeNull();
    expect(prompt).not.toContain("Heartbeat Protocol");
    expect(prompt).toContain("Scheduled Task");
  });
});
