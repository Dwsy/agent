import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { tmpdir, homedir } from "node:os";
import { join, dirname, basename } from "node:path";
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Question, QuestionsFile } from "./schema.js";
import { createVoiceAgent, fetchVoices, type VoiceInfo } from "./elevenlabs.js";
import { loadSettings, updateVoiceSettings } from "./settings.js";

function getGitBranch(cwd: string): string | null {
	try {
		const branch = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd,
			encoding: "utf8",
			timeout: 2000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		return branch || null;
	} catch {
		return null;
	}
}

function normalizePath(path: string): string {
	const home = homedir();
	if (path.startsWith(home)) {
		return "~" + path.slice(home.length);
	}
	return path;
}

interface SessionEntry {
	id: string;
	url: string;
	cwd: string;
	gitBranch: string | null;
	title: string;
	startedAt: number;
	lastSeen: number;
}

interface SessionsFile {
	sessions: SessionEntry[];
}

const SESSIONS_FILE = join(homedir(), ".pi", "interview-sessions.json");
const RECOVERY_DIR = join(homedir(), ".pi", "interview-recovery");
const STALE_THRESHOLD_MS = 30000;
const STALE_PRUNE_MS = 60000;
const RECOVERY_MAX_AGE_DAYS = 7;
const ABANDONED_GRACE_MS = 60000;
const WATCHDOG_INTERVAL_MS = 5000;

function ensurePiDir(): void {
	const piDir = join(homedir(), ".pi");
	if (!existsSync(piDir)) {
		mkdirSync(piDir, { recursive: true });
	}
}

function readSessions(): SessionsFile {
	try {
		if (!existsSync(SESSIONS_FILE)) {
			return { sessions: [] };
		}
		const data = readFileSync(SESSIONS_FILE, "utf8");
		const parsed = JSON.parse(data);
		if (!parsed.sessions || !Array.isArray(parsed.sessions)) {
			return { sessions: [] };
		}
		return parsed as SessionsFile;
	} catch {
		return { sessions: [] };
	}
}

function listSessions(): SessionEntry[] {
	const data = readSessions();
	const pruned = pruneStale(data.sessions);
	if (pruned.length !== data.sessions.length) {
		writeSessions({ sessions: pruned });
	}
	return pruned;
}

function writeSessions(data: SessionsFile): void {
	ensurePiDir();
	const tempFile = SESSIONS_FILE + ".tmp";
	writeFileSync(tempFile, JSON.stringify(data, null, 2));
	renameSync(tempFile, SESSIONS_FILE);
}

function pruneStale(sessions: SessionEntry[]): SessionEntry[] {
	const now = Date.now();
	return sessions.filter((s) => now - s.lastSeen < STALE_PRUNE_MS);
}

function touchSession(entry: SessionEntry): void {
	const data = readSessions();
	data.sessions = pruneStale(data.sessions);
	const existing = data.sessions.find((s) => s.id === entry.id);
	if (existing) {
		existing.lastSeen = Date.now();
		existing.url = entry.url;
		existing.cwd = entry.cwd;
		existing.gitBranch = entry.gitBranch;
		existing.title = entry.title;
		existing.startedAt = entry.startedAt;
	} else {
		data.sessions.push({ ...entry, lastSeen: Date.now() });
	}
	writeSessions(data);
}

function registerSession(entry: SessionEntry): void {
	touchSession(entry);
}

function unregisterSession(sessionId: string): void {
	const data = readSessions();
	data.sessions = data.sessions.filter((s) => s.id !== sessionId);
	writeSessions(data);
}

export function getActiveSessions(): SessionEntry[] {
	const pruned = listSessions();
	const now = Date.now();
	return pruned.filter((s) => now - s.lastSeen < STALE_THRESHOLD_MS);
}

function ensureRecoveryDir(): void {
	if (!existsSync(RECOVERY_DIR)) {
		mkdirSync(RECOVERY_DIR, { recursive: true });
	}
}

function cleanupOldRecoveryFiles(): void {
	if (!existsSync(RECOVERY_DIR)) return;
	const now = Date.now();
	const maxAge = RECOVERY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
	try {
		const files = readdirSync(RECOVERY_DIR);
		for (const file of files) {
			const filePath = join(RECOVERY_DIR, file);
			const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})_/);
			if (dateMatch) {
				const fileDate = new Date(dateMatch[1]).getTime();
				if (now - fileDate > maxAge) {
					unlinkSync(filePath);
				}
			}
		}
	} catch {}
}

function sanitizeForFilename(str: string): string {
	return str.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 50);
}

function saveToRecovery(
	questions: QuestionsFile,
	cwd: string,
	gitBranch: string | null,
	sessionId: string
): string {
	ensureRecoveryDir();
	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
	const project = sanitizeForFilename(basename(cwd) || "unknown");
	const branch = sanitizeForFilename(gitBranch || "nogit");
	const shortId = sessionId.slice(0, 8);
	const filename = `${date}_${time}_${project}_${branch}_${shortId}.json`;
	const filePath = join(RECOVERY_DIR, filename);
	writeFileSync(filePath, JSON.stringify(questions, null, 2));
	return filePath;
}

export interface ResponseItem {
	id: string;
	value: string | string[];
	attachments?: string[];
}

export interface InterviewServerOptions {
	questions: QuestionsFile;
	sessionToken: string;
	sessionId: string;
	cwd: string;
	timeout: number;
	port?: number;
	verbose?: boolean;
	theme?: InterviewThemeConfig;
	voiceApiKey?: string;
	voiceAutoStart?: boolean;
}

export interface InterviewServerCallbacks {
	onSubmit: (responses: ResponseItem[], transcript?: TranscriptEntry[]) => void;
	onCancel: (reason?: "timeout" | "user" | "stale") => void;
}

export interface TranscriptEntry {
	role: "ai" | "user";
	text: string;
	timestamp: number;
}

export interface InterviewServerHandle {
	server: http.Server;
	url: string;
	close: () => void;
}

export type ThemeMode = "auto" | "light" | "dark";

export interface InterviewThemeConfig {
	mode?: ThemeMode;
	name?: string;
	lightPath?: string;
	darkPath?: string;
	toggleHotkey?: string;
}

const MAX_BODY_SIZE = 15 * 1024 * 1024;
const MAX_IMAGES = 12;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const FORM_DIR = join(dirname(fileURLToPath(import.meta.url)), "form");
const TEMPLATE = readFileSync(join(FORM_DIR, "index.html"), "utf-8");
const STYLES = readFileSync(join(FORM_DIR, "styles.css"), "utf-8");
const SCRIPT = readFileSync(join(FORM_DIR, "script.js"), "utf-8");
const VOICE_SCRIPT = existsSync(join(FORM_DIR, "voice.js"))
	? readFileSync(join(FORM_DIR, "voice.js"), "utf-8")
	: null;
const SETTINGS_SCRIPT = existsSync(join(FORM_DIR, "settings.js"))
	? readFileSync(join(FORM_DIR, "settings.js"), "utf-8")
	: "";

let voicesCache: { voices: VoiceInfo[]; timestamp: number } | null = null;
const VOICE_CACHE_TTL_MS = 5 * 60 * 1000;
const THEMES_DIR = join(FORM_DIR, "themes");
const BUILTIN_THEMES = new Map<string, { light: string; dark: string }>([
	[
		"default",
		{
			light: readFileSync(join(THEMES_DIR, "default-light.css"), "utf-8"),
			dark: readFileSync(join(THEMES_DIR, "default-dark.css"), "utf-8"),
		},
	],
	[
		"tufte",
		{
			light: readFileSync(join(THEMES_DIR, "tufte-light.css"), "utf-8"),
			dark: readFileSync(join(THEMES_DIR, "tufte-dark.css"), "utf-8"),
		},
	],
]);

class BodyTooLargeError extends Error {
	statusCode = 413;
}

function log(verbose: boolean | undefined, message: string) {
	if (verbose) {
		process.stderr.write(`[interview] ${message}\n`);
	}
}

function safeInlineJSON(data: unknown): string {
	return JSON.stringify(data)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026");
}

function normalizeThemeMode(mode?: string): ThemeMode | undefined {
	if (mode === "auto" || mode === "light" || mode === "dark") return mode;
	return undefined;
}

function sendText(res: ServerResponse, status: number, text: string) {
	res.writeHead(status, {
		"Content-Type": "text/plain; charset=utf-8",
		"Cache-Control": "no-store",
	});
	res.end(text);
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Cache-Control": "no-store",
	});
	res.end(JSON.stringify(payload));
}

async function parseJSONBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let body = "";
		let size = 0;

		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY_SIZE) {
				req.destroy();
				reject(new BodyTooLargeError("Request body too large"));
				return;
			}
			body += chunk.toString();
		});

		req.on("end", () => {
			try {
				resolve(JSON.parse(body));
			} catch {
				reject(new Error("Invalid JSON"));
			}
		});

		req.on("error", reject);
	});
}

async function handleImageUpload(
	image: { id: string; filename: string; mimeType: string; data: string },
	sessionId: string
): Promise<string> {
	if (!ALLOWED_TYPES.includes(image.mimeType)) {
		throw new Error(`Invalid image type: ${image.mimeType}`);
	}

	const buffer = Buffer.from(image.data, "base64");
	if (buffer.length > MAX_IMAGE_SIZE) {
		throw new Error("Image exceeds 5MB limit");
	}

	const sanitized = image.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
	const basename = sanitized.split(/[/\\]/).pop() || `image_${randomUUID()}`;
	const extMap: Record<string, string> = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/gif": ".gif",
		"image/webp": ".webp",
	};
	const ext = extMap[image.mimeType] ?? "";
	const filename = basename.includes(".") ? basename : `${basename}${ext}`;

	const tempDir = join(tmpdir(), `pi-interview-${sessionId}`);
	await mkdir(tempDir, { recursive: true });

	const filepath = join(tempDir, filename);
	await writeFile(filepath, buffer);

	return filepath;
}

function validateTokenQuery(url: URL, expectedToken: string, res: ServerResponse): boolean {
	const token = url.searchParams.get("session");
	if (token !== expectedToken) {
		sendText(res, 403, "Invalid session");
		return false;
	}
	return true;
}

function validateTokenBody(body: unknown, expectedToken: string, res: ServerResponse): boolean {
	if (!body || typeof body !== "object") {
		sendJson(res, 400, { ok: false, error: "Invalid request body" });
		return false;
	}
	const token = (body as { token?: string }).token;
	if (token !== expectedToken) {
		sendJson(res, 403, { ok: false, error: "Invalid session" });
		return false;
	}
	return true;
}

function ensureQuestionId(
	id: string,
	questionById: Map<string, Question>
): { ok: true; question: Question } | { ok: false; error: string } {
	const question = questionById.get(id);
	if (!question) {
		return { ok: false, error: `Unknown question id: ${id}` };
	}
	return { ok: true, question };
}

export async function startInterviewServer(
	options: InterviewServerOptions,
	callbacks: InterviewServerCallbacks
): Promise<InterviewServerHandle> {
	const { questions, sessionToken, sessionId, cwd, timeout, port, verbose, voiceApiKey, voiceAutoStart } = options;
	const questionById = new Map<string, Question>();
	for (const question of questions.questions) {
		questionById.set(question.id, question);
	}

	const themeConfig = options.theme ?? {};
	const resolvedThemeName =
		themeConfig.name && BUILTIN_THEMES.has(themeConfig.name) ? themeConfig.name : "default";
	if (themeConfig.name && !BUILTIN_THEMES.has(themeConfig.name)) {
		log(verbose, `Unknown theme "${themeConfig.name}", using "default"`);
	}
	const builtinTheme = BUILTIN_THEMES.get(resolvedThemeName) ?? BUILTIN_THEMES.get("default");
	if (!builtinTheme) {
		throw new Error("Missing default theme assets");
	}

	const readThemeFile = (filePath: string, fallback: string, label: string) => {
		try {
			return readFileSync(filePath, "utf-8");
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			log(verbose, `Failed to load ${label} theme from "${filePath}": ${message}`);
			return fallback;
		}
	};

	const themeLightCss = themeConfig.lightPath
		? readThemeFile(themeConfig.lightPath, builtinTheme.light, "light")
		: builtinTheme.light;
	const themeDarkCss = themeConfig.darkPath
		? readThemeFile(themeConfig.darkPath, builtinTheme.dark, "dark")
		: builtinTheme.dark;
	const themeMode = normalizeThemeMode(themeConfig.mode) ?? "dark";

	const normalizedCwd = normalizePath(cwd);
	const gitBranch = getGitBranch(cwd);
	let sessionEntry: SessionEntry | null = null;
	let browserConnected = false;
	let lastHeartbeatAt = Date.now();
	let watchdog: NodeJS.Timeout | null = null;
	let completed = false;

	const stopWatchdog = () => {
		if (watchdog) {
			clearInterval(watchdog);
			watchdog = null;
		}
	};

	const markCompleted = () => {
		if (completed) return false;
		completed = true;
		stopWatchdog();
		return true;
	};

	const touchHeartbeat = () => {
		lastHeartbeatAt = Date.now();
		if (!browserConnected) {
			browserConnected = true;
		}
		if (sessionEntry) {
			touchSession(sessionEntry);
		}
	};

	const server = http.createServer(async (req, res) => {
		try {
			const method = req.method || "GET";
			const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
			log(verbose, `${method} ${url.pathname}`);

			if (method === "GET" && url.pathname === "/") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				touchHeartbeat();
				const settings = loadSettings();
				const inlineData = safeInlineJSON({
					questions: questions.questions,
					title: questions.title,
					description: questions.description,
					sessionToken,
					sessionId,
					cwd: normalizedCwd,
					gitBranch,
					startedAt: Date.now(),
					timeout,
					theme: {
						mode: themeMode,
						toggleHotkey: themeConfig.toggleHotkey,
					},
					voice: {
						autoStart: voiceAutoStart ?? false,
						apiKeyConfigured: !!voiceApiKey,
						volume: settings.voice?.volume ?? 0.7,
						greeting: questions.voice?.greeting,
						closing: questions.voice?.closing,
					},
				});
				const html = TEMPLATE
					.replace("/* __INTERVIEW_DATA_PLACEHOLDER__ */", inlineData)
					.replace(/__SESSION_TOKEN__/g, sessionToken);
				res.writeHead(200, {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "no-store",
				});
				res.end(html);
				return;
			}

			if (method === "GET" && url.pathname === "/health") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				sendJson(res, 200, { ok: true });
				return;
			}

			if (method === "GET" && url.pathname === "/voice/status") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				sendJson(res, 200, {
					ok: true,
					available: !!voiceApiKey,
					reason: voiceApiKey ? undefined : "Voice API key not configured.",
				});
				return;
			}

			if (method === "GET" && url.pathname === "/sessions") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				const sessions = listSessions().map((session) => ({
					...session,
					status: Date.now() - session.lastSeen < STALE_THRESHOLD_MS ? "active" : "waiting",
				}));
				sendJson(res, 200, { ok: true, sessions });
				return;
			}

			if (method === "GET" && url.pathname === "/styles.css") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				res.writeHead(200, {
					"Content-Type": "text/css; charset=utf-8",
					"Cache-Control": "no-store",
				});
				res.end(STYLES);
				return;
			}

			if (method === "GET" && url.pathname === "/theme-light.css") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				res.writeHead(200, {
					"Content-Type": "text/css; charset=utf-8",
					"Cache-Control": "no-store",
				});
				res.end(themeLightCss);
				return;
			}

			if (method === "GET" && url.pathname === "/theme-dark.css") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				res.writeHead(200, {
					"Content-Type": "text/css; charset=utf-8",
					"Cache-Control": "no-store",
				});
				res.end(themeDarkCss);
				return;
			}

			if (method === "GET" && url.pathname === "/script.js") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				res.writeHead(200, {
					"Content-Type": "application/javascript; charset=utf-8",
					"Cache-Control": "no-store",
				});
				res.end(SCRIPT);
				return;
			}

			if (method === "GET" && url.pathname === "/voice.js") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				if (!VOICE_SCRIPT) {
					sendText(res, 404, "Voice module not available");
					return;
				}
				res.writeHead(200, {
					"Content-Type": "application/javascript; charset=utf-8",
					"Cache-Control": "no-store",
				});
				res.end(VOICE_SCRIPT);
				return;
			}

			if (method === "GET" && url.pathname === "/settings.js") {
				if (!validateTokenQuery(url, sessionToken, res)) return;
				res.writeHead(200, {
					"Content-Type": "application/javascript; charset=utf-8",
					"Cache-Control": "no-store",
				});
				res.end(SETTINGS_SCRIPT);
				return;
			}

			if (method === "GET" && url.pathname === "/settings/voices") {
				if (!validateTokenQuery(url, sessionToken, res)) return;

				if (!voiceApiKey) {
					sendJson(res, 400, { ok: false, error: "Voice API key not configured" });
					return;
				}

				try {
					const now = Date.now();
					if (voicesCache && now - voicesCache.timestamp < VOICE_CACHE_TTL_MS) {
						sendJson(res, 200, { ok: true, voices: voicesCache.voices });
						return;
					}

					const voices = await fetchVoices(voiceApiKey);
					voicesCache = { voices, timestamp: now };
					sendJson(res, 200, { ok: true, voices });
				} catch (err) {
					const message = err instanceof Error ? err.message : "Failed to fetch voices";
					sendJson(res, 500, { ok: false, error: message });
				}
				return;
			}

			if (method === "GET" && url.pathname === "/settings") {
				if (!validateTokenQuery(url, sessionToken, res)) return;

				const currentSettings = loadSettings();
				sendJson(res, 200, {
					ok: true,
					settings: {
						voiceId: currentSettings.voice?.voiceId || "",
						volume: currentSettings.voice?.volume ?? 0.7,
					},
				});
				return;
			}

			if (method === "POST" && url.pathname === "/settings") {
				const body = await parseJSONBody(req).catch(() => null);
				if (!body) {
					sendJson(res, 400, { ok: false, error: "Invalid body" });
					return;
				}
				if (!validateTokenBody(body, sessionToken, res)) return;

				const payload = body as { voiceId?: string; volume?: number };

				try {
					updateVoiceSettings({
						voiceId: payload.voiceId,
						volume: payload.volume,
					});
					sendJson(res, 200, { ok: true });
				} catch (err) {
					const message = err instanceof Error ? err.message : "Failed to save settings";
					sendJson(res, 500, { ok: false, error: message });
				}
				return;
			}

			if (method === "POST" && url.pathname === "/heartbeat") {
				const body = await parseJSONBody(req).catch(() => null);
				if (!body) {
					sendJson(res, 400, { ok: false, error: "Invalid body" });
					return;
				}
				if (!validateTokenBody(body, sessionToken, res)) return;
				touchHeartbeat();
				sendJson(res, 200, { ok: true });
				return;
			}

			if (method === "POST" && url.pathname === "/voice/init") {
				const body = await parseJSONBody(req).catch((err) => {
					if (err instanceof BodyTooLargeError) {
						sendJson(res, err.statusCode, { ok: false, error: err.message });
						return null;
					}
					sendJson(res, 400, { ok: false, error: err.message });
					return null;
				});
				if (!body) return;
				if (!validateTokenBody(body, sessionToken, res)) return;

				const payload = body as { apiKey?: string };
				const apiKey = (payload.apiKey && typeof payload.apiKey === "string" ? payload.apiKey : null) || voiceApiKey;
				if (!apiKey) {
					sendJson(res, 400, { ok: false, error: "Voice API key not configured." });
					return;
				}

				try {
					const currentSettings = loadSettings();
					const { agentId, signedUrl } = await createVoiceAgent({
						apiKey,
						questions,
						sessionId,
						voiceId: currentSettings.voice?.voiceId,
					});
					sendJson(res, 200, { ok: true, agentId, signedUrl });
				} catch (err) {
					const message = err instanceof Error ? err.message : "Voice initialization failed";
					sendJson(res, 500, { ok: false, error: message });
				}
				return;
			}

			if (method === "POST" && url.pathname === "/cancel") {
				const body = await parseJSONBody(req).catch((err) => {
					if (err instanceof BodyTooLargeError) {
						sendJson(res, err.statusCode, { ok: false, error: err.message });
						return null;
					}
					sendJson(res, 400, { ok: false, error: err.message });
					return null;
				});
				if (!body) return;
				if (!validateTokenBody(body, sessionToken, res)) return;
				if (completed) {
					sendJson(res, 200, { ok: true });
					return;
				}
				const reason = (body as { reason?: string }).reason;
				if (reason === "timeout" || reason === "stale") {
					const recoveryPath = saveToRecovery(questions, cwd, gitBranch, sessionId);
					const label = reason === "timeout" ? "timed out" : "stale";
					log(verbose, `Interview ${label}. Saved to: ${recoveryPath}`);
				}
				markCompleted();
				unregisterSession(sessionId);
				sendJson(res, 200, { ok: true });
				setImmediate(() => callbacks.onCancel(reason));
				return;
			}

			if (method === "POST" && url.pathname === "/submit") {
				const body = await parseJSONBody(req).catch((err) => {
					if (err instanceof BodyTooLargeError) {
						sendJson(res, err.statusCode, { ok: false, error: err.message });
						return null;
					}
					sendJson(res, 400, { ok: false, error: err.message });
					return null;
				});
				if (!body) return;
				if (!validateTokenBody(body, sessionToken, res)) return;
				if (completed) {
					sendJson(res, 409, { ok: false, error: "Session closed" });
					return;
				}

				const payload = body as {
					responses?: Array<{ id: string; value: string | string[]; attachments?: string[] }>;
					images?: Array<{ id: string; filename: string; mimeType: string; data: string; isAttachment?: boolean }>;
					transcript?: TranscriptEntry[];
				};

				const responsesInput = Array.isArray(payload.responses) ? payload.responses : [];
				const imagesInput = Array.isArray(payload.images) ? payload.images : [];
				const transcript = Array.isArray(payload.transcript) ? payload.transcript : undefined;

				if (imagesInput.length > MAX_IMAGES) {
					sendJson(res, 400, { ok: false, error: `Too many images (max ${MAX_IMAGES})` });
					return;
				}

				if (payload.transcript !== undefined && !Array.isArray(payload.transcript)) {
					sendJson(res, 400, { ok: false, error: "Invalid transcript format" });
					return;
				}
				if (transcript) {
					for (const entry of transcript) {
						if (
							!entry ||
							(entry.role !== "ai" && entry.role !== "user") ||
							typeof entry.text !== "string" ||
							typeof entry.timestamp !== "number"
						) {
							sendJson(res, 400, { ok: false, error: "Invalid transcript entry" });
							return;
						}
					}
				}

				const responses: ResponseItem[] = [];
				for (const item of responsesInput) {
					if (!item || typeof item.id !== "string") continue;
					const questionCheck = ensureQuestionId(item.id, questionById);
					if (questionCheck.ok === false) {
						sendJson(res, 400, { ok: false, error: questionCheck.error, field: item.id });
						return;
					}
					const question = questionCheck.question;
					
					const resp: ResponseItem = { id: item.id, value: "" };
					
					if (question.type === "image") {
						if (Array.isArray(item.value) && item.value.every((v) => typeof v === "string")) {
							resp.value = item.value;
						}
					} else if (question.type === "multi") {
						if (!Array.isArray(item.value) || item.value.some((v) => typeof v !== "string")) {
							sendJson(res, 400, {
								ok: false,
								error: `Invalid response value for ${item.id}`,
								field: item.id,
							});
							return;
						}
						resp.value = item.value;
					} else {
						if (typeof item.value !== "string") {
							sendJson(res, 400, {
								ok: false,
								error: `Invalid response value for ${item.id}`,
								field: item.id,
							});
							return;
						}
						resp.value = item.value;
					}
					
					if (Array.isArray(item.attachments) && item.attachments.every((a) => typeof a === "string")) {
						resp.attachments = item.attachments;
					}

					responses.push(resp);
				}

				for (const image of imagesInput) {
					if (!image || typeof image.id !== "string") continue;
					const questionCheck = ensureQuestionId(image.id, questionById);
					if (questionCheck.ok === false) {
						sendJson(res, 400, { ok: false, error: questionCheck.error, field: image.id });
						return;
					}

					if (
						typeof image.filename !== "string" ||
						typeof image.mimeType !== "string" ||
						typeof image.data !== "string"
					) {
						sendJson(res, 400, { ok: false, error: "Invalid image payload", field: image.id });
						return;
					}

					try {
						const filepath = await handleImageUpload(image, sessionId);
						
						const existing = responses.find((r) => r.id === image.id);
						if (image.isAttachment) {
							if (existing) {
								existing.attachments = existing.attachments || [];
								existing.attachments.push(filepath);
							} else {
								responses.push({ id: image.id, value: "", attachments: [filepath] });
							}
						} else {
							if (existing) {
								if (Array.isArray(existing.value)) {
									existing.value.push(filepath);
								} else if (existing.value === "") {
									existing.value = filepath;
								} else {
									existing.value = [existing.value, filepath];
								}
							} else {
								responses.push({ id: image.id, value: filepath });
							}
						}
					} catch (err) {
						const message = err instanceof Error ? err.message : "Image upload failed";
						sendJson(res, 400, { ok: false, error: message, field: image.id });
						return;
					}
				}

				markCompleted();
				unregisterSession(sessionId);
				sendJson(res, 200, { ok: true });
				setImmediate(() => callbacks.onSubmit(responses, transcript));
				return;
			}

			sendText(res, 404, "Not found");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Server error";
			sendJson(res, 500, { ok: false, error: message });
		}
	});

	return new Promise((resolve, reject) => {
		const onError = (err: Error) => {
			reject(new Error(`Failed to start server: ${err.message}`));
		};

		server.once("error", onError);
		server.listen(port ?? 0, "127.0.0.1", () => {
			server.off("error", onError);
			const addr = server.address();
			if (!addr || typeof addr === "string") {
				reject(new Error("Failed to start server: invalid address"));
				return;
			}
			const url = `http://localhost:${addr.port}/?session=${sessionToken}`;
			cleanupOldRecoveryFiles();
			const now = Date.now();
			sessionEntry = {
				id: sessionId,
				url,
				cwd: normalizedCwd,
				gitBranch,
				title: questions.title || "Interview",
				startedAt: now,
				lastSeen: now,
			};
			registerSession(sessionEntry);
			if (!watchdog) {
				watchdog = setInterval(() => {
					if (completed || !browserConnected) return;
					if (Date.now() - lastHeartbeatAt <= ABANDONED_GRACE_MS) return;
					if (!markCompleted()) return;
					const recoveryPath = saveToRecovery(questions, cwd, gitBranch, sessionId);
					log(verbose, `Interview stale. Saved to: ${recoveryPath}`);
					unregisterSession(sessionId);
					setImmediate(() => callbacks.onCancel("stale"));
				}, WATCHDOG_INTERVAL_MS);
			}
			resolve({
				server,
				url,
				close: () => {
					try {
						markCompleted();
						unregisterSession(sessionId);
						server.close();
					} catch {}
				},
			});
		});
	});
}
