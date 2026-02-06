import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Cache } from "./cache.js";
import { hashBuffer } from "./cache.js";
import { fromPosix, toRelativePath } from "./paths.js";
import type { FileState, Manifest, TrackedStats } from "./types.js";

interface SnapshotData {
	exists: boolean;
	buffer?: Buffer;
	hash?: string;
	size?: number;
	binary?: boolean;
}

function isBinaryBuffer(buffer: Buffer): boolean {
	if (buffer.includes(0)) return true;
	const decoded = buffer.toString("utf-8");
	const encoded = Buffer.from(decoded, "utf-8");
	return !encoded.equals(buffer);
}

async function readSnapshot(absPath: string): Promise<SnapshotData> {
	try {
		const buffer = await readFile(absPath);
		const binary = isBinaryBuffer(buffer);
		const hash = hashBuffer(buffer);
		return { exists: true, buffer, hash, size: buffer.length, binary };
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === "ENOENT") {
			return { exists: false };
		}
		throw error;
	}
}

async function writeSnapshotToCache(
	cache: Cache,
	snapshot: SnapshotData,
): Promise<FileState> {
	if (!snapshot.exists) {
		return { exists: false };
	}
	if (!snapshot.buffer || !snapshot.hash) {
		return { exists: false };
	}
	await cache.writeBlob(snapshot.hash, snapshot.buffer);
	return {
		exists: true,
		hash: snapshot.hash,
		size: snapshot.size,
		binary: snapshot.binary,
	};
}

export class SnapshotTracker {
	private baseManifest: Manifest = new Map();
	private trackedManifest: Manifest = new Map();
	private leafCache = new Map<string, Manifest>();

	constructor(
		private readonly cache: Cache,
		private readonly realRoot: string,
		private readonly sandboxRoot: string,
		private readonly onStats?: (stats: TrackedStats) => void,
	) {}

	async loadBase(): Promise<void> {
		const base = await this.cache.readBase();
		if (base) {
			this.baseManifest = base;
		}
	}

	getBaseManifest(): Manifest {
		return new Map(this.baseManifest);
	}

	getTrackedManifest(): Manifest {
		return new Map(this.trackedManifest);
	}

	setTrackedManifest(manifest: Manifest): void {
		this.trackedManifest = new Map(manifest);
		this.emitStats();
	}

	async ensureBaseFromSandbox(relativePath: string): Promise<void> {
		await this.ensureBase(relativePath, this.sandboxRoot);
	}

	async ensureBaseFromDisk(relativePath: string): Promise<void> {
		await this.ensureBase(relativePath, this.realRoot);
	}

	private async ensureBase(
		relativePath: string,
		sourceRoot: string,
	): Promise<void> {
		if (this.baseManifest.has(relativePath)) return;
		const absPath = path.join(sourceRoot, fromPosix(relativePath));
		const snapshot = await readSnapshot(absPath);
		const entry = await writeSnapshotToCache(this.cache, snapshot);
		this.baseManifest.set(relativePath, entry);
		await this.cache.writeBase(this.baseManifest);
	}

	async updateFromSandbox(relativePath: string): Promise<FileState> {
		const absPath = path.join(this.sandboxRoot, fromPosix(relativePath));
		const snapshot = await readSnapshot(absPath);
		const entry = await writeSnapshotToCache(this.cache, snapshot);
		this.trackedManifest.set(relativePath, entry);
		this.emitStats();
		return entry;
	}

	markDeleted(relativePath: string): void {
		this.trackedManifest.set(relativePath, { exists: false });
		this.emitStats();
	}

	async saveLeaf(leafId: string | null): Promise<void> {
		if (!leafId) return;
		const snapshot = new Map(this.trackedManifest);
		this.leafCache.set(leafId, snapshot);
		await this.cache.writeLeaf(leafId, snapshot);
	}

	async loadLeaf(leafId: string): Promise<Manifest | undefined> {
		const cached = this.leafCache.get(leafId);
		if (cached) return new Map(cached);
		const manifest = await this.cache.readLeaf(leafId);
		if (manifest) {
			this.leafCache.set(leafId, manifest);
			return new Map(manifest);
		}
		return undefined;
	}

	async restoreLeaf(
		leafId: string | null,
		applyRoots: string[],
	): Promise<void> {
		const manifest = new Map(this.baseManifest);
		if (leafId) {
			const leafManifest = await this.loadLeaf(leafId);
			if (!leafManifest) return;
			for (const [relativePath, entry] of leafManifest) {
				manifest.set(relativePath, entry);
			}
		}
		for (const root of applyRoots) {
			await applyManifest(this.cache, manifest, root);
		}
		this.setTrackedManifest(manifest);
	}

	getTrackedStats(): TrackedStats {
		let fileCount = 0;
		let totalBytes = 0;
		for (const entry of this.trackedManifest.values()) {
			if (!entry.exists) continue;
			fileCount += 1;
			totalBytes += entry.size ?? 0;
		}
		return { fileCount, totalBytes };
	}

	resolveRelativePath(filePath: string): string | null {
		return toRelativePath(filePath, this.realRoot);
	}

	private emitStats(): void {
		this.onStats?.(this.getTrackedStats());
	}
}

async function applyManifest(
	cache: Cache,
	manifest: Manifest,
	targetRoot: string,
): Promise<void> {
	for (const [relativePath, entry] of manifest) {
		const absPath = path.join(targetRoot, fromPosix(relativePath));
		if (!entry.exists) {
			await rm(absPath, { force: true });
			continue;
		}
		if (!entry.hash) continue;
		const buffer = await cache.readBlob(entry.hash);
		await mkdir(path.dirname(absPath), { recursive: true });
		await writeFile(absPath, buffer);
	}
}
