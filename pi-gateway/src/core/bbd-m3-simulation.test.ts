/**
 * BBD Simulation Tests — M3 Extension UI WS 透传
 *
 * 模拟测试覆盖：
 * 1. forward() 广播 extension_ui_request 到 WS 客户端
 * 2. handleResponse() first-win + dismissed 通知
 * 3. TTL 60s auto-cancel
 * 4. 第二个 WS client 收到 dismissed
 * 5. resendPending() 恢复 pending 请求（重连）
 */

import { describe, test, expect } from "bun:test";
import { ExtensionUIForwarder } from "./extension-ui-forwarder.ts";
import type { ExtensionUIResponse } from "./extension-ui-types.ts";

// ============================================================================
// Mock WebSocket
// ============================================================================

class MockWebSocket {
  sent: string[] = [];
  closed = false;

  send(data: string) {
    if (this.closed) throw new Error("WebSocket is closed");
    this.sent.push(data);
  }

  get lastMessage(): any {
    if (this.sent.length === 0) return null;
    return JSON.parse(this.sent[this.sent.length - 1]);
  }

  get allMessages(): any[] {
    return this.sent.map(s => JSON.parse(s));
  }
}

function makeClients(...ids: string[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const id of ids) {
    map.set(id, new MockWebSocket());
  }
  return map;
}

function makeSelectRequest(id: string, ttlMs = 60_000) {
  return {
    id,
    method: "select",
    title: "Choose an option",
    options: [
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B" },
    ],
    ttlMs,
  };
}

function makeResponse(id: string, value: string): ExtensionUIResponse {
  return {
    type: "extension_ui_response",
    id,
    value,
    timestamp: Date.now(),
  };
}

// ============================================================================
// 1. forward() 广播到 WS 客户端
// ============================================================================

describe("M3: extension_ui_request forwarding", () => {
  test("forward broadcasts to all connected WS clients", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1", "client-2");
    const rpcWrites: string[] = [];

    const result = forwarder.forward(
      makeSelectRequest("req-1"),
      clients,
      (s) => rpcWrites.push(s),
    );

    expect(result).toBe(true);
    expect(forwarder.pendingCount).toBe(1);

    // Both clients should receive the request
    const ws1 = clients.get("client-1") as MockWebSocket;
    const ws2 = clients.get("client-2") as MockWebSocket;

    expect(ws1.sent.length).toBe(1);
    expect(ws2.sent.length).toBe(1);

    const msg1 = ws1.lastMessage;
    expect(msg1.type).toBe("event");
    expect(msg1.event).toBe("extension_ui_request");
    expect(msg1.payload.id).toBe("req-1");
    expect(msg1.payload.method).toBe("select");
    expect(msg1.payload.options).toHaveLength(2);
  });

  test("forward returns false when no WS clients connected", () => {
    const forwarder = new ExtensionUIForwarder();
    const emptyClients = new Map<string, any>();
    const rpcWrites: string[] = [];

    const result = forwarder.forward(
      makeSelectRequest("req-2"),
      emptyClients,
      (s) => rpcWrites.push(s),
    );

    expect(result).toBe(false);
    expect(forwarder.pendingCount).toBe(0);
  });

  test("forward normalizes string options to {value, label}", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");
    const rpcWrites: string[] = [];

    forwarder.forward(
      { id: "req-3", method: "select", options: ["yes", "no"], ttlMs: 60000 },
      clients,
      (s) => rpcWrites.push(s),
    );

    const ws = clients.get("client-1") as MockWebSocket;
    const payload = ws.lastMessage.payload;
    expect(payload.options[0]).toEqual({ value: "yes", label: "yes" });
    expect(payload.options[1]).toEqual({ value: "no", label: "no" });
  });

  test("forward handles confirm method", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");

    forwarder.forward(
      { id: "req-confirm", method: "confirm", message: "Are you sure?", ttlMs: 60000 },
      clients,
      () => {},
    );

    const ws = clients.get("client-1") as MockWebSocket;
    const payload = ws.lastMessage.payload;
    expect(payload.method).toBe("confirm");
    expect(payload.message).toBe("Are you sure?");
  });

  test("forward handles text method", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");

    forwarder.forward(
      { id: "req-text", method: "text", placeholder: "Enter name...", ttlMs: 60000 },
      clients,
      () => {},
    );

    const ws = clients.get("client-1") as MockWebSocket;
    const payload = ws.lastMessage.payload;
    expect(payload.method).toBe("text");
    expect(payload.placeholder).toBe("Enter name...");
  });
});

// ============================================================================
// 2. handleResponse() first-win + dismissed
// ============================================================================

describe("M3: first-win response handling", () => {
  test("first response wins and resolves the request", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1", "client-2");
    const rpcWrites: string[] = [];

    forwarder.forward(makeSelectRequest("req-fw"), clients, (s) => rpcWrites.push(s));

    // Client-1 responds first
    const result = forwarder.handleResponse(
      makeResponse("req-fw", "a"),
      clients,
      "client-1",
    );

    expect(result).toBe(true);
    expect(forwarder.pendingCount).toBe(0);

    // RPC should receive the response
    expect(rpcWrites.length).toBe(1);
    const rpcMsg = JSON.parse(rpcWrites[0]);
    expect(rpcMsg.type).toBe("extension_ui_response");
    expect(rpcMsg.id).toBe("req-fw");
    expect(rpcMsg.value).toBe("a");
  });

  test("second response is ignored (first-win)", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1", "client-2");
    const rpcWrites: string[] = [];

    forwarder.forward(makeSelectRequest("req-dup"), clients, (s) => rpcWrites.push(s));

    // Client-1 wins
    forwarder.handleResponse(makeResponse("req-dup", "a"), clients, "client-1");

    // Client-2 tries to respond — should be ignored
    const result = forwarder.handleResponse(
      makeResponse("req-dup", "b"),
      clients,
      "client-2",
    );

    expect(result).toBe(false);
    // Only one RPC write
    expect(rpcWrites.length).toBe(1);
  });

  test("other clients receive dismissed notification after first-win", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1", "client-2", "client-3");
    const rpcWrites: string[] = [];

    forwarder.forward(makeSelectRequest("req-dismiss"), clients, (s) => rpcWrites.push(s));

    // Clear initial broadcast messages
    for (const ws of clients.values()) {
      (ws as MockWebSocket).sent = [];
    }

    // Client-1 responds
    forwarder.handleResponse(makeResponse("req-dismiss", "a"), clients, "client-1");

    // Client-1 should NOT receive dismissed (it's the winner)
    const ws1 = clients.get("client-1") as MockWebSocket;
    expect(ws1.sent.length).toBe(0);

    // Client-2 and Client-3 should receive dismissed
    const ws2 = clients.get("client-2") as MockWebSocket;
    const ws3 = clients.get("client-3") as MockWebSocket;

    expect(ws2.sent.length).toBe(1);
    expect(ws2.lastMessage.event).toBe("extension_ui_dismissed");
    expect(ws2.lastMessage.payload.id).toBe("req-dismiss");

    expect(ws3.sent.length).toBe(1);
    expect(ws3.lastMessage.event).toBe("extension_ui_dismissed");
  });

  test("response to unknown request returns false", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");

    const result = forwarder.handleResponse(
      makeResponse("nonexistent", "a"),
      clients,
      "client-1",
    );

    expect(result).toBe(false);
  });
});

// ============================================================================
// 3. TTL auto-cancel
// ============================================================================

describe("M3: TTL auto-cancel", () => {
  test("request auto-cancels after TTL expires", async () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");
    const rpcWrites: string[] = [];

    // Use short TTL for testing
    forwarder.forward(
      { ...makeSelectRequest("req-ttl"), ttlMs: 100 },
      clients,
      (s) => rpcWrites.push(s),
    );

    expect(forwarder.pendingCount).toBe(1);

    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 200));

    expect(forwarder.pendingCount).toBe(0);

    // RPC should receive a cancel response
    expect(rpcWrites.length).toBe(1);
    const rpcMsg = JSON.parse(rpcWrites[0]);
    expect(rpcMsg.type).toBe("extension_ui_response");
    expect(rpcMsg.id).toBe("req-ttl");
    expect(rpcMsg.cancelled).toBe(true);
  });

  test("response before TTL prevents auto-cancel", async () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");
    const rpcWrites: string[] = [];

    forwarder.forward(
      { ...makeSelectRequest("req-fast"), ttlMs: 200 },
      clients,
      (s) => rpcWrites.push(s),
    );

    // Respond quickly
    forwarder.handleResponse(makeResponse("req-fast", "a"), clients, "client-1");

    // Wait past TTL
    await new Promise(r => setTimeout(r, 300));

    // Should only have the real response, not a cancel
    expect(rpcWrites.length).toBe(1);
    const rpcMsg = JSON.parse(rpcWrites[0]);
    expect(rpcMsg.cancelled).toBeUndefined();
    expect(rpcMsg.value).toBe("a");
  });
});

// ============================================================================
// 4. cancelAll (gateway shutdown)
// ============================================================================

describe("M3: cancelAll on shutdown", () => {
  test("cancelAll sends cancel for all pending requests", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");
    const rpcWrites: string[] = [];
    const writeToRpc = (s: string) => rpcWrites.push(s);

    forwarder.forward(makeSelectRequest("req-a"), clients, writeToRpc);
    forwarder.forward({ id: "req-b", method: "confirm", message: "ok?", ttlMs: 60000 }, clients, writeToRpc);

    expect(forwarder.pendingCount).toBe(2);

    forwarder.cancelAll(writeToRpc);

    expect(forwarder.pendingCount).toBe(0);
    // Both should be cancelled
    expect(rpcWrites.length).toBe(2);
    for (const w of rpcWrites) {
      const msg = JSON.parse(w);
      expect(msg.cancelled).toBe(true);
    }
  });
});

// ============================================================================
// 5. resendPending (reconnect recovery)
// ============================================================================

describe("M3: reconnect recovery via resendPending", () => {
  test("resendPending sends unresolved requests to new client", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");
    const rpcWrites: string[] = [];

    // Forward a request
    forwarder.forward(
      { ...makeSelectRequest("req-resend"), ttlMs: 60000 },
      clients,
      (s) => rpcWrites.push(s),
    );

    // New client connects
    const newWs = new MockWebSocket();
    forwarder.resendPending(newWs as any);

    // New client should receive the pending request
    expect(newWs.sent.length).toBe(1);
    const msg = newWs.lastMessage;
    expect(msg.event).toBe("extension_ui_request");
    expect(msg.payload.id).toBe("req-resend");
    // TTL should be reduced (remaining time)
    expect(msg.payload.ttlMs).toBeLessThanOrEqual(60000);
  });

  test("resendPending skips resolved requests", () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");

    forwarder.forward(makeSelectRequest("req-resolved"), clients, () => {});

    // Resolve it
    forwarder.handleResponse(makeResponse("req-resolved", "a"), clients, "client-1");

    // New client connects
    const newWs = new MockWebSocket();
    forwarder.resendPending(newWs as any);

    // Should not receive anything
    expect(newWs.sent.length).toBe(0);
  });

  test("resendPending skips requests with remaining TTL <= 10s", async () => {
    const forwarder = new ExtensionUIForwarder();
    const clients = makeClients("client-1");

    // Short TTL — will have < 10s remaining quickly
    forwarder.forward(
      { ...makeSelectRequest("req-expiring"), ttlMs: 150 },
      clients,
      () => {},
    );

    // Wait until remaining < 10s (150ms - 145ms = 5ms remaining)
    await new Promise(r => setTimeout(r, 145));

    const newWs = new MockWebSocket();
    forwarder.resendPending(newWs as any);

    // Should not resend (remaining TTL too low)
    expect(newWs.sent.length).toBe(0);
  });
});
