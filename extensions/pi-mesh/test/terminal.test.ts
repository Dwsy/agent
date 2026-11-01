import { expect, test } from "bun:test";
import http from "node:http";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import {
	attachTerminalWs,
	parseTerminalQuery,
	sanitizeClientLine,
	type TerminalAttachOptions,
} from "../src/hub/terminal.ts";
import type { ChildProcess } from "node:child_process";

function queryUrl(q: string): URL {
	return new URL(`http://127.0.0.1/api/terminal?${q}`);
}

test("parseTerminalQuery validates target, mode and geometry", () => {
	expect(parseTerminalQuery(queryUrl("target=w1:p2&mode=control&cols=100&rows=30"))).toEqual({
		target: "w1:p2",
		mode: "control",
		cols: 100,
		rows: 30,
	});
	expect(parseTerminalQuery(queryUrl("target=w1:p2"))).toEqual({
		target: "w1:p2",
		mode: "control",
		cols: 80,
		rows: 24,
	});
	expect("error" in parseTerminalQuery(queryUrl("target=../../etc"))).toBe(true);
	expect("error" in parseTerminalQuery(queryUrl("target=w1:p2&mode=write"))).toBe(true);
	expect("error" in parseTerminalQuery(queryUrl("target=w1:p2&cols=5"))).toBe(true);
	expect("error" in parseTerminalQuery(queryUrl("target=w1:p2&rows=999"))).toBe(true);
});

test("sanitizeClientLine allows only herdr terminal commands", () => {
	const input = JSON.stringify({ type: "terminal.input", bytes: "aGVsbG8=" });
	expect(sanitizeClientLine(input)).toBe(input);
	expect(sanitizeClientLine(JSON.stringify({ type: "terminal.resize", cols: 90, rows: 25 }))).toBeTruthy();
	expect(sanitizeClientLine(JSON.stringify({ type: "terminal.input" }))).toBeNull(); // missing bytes
	expect(sanitizeClientLine(JSON.stringify({ type: "terminal.resize", cols: 1 }))).toBeNull();
	expect(sanitizeClientLine(JSON.stringify({ type: "rm -rf" }))).toBeNull();
	expect(sanitizeClientLine("not json")).toBeNull();
});

test("sanitizeClientLine keeps mouse payload base64 verbatim (bytes >= 128 stay byte-exact)", () => {
	// X10 press at x=100,y=100: ESC [ M 0x20 0x84 0x84 — two raw bytes >= 128
	const mouse = JSON.stringify({ type: "terminal.input", bytes: "G1tNIISE" });
	expect(sanitizeClientLine(mouse)).toBe(mouse);
	expect(Buffer.from(JSON.parse(mouse).bytes, "base64")).toEqual(Buffer.from([0x1b, 0x5b, 0x4d, 0x20, 0x84, 0x84]));
	// the base64 field is opaque: any decodable payload passes, no text coercion
	const binary = JSON.stringify({ type: "terminal.input", bytes: "G1tNm/8=" });
	expect(sanitizeClientLine(binary)).toBe(binary);
});

/** Fake herdr child: stdin captures lines, stdout emits frames. */
function fakeChild(): { child: ChildProcess; stdin: PassThrough; stdout: PassThrough; argv: string[]; killed: () => boolean } {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const ee = new EventEmitter() as EventEmitter & Record<string, unknown>;
	let killed = false;
	const child = Object.assign(ee, {
		stdin,
		stdout,
		kill: () => {
			killed = true;
		},
	}) as unknown as ChildProcess;
	return { child, stdin, stdout, argv: [], killed: () => killed };
}

async function withBridge(
	run: (ctx: { ws: WebSocket; fakes: ReturnType<typeof fakeChild>; server: http.Server }) => Promise<void>,
	mode = "control",
): Promise<void> {
	const server = http.createServer();
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const fakes = fakeChild();
	const captured: string[][] = [];
	const opts: TerminalAttachOptions = {
		spawnChild: (argv) => {
			captured.push(argv);
			return fakes.child;
		},
	};
	const off = attachTerminalWs(server, opts);
	const port = (server.address() as { port: number }).port;
	const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal?target=w1:p2&mode=${mode}&cols=80&rows=24`);
	await new Promise<void>((resolve, reject) => {
		ws.once("open", () => resolve());
		ws.once("error", reject);
	});
	try {
		await run({ ws, fakes, server });
	} finally {
		ws.close();
		off();
		server.close();
	}
	expect(captured[0]).toEqual([
		"terminal",
		"session",
		mode,
		"w1:p2",
		"--cols",
		"80",
		"--rows",
		"24",
	]);
}

test("bridge: herdr frames flow to the browser and valid input reaches herdr", async () => {
	await withBridge(async ({ ws, fakes }) => {
		const received: string[] = [];
		ws.on("message", (d) => received.push(d.toString()));

		// herdr output frame -> browser (verbatim JSONL)
		fakes.stdout.write(`${JSON.stringify({ bytes: "aGVsbG8=" })}\n`);
		await Bun.sleep(50);
		expect(received).toContain(JSON.stringify({ bytes: "aGVsbG8=" }));

		// browser input -> herdr stdin; junk is dropped
		ws.send("garbage");
		ws.send(JSON.stringify({ type: "terminal.input", bytes: "dGVzdA==" }));
		await Bun.sleep(50);
		const lines: string[] = [];
		fakes.stdin.on("data", (c: Buffer) => lines.push(...c.toString().split("\n").filter(Boolean)));
		await Bun.sleep(50);
		expect(lines).toEqual([JSON.stringify({ type: "terminal.input", bytes: "dGVzdA==" })]);

		// herdr exit -> browser gets terminal.closed
		fakes.child.emit("exit", 0);
		await Bun.sleep(50);
		expect(received.some((r) => r.includes("terminal.closed"))).toBe(true);
	});
});

test("bridge: observe mode never forwards input to herdr", async () => {
	await withBridge(async ({ ws, fakes }) => {
		ws.send(JSON.stringify({ type: "terminal.input", bytes: "dGVzdA==" }));
		await Bun.sleep(50);
		let wrote = false;
		fakes.stdin.on("data", () => (wrote = true));
		await Bun.sleep(50);
		expect(wrote).toBe(false);
	}, "observe");
});

test("bridge: mouse payload bytes reach herdr stdin byte-for-byte", async () => {
	await withBridge(async ({ ws, fakes }) => {
		const lines: string[] = [];
		fakes.stdin.on("data", (c: Buffer) => lines.push(...c.toString().split("\n").filter(Boolean)));
		// SGR wheel report + X10 press with raw bytes >= 128 in one batch
		const sgr = JSON.stringify({ type: "terminal.input", bytes: "G1s8NjQ7MTI7MzRN" });
		const x10 = JSON.stringify({ type: "terminal.input", bytes: "G1tNIISE" });
		ws.send(sgr);
		ws.send(x10);
		await Bun.sleep(50);
		expect(lines).toEqual([sgr, x10]);
	});
});

test("bridge: a new attach for the same mode+target reaps the stale child (orphan guard)", async () => {
	const server = http.createServer();
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const fakes: ReturnType<typeof fakeChild>[] = [];
	const opts: TerminalAttachOptions = {
		spawnChild: () => {
			const f = fakeChild();
			fakes.push(f);
			return f.child;
		},
	};
	const off = attachTerminalWs(server, opts);
	const port = (server.address() as { port: number }).port;
	const url = `ws://127.0.0.1:${port}/api/terminal?target=w1:p2&mode=control&cols=80&rows=24`;

	const ws1 = new WebSocket(url);
	await new Promise<void>((r) => ws1.once("open", () => r()));
	expect(fakes.length).toBe(1);

	// Simulate the orphan: ws1 never closes cleanly (hard-killed browser).
	const ws2 = new WebSocket(url);
	await new Promise<void>((r) => ws2.once("open", () => r()));
	expect(fakes.length).toBe(2);
	expect(fakes[0]!.killed()).toBe(true); // stale child reaped

	ws2.close();
	off();
	server.close();
});
