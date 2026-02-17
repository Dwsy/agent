/**
 * keyboard_select tool — send an inline keyboard to the user and wait for selection.
 *
 * This gives the AI agent the ability to present interactive choices to the user
 * via Telegram inline keyboards (or other channel-specific UI).
 *
 * The tool call blocks until the user makes a selection or the timeout expires.
 */

import { Type } from "@sinclair/typebox";
import { toolOk, toolError, gatewayHeaders, parseResponseJson } from "./helpers.ts";

export function createKeyboardSelectTool(gatewayUrl: string, internalToken: string, authToken?: string) {
  return {
    name: "keyboard_select",
    label: "Interactive Selection",
    description:
      "Present an interactive inline keyboard to the user and wait for their selection. " +
      "Use this when you need the user to choose from a set of options (e.g., confirm an action, " +
      "pick a configuration, select from search results). The tool blocks until the user clicks " +
      "a button or the timeout expires. Each option needs a unique id and display text.",
    parameters: Type.Object({
      title: Type.String({ description: "Message text displayed above the keyboard buttons" }),
      options: Type.Array(
        Type.Object({
          id: Type.String({ description: "Unique identifier for this option (returned on selection)" }),
          text: Type.String({ description: "Button label shown to the user" }),
        }),
        { description: "List of options to present as buttons", minItems: 1, maxItems: 50 },
      ),
      columns: Type.Optional(
        Type.Number({ description: "Number of buttons per row (default: 1, max: 8)", minimum: 1, maximum: 8 }),
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Timeout in seconds (default: 120, max: 300)", minimum: 5, maximum: 300 }),
      ),
    }),
    async execute(_toolCallId: string, params: unknown) {
      const { title, options, columns, timeout } = params as {
        title: string;
        options: Array<{ id: string; text: string }>;
        columns?: number;
        timeout?: number;
      };

      const sessionKey = process.env.PI_GATEWAY_SESSION_KEY || "";
      const timeoutMs = timeout ? timeout * 1000 : undefined;

      try {
        const res = await fetch(`${gatewayUrl}/api/keyboard`, {
          method: "POST",
          headers: gatewayHeaders(authToken ?? internalToken, true),
          body: JSON.stringify({
            token: internalToken,
            pid: process.pid,
            sessionKey: sessionKey || undefined,
            title,
            options,
            columns,
            timeout: timeoutMs,
          }),
        });

        const data = await parseResponseJson(res);

        if (!res.ok) {
          return toolError(`Keyboard failed: ${data.error || res.statusText}`);
        }

        if (data.ok && data.selected) {
          const sel = data.selected as { id: string; text: string };
          return toolOk(`User selected: "${sel.text}" (id: ${sel.id})`);
        }

        if (data.error === "timeout") {
          return toolError("User did not respond within the timeout period");
        }

        if (data.error === "cancelled") {
          return toolError("Selection was cancelled");
        }

        return toolError(String(data.error ?? "Unknown keyboard error"));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(`keyboard_select error: ${message}`);
      }
    },
  };
}
