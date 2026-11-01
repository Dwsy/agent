/**
 * Hub daemon autostart. Best-effort by design: if the hub cannot be brought up
 * the session continues (the MeshClient retries anyway), so this never throws.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { meshPaths } from "./protocol.ts";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const DAEMON_ENTRY = join(SRC_DIR, "hub", "daemon.ts");

function sleep(ms: number): Promise<void> {
	// Ref'd on purpose: a bare CLI (`mesh web`) has no other handle while it
	// waits for the daemon, and an unref'd timer lets the process exit silently
	// mid-wait (no output, exit 0).
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Probe the socket once. Resolves with the error (null = hub answered). */
function probe(socketPath: string): Promise<NodeJS.ErrnoException | null> {
	return new Promise((resolve) => {
		const socket = net.createConnection(socketPath);
		const done = (err: NodeJS.ErrnoException | null) => {
			socket.destroy();
			resolve(err);
		};
		socket.once("connect", () => done(null));
		socket.once("error", (err) => done(err as NodeJS.ErrnoException));
		socket.once("close", () => done(new Error("closed before connect")));
	});
}

/** Make sure a hub daemon is reachable on meshPaths(home).socketPath. */
export async function ensureHubRunning(home: string): Promise<void> {
	try {
		const { socketPath } = meshPaths(home);
		const first = await probe(socketPath);
		if (!first) return;

		// A socket file nothing listens on blocks the daemon's bind: clear it.
		if (first.code === "ECONNREFUSED" && existsSync(socketPath)) {
			try {
				unlinkSync(socketPath);
			} catch {}
		}

		const child = spawn("bun", [DAEMON_ENTRY, "--home", home], {
			detached: true, // survive pi exit
			stdio: "ignore",
			cwd: SRC_DIR,
		});
		// spawn errors (e.g. bun missing) are async: swallow them explicitly.
		child.on("error", () => {});
		child.unref();

		for (let i = 0; i < 10; i++) {
			await sleep(300);
			if (!(await probe(socketPath))) return;
		}
	} catch (err) {
		// Degrade silently into client-side retries; never surface to the session.
		console.error("[pi-mesh] ensureHubRunning:", err instanceof Error ? err.message : err);
	}
}
