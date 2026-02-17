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
 * - PI_GATEWAY_URL: Gateway HTTP base URL (e.g., http://127.0.0.1:52134)
 * - PI_GATEWAY_INTERNAL_TOKEN: Shared secret for authenticating back to gateway
 * - PI_GATEWAY_SESSION_KEY: Current session key (set dynamically by RPC pool)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createSendMediaTool } from "./send-media.ts";
import { createSendMessageTool } from "./send-message.ts";
import { createCronTool } from "./cron.ts";
import { createMessageActionTool } from "./message-action.ts";
import { createGatewayTool } from "./gateway.ts";
import { createSessionStatusTool } from "./session-status.ts";
import { createKeyboardSelectTool } from "./keyboard-select.ts";

export default function gatewayTools(pi: ExtensionAPI) {
  const gatewayUrl = process.env.PI_GATEWAY_URL;
  const internalToken = process.env.PI_GATEWAY_INTERNAL_TOKEN;
  const authToken = process.env.PI_GATEWAY_AUTH_TOKEN;
  const sessionKey = process.env.PI_GATEWAY_SESSION_KEY;

  if (!gatewayUrl || !internalToken) {
    console.warn(
      `[gateway-tools] skipped: missing env PI_GATEWAY_URL or PI_GATEWAY_INTERNAL_TOKEN ` +
      `(url=${gatewayUrl ? "yes" : "no"}, token=${internalToken ? "yes" : "no"}, session=${sessionKey ? "yes" : "no"})`,
    );
    return;
  }

  console.info(
    `[gateway-tools] loading tools (url=${gatewayUrl}, session=${sessionKey ?? "(none)"})`,
  );

  pi.registerTool(createSendMediaTool(gatewayUrl, internalToken, authToken));
  pi.registerTool(createSendMessageTool(gatewayUrl, internalToken, authToken));
  pi.registerTool(createCronTool(gatewayUrl, internalToken, authToken));
  pi.registerTool(createMessageActionTool(gatewayUrl, internalToken, authToken));
  pi.registerTool(createGatewayTool(gatewayUrl, internalToken, authToken));
  pi.registerTool(createSessionStatusTool(gatewayUrl, internalToken, authToken));
  pi.registerTool(createKeyboardSelectTool(gatewayUrl, internalToken, authToken));

  console.info("[gateway-tools] registered tools: send_media, send_message, cron, message, gateway, session_status, keyboard_select");
}
