import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { FileState, Manifest, ManifestRecord } from "./types.js";

const CACHE_VERSION = 1;

export interface Cache {
	root: string;
	blobsDir: string;
	leavesDir: string;
	basePath: string;
	ensure(): Promise<void>;
	writeBlob(hash: string, buffer: Buffer): Promise<void>;
	readBlob(hash: string): Promise<Buffer>;
	readBase(): Promise<Manifest | undefined>;
	writeBase(manifest: Manifest): Promise<void>;
	readLeaf(leafId: string): Promise<Manifest | undefined>;
	writeLeaf(leafId: string, manifest: Manifest): Promise<void>;
	listLeafIds(): Promise<string[]>;
}

export function getCacheRoot(sessionId: string): string {
	return path.join(homedir(), ".pi", "agent", "cache", "undo-redo", sessionId);
}

function serializeManifest(manifest: Manifest): ManifestRecord {
	const record: ManifestRecord = {};
	for (const [filePath, entry] of manifest) {
		record[filePath] = { ...entry };
	}
	return record;
}

function deserializeManifest(record: ManifestRecord | undefined): Manifest {
	const manifest = new Map<string, FileState>();
	if (!record) return manifest;
	for (const [filePath, entry] of Object.entries(record)) {
		manifest.set(filePath, { ...entry });
	}
	return manifest;
}

async function readManifestFile(
	filePath: string,
): Promise<Manifest | undefined> {
	if (!existsSync(filePath)) return undefined;
	const raw = await readFile(filePath, "utf-8");
	const parsed = JSON.parse(raw) as {
		version?: number;
		files?: ManifestRecord;
	};
	if (!parsed.files) return undefined;
	return deserializeManifest(parsed.files);
}

async function writeManifestFile(
	filePath: string,
	manifest: Manifest,
): Promise<void> {
	const payload = {
		version: CACHE_VERSION,
		files: serializeManifest(manifest),
	};
	await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

export function createCache(sessionId: string): Cache {
	const root = getCacheRoot(sessionId);
	const blobsDir = path.join(root, "blobs");
	const leavesDir = path.join(root, "leaves");
	const basePath = path.join(root, "base.json");

	return {
		root,
		blobsDir,
		leavesDir,
		basePath,
		ensure: async () => {
			await mkdir(blobsDir, { recursive: true });
			await mkdir(leavesDir, { recursive: true });
		},
		writeBlob: async (hash: string, buffer: Buffer) => {
			const blobPath = path.join(blobsDir, hash);
			try {
				await access(blobPath);
				return;
			} catch {
				// Continue to write.
			}
			await writeFile(blobPath, buffer);
		},
		readBlob: async (hash: string) => {
			const blobPath = path.join(blobsDir, hash);
			return readFile(blobPath);
		},
		readBase: async () => readManifestFile(basePath),
		writeBase: async (manifest: Manifest) =>
			writeManifestFile(basePath, manifest),
		readLeaf: async (leafId: string) =>
			readManifestFile(path.join(leavesDir, `${leafId}.json`)),
		writeLeaf: async (leafId: string, manifest: Manifest) =>
			writeManifestFile(path.join(leavesDir, `${leafId}.json`), manifest),
		listLeafIds: async () => {
			if (!existsSync(leavesDir)) return [];
			const entries = await readdir(leavesDir, { withFileTypes: true });
			return entries
				.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
				.map((entry) => entry.name.replace(/\.json$/, ""));
		},
	};
}

export function hashBuffer(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}
