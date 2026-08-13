/**
 * Parser tests run against synthetic transcripts written to a temp file, so
 * they assert the shape of both formats without depending on the contents of
 * the user's real session directory.
 */

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseTranscript } from "../src/transcript.ts";

const dir = mkdtempSync(join(tmpdir(), "session-explorer-test-"));

function writeTranscript(name, entries) {
  const path = join(dir, name);
  writeFileSync(path, entries.map((entry) => JSON.stringify(entry)).join("\n"));
  return path;
}

test("pi: pairs a tool result onto the call that produced it", () => {
  const path = writeTranscript("pi-tools.jsonl", [
    { type: "session", id: "s1", timestamp: "2026-01-01T00:00:00Z", cwd: "/tmp/proj" },
    {
      type: "message",
      id: "m1",
      timestamp: "2026-01-01T00:00:01Z",
      message: { role: "user", content: [{ type: "text", text: "read the file" }] },
    },
    {
      type: "message",
      id: "m2",
      timestamp: "2026-01-01T00:00:02Z",
      message: {
        role: "assistant",
        model: "test-model",
        content: [
          { type: "thinking", thinking: "considering" },
          { type: "toolCall", id: "call_1", name: "read", arguments: { path: "/tmp/a.ts" } },
        ],
      },
    },
    {
      type: "message",
      id: "m3",
      timestamp: "2026-01-01T00:00:03Z",
      message: {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        isError: true,
        content: [{ type: "text", text: "ENOENT" }],
      },
    },
  ]);

  const parsed = parseTranscript(path);

  assert.equal(parsed.format, "pi");
  // The tool result is folded in, not left as a third item.
  assert.deepEqual(
    parsed.items.map((item) => item.kind),
    ["user", "assistant"],
  );

  const call = parsed.items[1].blocks.find((block) => block.type === "toolCall");
  assert.equal(call.result.text, "ENOENT");
  assert.equal(call.result.isError, true);
  assert.equal(parsed.stats.toolErrors, 1);
  assert.equal(parsed.stats.thinkingBlocks, 1);
  assert.deepEqual(parsed.stats.toolCounts, [{ name: "read", count: 1 }]);
});

test("pi: user turns build the outline, other entries do not", () => {
  const path = writeTranscript("pi-outline.jsonl", [
    { type: "session", id: "s2", timestamp: "2026-01-01T00:00:00Z", cwd: "/tmp/proj" },
    {
      type: "message",
      id: "u1",
      message: { role: "user", content: [{ type: "text", text: "first question\nsecond line" }] },
    },
    { type: "compaction", id: "c1", summary: "summary text" },
    {
      type: "message",
      id: "u2",
      message: { role: "user", content: [{ type: "text", text: "second question" }] },
    },
  ]);

  const parsed = parseTranscript(path);

  assert.equal(parsed.outline.length, 2);
  assert.equal(parsed.outline[0].title, "first question second line");
  assert.equal(parsed.stats.compactions, 1);
});

test("pi: oversized tool output is clipped and reports its true length", () => {
  const long = "x".repeat(10_000);
  const path = writeTranscript("pi-clip.jsonl", [
    { type: "session", id: "s3", timestamp: "2026-01-01T00:00:00Z", cwd: "/tmp/proj" },
    {
      type: "message",
      id: "a1",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_2", name: "bash", arguments: {} }],
      },
    },
    {
      type: "message",
      id: "r1",
      message: { role: "toolResult", toolCallId: "call_2", content: [{ type: "text", text: long }] },
    },
  ]);

  const call = parseTranscript(path).items[0].blocks[0];
  assert.equal(call.result.truncated, true);
  assert.equal(call.result.fullLength, 10_000);
  assert.ok(call.result.text.length < 10_000);
});

test("pi: malformed lines are counted, not fatal", () => {
  const path = join(dir, "pi-broken.jsonl");
  writeFileSync(
    path,
    [
      JSON.stringify({ type: "session", id: "s4", cwd: "/tmp" }),
      "{not json",
      JSON.stringify({
        type: "message",
        id: "u1",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      }),
    ].join("\n"),
  );

  const parsed = parseTranscript(path);
  assert.equal(parsed.malformedLines, 1);
  assert.equal(parsed.stats.userMessages, 1);
});

test("codex: detected by session_meta and mapped onto the same item model", () => {
  const path = writeTranscript("codex.jsonl", [
    {
      timestamp: "2026-01-01T00:00:00Z",
      type: "session_meta",
      payload: { id: "c1", cwd: "/tmp/proj" },
    },
    {
      timestamp: "2026-01-01T00:00:01Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "# AGENTS.md instructions for /tmp/proj\nrules" }],
      },
    },
    {
      timestamp: "2026-01-01T00:00:02Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "the real question" }],
      },
    },
    {
      timestamp: "2026-01-01T00:00:03Z",
      type: "response_item",
      payload: {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "thinking about it" }],
      },
    },
    {
      timestamp: "2026-01-01T00:00:04Z",
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: '{"cmd":"ls"}',
        call_id: "call_a",
      },
    },
    {
      timestamp: "2026-01-01T00:00:05Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_a",
        output: '{"output":"Process exited with code 1","metadata":{"exit_code":1}}',
      },
    },
    // Codex duplicates assistant text as an event; it must not appear twice.
    {
      timestamp: "2026-01-01T00:00:06Z",
      type: "event_msg",
      payload: { type: "agent_message", message: "done" },
    },
    {
      timestamp: "2026-01-01T00:00:07Z",
      type: "response_item",
      payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] },
    },
  ]);

  const parsed = parseTranscript(path);

  assert.equal(parsed.format, "codex");
  // The injected preamble becomes an event, so only the real prompt is a turn.
  assert.equal(parsed.stats.userMessages, 1);
  assert.equal(parsed.outline.length, 1);
  assert.equal(parsed.outline[0].title, "the real question");

  // Consecutive assistant activity is gathered into one turn.
  const assistant = parsed.items.filter((item) => item.kind === "assistant");
  assert.equal(assistant.length, 1);
  assert.deepEqual(
    assistant[0].blocks.map((block) => block.type),
    ["thinking", "toolCall", "text"],
  );

  const call = assistant[0].blocks[1];
  assert.deepEqual(call.arguments, { cmd: "ls" });
  assert.equal(call.result.text, "Process exited with code 1");
  assert.equal(call.result.isError, true, "non-zero exit code should read as a failure");

  // "done" appeared as both an event and a response item.
  const texts = assistant[0].blocks.filter((block) => block.type === "text");
  assert.equal(texts.length, 1);
});

test("codex: a zero exit code is not an error", () => {
  const path = writeTranscript("codex-ok.jsonl", [
    { timestamp: "2026-01-01T00:00:00Z", type: "session_meta", payload: { id: "c2", cwd: "/tmp" } },
    {
      timestamp: "2026-01-01T00:00:01Z",
      type: "response_item",
      payload: { type: "function_call", name: "exec_command", arguments: "{}", call_id: "ok" },
    },
    {
      timestamp: "2026-01-01T00:00:02Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "ok",
        output: '{"output":"Process exited with code 0","metadata":{"exit_code":0}}',
      },
    },
  ]);

  const parsed = parseTranscript(path);
  const call = parsed.items[0].blocks[0];
  assert.equal(call.result.isError, false);
  assert.equal(parsed.stats.toolErrors, 0);
});
