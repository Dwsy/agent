/**
 * Gateway Tools Extension for pi-gateway
 *
 * Registers tools that allow the pi agent to interact with the gateway:
 * - send_media: Send files (images, audio, documents) to the current chat
 * - send_message: Send text messages to the current chat
 * - cron: Manage scheduled tasks (list/add/remove/pause/resume/run)
 *
 * Environment variables (set by gateway when spawning pi processes):
 * - PI_GATEWAY_URL: Gateway HTTP base URL (e.g., http://127.0.0.1:18789)
 * - PI_GATEWAY_INTERNAL_TOKEN: Shared secret for authenticating back to gateway
 * - PI_GATEWAY_SESSION_KEY: Current session key (set dynamically by RPC pool)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function gatewayTools(pi: ExtensionAPI) {
  const gatewayUrl = process.env.PI_GATEWAY_URL;
  const internalToken = process.env.PI_GATEWAY_INTERNAL_TOKEN;

  if (!gatewayUrl || !internalToken) {
    // Not running under pi-gateway — skip tool registration
    return;
  }

  pi.registerTool({
    name: "send_media",
    label: "Send Media",
    description:
      "Send a file (image, audio, document, video) to the current chat via pi-gateway. " +
      "The file is delivered directly to the channel (Telegram/Discord/WebChat). " +
      "Path can be relative to workspace (e.g., ./output.png) or absolute temp paths (/tmp/, /var/folders/). " +
      "Type is auto-detected from extension if omitted. " +
      "Note: SVG files are NOT supported as images on Telegram — convert to PNG first. " +
      "Telegram image formats: jpg, jpeg, png, gif, webp, bmp.",
    parameters: Type.Object({
      path: Type.String({ description: "File path — relative (./output.png) or absolute temp path (/tmp/xxx.png)" }),
      caption: Type.Optional(
        Type.String({ description: "Optional caption text sent with the media" }),
      ),
      type: Type.Optional(
        Type.String({
          enum: ["photo", "audio", "document", "video"],
          description: "Media type. Auto-detected from file extension if omitted.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const { path, caption, type } = params as {
        path: string;
        caption?: string;
        type?: string;
      };

      const sessionKey = process.env.PI_GATEWAY_SESSION_KEY || "";

      try {
        const res = await fetch(`${gatewayUrl}/api/media/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: internalToken,
            pid: process.pid,
            sessionKey: sessionKey || undefined,
            path,
            caption,
            type,
          }),
        });

        const data = (await res.json()) as Record<string, unknown>;

        if (!res.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to send media: ${data.error || res.statusText}`,
              },
            ],
            details: { error: true, status: res.status },
          };
        }

        // Direct delivery succeeded — or fallback directive returned
        if (data.delivered === false) {
          // Channel doesn't support sendMedia, return directive for legacy parsing
          const directiveText = caption
            ? `${caption}\n${data.directive}`
            : String(data.directive);
          return {
            content: [{ type: "text" as const, text: directiveText }],
            details: { path: data.path, type: data.type, channel: data.channel, delivered: false },
          };
        }

        // Direct delivery success
        const summary = data.messageId
          ? `Media sent (${data.type}, messageId: ${data.messageId})`
          : `Media sent (${data.type})`;

        return {
          content: [{ type: "text" as const, text: summary }],
          details: {
            ok: true,
            messageId: data.messageId,
            path: data.path,
            type: data.type,
            channel: data.channel,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `send_media error: ${message}` }],
          details: { error: true },
        };
      }
    },
  });

  // ========================================================================
  // send_message — text message delivery (v3.4 T1)
  // ========================================================================

  pi.registerTool({
    name: "send_message",
    label: "Send Message",
    description:
      "Send a text message to the current chat via pi-gateway. " +
      "Optionally reply to a specific message by providing replyTo (message ID). " +
      "Use this when you need to send an additional message outside the normal response flow.",
    parameters: Type.Object({
      text: Type.String({ description: "Message text to send" }),
      replyTo: Type.Optional(
        Type.String({ description: "Message ID to reply to (creates a threaded reply)" }),
      ),
      parseMode: Type.Optional(
        Type.String({ description: "Parse mode: Markdown, HTML, or plain (default: channel default)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const { text, replyTo, parseMode } = params as {
        text: string;
        replyTo?: string;
        parseMode?: string;
      };

      const sessionKey = process.env.PI_GATEWAY_SESSION_KEY || "";

      try {
        const res = await fetch(`${gatewayUrl}/api/message/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: internalToken,
            pid: process.pid,
            sessionKey: sessionKey || undefined,
            text,
            replyTo,
            parseMode,
          }),
        });

        const data = (await res.json()) as Record<string, unknown>;

        if (!res.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Failed to send message: ${data.error || res.statusText}`,
              },
            ],
            details: { error: true, status: res.status },
          };
        }

        const summary = replyTo
          ? `Message sent (reply to ${replyTo}, ${data.textLength} chars)`
          : `Message sent (${data.textLength} chars)`;

        return {
          content: [{ type: "text" as const, text: summary }],
          details: {
            ok: true,
            channel: data.channel,
            textLength: data.textLength,
            replyTo: data.replyTo,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `send_message error: ${message}` }],
          details: { error: true },
        };
      }
    },
  });

  // ========================================================================
  // cron — scheduled task management (v3.6)
  // ========================================================================

  const CRON_ACTIONS = ["list", "add", "remove", "pause", "resume", "run", "wake"] as const;

  pi.registerTool({
    name: "cron",
    label: "Cron",
    description:
      "Manage gateway scheduled tasks (cron jobs) and send wake events. " +
      "Actions: list (show all jobs), add (create job), remove (delete job), " +
      "pause/resume (toggle job), run (trigger immediately), wake (inject system event).\n\n" +
      "SCHEDULE TYPES (schedule.kind):\n" +
      '- "cron": Standard cron expression, e.g. "0 */6 * * *"\n' +
      '- "every": Interval, e.g. "30m", "2h", "1d"\n' +
      '- "at": One-shot ISO 8601 datetime (fires once)\n\n' +
      "MODE:\n" +
      '- "isolated" (default): Runs in independent session\n' +
      '- "main": Injects as system event into main session\n\n' +
      "WAKE:\n" +
      "Inject a system event into the main session. " +
      'mode "next-heartbeat" (default) queues for next heartbeat; "now" triggers immediately.\n\n' +
      "EXAMPLES:\n" +
      '- List: { action: "list" }\n' +
      '- Add hourly task: { action: "add", id: "backup", schedule: { kind: "every", expr: "1h" }, task: "Run backup check" }\n' +
      '- Add cron: { action: "add", id: "morning", schedule: { kind: "cron", expr: "0 9 * * *" }, task: "Morning briefing" }\n' +
      '- One-shot reminder: { action: "add", id: "remind-1", schedule: { kind: "at", expr: "2026-02-13T10:00:00Z" }, task: "Remind user about meeting", deleteAfterRun: true }\n' +
      '- Remove: { action: "remove", id: "backup" }\n' +
      '- Pause: { action: "pause", id: "morning" }\n' +
      '- Run now: { action: "run", id: "backup" }\n' +
      '- Wake now: { action: "wake", text: "Check email for urgent items", wakeMode: "now" }\n' +
      '- Wake next: { action: "wake", text: "Review pending PRs" }',
    parameters: Type.Object({
      action: Type.String({
        enum: ["list", "add", "remove", "pause", "resume", "run", "wake"],
        description: "Action to perform",
      }),
      id: Type.Optional(
        Type.String({ description: "Job ID — required for add/remove/pause/resume/run" }),
      ),
      schedule: Type.Optional(
        Type.Object(
          {
            kind: Type.String({
              enum: ["cron", "every", "at"],
              description: "Schedule type",
            }),
            expr: Type.String({ description: 'Schedule expression (cron: "0 */6 * * *", every: "30m", at: ISO 8601)' }),
            timezone: Type.Optional(Type.String({ description: "Timezone for cron expressions (e.g. Asia/Shanghai)" })),
          },
          { description: "Schedule — required for add" },
        ),
      ),
      task: Type.Optional(
        Type.String({ description: "Task description text — required for add" }),
      ),
      mode: Type.Optional(
        Type.String({
          enum: ["isolated", "main"],
          description: 'Execution mode. Default: "isolated"',
        }),
      ),
      delivery: Type.Optional(
        Type.String({
          enum: ["announce", "direct", "silent"],
          description: 'Result delivery mode. "announce" (default) = retell via main session, "direct" = send raw to channel, "silent" = log only',
        }),
      ),
      deleteAfterRun: Type.Optional(
        Type.Boolean({ description: "Remove job after first execution. Default: false" }),
      ),
      wakeMode: Type.Optional(
        Type.String({
          enum: ["now", "next-heartbeat"],
          description: 'Wake mode — "now" triggers immediately, "next-heartbeat" (default) queues for next heartbeat. Only for wake action.',
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const { action, id, schedule, task, mode, delivery, deleteAfterRun, wakeMode } = params as {
        action: string;
        id?: string;
        schedule?: { kind: string; expr: string; timezone?: string };
        task?: string;
        mode?: string;
        delivery?: string;
        deleteAfterRun?: boolean;
        wakeMode?: string;
      };

      try {
        switch (action) {
          case "list": {
            const res = await fetch(`${gatewayUrl}/api/cron/jobs`, {
              headers: { Authorization: `Bearer ${internalToken}` },
            });
            const data = (await res.json()) as { ok: boolean; jobs?: unknown[]; error?: string };
            if (!res.ok) return cronError(data.error || res.statusText);
            const jobs = data.jobs ?? [];
            return cronOk(
              jobs.length === 0
                ? "No scheduled jobs."
                : `${jobs.length} job(s):\n${JSON.stringify(jobs, null, 2)}`,
            );
          }

          case "add": {
            if (!id) return cronError("id is required for add");
            if (!schedule) return cronError("schedule is required for add");
            if (!task) return cronError("task is required for add");

            const res = await fetch(`${gatewayUrl}/api/cron/jobs`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${internalToken}`,
              },
              body: JSON.stringify({
                id,
                schedule,
                task,
                mode: mode || "isolated",
                delivery: delivery || "announce",
                deleteAfterRun: deleteAfterRun ?? false,
              }),
            });
            const data = (await res.json()) as Record<string, unknown>;
            if (!res.ok) return cronError(data.error as string || res.statusText);
            return cronOk(`Job "${id}" created (${schedule.kind}: ${schedule.expr})`);
          }

          case "remove": {
            if (!id) return cronError("id is required for remove");
            const res = await fetch(`${gatewayUrl}/api/cron/jobs/${encodeURIComponent(id)}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${internalToken}` },
            });
            const data = (await res.json()) as Record<string, unknown>;
            if (!res.ok) return cronError(data.error as string || res.statusText);
            return cronOk(`Job "${id}" removed.`);
          }

          case "pause":
          case "resume": {
            if (!id) return cronError(`id is required for ${action}`);
            const res = await fetch(`${gatewayUrl}/api/cron/jobs/${encodeURIComponent(id)}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${internalToken}`,
              },
              body: JSON.stringify({ action }),
            });
            const data = (await res.json()) as Record<string, unknown>;
            if (!res.ok) return cronError(data.error as string || res.statusText);
            return cronOk(`Job "${id}" ${action}d.`);
          }

          case "run": {
            if (!id) return cronError("id is required for run");
            const res = await fetch(
              `${gatewayUrl}/api/cron/jobs/${encodeURIComponent(id)}/run`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${internalToken}` },
              },
            );
            const data = (await res.json()) as Record<string, unknown>;
            if (!res.ok) return cronError(data.error as string || res.statusText);
            return cronOk(`Job "${id}" triggered.`);
          }

          case "wake": {
            if (!task) return cronError("task (text) is required for wake");
            const res = await fetch(`${gatewayUrl}/api/wake`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${internalToken}`,
              },
              body: JSON.stringify({
                text: task,
                mode: wakeMode || "next-heartbeat",
              }),
            });
            const data = (await res.json()) as Record<string, unknown>;
            if (!res.ok) return cronError(data.error as string || res.statusText);
            const modeLabel = (data.mode || wakeMode || "next-heartbeat") as string;
            return cronOk(
              modeLabel === "now"
                ? `Wake event injected and heartbeat triggered.`
                : `Wake event queued for next heartbeat.`,
            );
          }

          default:
            return cronError(`Unknown action: ${action}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return cronError(message);
      }
    },
  });

  // ========================================================================
  // message — react/edit/delete actions on existing messages (v3.6)
  // ========================================================================

  const MESSAGE_ACTIONS = ["react", "edit", "delete"] as const;

  pi.registerTool({
    name: "message",
    label: "Message Action",
    description:
      "Perform actions on existing chat messages: react with emoji, edit message text, or delete a message. " +
      "The messageId comes from previous send_message or send_media tool results. " +
      "Actions: react (add/remove emoji reaction), edit (replace message text), delete (remove message).",
    parameters: Type.Object({
      action: Type.String({
        enum: MESSAGE_ACTIONS as unknown as string[],
        description: "Action to perform: react, edit, or delete",
      }),
      messageId: Type.String({ description: "Target message ID (from send_message/send_media result)" }),
      emoji: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())], {
          description: "Emoji for react action — single emoji or array of emoji",
        }),
      ),
      text: Type.Optional(
        Type.String({ description: "New text for edit action" }),
      ),
      remove: Type.Optional(
        Type.Boolean({ description: "Remove reaction instead of adding (react action only, default: false)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const { action, messageId, emoji, text, remove } = params as {
        action: string;
        messageId: string;
        emoji?: string | string[];
        text?: string;
        remove?: boolean;
      };

      if (!MESSAGE_ACTIONS.includes(action as any)) {
        return toolError(`Unknown action: ${action}. Must be one of: ${MESSAGE_ACTIONS.join(", ")}`);
      }
      if (!messageId) {
        return toolError("messageId is required");
      }
      if (action === "react" && !emoji) {
        return toolError("emoji is required for react action");
      }
      if (action === "edit" && !text) {
        return toolError("text is required for edit action");
      }

      try {
        const res = await fetch(`${gatewayUrl}/api/message/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: internalToken,
            pid: process.pid,
            sessionKey: process.env.PI_GATEWAY_SESSION_KEY || undefined,
            action,
            messageId,
            emoji,
            text,
            remove,
          }),
        });

        const data = (await res.json()) as Record<string, unknown>;

        if (!res.ok) {
          return toolError(String(data.error || res.statusText));
        }

        if (action === "react") {
          const emojiStr = Array.isArray(emoji) ? emoji.join(" ") : emoji;
          return toolOk(remove ? `Reaction ${emojiStr} removed from message ${messageId}` : `Reacted ${emojiStr} to message ${messageId}`);
        }
        if (action === "edit") {
          return toolOk(`Message ${messageId} edited (${(text ?? "").length} chars)`);
        }
        if (action === "delete") {
          return toolOk(`Message ${messageId} deleted`);
        }

        return toolOk(`Action ${action} completed on message ${messageId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(message);
      }
    },
  });
}

// ============================================================================
// Cron tool helpers
// ============================================================================

function cronOk(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { ok: true },
  };
}

function cronError(error: string) {
  return {
    content: [{ type: "text" as const, text: `Cron error: ${error}` }],
    details: { error: true },
  };
}

// ============================================================================
// Generic tool helpers (message tool)
// ============================================================================

function toolOk(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { ok: true },
  };
}

function toolError(error: string) {
  return {
    content: [{ type: "text" as const, text: `Message action error: ${error}` }],
    details: { error: true },
  };
}
