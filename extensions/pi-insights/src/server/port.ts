/**
 * UI port resolution.
 *
 * Priority: runtime override (`/insights port n`, also persisted) → config file
 * → `PI_INSIGHTS_UI_PORT` → default. 32211 belongs to the sibling extension
 * pi-provider-trace, so the default sits one above it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_INSIGHTS_UI_PORT = 32212;

const MIN_PORT = 1024;
const MAX_PORT = 65535;

let runtimePort: number | null = null;

function configPath(): string {
	return join(homedir(), ".pi", "agent", "usage-data", "insights-ui.json");
}

function isValidPort(n: unknown): n is number {
	return typeof n === "number" && Number.isInteger(n) && n >= MIN_PORT && n <= MAX_PORT;
}

/** Stale or hand-edited config must not break Pi startup, so bad values are skipped. */
function readFilePort(): number | null {
	const path = configPath();
	if (!existsSync(path)) return null;
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as { port?: unknown };
		return isValidPort(raw.port) ? raw.port : null;
	} catch {
		return null;
	}
}

function readEnvPort(): number | null {
	const raw = process.env.PI_INSIGHTS_UI_PORT?.trim();
	if (!raw) return null;
	const n = Number(raw);
	return isValidPort(n) ? n : null;
}

export function getInsightsUiPort(): number {
	if (runtimePort != null) return runtimePort;
	return readFilePort() ?? readEnvPort() ?? DEFAULT_INSIGHTS_UI_PORT;
}

/** Throws on an out-of-range port: this is a direct user instruction, not stale state. */
export function setInsightsUiPort(port: number, persist = true): number {
	if (!isValidPort(port)) {
		throw new RangeError(`port must be an integer in [${MIN_PORT}, ${MAX_PORT}], got ${port}`);
	}
	runtimePort = port;
	if (!persist) return port;
	const path = configPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ port }, null, 2)}\n`, "utf8");
	return port;
}

/** True when the listener on `port` answers `/api/status` like a pi-insights server. */
export async function probeInsightsUiOnPort(port: number): Promise<boolean> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 800);
	try {
		const res = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: ctrl.signal });
		if (!res.ok) return false;
		const body = (await res.json()) as Record<string, unknown>;
		return (
			body.ok === true &&
			typeof body.version === "string" &&
			typeof body.sessionsDir === "string" &&
			typeof body.cacheDir === "string" &&
			typeof body.cachedSessions === "number" &&
			Array.isArray(body.ranges)
		);
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}
