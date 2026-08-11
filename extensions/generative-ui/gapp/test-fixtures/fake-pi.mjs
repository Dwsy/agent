#!/usr/bin/env node
// Fake `pi --mode json` CLI for subagent pool tests: emits a minimal NDJSON
// event stream whose assistant text echoes argv, then hangs forever (like the
// real `pi -p`, which keeps handles alive) so tests exercise the
// kill-on-completion path. FAKE_PI_FAIL=1 prints boom to stderr and exits 2.
const delay = Number(process.env.FAKE_PI_DELAY_MS || 0);
const fail = process.env.FAKE_PI_FAIL === "1";

const emit = (event) => process.stdout.write(JSON.stringify(event) + "\n");

emit({ type: "session", version: 3, id: "fake", timestamp: new Date().toISOString(), cwd: process.cwd() });
emit({ type: "agent_start" });

setTimeout(() => {
  if (fail) {
    console.error("boom");
    process.exit(2);
  }
  const text = JSON.stringify({ args: process.argv.slice(2) });
  emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text }] } });
  emit({ type: "agent_settled" });
  setInterval(() => {}, 1000); // never exit on our own
}, delay);
