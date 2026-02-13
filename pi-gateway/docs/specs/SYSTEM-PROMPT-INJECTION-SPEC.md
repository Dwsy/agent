# System Prompt Injection Spec

**Status:** Draft
**Author:** pi-zero (PM)
**Date:** 2026-02-11
**Priority:** P0 (agents can't use heartbeat/cron/media without this)

---

## Problem

pi-gateway v3.1 shipped heartbeat, cron, and media features — but the agent's system prompt contains zero information about these protocols. The agent doesn't know:

1. What `HEARTBEAT_OK` means or when to reply with it
2. What `[CRON:xxx]` events look like or how to process them
3. What `MEDIA:<path>` syntax does or when to use it

This is the equivalent of giving someone a phone without telling them what the buttons do.

## Solution

Conditionally inject protocol documentation into the agent's `--append-system-prompt` based on which features are enabled in config.

## Design

### New file: `src/core/system-prompts.ts`

Single responsibility: build the gateway-injected system prompt string.

```typescript
export function buildGatewaySystemPrompt(config: Config): string | null
```

Returns `null` when no features need injection (saves tokens).

### Injection segments (conditional)

| Condition | Segment |
|---|---|
| `heartbeat.enabled === true` | Heartbeat protocol |
| `cron.enabled === true` | Cron event protocol |
| `channels.telegram.enabled === true` OR `channels.discord.enabled === true` | Media protocol |

### Segment content

#### Heartbeat Protocol (when `heartbeat.enabled`)

```
## Gateway: Heartbeat Protocol

You are connected to pi-gateway which periodically wakes you via heartbeat.

When woken by heartbeat:
1. Read HEARTBEAT.md if it exists — follow its instructions strictly
2. Do NOT infer or repeat tasks from prior conversations
3. If nothing needs attention, reply with exactly: HEARTBEAT_OK
4. If you completed tasks but want to confirm success, include HEARTBEAT_OK at the end of your response
5. If there are alerts or issues requiring human attention, describe them WITHOUT including HEARTBEAT_OK

The gateway suppresses HEARTBEAT_OK responses (they won't reach the user). Only non-OK responses are delivered as alerts.
```

#### Cron Event Protocol (when `cron.enabled`)

```
## Gateway: Scheduled Task Events

The gateway may inject scheduled task events in the format:
- [CRON:{job-id}] {task description}

When you see these events:
1. Process each task according to its description
2. Report results for each task
3. If ALL tasks completed successfully, include HEARTBEAT_OK at the end
4. If any task failed, describe the failure WITHOUT HEARTBEAT_OK
```

#### Media Protocol (when telegram or discord enabled)

```
## Gateway: Media Replies

To send a file (image, audio, document) back to the user, use this syntax on a separate line:
MEDIA:<relative-path>

Examples:
- MEDIA:./output.png
- MEDIA:./report.pdf

Rules:
- Path must be relative (no absolute paths, no ~ paths)
- One MEDIA directive per line
- Text before/after MEDIA lines is sent as normal message
- Supported: images, audio, video, documents
```

### Integration point: `capability-profile.ts`

Modify `appendRuntimePromptArgs` to call `buildGatewaySystemPrompt(config)` and append the result to the existing `appendSystemPrompt` value:

```typescript
function appendRuntimePromptArgs(args: string[], config: Config): void {
  if (config.agent.systemPrompt?.trim()) {
    args.push("--system-prompt", expandHome(config.agent.systemPrompt.trim()));
  }

  // Combine user-configured appendSystemPrompt with gateway-injected prompts
  const userAppend = config.agent.appendSystemPrompt?.trim() ?? "";
  const gatewayAppend = buildGatewaySystemPrompt(config);

  const combined = [userAppend, gatewayAppend].filter(Boolean).join("\n\n");
  if (combined) {
    args.push("--append-system-prompt", combined);
  }
}
```

**Note:** `--append-system-prompt` accepts inline text. If the user's `appendSystemPrompt` is a file path, `expandHome` handles it — but we need to check if pi CLI accepts mixed file-path + inline-text. If not, we write the combined content to a temp file.

### Cleanup: Telegram handler

Remove the inline `replyHint` from `src/plugins/builtin/telegram/handlers.ts:753` — the media protocol is now in the system prompt. The per-message `[media attached: N images]` note stays (it's contextual, not protocol).

### Config override

Add optional `agent.gatewayPrompts` to disable auto-injection:

```jsonc
"agent": {
  "gatewayPrompts": {
    "heartbeat": true,   // default: auto (true when heartbeat.enabled)
    "cron": true,         // default: auto (true when cron.enabled)
    "media": true         // default: auto (true when any channel enabled)
  }
}
```

## Files to change

| File | Change |
|---|---|
| `src/core/system-prompts.ts` | **New** — prompt builder |
| `src/core/capability-profile.ts` | Modify `appendRuntimePromptArgs` |
| `src/core/config.ts` | Add `GatewayPromptsConfig` interface |
| `src/plugins/builtin/telegram/handlers.ts` | Remove hardcoded `replyHint` |
| `src/core/bbd-v31-heartbeat-cron-media.test.ts` | Add prompt injection tests |

## Test scenarios

| ID | Scenario | Expected |
|---|---|---|
| SP-1 | heartbeat.enabled=true, cron disabled | Prompt contains heartbeat section only |
| SP-2 | heartbeat + cron enabled | Prompt contains both sections |
| SP-3 | All features enabled | Prompt contains all 3 sections |
| SP-4 | Nothing enabled | `buildGatewaySystemPrompt` returns null, no --append-system-prompt added |
| SP-5 | User has own appendSystemPrompt + gateway prompts | Both combined with \n\n separator |
| SP-6 | gatewayPrompts.heartbeat=false overrides heartbeat.enabled=true | Heartbeat section excluded |

## Estimation

- Complexity: L2 (3-4 files, ~100 lines new code, clear scope)
- Risk: Low — additive change, no breaking behavior
- Time: ~2h implementation + 1h testing

## Assignment

TBD — waiting for team availability check.
