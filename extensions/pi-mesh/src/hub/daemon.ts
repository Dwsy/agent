/**
 * Hub daemon entrypoint: registry + socket server + HTTP/SSE server.
 * Usage: bun src/hub/daemon.ts [--home <path>]
 */
import { appendFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import type { MeshConfig } from "../config.ts";
import { loadConfig } from "../config.ts";
import { meshPaths } from "../protocol.ts";
import { createHttpServer } from "./http.ts";
import { Registry } from "./registry.ts";
import { createHubServer } from "./server.ts";
import { attachNotifier } from "../notify.ts";
import { attachTerminalWs } from "./terminal.ts";

const HOUR_MS = 60 * 60 * 1000;

function log(home: string, msg: string): void {
	const { dir, logFile } = meshPaths(home);
	try {
		mkdirSync(dir, { recursive: true });
		appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
	} catch {
		// logging must never take the hub down
	}
}

function parseHome(argv: string[]): string {
	const idx = argv.indexOf("--home");
	if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
	return os.homedir();
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
	const home = parseHome(argv);
	const config: MeshConfig = loadConfig(home);
	const registry = new Registry(config, home);
	registry.loadJSON();
	const hub = await createHubServer(registry, config, home);
	const httpServer = createHttpServer({ hub, registry, config });
	const offTerminals = attachTerminalWs(httpServer.server);
	log(home, `started socket=${hub.socketPath} http=127.0.0.1:${config.httpPort}`);

	const sweep = setInterval(() => registry.sweepOffline(), config.heartbeatIntervalMs);
	const purge = setInterval(() => registry.purgeExpired(), HOUR_MS);
	const offNotifier = attachNotifier(registry);

	let closing = false;
	const shutdown = (signal: string) => {
		if (closing) return;
		closing = true;
		log(home, `stopping (${signal})`);
		clearInterval(sweep);
		clearInterval(purge);
		offNotifier();
		offTerminals();
		registry.stop(); // flush persisted state before teardown
		void Promise.allSettled([hub.close(), httpServer.close()]).then(() => {
			log(home, "stopped");
			process.exit(0);
		});
	};
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (import.meta.main) {
	void main();
}
