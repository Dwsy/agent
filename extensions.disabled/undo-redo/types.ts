export type FileState = {
	exists: boolean;
	hash?: string;
	size?: number;
	binary?: boolean;
};

export type Manifest = Map<string, FileState>;

export type ManifestRecord = Record<string, FileState>;

export interface TrackedStats {
	fileCount: number;
	totalBytes: number;
}

export interface SandboxEntryStats {
	size: number;
	mtimeMs: number;
}

export type SandboxProgressStage = "prepare" | "scan" | "sync" | "done";

export interface SandboxProgress {
	stage: SandboxProgressStage;
	message: string;
	current?: number;
	total?: number;
}

export type ChangeType = "added" | "modified" | "deleted";

export interface DiffItem {
	leafId: string;
	path: string;
	change: ChangeType;
}
