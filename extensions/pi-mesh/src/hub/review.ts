/**
 * Session file-change review extraction.
 *
 * Parses pi session JSONL (see ~/.agents/skills/use-pi-session/references/
 * pi-session-format.md) and derives a structured review of the files the
 * session modified: per-toolCall change hunks (unified diff text), a file
 * tree, and stats. Domain logic ported from pi-session-manager's
 * psm-code-review/tool-review/{model.ts,viewModel.ts}.
 *
 * Change mapping (ported from model.ts):
 *   - write / write_file       -> whole-file add/replace hunk ("" -> content)
 *   - edit / edit_file /
 *     multi_edit / multiedit /
 *     apply_patch              -> one hunk per old_string/new_string pair
 *                                 (nested `edits[]` pairs supported)
 *   - bash / shell / exec      -> "external" shell notes (not file changes)
 *
 * WHY own JSONL walker: transcript.ts flattens to TranscriptEntry and drops
 * toolCall blocks; review needs the raw tool calls + toolResult `details`.
 */
import { readFile } from "node:fs/promises";
import { posix as posixPath, win32 as win32Path } from "node:path";
import { createTwoFilesPatch } from "diff";

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

export type ReviewStatus = "added" | "modified" | "deleted" | "renamed";
export type ReviewOutcome = "succeeded" | "failed" | "pending";

/** One file-mutating tool call rendered as a diff hunk (fragment old -> new). */
export interface ReviewHunk {
	toolCallId: string;
	entryId: string;
	toolName: "edit" | "write";
	timestamp: string;
	/** Per-file ordering key (encounter order within the session). */
	sequence: number;
	oldText: string;
	newText: string;
	/** Unified diff text for this operation (`diff.createTwoFilesPatch`). */
	patch: string;
	additions: number;
	deletions: number;
	isError: boolean;
	outcome: ReviewOutcome;
}

/** Record of a change tool call (flattened view over the file's hunks). */
export interface ReviewToolCall {
	id: string;
	entryId: string;
	toolName: "edit" | "write";
	timestamp: string;
	sequence: number;
	outcome: ReviewOutcome;
}

export interface ReviewFile {
	/** Display path kept in `path` for compatibility with existing consumers. */
	path: string;
	/** Stable identity: cwd-resolved canonical path, never shortened for display. */
	fileKey: string;
	canonicalPath: string;
	/** Human-facing path relative to the session cwd when possible. */
	displayPath: string;
	/** Original spellings from tool arguments, used to resolve activity-feed links. */
	sourcePaths: string[];
	status: ReviewStatus;
	/** Change hunks ordered by timestamp (consecutive edits deduped per path). */
	hunks: ReviewHunk[];
	/** Concatenated unified patch text (all hunks, in order). */
	patch: string;
	toolCalls: ReviewToolCall[];
	additions: number;
	deletions: number;
}

export interface ReviewTreeFile {
	/** Display path kept in `path` for compatibility with existing consumers. */
	path: string;
	fileKey: string;
	canonicalPath: string;
	displayPath: string;
	/** Last path segment. */
	name: string;
	/** Tree-safe display name (leaf/directory collisions get a suffix). */
	displayName: string;
	status: ReviewStatus;
	additions: number;
	deletions: number;
}

export interface TreeNode {
	/** Path segment ("" for root). */
	name: string;
	/** Full directory path ("" for root). */
	path: string;
	dirs: TreeNode[];
	files: ReviewTreeFile[];
}

/** Bash op kept as an "external" note (reference: ReviewShellList.tsx). */
export interface ReviewShellNote {
	id: string;
	entryId: string;
	command: string;
	timestamp: string;
	isError: boolean;
	outcome: ReviewOutcome;
}

export interface ReviewStats {
	files: number;
	additions: number;
	deletions: number;
	hunks: number;
	toolCalls: number;
	successfulHunks: number;
	failedHunks: number;
	pendingHunks: number;
	successfulToolCalls: number;
	failedToolCalls: number;
	pendingToolCalls: number;
	shell: number;
	byStatus: Record<ReviewStatus, number>;
}

export interface ReviewData {
	files: ReviewFile[];
	tree: TreeNode;
	stats: ReviewStats;
	shell: ReviewShellNote[];
}

// ---------------------------------------------------------------------------
// Raw session scan
// ---------------------------------------------------------------------------

interface RawToolCall {
	id: string;
	entryId: string;
	timestamp: string;
	name: string;
	args: Record<string, unknown>;
}

interface RawToolResult {
	isError: boolean;
	/** tool-specific metadata; `details.patch` may hint delete/rename. */
	details: Record<string, unknown>;
}

interface RawScan {
	toolCalls: RawToolCall[];
	resultsByCallId: Map<string, RawToolResult>;
	/** Session header cwd, used to shorten absolute paths. */
	cwd: string;
}

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toBlocks(content: unknown): unknown[] {
	if (Array.isArray(content)) return content;
	if (typeof content === "string") return [{ type: "text", text: content }];
	return [];
}

/** Tolerant JSONL scan (mirrors transcript.ts's crash-writer tolerance). */
function scanSession(raw: string): RawScan {
	const toolCalls: RawToolCall[] = [];
	const resultsByCallId = new Map<string, RawToolResult>();
	let cwd = "";
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			continue; // tolerate truncated/garbage lines from crashed writers
		}
		if (parsed?.type === "session") {
			if (typeof parsed.cwd === "string") cwd = parsed.cwd;
			continue;
		}
		if (parsed?.type !== "message") continue; // model_change/custom/... noise
		const msg = asRecord(parsed.message);
		const role = typeof msg.role === "string" ? msg.role : "";
		const entryId = typeof parsed.id === "string" ? parsed.id : "";
		const timestamp = typeof parsed.timestamp === "string" ? parsed.timestamp : "";
		if (role === "assistant") {
			for (const item of toBlocks(msg.content)) {
				const block = asRecord(item);
				if (block.type !== "toolCall") continue;
				const id = typeof block.id === "string" ? block.id : "";
				const name = typeof block.name === "string" ? block.name : "";
				toolCalls.push({ id, entryId, timestamp, name, args: asRecord(block.arguments) });
			}
		} else if (role === "toolResult") {
			const callId = typeof msg.toolCallId === "string" ? msg.toolCallId : "";
			if (!callId) continue;
			resultsByCallId.set(callId, {
				isError: msg.isError === true,
				details: asRecord(msg.details),
			});
		}
	}
	return { toolCalls, resultsByCallId, cwd };
}

// ---------------------------------------------------------------------------
// model.ts ports: tool-name normalization + argument extraction
// ---------------------------------------------------------------------------

function normalizeReviewToolName(name: string): string {
	const normalized = name.toLowerCase();
	if (normalized === "bash" || normalized === "shell" || normalized === "exec") return "bash";
	if (normalized === "write" || normalized === "write_file") return "write";
	if (
		normalized === "edit" ||
		normalized === "edit_file" ||
		normalized === "multi_edit" ||
		normalized === "multi-edit" ||
		normalized === "multiedit" ||
		normalized === "apply_patch"
	) {
		return "edit";
	}
	return normalized;
}

function getStringArg(args: Record<string, unknown>, ...keys: string[]): string {
	for (const key of keys) {
		const value = args[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return "";
}

interface EditPair {
	oldText: string;
	newText: string;
}

function getNestedEditPairs(args: Record<string, unknown>): EditPair[] {
	const edits = args.edits;
	if (!Array.isArray(edits)) return [];
	const pairs: EditPair[] = [];
	for (const item of edits) {
		const edit = asRecord(item);
		const oldText = getStringArg(edit, "old_string", "oldStr", "before", "oldText");
		const newText = getStringArg(edit, "new_string", "newStr", "after", "newText");
		if (oldText || newText) pairs.push({ oldText, newText });
	}
	return pairs;
}

function getEditPairs(args: Record<string, unknown>): EditPair[] {
	const oldText = getStringArg(args, "old_string", "oldStr", "before", "oldText");
	const newText = getStringArg(args, "new_string", "newStr", "after", "newText");
	if (oldText || newText) return [{ oldText, newText }];
	return getNestedEditPairs(args); // multi-edit: one hunk per pair
}

function getOperationPath(args: Record<string, unknown>): string {
	return getStringArg(args, "file_path", "path", "filePath", "absolutePath", "notebook_path", "absolute_path");
}

// ---------------------------------------------------------------------------
// viewModel.ts ports: path normalization + tree display collisions
// ---------------------------------------------------------------------------

function isWindowsPath(value: string): boolean {
	return /^[a-z]:[\\/]/i.test(value) || /^(?:\\\\|\/\/)[^\\/]/.test(value);
}

/**
 * Stable path identity. Resolve relative tool arguments against the session
 * cwd, but never remove source-root/package segments: those are identity.
 */
export function canonicalizeReviewPath(path: string, cwd = ""): string {
	const raw = path.trim();
	if (!raw || raw === "Unknown target") return "";
	const base = cwd.trim();
	if (isWindowsPath(raw) || isWindowsPath(base)) {
		const input = raw.replace(/\//g, "\\");
		const winBase = base.replace(/\//g, "\\");
		const normalized = win32Path.isAbsolute(input)
			? win32Path.normalize(input)
			: winBase
				? win32Path.resolve(winBase, input)
				: win32Path.normalize(input);
		return normalized.replace(/\\/g, "/").replace(/^([a-z]):/i, (_, drive: string) => `${drive.toUpperCase()}:`);
	}

	const input = raw.replace(/\\/g, "/");
	const posixBase = base.replace(/\\/g, "/");
	if (posixPath.isAbsolute(input)) return posixPath.normalize(input);
	if (posixBase && posixPath.isAbsolute(posixBase)) return posixPath.resolve(posixBase, input);
	return posixPath.normalize(input).replace(/^\.\//, "");
}

/** Human-facing path. The session cwd is the only safe shortening boundary. */
export function displayReviewPath(canonicalPath: string, cwd = ""): string {
	if (!canonicalPath) return "";
	const base = cwd.trim();
	if (base && isWindowsPath(canonicalPath) && isWindowsPath(base)) {
		const relative = win32Path.relative(base.replace(/\//g, "\\"), canonicalPath.replace(/\//g, "\\"));
		return relative ? relative.replace(/\\/g, "/") : win32Path.basename(canonicalPath);
	}
	if (base && !isWindowsPath(canonicalPath) && posixPath.isAbsolute(base.replace(/\\/g, "/"))) {
		const relative = posixPath.relative(base.replace(/\\/g, "/"), canonicalPath);
		return relative || posixPath.basename(canonicalPath);
	}
	return canonicalPath;
}

/** Compatibility helper: normalized display path, never used as file identity. */
export function normalizeReviewPath(path: string, cwd = ""): string {
	return displayReviewPath(canonicalizeReviewPath(path, cwd), cwd);
}

const FILE_TREE_LEAF_SUFFIX = " (file)";

/**
 * Ported from viewModel.resolveFileTreeDisplayPaths: when a path is also a
 * prefix of a longer path (file `payment-core` vs `payment-core/foo.ts`),
 * rename the leaf so file/directory segments cannot collide.
 */
export function resolveFileTreeDisplayPaths(paths: string[]): Map<string, string> {
	const sorted = [...paths].sort((a, b) => a.localeCompare(b));
	const displayPathByCanonical = new Map<string, string>();
	for (const path of sorted) {
		const collides = sorted.some(other => other !== path && other.startsWith(`${path}/`));
		displayPathByCanonical.set(path, collides ? `${path}${FILE_TREE_LEAF_SUFFIX}` : path);
	}
	return displayPathByCanonical;
}

// ---------------------------------------------------------------------------
// Patch helpers
// ---------------------------------------------------------------------------

function countPatchLines(patch: string): { additions: number; deletions: number } {
	let additions = 0;
	let deletions = 0;
	for (const line of patch.split("\n")) {
		if (line.startsWith("+++") || line.startsWith("---")) continue;
		if (line.startsWith("+")) additions += 1;
		else if (line.startsWith("-")) deletions += 1;
	}
	return { additions, deletions };
}

function makePatch(path: string, oldText: string, newText: string): string {
	try {
		return createTwoFilesPatch(path, path, oldText, newText, "", "");
	} catch {
		return "";
	}
}

// ---------------------------------------------------------------------------
// Review extraction
// ---------------------------------------------------------------------------

function looksDeleted(result: RawToolResult | undefined): boolean {
	const patch = result?.details?.patch;
	return typeof patch === "string" && /\+\+\+ \/dev\/null/.test(patch);
}

function looksRenamed(result: RawToolResult | undefined): boolean {
	if (!result) return false;
	if (result.details.renamedFrom != null || result.details.renameFrom != null) return true;
	const patch = result.details.patch;
	return typeof patch === "string" && /(^|\n)rename (from|to) /.test(patch);
}

interface PendingFile {
	fileKey: string;
	canonicalPath: string;
	displayPath: string;
	sourcePaths: Set<string>;
	hunks: ReviewHunk[];
	toolCalls: ReviewToolCall[];
	firstSuccessfulToolName?: "edit" | "write";
	deleted: boolean;
	renamed: boolean;
}

function reviewOutcome(result: RawToolResult | undefined): ReviewOutcome {
	if (!result) return "pending";
	return result.isError ? "failed" : "succeeded";
}

/** Build the review model from session JSONL text. */
export function buildReviewFromText(raw: string): ReviewData {
	const { toolCalls, resultsByCallId, cwd } = scanSession(raw);
	const byPath = new Map<string, PendingFile>();
	const shell: ReviewShellNote[] = [];
	let sequence = 0;

	for (const call of toolCalls) {
		const toolName = normalizeReviewToolName(call.name);
		if (toolName === "bash") {
			const result = resultsByCallId.get(call.id);
			shell.push({
				id: call.id,
				entryId: call.entryId,
				command: getStringArg(call.args, "command").replace(/\s+/g, " ").trim(),
				timestamp: call.timestamp,
				isError: result?.isError === true,
				outcome: reviewOutcome(result),
			});
			continue;
		}
		if (toolName !== "edit" && toolName !== "write") continue; // read/task/... not changes

		const rawPath = getOperationPath(call.args);
		const canonicalPath = canonicalizeReviewPath(rawPath, cwd) || `Unknown/#${call.id || sequence + 1}`;
		const displayPath = rawPath ? displayReviewPath(canonicalPath, cwd) : canonicalPath;
		const fileKey = canonicalPath;
		const result = resultsByCallId.get(call.id);
		const outcome = reviewOutcome(result);
		let pending = byPath.get(fileKey);
		if (!pending) {
			pending = {
				fileKey,
				canonicalPath,
				displayPath,
				sourcePaths: new Set(),
				hunks: [],
				toolCalls: [],
				deleted: false,
				renamed: false,
			};
			byPath.set(fileKey, pending);
		}
		if (rawPath) {
			pending.sourcePaths.add(rawPath);
			pending.sourcePaths.add(rawPath.replace(/\\/g, "/"));
		}
		if (outcome === "succeeded" && !pending.firstSuccessfulToolName) pending.firstSuccessfulToolName = toolName;
		if (outcome === "succeeded" && looksDeleted(result)) pending.deleted = true;
		if (outcome === "succeeded" && looksRenamed(result)) pending.renamed = true;

		const pairs: EditPair[] =
			toolName === "write"
				? [{ oldText: "", newText: getStringArg(call.args, "content", "new_string") }]
				: getEditPairs(call.args);

		let firstSequence = 0;
		for (const pair of pairs) {
			if (toolName === "write" && pair.oldText === pair.newText && pair.newText === "") continue;
			if (pair.oldText === pair.newText && toolName === "edit" && !pair.oldText) continue;
			sequence += 1;
			if (!firstSequence) firstSequence = sequence;
			const patch = makePatch(displayPath, pair.oldText, pair.newText);
			const { additions, deletions } = countPatchLines(patch);
			pending.hunks.push({
				toolCallId: call.id,
				entryId: call.entryId,
				toolName,
				timestamp: call.timestamp,
				sequence,
				oldText: pair.oldText,
				newText: pair.newText,
				patch,
				additions,
				deletions,
				isError: outcome === "failed",
				outcome,
			});
		}
		if (firstSequence) {
			pending.toolCalls.push({
				id: call.id,
				entryId: call.entryId,
				toolName,
				timestamp: call.timestamp,
				sequence: firstSequence,
				outcome,
			});
		}
	}

	// Dedupe by canonical identity, never by a shortened display path.
	const files: ReviewFile[] = [];
	for (const pending of [...byPath.values()].sort((a, b) => a.displayPath.localeCompare(b.displayPath))) {
		pending.hunks.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : a.sequence - b.sequence));
		pending.toolCalls.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : a.sequence - b.sequence));
		const succeeded = pending.hunks.filter(h => h.outcome === "succeeded");
		const additions = succeeded.reduce((sum, h) => sum + h.additions, 0);
		const deletions = succeeded.reduce((sum, h) => sum + h.deletions, 0);
		let status: ReviewStatus;
		if (pending.deleted) status = "deleted";
		else if (pending.renamed) status = "renamed";
		else if (pending.firstSuccessfulToolName === "write") status = "added";
		else status = "modified";
		files.push({
			path: pending.displayPath,
			fileKey: pending.fileKey,
			canonicalPath: pending.canonicalPath,
			displayPath: pending.displayPath,
			sourcePaths: [...pending.sourcePaths],
			status,
			hunks: pending.hunks,
			patch: pending.hunks.map(h => h.patch).filter(Boolean).join("\n"),
			toolCalls: pending.toolCalls,
			additions,
			deletions,
		});
	}

	const byStatus: Record<ReviewStatus, number> = { added: 0, modified: 0, deleted: 0, renamed: 0 };
	for (const file of files) byStatus[file.status] += 1;
	const allHunks = files.flatMap(file => file.hunks);
	const allToolCalls = files.flatMap(file => file.toolCalls);

	return {
		files,
		tree: buildTree(files),
		stats: {
			files: files.length,
			additions: files.reduce((sum, f) => sum + f.additions, 0),
			deletions: files.reduce((sum, f) => sum + f.deletions, 0),
			hunks: allHunks.length,
			toolCalls: allToolCalls.length,
			successfulHunks: allHunks.filter(h => h.outcome === "succeeded").length,
			failedHunks: allHunks.filter(h => h.outcome === "failed").length,
			pendingHunks: allHunks.filter(h => h.outcome === "pending").length,
			successfulToolCalls: allToolCalls.filter(call => call.outcome === "succeeded").length,
			failedToolCalls: allToolCalls.filter(call => call.outcome === "failed").length,
			pendingToolCalls: allToolCalls.filter(call => call.outcome === "pending").length,
			shell: shell.length,
			byStatus,
		},
		shell,
	};
}

/** Nested directory tree over the review files (files hang off their dir node). */
export function buildTree(files: ReviewFile[]): TreeNode {
	const root: TreeNode = { name: "", path: "", dirs: [], files: [] };
	const dirsByPath = new Map<string, TreeNode>([["", root]]);
	const displayByPath = resolveFileTreeDisplayPaths(files.map(f => f.displayPath || f.path));

	for (const file of files) {
		const displayPath = file.displayPath || file.path;
		const fileKey = file.fileKey || file.canonicalPath || file.path;
		const canonicalPath = file.canonicalPath || fileKey;
		const segments = displayPath.split("/").filter(Boolean);
		const fileName = segments.pop() ?? displayPath;
		let dirPath = "";
		let node = root;
		for (const segment of segments) {
			dirPath = dirPath ? `${dirPath}/${segment}` : segment;
			let child = dirsByPath.get(dirPath);
			if (!child) {
				child = { name: segment, path: dirPath, dirs: [], files: [] };
				dirsByPath.set(dirPath, child);
				node.dirs.push(child);
			}
			node = child;
		}
		node.files.push({
			path: displayPath,
			fileKey,
			canonicalPath,
			displayPath,
			name: fileName,
			displayName: displayByPath.get(displayPath) ?? fileName,
			status: file.status,
			additions: file.additions,
			deletions: file.deletions,
		});
	}

	const sortNode = (node: TreeNode) => {
		node.dirs.sort((a, b) => a.name.localeCompare(b.name));
		node.files.sort((a, b) => a.displayName.localeCompare(b.displayName));
		for (const dir of node.dirs) sortNode(dir);
	};
	sortNode(root);
	return root;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Parse a session JSONL file into a structured file-change review. */
export async function buildReview(sessionFile: string): Promise<ReviewData> {
	let raw: string;
	try {
		raw = await readFile(sessionFile, "utf8");
	} catch (err) {
		throw new Error(`pi-mesh: cannot read review session ${sessionFile}: ${errMessage(err)}`);
	}
	return buildReviewFromText(raw);
}

/**
 * HTTP handler shape for `GET /api/peers/:sessionId/review`
 * (the route resolves the peer's sessionFile, then calls this).
 */
export async function handleReviewRequest(
	sessionFile: string,
): Promise<{ ok: true; data: ReviewData } | { ok: false; error: string }> {
	try {
		return { ok: true, data: await buildReview(sessionFile) };
	} catch (err) {
		return { ok: false, error: errMessage(err) };
	}
}
