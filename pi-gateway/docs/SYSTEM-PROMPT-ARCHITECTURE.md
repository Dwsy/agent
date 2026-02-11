# System Prompt Architecture: OpenClaw vs pi-gateway

> TL;DR: OpenClaw builds a rich, layered system prompt (~2000 lines) with 15+ sections covering tools, skills, memory, messaging, safety, heartbeat, sandbox, and runtime context. pi-gateway injects 3 conditional segments via `--append-system-prompt`. The gap is structural — pi-gateway needs a prompt architecture, not just more segments.

## 1. OpenClaw System Prompt Architecture

### 1.1 Prompt Assembly Flow

```
buildAgentSystemPrompt(params)          ← src/agents/system-prompt.ts
    │
    ├── Identity line: "You are a personal assistant running inside OpenClaw."
    │
    ├── ## Tooling                      ← Tool names + descriptions (policy-filtered)
    ├── ## Tool Call Style              ← Narration guidance
    ├── ## Safety                       ← Anthropic-inspired safety guardrails
    ├── ## OpenClaw CLI Quick Reference ← Gateway daemon commands
    ├── ## Skills (mandatory)           ← Skill discovery + SKILL.md loading rules
    ├── ## Memory Recall                ← memory_search/memory_get usage
    ├── ## OpenClaw Self-Update         ← config.apply / update.run (when gateway tool available)
    ├── ## Model Aliases                ← Provider/model shorthand table
    ├── ## Workspace                    ← Working directory + workspace notes
    ├── ## Documentation                ← Docs path + community links
    ├── ## Sandbox                      ← Docker sandbox info (when enabled)
    ├── ## User Identity                ← Owner numbers
    ├── ## Current Date & Time          ← Timezone
    ├── ## Workspace Files (injected)   ← AGENTS.md, SOUL.md, etc.
    ├── ## Reply Tags                   ← [[reply_to_current]] syntax
    ├── ## Messaging                    ← Cross-session messaging, message tool, inline buttons
    ├── ## Voice (TTS)                  ← TTS hint (when configured)
    ├── ## Group Chat Context           ← Extra system prompt (channel-specific)
    ├── ## Reactions                    ← Emoji reaction guidance (minimal/extensive)
    ├── ## Reasoning Format             ← <think>/<final> tags (when reasoning enabled)
    ├── ## Silent Replies               ← SILENT_REPLY_TOKEN protocol
    ├── ## Heartbeats                   ← HEARTBEAT_OK protocol
    ├── ## Runtime                      ← agent=, host=, os=, model=, channel=, capabilities=
    │
    └── # Project Context              ← AGENTS.md, SOUL.md, context files (injected content)
```

### 1.2 Key Design Principles

**a) Tool Descriptions Are Part of the System Prompt**

OpenClaw injects a `coreToolSummaries` map with 25+ tool descriptions directly into the system prompt. The agent knows exactly what each tool does:

```typescript
cron: "Manage cron jobs and wake events (use for reminders; when scheduling a reminder, 
       write the systemEvent text as something that will read like a reminder when it fires...)"
message: "Send messages and channel actions"
sessions_spawn: "Spawn a sub-agent session"
gateway: "Restart, apply config, or run updates on the running OpenClaw process"
```

This is how the agent "knows" it can manage cron jobs — the tool description tells it.

**b) Prompt Mode Controls Section Inclusion**

Three modes: `full` (main agent), `minimal` (subagents), `none` (bare identity). Subagents get stripped-down prompts without skills, memory, heartbeat, or self-update sections.

**c) Media Reply Hint Is Injected Per-Message, Not in System Prompt**

OpenClaw does NOT put media reply syntax in the system prompt. Instead, it injects a `mediaReplyHint` into the user message body when media is attached:

```typescript
// src/auto-reply/reply/get-reply-run.ts:253
const mediaReplyHint = mediaNote
  ? "To send an image back, prefer the message tool (media/path/filePath). 
     If you must inline, use MEDIA:https://example.com/image.jpg ... 
     Avoid absolute paths (MEDIA:/...) and ~ paths — they are blocked for security."
  : undefined;

// Assembly order: mediaNote → mediaReplyHint → user text
prefixedCommandBody = [mediaNote, mediaReplyHint, prefixedBody].filter(Boolean).join("\n");
```

**d) Heartbeat Protocol Is Always in System Prompt (When Full Mode)**

Unlike pi-gateway's conditional injection, OpenClaw ALWAYS includes the heartbeat section in full-mode prompts. The agent always knows about HEARTBEAT_OK, even if heartbeat isn't actively configured:

```typescript
// Always included for non-minimal modes
lines.push(
  "## Heartbeats",
  heartbeatPromptLine,
  "If you receive a heartbeat poll... reply exactly: HEARTBEAT_OK",
);
```

**e) Plugin Hooks Can Modify System Prompt**

The `before_agent_start` hook returns `{ systemPrompt?, prependContext? }`, allowing plugins to inject or override the system prompt before each agent turn.

**f) Runtime Line Provides Full Context**

The Runtime line tells the agent everything about its environment:
```
Runtime: agent=main | host=macbook | os=darwin (arm64) | node=22.x | 
         model=claude-opus-4-6 | channel=telegram | capabilities=inlineButtons | thinking=off
```

### 1.3 Inbound Message Assembly Order

When a user sends a message with media:

```
1. [media attached: 1 image | ./photo.jpg (image/jpeg)]     ← mediaNote
2. To send an image back, prefer the message tool...         ← mediaReplyHint  
3. [media understanding output if vision processed]          ← MediaUnderstanding
4. User's actual text message                                ← Body
```

## 2. pi-gateway Current State

### 2.1 What We Have

`buildGatewaySystemPrompt(config)` in `src/core/system-prompts.ts`:

```
Condition: heartbeat.enabled     → HEARTBEAT_SEGMENT (~8 lines)
Condition: cron.enabled          → CRON_SEGMENT (~6 lines)
Condition: hasAnyChannel(config) → MEDIA_SEGMENT (~10 lines)
```

Injected via `--append-system-prompt` CLI flag, merged with user's `appendSystemPrompt`.

### 2.2 What's Missing

| Capability | OpenClaw | pi-gateway |
|---|---|---|
| Tool descriptions in prompt | 25+ tools with rich descriptions | ❌ None — relies on pi CLI's built-in tool descriptions |
| Cron tool guidance | "use for reminders; write systemEvent text as..." | ❌ Only "scheduled task events" format |
| Gateway identity | "You are running inside OpenClaw" | ❌ Agent doesn't know it's in a gateway |
| Runtime context | agent=, host=, channel=, capabilities= | ❌ None |
| Channel-specific behavior | Per-channel messaging hints, inline buttons, reactions | ❌ None |
| Heartbeat always-on | Always in full-mode prompt | Conditional on heartbeat.enabled |
| Media reply hint | Per-message injection (only when media present) | Static system prompt segment |
| Plugin prompt hooks | before_agent_start can modify prompt | ❌ None |
| Prompt modes | full/minimal/none for main/subagent/bare | ❌ Single mode |
| Safety section | Anthropic-inspired guardrails | ❌ None |
| Skills guidance | Scan descriptions, read one SKILL.md | ❌ Relies on pi CLI |
| Memory guidance | memory_search before answering | ❌ Relies on pi CLI |
| Silent reply protocol | SILENT_REPLY_TOKEN | ❌ None |
| Workspace context | Working dir + notes | ❌ Relies on pi CLI |

## 3. Redesign Proposal

### 3.1 Architecture: Three-Layer Prompt System

```
Layer 1: Gateway Identity Prompt (static, always injected)
    "You are running inside pi-gateway, a multi-agent gateway."
    + Runtime line (agent, host, channel, capabilities)
    + Gateway-specific behavior rules

Layer 2: Capability Prompts (conditional, per-feature)
    + Heartbeat protocol (when heartbeat.enabled OR always-on option)
    + Cron protocol (when cron.enabled)
    + Media reply syntax (when any channel active)
    + Delegation protocol (when agents > 1)
    + Channel-specific hints (Telegram formatting, Discord threads, etc.)

Layer 3: Per-Message Context (injected into message body, not system prompt)
    + Media note ([media attached: ...])
    + Media reply hint (only when media present)
    + Cron event prefix ([CRON:{id}] ...)
    + Heartbeat trigger
```

### 3.2 Proposed Implementation

#### New: `buildGatewayIdentityPrompt(config)` — Layer 1

Always injected. Tells the agent what it is and where it's running.

```typescript
function buildGatewayIdentityPrompt(config: Config): string {
  const lines = [
    "## Gateway Environment",
    "You are running inside pi-gateway, a multi-agent gateway that routes messages from messaging channels to pi agent processes.",
    "",
    `Runtime: agent=${agentId} | channel=${channel} | capabilities=${caps}`,
    "",
    "Gateway-specific rules:",
    "- Your replies are delivered to messaging channels (Telegram, Discord, WebChat)",
    "- Keep replies concise — messaging UIs have limited space",
    "- Do not reference local file paths in replies unless the user is technical",
    "- For proactive notifications, the gateway handles delivery routing",
  ];
  return lines.join("\n");
}
```

#### Enhanced: `buildCapabilityPrompts(config)` — Layer 2

Conditional segments, but with richer content:

```typescript
// Heartbeat: consider always-on (like OpenClaw) with a config override
const HEARTBEAT_SEGMENT = `## Heartbeat Protocol
...existing content...
Note: The gateway suppresses HEARTBEAT_OK responses. Only alerts reach the user.`;

// Cron: add tool-like guidance
const CRON_SEGMENT = `## Scheduled Tasks
You can manage scheduled tasks:
- View jobs: /cron list
- Add job: /cron add <schedule> <task>
- Remove: /cron remove <id>
- Pause/resume: /cron pause|resume <id>
- Manual trigger: /cron run <id>

Schedule formats: cron ("0 */6 * * *"), interval ("30m", "2h"), one-shot ISO datetime.
When the gateway injects [CRON:{job-id}] events, process each task and report results.`;

// Media: split into system prompt (syntax) + per-message (hint)
const MEDIA_SEGMENT = `## Media Replies
To send a file back to the user:
MEDIA:<relative-path>

Rules:
- Path must be relative (no absolute, no ~, no ..)
- One MEDIA directive per line
- Supported: images, audio, video, documents
- Security: paths are validated against your workspace root`;

// NEW: Channel-specific
const TELEGRAM_SEGMENT = `## Telegram Formatting
- Use Markdown for formatting (bold, italic, code)
- Messages over 4096 chars are auto-chunked
- Inline buttons available via message tool
- Stickers and voice notes are transcribed before delivery`;

// NEW: Delegation
const DELEGATION_SEGMENT = `## Agent Delegation
You can delegate tasks to other agents via delegate_to_agent.
Available agents: ${agentList}
Delegation is synchronous with a ${timeout}ms timeout.`;
```

#### New: Per-Message Context Injection — Layer 3

Move media reply hint from system prompt to message body (like OpenClaw):

```typescript
// In Telegram handler, when media is attached:
const mediaNote = `[media attached: ${count} ${type}]`;
const mediaReplyHint = "To reply with media, use MEDIA:./path on a separate line.";
const fullMessage = [mediaNote, mediaReplyHint, userText].filter(Boolean).join("\n");
```

### 3.3 Config Changes

```jsonc
{
  "agent": {
    "gatewayPrompts": {
      // Existing
      "heartbeat": true,    // auto: true when heartbeat.enabled
      "cron": true,          // auto: true when cron.enabled
      "media": true,         // auto: true when any channel active
      
      // New
      "identity": true,      // Gateway identity prompt (default: true)
      "channel": true,       // Channel-specific hints (default: true)
      "delegation": true,    // Delegation protocol (default: auto when agents > 1)
      "alwaysHeartbeat": false  // Include heartbeat even when not enabled (default: false)
    }
  }
}
```

### 3.4 Migration Path

| Phase | Change | Risk |
|---|---|---|
| v3.3-alpha | Add Layer 1 (identity prompt) — always on | Low — additive only |
| v3.3-beta | Enhance Layer 2 segments (richer cron/media) | Low — replaces existing |
| v3.3 | Add channel-specific + delegation segments | Medium — new content |
| v3.4 | Move media reply hint to Layer 3 (per-message) | Medium — behavior change |

### 3.5 What We Should NOT Copy from OpenClaw

- ❌ Tool descriptions in system prompt — pi CLI already handles this via its own system prompt
- ❌ Skills/Memory guidance — pi CLI handles this
- ❌ Safety section — pi CLI has its own
- ❌ CLI quick reference — not relevant for gateway
- ❌ Workspace files injection — pi CLI handles AGENTS.md/SOUL.md loading
- ❌ Silent reply protocol — different architecture (RPC vs embedded)
- ❌ Prompt modes (full/minimal/none) — pi-gateway delegates to pi CLI for subagent prompts

The key insight: pi-gateway uses RPC isolation, so the pi CLI process already has its own rich system prompt. We only need to APPEND gateway-specific context that the pi CLI doesn't know about (identity, channel, heartbeat/cron protocols, media syntax).

## 4. Summary

OpenClaw builds the entire system prompt because it runs an embedded agent. pi-gateway only needs to fill the gap between what pi CLI knows and what the gateway environment adds. The redesign focuses on three things:

1. **Tell the agent where it is** (Layer 1 — identity + runtime)
2. **Tell it what gateway features exist** (Layer 2 — capability segments)
3. **Give it per-message context** (Layer 3 — media notes, cron events)

> *「知己知彼、百戦殆うからず」— 知道自己是什么，才能做好该做的事。*
