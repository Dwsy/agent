/**
 * Extension UI Forwarder
 *
 * Manages forwarding extension_ui_request from RPC agents to WebChat WS clients,
 * and routing responses back to the agent's stdin.
 *
 * Replaces the auto-cancel behavior in rpc-client.ts when WebChat clients are connected.
 */

import type { ServerWebSocket } from "bun";
import type {
  ExtensionUIRequest,
  ExtensionUIResponse,
  ExtensionUIDismissed,
  PendingUIRequest,
  ExtensionUIMethod,
  SelectOption,
} from "./extension-ui-types.ts";
import { createLogger } from "./types.ts";

const DEFAULT_TTL_MS = 60_000;

export class ExtensionUIForwarder {
  /** Pending requests awaiting frontend response */
  private pending = new Map<string, PendingUIRequest>();
  private log = createLogger("extension-ui");

  /**
   * Forward an extension_ui_request to all connected WS clients.
   * Returns a Promise that resolves when a client responds or TTL expires.
   */
  forward(
    data: Record<string, unknown>,
    wsClients: Map<string, ServerWebSocket<any>>,
    writeToRpc: (response: string) => void,
  ): boolean {
    const id = data.id as string;
    const method = data.method as string;
    if (!id || !method) return false;

    // No WS clients connected — fall back to auto-cancel
    if (wsClients.size === 0) return false;

    const request: ExtensionUIRequest = this.normalizeRequest(data);

    const entry: PendingUIRequest = {
      id,
      request,
      resolved: false,
      createdAt: Date.now(),
      ttlTimer: setTimeout(() => {
        this.handleTimeout(id, writeToRpc);
      }, request.ttlMs),
      respond: (response: ExtensionUIResponse) => {
        writeToRpc(JSON.stringify({
          type: "extension_ui_response",
          id,
          value: response.value,
          confirmed: response.confirmed,
          cancelled: response.cancelled,
        }));
      },
      onTimeout: () => {
        writeToRpc(JSON.stringify({
          type: "extension_ui_response",
          id,
          cancelled: true,
        }));
      },
    };

    this.pending.set(id, entry);

    // Broadcast to all WS clients (first-win)
    const frame = JSON.stringify({
      type: "event",
      event: "extension_ui_request",
      payload: request,
    });
    for (const ws of wsClients.values()) {
      try { ws.send(frame); } catch {}
    }

    this.log.debug(`Forwarded extension_ui_request ${id} (${method}) to ${wsClients.size} client(s)`);
    return true;
  }

  /**
   * Handle a response from a WS client.
   * First response wins; late responses are ignored + dismissed.
   */
  handleResponse(
    response: ExtensionUIResponse,
    wsClients: Map<string, ServerWebSocket<any>>,
    respondingClientId: string,
  ): boolean {
    const entry = this.pending.get(response.id);
    if (!entry) return false;

    if (entry.resolved) {
      // Already resolved — send dismissed to this late client
      this.log.debug(`Late response for ${response.id} from ${respondingClientId}, ignoring`);
      return false;
    }

    // First win — resolve
    entry.resolved = true;
    clearTimeout(entry.ttlTimer);
    entry.respond(response);
    this.pending.delete(response.id);

    // Notify other clients that this prompt is dismissed
    const dismissed: ExtensionUIDismissed = {
      type: "extension_ui_dismissed",
      id: response.id,
    };
    const frame = JSON.stringify({ type: "event", event: "extension_ui_dismissed", payload: dismissed });
    for (const [clientId, ws] of wsClients) {
      if (clientId !== respondingClientId) {
        try { ws.send(frame); } catch {}
      }
    }

    this.log.debug(`Resolved extension_ui_request ${response.id} via ${respondingClientId}`);
    return true;
  }

  /**
   * Re-send pending requests to a newly connected client (reconnect recovery).
   * Only re-sends requests with remaining TTL > 10s.
   */
  resendPending(ws: ServerWebSocket<any>): void {
    const now = Date.now();
    for (const entry of this.pending.values()) {
      if (entry.resolved) continue;
      const elapsed = now - entry.createdAt;
      const remaining = entry.request.ttlMs - elapsed;
      if (remaining <= 10_000) continue;

      const frame = JSON.stringify({
        type: "event",
        event: "extension_ui_request",
        payload: { ...entry.request, ttlMs: remaining },
      });
      try { ws.send(frame); } catch {}
    }
  }

  /** Cancel all pending requests (gateway shutdown). */
  cancelAll(writeToRpc: (response: string) => void): void {
    for (const entry of this.pending.values()) {
      if (!entry.resolved) {
        clearTimeout(entry.ttlTimer);
        entry.onTimeout();
      }
    }
    this.pending.clear();
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private handleTimeout(id: string, writeToRpc: (response: string) => void): void {
    const entry = this.pending.get(id);
    if (!entry || entry.resolved) return;

    entry.resolved = true;
    entry.onTimeout();
    this.pending.delete(id);
    this.log.debug(`Extension UI request ${id} timed out (${entry.request.ttlMs}ms)`);
  }

  private normalizeRequest(data: Record<string, unknown>): ExtensionUIRequest {
    const method = data.method as ExtensionUIMethod;
    const base = {
      type: "extension_ui_request" as const,
      id: data.id as string,
      method,
      title: data.title as string | undefined,
      ttlMs: (data.ttlMs as number) ?? DEFAULT_TTL_MS,
    };

    switch (method) {
      case "select":
      case "multiselect":
        return {
          ...base,
          method,
          options: this.normalizeOptions(data.options),
          initialValue: data.initialValue as string | undefined,
          initialValues: data.initialValues as string[] | undefined,
        };
      case "text":
      case "editor":
        return {
          ...base,
          method,
          placeholder: data.placeholder as string | undefined,
          defaultValue: data.defaultValue as string | undefined,
        };
      case "confirm":
        return {
          ...base,
          method,
          message: data.message as string | undefined,
          initialValue: data.initialValue as boolean | undefined,
        };
      case "progress":
        return {
          ...base,
          method,
          current: data.current as number | undefined,
          total: data.total as number | undefined,
          label: data.label as string | undefined,
        };
      default:
        return { ...base, method: "confirm", message: `Unknown method: ${method}` };
    }
  }

  /** Normalize options: accept string[] or {value,label,hint?}[] */
  private normalizeOptions(raw: unknown): SelectOption[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      if (typeof item === "string") return { value: item, label: item };
      if (item && typeof item === "object" && "value" in item) {
        return {
          value: String(item.value),
          label: String(item.label ?? item.value),
          hint: item.hint ? String(item.hint) : undefined,
        };
      }
      return { value: String(item), label: String(item) };
    });
  }
}
