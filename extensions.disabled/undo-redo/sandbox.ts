import { constants } from "node:fs";
import {
	access,
	copyFile,
	cp,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import ignore, { type Ignore, type Options } from "ignore";
import { fromPosix, toPosix } from "./paths.js";
import type { SandboxEntryStats, SandboxProgress } from "./types.js";

const DEFAULT_IGNORES = [
	".git/",
	"node_modules/",
	"dist/",
	"build/",
	".next/",
	".venv/",
	"target/",
	"out/",
	".cache/",
];
const META_FILENAME = ".undo-redo-meta.json";

interface SandboxMeta {
	realRoot: string;
}

function createIgnore(options?: Options): Ignore {
	const factory = ignore as unknown as (opts?: Options) => Ignore;
	return factory(options);
}

async function ensureDir(dirPath: string): Promise<void> {
	await mkdir(dirPath, { recursive: true });
}

function shouldIgnore(
	ignoreMatcher: Ignore,
	relativePath: string,
	isDir: boolean,
): boolean {
	if (!relativePath) return false;
	if (ignoreMatcher.ignores(relativePath)) return true;
	if (isDir && ignoreMatcher.ignores(`${relativePath}/`)) return true;
	return false;
}

async function loadIgnoreMatcher(realRoot: string): Promise<Ignore> {
	const matcher = createIgnore();
	matcher.add(DEFAULT_IGNORES);
	try {
		const gitignorePath = path.join(realRoot, ".gitignore");
		const contents = await readFile(gitignorePath, "utf-8");
		matcher.add(contents);
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code !== "ENOENT") {
			throw error;
		}
	}
	return matcher;
}

async function readSandboxMeta(
	sandboxRoot: string,
): Promise<SandboxMeta | null> {
	try {
		const raw = await readFile(path.join(sandboxRoot, META_FILENAME), "utf-8");
		const parsed = JSON.parse(raw) as SandboxMeta;
		if (!parsed?.realRoot) return null;
		return parsed;
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") return null;
		throw error;
	}
}

async function writeSandboxMeta(
	sandboxRoot: string,
	meta: SandboxMeta,
): Promise<void> {
	await writeFile(
		path.join(sandboxRoot, META_FILENAME),
		JSON.stringify(meta, null, 2),
		"utf-8",
	);
}

export async function prepareSandbox(
	realRoot: string,
	sandboxRoot: string,
	ignoreMatcher: Ignore,
	reuseExisting: boolean,
): Promise<{ reused: boolean }> {
	let reused = false;
	if (reuseExisting) {
		const meta = await readSandboxMeta(sandboxRoot);
		if (meta?.realRoot === realRoot) {
			try {
				await access(sandboxRoot, constants.R_OK | constants.W_OK);
				reused = true;
			} catch {
				// fall through
			}
		}
	}

	if (reused) {
		return { reused: true };
	}

	await rm(sandboxRoot, { recursive: true, force: true });
	await ensureDir(sandboxRoot);
	await cp(realRoot, sandboxRoot, {
		recursive: true,
		dereference: false,
		preserveTimestamps: true,
		filter: (src) => {
			const relative = toPosix(path.relative(realRoot, src));
			if (!relative) return true;
			return (
				!ignoreMatcher.ignores(relative) &&
				!ignoreMatcher.ignores(`${relative}/`)
			);
		},
	});
	await writeSandboxMeta(sandboxRoot, { realRoot });
	return { reused: false };
}

async function scanDirectoryStats(
	rootPath: string,
	ignoreMatcher: Ignore,
): Promise<Map<string, SandboxEntryStats>> {
	const stats = new Map<string, SandboxEntryStats>();

	const walk = async (dirPath: string): Promise<void> => {
		const entries = await readdir(dirPath, { withFileTypes: true });
		for (const entry of entries) {
			const absolutePath = path.join(dirPath, entry.name);
			const relative = toPosix(path.relative(rootPath, absolutePath));

			if (entry.isDirectory()) {
				if (shouldIgnore(ignoreMatcher, relative, true)) {
					continue;
				}
				await walk(absolutePath);
				continue;
			}

			if (shouldIgnore(ignoreMatcher, relative, false)) {
				continue;
			}

			const fileStats = await stat(absolutePath);
			if (!fileStats.isFile() && !fileStats.isSymbolicLink()) {
				continue;
			}

			stats.set(relative, { size: fileStats.size, mtimeMs: fileStats.mtimeMs });
		}
	};

	await walk(rootPath);
	return stats;
}

export async function scanSandboxStats(
	sandboxRoot: string,
	ignoreMatcher: Ignore,
): Promise<Map<string, SandboxEntryStats>> {
	return scanDirectoryStats(sandboxRoot, ignoreMatcher);
}

export async function updateSandboxStatsForFile(
	sandboxRoot: string,
	stats: Map<string, SandboxEntryStats>,
	relativePath: string,
	ignoreMatcher: Ignore,
): Promise<void> {
	if (shouldIgnore(ignoreMatcher, relativePath, false)) {
		stats.delete(relativePath);
		return;
	}
	const absolutePath = path.join(sandboxRoot, fromPosix(relativePath));
	try {
		const fileStats = await stat(absolutePath);
		if (!fileStats.isFile() && !fileStats.isSymbolicLink()) {
			stats.delete(relativePath);
			return;
		}
		stats.set(relativePath, {
			size: fileStats.size,
			mtimeMs: fileStats.mtimeMs,
		});
	} catch {
		stats.delete(relativePath);
	}
}

export function diffSandboxStats(
	before: Map<string, SandboxEntryStats>,
	after: Map<string, SandboxEntryStats>,
): { added: string[]; removed: string[]; changed: string[] } {
	const added: string[] = [];
	const removed: string[] = [];
	const changed: string[] = [];

	for (const [filePath, entry] of after) {
		const previous = before.get(filePath);
		if (!previous) {
			added.push(filePath);
			continue;
		}
		if (previous.size !== entry.size || previous.mtimeMs !== entry.mtimeMs) {
			changed.push(filePath);
		}
	}

	for (const filePath of before.keys()) {
		if (!after.has(filePath)) {
			removed.push(filePath);
		}
	}

	return { added, removed, changed };
}

async function syncFileToSandbox(
	relativePath: string,
	realRoot: string,
	sandboxRoot: string,
): Promise<void> {
	const sourcePath = path.join(realRoot, fromPosix(relativePath));
	const targetPath = path.join(sandboxRoot, fromPosix(relativePath));
	await ensureDir(path.dirname(targetPath));
	await copyFile(sourcePath, targetPath);
}

export async function syncFileFromSandbox(
	relativePath: string,
	sandboxRoot: string,
	realRoot: string,
): Promise<void> {
	const sourcePath = path.join(sandboxRoot, fromPosix(relativePath));
	const targetPath = path.join(realRoot, fromPosix(relativePath));
	await ensureDir(path.dirname(targetPath));
	await copyFile(sourcePath, targetPath);
}

export async function removeFileFromDisk(
	relativePath: string,
	realRoot: string,
): Promise<void> {
	const targetPath = path.join(realRoot, fromPosix(relativePath));
	await rm(targetPath, { force: true });
}

export async function removeFileFromSandbox(
	relativePath: string,
	sandboxRoot: string,
): Promise<void> {
	const targetPath = path.join(sandboxRoot, fromPosix(relativePath));
	await rm(targetPath, { force: true });
}

export async function ensureSandboxFile(
	relativePath: string,
	realRoot: string,
	sandboxRoot: string,
): Promise<void> {
	const sandboxPath = path.join(sandboxRoot, fromPosix(relativePath));
	try {
		await access(sandboxPath, constants.R_OK);
		return;
	} catch {
		// Continue to populate from disk if available.
	}

	const realPath = path.join(realRoot, fromPosix(relativePath));
	try {
		const fileStats = await stat(realPath);
		if (!fileStats.isFile() && !fileStats.isSymbolicLink()) return;
		await ensureDir(path.dirname(sandboxPath));
		await copyFile(realPath, sandboxPath);
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code !== "ENOENT") {
			throw error;
		}
	}
}

export class SandboxState {
	private stats: Map<string, SandboxEntryStats> = new Map();
	private ignoreMatcher: Ignore | null = null;

	constructor(
		public readonly realRoot: string,
		public readonly sandboxRoot: string,
		private readonly onProgress?: (progress: SandboxProgress) => void,
	) {}

	private report(progress: SandboxProgress): void {
		this.onProgress?.(progress);
	}

	async initialize(): Promise<void> {
		this.ignoreMatcher = await loadIgnoreMatcher(this.realRoot);
		this.report({ stage: "prepare", message: "Preparing sandbox..." });
		const { reused } = await prepareSandbox(
			this.realRoot,
			this.sandboxRoot,
			this.ignoreMatcher,
			true,
		);

		if (!reused) {
			this.report({
				stage: "scan",
				message: "Scanning sandbox...",
				current: 2,
				total: 2,
			});
			this.stats = await scanSandboxStats(this.sandboxRoot, this.ignoreMatcher);
			this.report({
				stage: "done",
				message: "Sandbox ready.",
				current: 2,
				total: 2,
			});
			return;
		}

		this.report({
			stage: "scan",
			message: "Scanning sandbox...",
			current: 2,
			total: 3,
		});
		const sandboxStats = await scanSandboxStats(
			this.sandboxRoot,
			this.ignoreMatcher,
		);
		const realStats = await scanDirectoryStats(
			this.realRoot,
			this.ignoreMatcher,
		);
		this.report({
			stage: "sync",
			message: "Synchronizing sandbox...",
			current: 3,
			total: 3,
		});
		const diff = diffSandboxStats(sandboxStats, realStats);

		for (const relativePath of diff.added) {
			await syncFileToSandbox(relativePath, this.realRoot, this.sandboxRoot);
			await updateSandboxStatsForFile(
				this.sandboxRoot,
				sandboxStats,
				relativePath,
				this.ignoreMatcher,
			);
		}

		for (const relativePath of diff.changed) {
			await syncFileToSandbox(relativePath, this.realRoot, this.sandboxRoot);
			await updateSandboxStatsForFile(
				this.sandboxRoot,
				sandboxStats,
				relativePath,
				this.ignoreMatcher,
			);
		}

		for (const relativePath of diff.removed) {
			await removeFileFromSandbox(relativePath, this.sandboxRoot);
			sandboxStats.delete(relativePath);
		}

		this.stats = sandboxStats;
		this.report({
			stage: "done",
			message: "Sandbox ready.",
			current: 3,
			total: 3,
		});
	}

	getStats(): Map<string, SandboxEntryStats> {
		return this.stats;
	}

	setStats(stats: Map<string, SandboxEntryStats>): void {
		this.stats = stats;
	}

	async rescan(): Promise<Map<string, SandboxEntryStats>> {
		return scanSandboxStats(this.sandboxRoot, this.getIgnoreMatcher());
	}

	async updateFile(relativePath: string): Promise<void> {
		await updateSandboxStatsForFile(
			this.sandboxRoot,
			this.stats,
			relativePath,
			this.getIgnoreMatcher(),
		);
	}

	isIgnored(relativePath: string): boolean {
		return shouldIgnore(this.getIgnoreMatcher(), relativePath, false);
	}

	private getIgnoreMatcher(): Ignore {
		if (!this.ignoreMatcher) {
			throw new Error("SandboxState not initialized");
		}
		return this.ignoreMatcher;
	}
}
