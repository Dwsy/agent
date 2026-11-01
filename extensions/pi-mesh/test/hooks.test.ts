import { expect, test } from "bun:test";
import { detectSessionMode, type SessionModeSource } from "../src/hooks.ts";

// ── primary signal: pi's SessionManager.isPersisted() (runtime self-report) ──

test("isPersisted()=false self-reports memory mode regardless of argv", () => {
	// pi --no-session -> SessionManager.inMemory() -> isPersisted() === false.
	// Even without the flag in argv (SDK hosts, tests), the runtime knows.
	const sm: SessionModeSource = { isPersisted: () => false, getSessionFile: () => undefined };
	expect(detectSessionMode(sm, ["node", "pi"])).toEqual({
		persistence: "memory",
		ephemeral: true,
		source: "session-manager",
	});
});

test("isPersisted()=true self-reports file mode and beats argv sniffing", () => {
	// The runtime flag is authoritative: a stale/embedded --no-session in argv
	// must not override what the session manager actually is.
	const sm: SessionModeSource = { isPersisted: () => true, getSessionFile: () => "/tmp/s.jsonl" };
	expect(detectSessionMode(sm, ["node", "pi", "--no-session"])).toEqual({
		persistence: "file",
		ephemeral: false,
		source: "session-manager",
	});
});

test("isPersisted()=false wins over a present sessionFile path", () => {
	const sm: SessionModeSource = { isPersisted: () => false, getSessionFile: () => "/tmp/phantom.jsonl" };
	expect(detectSessionMode(sm, ["node", "pi"]).persistence).toBe("memory");
});

// ── secondary signal: typed getSessionFile(): string | undefined contract ──

test("getSessionFile()=undefined means in-memory (contract fallback)", () => {
	// ReadonlySessionManager types omit isPersisted; a type-only surface still
	// resolves via the getSessionFile() contract.
	const sm: SessionModeSource = { getSessionFile: () => undefined };
	expect(detectSessionMode(sm, ["node", "pi"])).toEqual({
		persistence: "memory",
		ephemeral: true,
		source: "session-file",
	});
});

test("getSessionFile()=path means file-backed even before first message", () => {
	// File-backed sessions get their path at newSession() time (JSONL is written
	// lazily after the first user/assistant message) — path present == file mode.
	const sm: SessionModeSource = { getSessionFile: () => "/tmp/s.jsonl" };
	expect(detectSessionMode(sm, ["node", "pi", "--no-session"])).toEqual({
		persistence: "file",
		ephemeral: false,
		source: "session-file",
	});
});

test("a throwing sessionManager falls through to the next signal", () => {
	const throwing: SessionModeSource = {
		isPersisted: () => {
			throw new Error("boom");
		},
		getSessionFile: () => undefined,
	};
	expect(detectSessionMode(throwing, ["node", "pi"]).source).toBe("session-file");

	const bothThrow: SessionModeSource = {
		isPersisted: () => {
			throw new Error("boom");
		},
		getSessionFile: () => {
			throw new Error("boom");
		},
	};
	expect(detectSessionMode(bothThrow, ["node", "pi", "--no-session"]).source).toBe("argv");
});

// ── fallback only: argv sniffing when the runtime surface is unavailable ──

test("argv fallback detects --no-session and missing session managers", () => {
	expect(detectSessionMode(undefined, ["node", "pi", "--no-session"])).toEqual({
		persistence: "memory",
		ephemeral: true,
		source: "argv",
	});
	expect(detectSessionMode(null, ["node", "pi"])).toEqual({
		persistence: "file",
		ephemeral: false,
		source: "argv",
	});
	// `-n` is --name, NOT --no-session
	expect(detectSessionMode(undefined, ["node", "pi", "-n", "my task"]).ephemeral).toBe(false);
});
