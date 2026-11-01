/**
 * `mesh web` contract test: URL derivation, platform opener argv, every
 * openWebUi outcome, and a CLI smoke run that touches neither a real browser
 * (--no-open) nor a real daemon (a fake listener on the hub socket path).
 */
import { test, expect, afterEach } from "bun:test";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { meshPaths } from "../src/protocol.ts";
import { isWebUiUp, openWebUi, openerCommand, webUiUrl } from "../src/webui.ts";

const EXT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const homes: string[] = [];

function makeHome(config: Record<string, unknown> = {}): string {
	const home = mkdtempSync(join(tmpdir(), "pi-mesh-web-"));
	mkdirSync(join(home, ".pi", "pi-mesh"), { recursive: true });
	writeFileSync(meshPaths(home).configFile, JSON.stringify(config));
	homes.push(home);
	return home;
}

afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

async function listenHttp(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
	const server = http.createServer(handler);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return { server, port: (server.address() as net.AddressInfo).port };
}

function closeServer(server: http.Server | net.Server): Promise<void> {
	return new Promise((resolve) => server.close(() => resolve()));
}

test("webUiUrl: derived from httpPort in config.json", () => {
	const home = makeHome({ httpPort: 5341 });
	expect(webUiUrl(home)).toBe("http://127.0.0.1:5341");
});

test("webUiUrl: invalid config bubbles (the CLI turns it into a CliError)", () => {
	const home = makeHome({ httpPort: 80 });
	expect(() => webUiUrl(home)).toThrow(/httpPort/);
});

test("openerCommand: exact argv per platform", () => {
	const url = "http://127.0.0.1:5341";
	expect(openerCommand(url, "darwin")).toEqual({ cmd: "open", args: [url] });
	expect(openerCommand(url, "win32")).toEqual({ cmd: "cmd", args: ["/c", "start", "", url] });
	expect(openerCommand(url, "linux")).toEqual({ cmd: "xdg-open", args: [url] });
	expect(openerCommand(url, "freebsd")).toEqual({ cmd: "xdg-open", args: [url] });
});

test("isWebUiUp: 200 → true, non-ok → false, nothing listening → false", async () => {
	let status = 200;
	const paths: string[] = [];
	const { server, port } = await listenHttp((req, res) => {
		paths.push(req.url ?? "");
		res.writeHead(status, { "content-type": "application/json" });
		res.end("{}");
	});
	const url = `http://127.0.0.1:${port}`;
	try {
		expect(await isWebUiUp(url)).toBe(true);
		status = 503;
		expect(await isWebUiUp(url)).toBe(false);
	} finally {
		await closeServer(server);
	}
	expect(paths).toEqual(["/api/peers", "/api/peers"]);
	// Connection refused must read as "down", not throw.
	expect(await isWebUiUp(url)).toBe(false);
});

test("openWebUi: ready hub → opens the browser with the WebUI URL", async () => {
	const home = makeHome({ httpPort: 5341 });
	const opened: string[] = [];
	const res = await openWebUi(
		{ home },
		{
			ensureHub: async () => {},
			probe: async () => true,
			open: (url) => opened.push(url),
			sleep: async () => {},
		},
	);
	expect(res).toEqual({
		ok: true,
		url: "http://127.0.0.1:5341",
		opened: true,
		message: "已打开 pi-mesh WebUI: http://127.0.0.1:5341",
	});
	expect(opened).toEqual(["http://127.0.0.1:5341"]);
});

test("openWebUi: noOpen → reports the URL, never calls the opener", async () => {
	const home = makeHome({ httpPort: 5341 });
	const opened: string[] = [];
	const res = await openWebUi(
		{ home, noOpen: true },
		{
			ensureHub: async () => {},
			probe: async () => true,
			open: (url) => opened.push(url),
			sleep: async () => {},
		},
	);
	expect(res).toEqual({
		ok: true,
		url: "http://127.0.0.1:5341",
		opened: false,
		message: "pi-mesh WebUI: http://127.0.0.1:5341（未自动打开）",
	});
	expect(opened).toEqual([]);
});

test("openWebUi: never reachable → ok:false, no opener, URL still reported", async () => {
	const home = makeHome({ httpPort: 5341 });
	const opened: string[] = [];
	let probes = 0;
	let sleeps = 0;
	const res = await openWebUi(
		{ home },
		{
			ensureHub: async () => {},
			probe: async () => {
				probes++;
				return false;
			},
			open: (url) => opened.push(url),
			sleep: async () => {
				sleeps++;
			},
		},
	);
	expect(probes).toBe(10);
	expect(sleeps).toBe(10);
	expect(res.ok).toBe(false);
	expect(res.url).toBe("http://127.0.0.1:5341");
	expect(res.opened).toBe(false);
	expect(res.message).toContain("http://127.0.0.1:5341");
	expect(opened).toEqual([]);
});

test("openWebUi: opener throwing → ok:false, swallowed into the message", async () => {
	const home = makeHome({ httpPort: 5341 });
	const res = await openWebUi(
		{ home },
		{
			ensureHub: async () => {},
			probe: async () => true,
			open: () => {
				throw new Error("no opener on PATH");
			},
			sleep: async () => {},
		},
	);
	expect(res.ok).toBe(false);
	expect(res.url).toBe("http://127.0.0.1:5341");
	expect(res.opened).toBe(false);
	expect(res.message).toContain("no opener on PATH");
});

test("openWebUi: failed bootstrap is best-effort — the probe verdict still wins", async () => {
	const home = makeHome({ httpPort: 5341 });
	const opened: string[] = [];
	const res = await openWebUi(
		{ home },
		{
			ensureHub: async () => {
				throw new Error("spawn bun ENOENT");
			},
			probe: async () => true,
			open: (url) => opened.push(url),
			sleep: async () => {},
		},
	);
	expect(res.ok).toBe(true);
	expect(res.opened).toBe(true);
	expect(opened).toEqual(["http://127.0.0.1:5341"]);
});

test(
	"CLI: `mesh web --no-open` prints the URL without a real hub or browser",
	async () => {
		// The fake HTTP API answers the probe; the fake socket listener satisfies
		// ensureHubRunning so no real daemon is ever spawned.
		const { server: apiServer, port } = await listenHttp((req, res) => {
			if (req.url === "/api/peers") {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ peers: [] }));
				return;
			}
			res.writeHead(404);
			res.end();
		});
		const home = makeHome({ httpPort: port });
		// Accept and HOLD the connection: Bun's client reports ECONNREFUSED when the
		// server sends FIN immediately after accept, which would defeat the probe.
		const hubSockets: net.Socket[] = [];
		const socketServer = net.createServer((socket) => {
			hubSockets.push(socket);
			socket.on("error", () => {});
		});
		await new Promise<void>((resolve) => socketServer.listen(meshPaths(home).socketPath, resolve));

		try {
			const cli = spawn("bun", ["src/cli.ts", "web", "--no-open"], {
				cwd: EXT_DIR,
				env: { ...process.env, HOME: home },
			});
			let stdout = "";
			let stderr = "";
			cli.stdout.on("data", (chunk) => (stdout += chunk));
			cli.stderr.on("data", (chunk) => (stderr += chunk));
			const code = await new Promise<number | null>((resolve) => cli.on("close", resolve));
			if (code !== 0) throw new Error(`cli exited ${code}: ${stderr}`);
			const out = JSON.parse(stdout);
			expect(out).toEqual({
				ok: true,
				url: `http://127.0.0.1:${port}`,
				opened: false,
				message: `pi-mesh WebUI: http://127.0.0.1:${port}（未自动打开）`,
			});
		} finally {
			for (const socket of hubSockets) socket.destroy();
			await closeServer(socketServer);
			await closeServer(apiServer);
		}
	},
	20_000,
);

test(
	"CLI: `mesh web` fails as a config error, never as \"hub not running\"",
	async () => {
		const home = makeHome({ httpPort: 80 });
		const cli = spawn("bun", ["src/cli.ts", "web", "--no-open"], {
			cwd: EXT_DIR,
			env: { ...process.env, HOME: home },
		});
		let stdout = "";
		let stderr = "";
		cli.stdout.on("data", (chunk) => (stdout += chunk));
		cli.stderr.on("data", (chunk) => (stderr += chunk));
		const code = await new Promise<number | null>((resolve) => cli.on("close", resolve));
		expect(code).toBe(1);
		expect(stdout).toBe("");
		expect(stderr).toContain("httpPort");
		expect(stderr).not.toContain("hub not running");
	},
	20_000,
);
