/**
 * Three-Layer Gateway System Prompt Architecture
 *
 * Layer 1: Gateway Identity (static, always injected)
 *   - Tells the agent it's running inside pi-gateway
 *   - Runtime context (agent, channel, capabilities)
 *   - Gateway-specific behavior rules
 *
 * Layer 2: Capability Prompts (conditional, per-feature)
 *   - Heartbeat protocol
 *   - Cron protocol + management commands
 *   - Media reply syntax
 *   - Delegation protocol
 *   - Channel-specific formatting hints
 *
 * Layer 3: Per-Message Context (injected into message body by channel handlers)
 *   - Media notes ([media attached: ...])
 *   - Media reply hints (only when media present)
 *   - Cron event prefix ([CRON:{id}] ...)
 *   - NOT handled here — handled by channel plugins at dispatch time
 */

import type { Config } from "./config.ts";
import { hostname as getHostname } from "node:os";

// ============================================================================
// Layer 1: Gateway Identity
// ============================================================================

export interface GatewayIdentityContext {
  agentId?: string;
  hostname?: string;
}

/**
 * Build the gateway identity prompt (Layer 1).
 * Always injected — tells the agent what environment it's running in.
 * Only includes static, process-level info. Channel is session-level → Layer 3.
 */
export function buildGatewayIdentityPrompt(
  config: Config,
  context?: GatewayIdentityContext,
): string {
  const agentId = context?.agentId ?? config.agents?.default ?? "main";
  const hostname = context?.hostname ?? getHostname();
  const os = `${process.platform} (${process.arch})`;
  const agentCount = config.agents?.list?.length ?? 1;

  const runtimeParts = [
    `agent=${agentId}`,
    `host=${hostname}`,
    `os=${os}`,
    `gateway=pi-gateway`,
    `agents=${agentCount}`,
  ];

  // Add enabled capabilities summary
  const caps: string[] = [];
  if (config.heartbeat?.enabled) caps.push("heartbeat");
  if (config.cron?.enabled) caps.push("cron");
  if (hasAnyChannel(config)) caps.push("media");
  if (agentCount > 1) caps.push("delegation");
  if (caps.length > 0) runtimeParts.push(`capabilities=${caps.join(",")}`);

  const lines = [
    "## Gateway Environment",
    "",
    "You are running inside pi-gateway, a multi-agent gateway that routes messages from messaging channels (Telegram, Discord, WebChat) to isolated pi agent processes via RPC.",
    "",
    `Runtime: ${runtimeParts.join(" | ")}`,
    "",
    "Gateway rules:",
    "- Your replies are delivered to messaging channels — format for messaging context: prefer structured, scannable responses over long prose",
    "- Do not reference local file paths in replies unless the user is technical",
    "- The gateway handles message routing, streaming, chunking, and delivery",
    "- Each channel has its own formatting rules (see Channel Formatting section if present)",
  ];

  return lines.join("\n");
}

// ============================================================================
// Layer 2: Capability Prompts
// ============================================================================

// --- Heartbeat ---

/**
 * Heartbeat protocol prompt.
 * Always-on option: set gatewayPrompts.alwaysHeartbeat=true to inject even when heartbeat.enabled=false.
 *
 * @owner TrueJaguar (KeenDragon)
 */
const HEARTBEAT_SEGMENT = `## Gateway: Heartbeat Protocol

You are connected to pi-gateway which periodically wakes you via heartbeat.

When woken by heartbeat:
1. Read HEARTBEAT.md if it exists — follow its instructions strictly
2. Do NOT infer or repeat tasks from prior conversations
3. If nothing needs attention, reply with exactly: HEARTBEAT_OK
4. If you completed tasks but want to confirm success, include HEARTBEAT_OK at the end of your response
5. If there are alerts or issues requiring human attention, describe them WITHOUT including HEARTBEAT_OK

**HEARTBEAT_OK decision guide:**
- File missing → run heartbeat normally (let the gateway decide)
- File exists but empty (only headings/empty checkboxes) → gateway skips the call automatically
- All tasks done, no issues → HEARTBEAT_OK
- Tasks done + brief summary (< 300 chars after token) → HEARTBEAT_OK at end, summary is suppressed
- Tasks done + detailed report (> 300 chars) → HEARTBEAT_OK at end, report IS delivered as alert
- Unresolved issues or errors → describe them, do NOT include HEARTBEAT_OK

**HEARTBEAT.md expected format:**
\`\`\`markdown
# Heartbeat
- [ ] Check disk usage
- [ ] Verify backup status
- [x] Already completed task (skip this)
\`\`\`

The gateway suppresses HEARTBEAT_OK responses (they won't reach the user). Only non-OK responses are delivered as alerts.`;

// --- Cron ---

/**
 * Build the cron capability prompt.
 *
 * @owner JadeHawk (SwiftQuartz)
 */
const CRON_SEGMENT = `## Gateway: Scheduled Tasks

The gateway runs a cron engine for scheduled task execution.

**Use the \`cron\` tool for programmatic job management** (preferred over slash commands).
The tool supports: list, add, remove, pause, resume, run.

**Slash commands (alternative):**
- /cron list — view all jobs with status (active/paused)
- /cron pause <id> — pause a running job
- /cron resume <id> — resume a paused job
- /cron remove <id> — delete a job permanently
- /cron run <id> — manually trigger a job now (for debugging)

**Schedule formats:**
- Cron expression: "0 */6 * * *" (standard cron, supports timezone)
- Interval: "30m", "2h", "1d" (fixed interval)
- One-shot: ISO 8601 datetime (fires once, auto-removes)

**Execution modes:**
- Isolated (default): job runs in its own session, results optionally announced
- Main: job is injected into your session as a system event, processed during heartbeat

**When the gateway injects cron events:**
Events appear as \`[CRON:{job-id}] {task description}\` in your message.
1. Process each task according to its description
2. Report results for each task
3. If ALL tasks completed successfully, include HEARTBEAT_OK at the end
4. If any task failed, describe the failure WITHOUT HEARTBEAT_OK`;

// --- Media ---

/**
 * Media reply syntax prompt (system prompt level).
 * Note: Per-message media hints (Layer 3) are injected by channel handlers.
 *
 * @owner TrueJaguar (KeenDragon)
 */
const MEDIA_SEGMENT = `## Gateway: Media & Message Tools

**\`send_media\` tool** — send files to the user.
The tool delivers media directly to the chat and returns a confirmation with messageId.

\`\`\`
send_media({ path: "./output.png" })
send_media({ path: "./report.pdf", caption: "Monthly report" })
send_media({ path: "./recording.mp3", type: "audio" })
\`\`\`

**\`send_message\` tool** — send an additional text message to the chat.
Use when you need to send a separate message outside the normal response flow, or reply to a specific message.

\`\`\`
send_message({ text: "Processing complete!" })
send_message({ text: "Here's the fix", replyTo: "123456" })
\`\`\`

**Type inference by extension (send_media):**
- Photo: jpg, jpeg, png, gif, webp, bmp
- Audio: mp3, ogg, wav, m4a, flac
- Video: mp4, webm, mov, avi
- Document: pdf, txt, csv, zip, and all other extensions

**Rules:**
- Path can be relative to workspace (./output.png) or absolute temp path (/tmp/xxx.png, /var/folders/...)
- Type is auto-detected from extension; override with the \`type\` parameter if needed
- Optional \`caption\` parameter adds text alongside the media
- SVG files are NOT supported as images on Telegram — convert to PNG first
- Telegram image formats: jpg, jpeg, png, gif, webp, bmp

**Fallback: MEDIA: directive** (used when send_media tool is unavailable)
Write on a separate line: MEDIA:<relative-path>
Example: MEDIA:./output.png

**Blocked paths (security):**
- Sensitive system paths: /etc/passwd, ~/.ssh ❌
- Directory traversal: ../../secret ❌
- URL schemes: file://, data:, javascript: ❌
- Null bytes and symlinks outside workspace ❌`;

// --- Delegation ---

/**
 * Build the delegation protocol prompt.
 *
 * @owner JadeHawk (SwiftQuartz)
 */
export function buildDelegationSegment(config: Config): string | null {
  const agents = config.agents?.list ?? [];
  if (agents.length <= 1) return null;

  const agentLines = agents.map((a) => {
    const desc = (a as any).description ? ` — ${(a as any).description}` : "";
    return `  - ${a.id}${desc}`;
  }).join("\n");
  const timeout = config.delegation.timeoutMs;
  const maxDepth = config.delegation.maxDepth;
  const maxConcurrent = config.delegation.maxConcurrent;
  const onTimeout = config.delegation.onTimeout;

  return `## Gateway: Agent Delegation

You can delegate tasks to other agents via the delegate_to_agent tool.

**Available agents:**
${agentLines}

**Constraints:**
- Timeout: ${Math.round(timeout / 1000)}s per delegation (max ${Math.round(config.delegation.maxTimeoutMs / 1000)}s)
- Max chain depth: ${maxDepth} (nested A→B→C delegations)
- Max concurrent: ${maxConcurrent} per agent
- On timeout: ${onTimeout === "return-partial" ? "returns partial results" : "aborts the call"}

**When to delegate:**
- Task requires a different workspace or specialized skill set
- You want to run independent subtasks in parallel
- Task is better suited to a specific agent's configuration

**Guidelines:**
- Keep delegation tasks focused and self-contained
- Include enough context for the target agent to work independently
- Delegation is synchronous — you wait for the result before continuing`;
}

// --- Channel-specific ---

/**
 * Build channel-specific formatting hints.
 *
 * Lists all enabled channels so the agent knows formatting rules and limits.
 * Since RPC processes are pool-level (not session-level), we include all active channels.
 *
 * @owner MintHawk (KeenUnion)
 */
export function buildChannelSegment(config: Config): string | null {
  const hints: string[] = [];

  if ((config.channels as any)?.telegram && (config.channels as any).telegram.enabled !== false) {
    hints.push(`### Telegram
- Max message length: 4096 characters (auto-chunked if exceeded)
- Formatting: HTML tags (bold, italic, code, pre, blockquote) — avoid nested markdown
- Streaming: replies are edited in-place with ~1s throttle
- Media: images/documents sent via MEDIA: directive; voice messages are transcribed before delivery
- Slash commands: /new, /status, /compact, /model, /role, /cron, /help`);
  }

  if ((config.channels as any)?.discord && (config.channels as any).discord.enabled !== false) {
    hints.push(`### Discord
- Max message length: 2000 characters (auto-chunked if exceeded)
- Formatting: standard Markdown (bold, italic, code blocks, blockquotes)
- Streaming: replies edited with 500ms throttle, truncated at ~1800 chars during streaming
- Threads: supported — replies stay in the originating thread
- Slash commands: /new, /status, /compact, /model, /think, /stop, /help`);
  }

  if ((config.channels as any)?.feishu && (config.channels as any).feishu.enabled !== false) {
    hints.push(`### Feishu (Lark)
- Formatting: rich text (post) format — use plain text for now, no Markdown
- Max message length: ~30000 characters per message (post type)
- Media: not yet supported via channel — use send_media tool for file delivery
- Interactive cards: future scope — currently text-only replies
- Slash commands: not supported — use natural language commands
- Note: Feishu WebSocket mode handles message dedup automatically`);
  }

  // WebChat is always available when gateway is running
  hints.push(`### WebChat
- No hard message length limit
- Formatting: full Markdown with syntax-highlighted code blocks
- Media: images rendered inline with click-to-expand lightbox; non-images shown as download links
- Sessions: users can create, switch, and delete sessions via sidebar`);

  return `## Gateway: Channel Formatting

Your replies are delivered to messaging channels. Each has different formatting rules and limits.

${hints.join("\n\n")}

General guidelines:
- Keep replies concise — messaging UIs have limited space
- Prefer structured output (lists, code blocks) over long paragraphs
- Do not reference local file paths unless the user is technical`;
}

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Build the complete gateway system prompt by assembling all layers.
 * Returns null when no features need injection (saves tokens).
 *
 * @owner NiceViper (DarkFalcon) — integration + config resolution
 */
export function buildGatewaySystemPrompt(
  config: Config,
  context?: GatewayIdentityContext,
): string | null {
  const overrides = config.agent.gatewayPrompts;
  const segments: string[] = [];

  // --- Layer 1: Identity ---
  const identityEnabled = overrides?.identity !== false; // default: true
  if (identityEnabled) {
    segments.push(buildGatewayIdentityPrompt(config, context));
  }

  // --- Layer 2: Capabilities ---

  // Heartbeat
  const heartbeatEnabled =
    overrides?.heartbeat ?? overrides?.alwaysHeartbeat ?? config.heartbeat?.enabled ?? false;
  if (heartbeatEnabled) segments.push(HEARTBEAT_SEGMENT);

  // Cron
  const cronEnabled = overrides?.cron ?? config.cron?.enabled ?? false;
  if (cronEnabled) segments.push(CRON_SEGMENT);

  // Media
  const mediaEnabled = overrides?.media ?? hasAnyChannel(config);
  if (mediaEnabled) segments.push(MEDIA_SEGMENT);

  // Delegation
  const delegationEnabled = overrides?.delegation ?? (config.agents?.list?.length ?? 0) > 1;
  if (delegationEnabled) {
    const delegationSegment = buildDelegationSegment(config);
    if (delegationSegment) segments.push(delegationSegment);
  }

  // Channel-specific hints
  const channelEnabled = overrides?.channel ?? hasAnyChannel(config);
  if (channelEnabled) {
    const channelSegment = buildChannelSegment(config);
    if (channelSegment) segments.push(channelSegment);
  }

  return segments.length > 0 ? segments.join("\n\n") : null;
}

// ============================================================================
// Helpers
// ============================================================================

function hasAnyChannel(config: Config): boolean {
  const channels = config.channels;
  if (!channels) return false;
  if ((channels as any).telegram?.enabled !== false && (channels as any).telegram) return true;
  if ((channels as any).discord?.enabled !== false && (channels as any).discord) return true;
  return false;
}

function resolveActiveChannel(config: Config): string | undefined {
  const channels: string[] = [];
  if ((config.channels as any)?.telegram?.enabled !== false && (config.channels as any)?.telegram)
    channels.push("telegram");
  if ((config.channels as any)?.discord?.enabled !== false && (config.channels as any)?.discord)
    channels.push("discord");
  if (channels.length === 0) return undefined;
  if (channels.length === 1) return channels[0];
  return channels.join("+");
}

// ============================================================================
// Backward-compat exports (used by existing tests)
// ============================================================================

export const HEARTBEAT_PROMPT = HEARTBEAT_SEGMENT;
export const CRON_PROMPT = CRON_SEGMENT;
export const MEDIA_PROMPT = MEDIA_SEGMENT;
