/**
 * `mesh web`: make sure the hub is up, then hand the user a browser tab on the
 * local WebUI. Fail-soft everywhere except config validation — a hub that
 * refuses to start or a machine without a platform opener must degrade into a
 * message, never into a thrown CLI error.
 */
import { spawn } from "node:child_process";
import { loadConfig } from "./config.ts";
import { ensureHubRunning } from "./ensure-hub.ts";

export interface WebUiOptions {
	home: string;
	/** Only ensure the hub is ready and return the URL — no browser (tests/CI/remote). */
	noOpen?: boolean;
}

export interface WebUiResult {
	ok: boolean;
	url: string;
	opened: boolean;
	message: string;
}

/** Test seam: defaults hit the real ensureHubRunning / HTTP probe / platform opener / setTimeout. */
export interface WebUiDeps {
	ensureHub?: (home: string) => Promise<void>;
	probe?: (url: string) => Promise<boolean>;
	open?: (url: string) => void;
	sleep?: (ms: number) => Promise<void>;
}

const PROBE_ATTEMPTS = 10;
const PROBE_INTERVAL_MS = 300;

/** Invalid config is the caller's problem: loadConfig's Error bubbles to the CLI. */
export function webUiUrl(home: string): string {
	return `http://127.0.0.1:${loadConfig(home).httpPort}`;
}

export function openerCommand(
	url: string,
	platform: NodeJS.Platform = process.platform,
): { cmd: string; args: string[] } {
	if (platform === "darwin") return { cmd: "open", args: [url] };
	// `start` treats the first quoted token as the window title — hence the empty one.
	if (platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", url] };
	return { cmd: "xdg-open", args: [url] };
}

export async function isWebUiUp(url: string, timeoutMs = 500): Promise<boolean> {
	try {
		const res = await fetch(`${url}/api/peers`, { signal: AbortSignal.timeout(timeoutMs) });
		return res.ok;
	} catch {
		return false;
	}
}

function openInBrowser(url: string): void {
	const { cmd, args } = openerCommand(url);
	const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
	// A missing opener (e.g. xdg-open on a headless box) fails asynchronously:
	// swallow it explicitly so it never becomes an unhandled 'error' event.
	child.on("error", () => {});
	child.unref();
}

function defaultSleep(ms: number): Promise<void> {
	// Deliberately NOT unref'd: the CLI may have no other handle left, and an
	// unref'd timer would let the process exit before the promise resolves.
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openWebUi(opts: WebUiOptions, deps: WebUiDeps = {}): Promise<WebUiResult> {
	const url = webUiUrl(opts.home);
	const ensureHub = deps.ensureHub ?? ensureHubRunning;
	const probe = deps.probe ?? isWebUiUp;
	const open = deps.open ?? openInBrowser;
	const sleep = deps.sleep ?? defaultSleep;

	try {
		await ensureHub(opts.home);
	} catch {
		// Bootstrap is best-effort; the probes below are the real verdict.
	}

	let up = false;
	for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt++) {
		up = await probe(url);
		if (up) break;
		await sleep(PROBE_INTERVAL_MS);
	}
	if (!up) {
		return { ok: false, url, opened: false, message: `hub 未就绪: ${url}（可手动打开）` };
	}

	if (opts.noOpen) {
		return { ok: true, url, opened: false, message: `pi-mesh WebUI: ${url}（未自动打开）` };
	}

	try {
		open(url);
	} catch (err) {
		return {
			ok: false,
			url,
			opened: false,
			message: `打开浏览器失败: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
	return { ok: true, url, opened: true, message: `已打开 pi-mesh WebUI: ${url}` };
}
