import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTranscript } from "../src/hub/transcript.ts";

const FIXTURE = join(import.meta.dir, "fixtures", "session-basic.jsonl");

function tmpSession(lines: unknown[]): string {
	const home = mkdtempSync(join(tmpdir(), "pi-mesh-transcript-"));
	const file = join(home, "session.jsonl");
	writeFileSync(file, lines.map(l => JSON.stringify(l)).join("\n") + "\n");
	return file;
}

function msg(id: string, role: string, content: unknown[], extra: Record<string, unknown> = {}) {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: `2026-09-30T05:36:${id.slice(1).padStart(2, "0")}.000Z`,
		message: { role, content, ...extra },
	};
}

describe("readTranscript", () => {
	test("flattens the real session fixture", () => {
		const entries = readTranscript(FIXTURE);
		expect(entries.length).toBe(3); // model_change line ignored

		expect(entries[0]!.id).toBe("a1");
		expect(entries[0]!.role).toBe("user");
		expect(entries[0]!.text).toBe("hi");
		expect(entries[0]!.timestamp).toBe("2026-09-30T05:36:00.000Z");

		// thinking and toolCall blocks contribute no text
		expect(entries[1]!.id).toBe("a2");
		expect(entries[1]!.role).toBe("assistant");
		expect(entries[1]!.text).toBe("hello");
		expect(entries[1]!.toolName).toBeUndefined();

		expect(entries[2]!.id).toBe("a3");
		expect(entries[2]!.role).toBe("toolResult");
		expect(entries[2]!.text).toBe("file.txt");
		expect(entries[2]!.toolName).toBe("bash");
		expect(entries[2]!.isError).toBe(false);
	});

	test("skips empty-text entries (thinking-only, empty tool results)", () => {
		const file = tmpSession([
			msg("x1", "assistant", [{ type: "thinking", thinking: "..." }]),
			msg("x2", "user", []),
			msg("x3", "assistant", [{ type: "text", text: "ok" }]),
		]);
		const entries = readTranscript(file);
		expect(entries.map(e => e.id)).toEqual(["x3"]);
	});

	test("toolResult text is truncated to 500 chars and carries error flag", () => {
		const long = "x".repeat(600);
		const file = tmpSession([
			msg("t1", "toolResult", [{ type: "text", text: long }], {
				toolName: "bash",
				isError: true,
			}),
		]);
		const [entry] = readTranscript(file);
		expect(entry!.text.length).toBe(500);
		expect(entry!.isError).toBe(true);
		expect(entry!.toolName).toBe("bash");
	});

	test("limit keeps the newest N in chronological order", () => {
		const file = tmpSession(
			Array.from({ length: 5 }, (_, i) => msg(`p${i + 1}`, "user", [{ type: "text", text: `m${i + 1}` }])),
		);
		const entries = readTranscript(file, { limit: 2 });
		expect(entries.map(e => e.id)).toEqual(["p4", "p5"]);
		expect(readTranscript(file, { limit: 0 })).toEqual([]);
	});

	test("beforeEntryId paginates backwards", () => {
		const file = tmpSession(
			Array.from({ length: 5 }, (_, i) => msg(`p${i + 1}`, "user", [{ type: "text", text: `m${i + 1}` }])),
		);
		const page = readTranscript(file, { beforeEntryId: "p3", limit: 2 });
		expect(page.map(e => e.id)).toEqual(["p1", "p2"]);
		// nothing older than the first entry
		expect(readTranscript(file, { beforeEntryId: "p1" })).toEqual([]);
		// unknown cursor falls back to the tail
		expect(readTranscript(file, { beforeEntryId: "nope", limit: 1 }).map(e => e.id)).toEqual(["p5"]);
	});

	test("non-message and garbage lines are ignored", () => {
		const home = mkdtempSync(join(tmpdir(), "pi-mesh-transcript-"));
		const file = join(home, "session.jsonl");
		writeFileSync(
			file,
			[
				JSON.stringify({ type: "session", id: "s", timestamp: "2026-09-30T05:35:36.633Z", cwd: "/tmp" }),
				"{broken json",
				JSON.stringify({ type: "custom", id: "c1" }),
				JSON.stringify(msg("y1", "user", [{ type: "text", text: "yo" }])),
				JSON.stringify(msg("y2", "system", [{ type: "text", text: "sys note" }])),
			].join("\n") + "\n",
		);
		const entries = readTranscript(file);
		expect(entries.map(e => e.id)).toEqual(["y1", "y2"]);
	});

	test("missing file throws a clear error", () => {
		expect(() => readTranscript("/nonexistent/session.jsonl")).toThrow(/cannot read transcript .*session\.jsonl/);
	});
});
