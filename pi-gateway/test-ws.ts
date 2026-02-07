/**
 * WebSocket E2E test for pi-gateway WebChat.
 */
const PORT = process.argv[2] ?? "18800";
const ws = new WebSocket(`ws://localhost:${PORT}`);

ws.onopen = () => {
  console.log("[test] WS connected");
  ws.send(JSON.stringify({ type: "req", id: "1", method: "connect", params: {} }));
  setTimeout(() => {
    console.log("[test] Sending chat.send...");
    ws.send(JSON.stringify({
      type: "req", id: "2", method: "chat.send",
      params: { text: "Say hello in exactly one sentence. Do not use any tools." },
    }));
  }, 500);
};

ws.onmessage = (e) => {
  const d = JSON.parse(String(e.data));

  if (d.type === "res") {
    console.log(`[test] res ${d.id}: ${d.ok ? "OK" : d.error}`);
  }

  if (d.type === "event" && d.event === "agent") {
    const p = d.payload;
    if (p?.type === "message_update" && p?.assistantMessageEvent?.type === "text_delta") {
      process.stdout.write(p.assistantMessageEvent.delta);
    }
    if (p?.type === "agent_end") {
      console.log("\n[test] agent_end received");
    }
  }

  if (d.type === "event" && d.event === "chat.reply") {
    console.log(`\n[test] REPLY: ${String(d.payload?.text ?? "").slice(0, 300)}`);
    setTimeout(() => process.exit(0), 500);
  }
};

ws.onerror = (e) => console.error("[test] WS error", e);

setTimeout(() => {
  console.log("\n[test] TIMEOUT after 60s");
  process.exit(1);
}, 60000);
