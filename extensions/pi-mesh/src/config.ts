/**
 * Config loading with fail-fast validation. File: ~/.pi/pi-mesh/config.json.
 * All fields optional; defaults below.
 */
import { readFileSync } from "node:fs";
import { meshPaths } from "./protocol.ts";

export interface MeshConfig {
	/** How often a live pi heartbeats. */
	heartbeatIntervalMs: number;
	/** Silence beyond this marks a live peer `offline`. Must be >= 3x interval. */
	offlineTimeoutMs: number;
	/** Days to retain offline/closed peers and their file activity. */
	retentionDays: number;
	/** WebUI/API port, bound to 127.0.0.1. */
	httpPort: number;
}

export const DEFAULT_CONFIG: MeshConfig = {
	heartbeatIntervalMs: 15_000,
	offlineTimeoutMs: 45_000,
	retentionDays: 7,
	httpPort: 5210,
};

/** Read config, merge defaults, reject invalid values. Never throws on missing file. */
export function loadConfig(home: string): MeshConfig {
	const path = meshPaths(home).configFile;
	let raw: Partial<MeshConfig> = {};
	try {
		raw = JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code !== "ENOENT") throw new Error(`pi-mesh: invalid config at ${path}: ${String(err)}`);
	}
	const merged: MeshConfig = { ...DEFAULT_CONFIG, ...raw };
	if (!Number.isFinite(merged.heartbeatIntervalMs) || merged.heartbeatIntervalMs < 1000) {
		throw new Error(`pi-mesh: heartbeatIntervalMs must be >= 1000, got ${merged.heartbeatIntervalMs}`);
	}
	if (merged.offlineTimeoutMs < 3 * merged.heartbeatIntervalMs) {
		throw new Error(
			`pi-mesh: offlineTimeoutMs (${merged.offlineTimeoutMs}) must be >= 3x heartbeatIntervalMs (${merged.heartbeatIntervalMs})`,
		);
	}
	if (!Number.isFinite(merged.retentionDays) || merged.retentionDays <= 0) {
		throw new Error(`pi-mesh: retentionDays must be > 0, got ${merged.retentionDays}`);
	}
	if (!Number.isFinite(merged.httpPort) || merged.httpPort < 1024 || merged.httpPort > 65535) {
		throw new Error(`pi-mesh: httpPort must be 1024-65535, got ${merged.httpPort}`);
	}
	return merged;
}
