/**
 * Gateway Tools Extension for pi-gateway
 *
 * Registers tools that allow the pi agent to interact with the gateway:
 * - send_media: Send files (images, audio, documents) to the current chat
 * - send_message: Send text messages to the current chat
 * - cron: Manage scheduled tasks (list/add/remove/pause/resume/run)
 * - message: React/edit/delete existing messages
 *
 * Environment variables (set by gateway when spawning pi processes):
 * - PI_GATEWAY_URL: Gateway HTTP base URL (e.g., http://127.0.0.1:18789)
 * - PI_GATEWAY_INTERNAL_TOKEN: Shared secret for authenticating back to gateway
 * - PI_GATEWAY_SESSION_KEY: Current session key (set dynamically by RPC pool)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createSendMediaTool } from "./send-media.ts";
import { createSendMessageTool } from "./send-message.ts";
import { createCronTool } from "./cron.ts";
import { createMessageActionTool } from "./message-action.ts";

export default function gatewayTools(pi: ExtensionAPI) {
  const gatewayUrl = process.env.PI_GATEWAY_URL;
  const internalToken = process.env.PI_GATEWAY_INTERNAL_TOKEN;

  if (!gatewayUrl || !internalToken) {
    return;
  }

  pi.registerTool(createSendMediaTool(gatewayUrl, internalToken));
  pi.registerTool(createSendMessageTool(gatewayUrl, internalToken));
  pi.registerTool(createCronTool(gatewayUrl, internalToken));
  pi.registerTool(createMessageActionTool(gatewayUrl, internalToken));
}
