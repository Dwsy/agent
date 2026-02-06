import { constants } from "node:fs";
import {
	access as fsAccess,
	mkdir as fsMkdir,
	readFile as fsReadFile,
	writeFile as fsWriteFile,
} from "node:fs/promises";
import path from "node:path";
import type {
	BashSpawnContext,
	ExtensionAPI,
	ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent";
import {
	expandPath,
	isWithinRoot,
	mapToSandboxPath,
	replaceRootInText,
	resolveUserPath,
	toRelativePath,
} from "./paths.js";
import {
	diffSandboxStats,
	ensureSandboxFile,
	removeFileFromDisk,
	type SandboxState,
	syncFileFromSandbox,
} from "./sandbox.js";
import type { SnapshotTracker } from "./tracker.js";

const IMAGE_MIME_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
};

export interface BufferedToolRuntime {
	realRoot: string;
	sandboxRoot: string;
	tracker: SnapshotTracker;
	sandboxState: SandboxState;
	updateStatus: () => void;
}

export interface BufferedToolSet {
	readTool: ToolDefinition;
	editTool: ToolDefinition;
	writeTool: ToolDefinition;
	findTool: ToolDefinition;
	lsTool: ToolDefinition;
	grepTool: ToolDefinition;
	bashTool: ToolDefinition;
}

interface ToolRegistrationOptions extends BufferedToolRuntime {
	pi: ExtensionAPI;
}

function mapInputPath(
	inputPath: string | undefined,
	realRoot: string,
	sandboxRoot: string,
): string | undefined {
	if (!inputPath) return inputPath;
	const expanded = expandPath(inputPath);
	const absolutePath = resolveUserPath(inputPath, realRoot);
	if (path.isAbsolute(expanded) && isWithinRoot(absolutePath, realRoot)) {
		return mapToSandboxPath(absolutePath, realRoot, sandboxRoot);
	}
	return inputPath;
}

function rewriteResultPaths<
	T extends { content: Array<{ type: string; text?: string }> },
>(result: T, sandboxRoot: string, realRoot: string): T {
	const content = result.content.map((item) => {
		if (item.type !== "text" || item.text === undefined) return item;
		return {
			...item,
			text: replaceRootInText(item.text, sandboxRoot, realRoot),
		};
	});
	return { ...result, content };
}

function rewriteError(
	error: unknown,
	sandboxRoot: string,
	realRoot: string,
): Error {
	const message = error instanceof Error ? error.message : String(error);
	return new Error(replaceRootInText(message, sandboxRoot, realRoot));
}

async function trackRead(
	filePath: string,
	realRoot: string,
	tracker: SnapshotTracker,
	updateStatus: () => void,
): Promise<void> {
	try {
		const absolutePath = resolveUserPath(filePath, realRoot);
		const relativePath = toRelativePath(absolutePath, realRoot);
		if (!relativePath) return;
		await tracker.ensureBaseFromSandbox(relativePath);
		await tracker.updateFromSandbox(relativePath);
		updateStatus();
	} catch {
		// Best-effort tracking; don't block tool execution.
	}
}

export function createBufferedToolSet(
	options: BufferedToolRuntime,
): BufferedToolSet {
	const { realRoot, sandboxRoot, tracker, sandboxState, updateStatus } =
		options;

	const ensureSandboxCopy = async (absolutePath: string): Promise<void> => {
		const relativePath = toRelativePath(absolutePath, realRoot);
		if (!relativePath) return;
		await ensureSandboxFile(relativePath, realRoot, sandboxRoot);
	};

	const readOps = {
		readFile: async (absolutePath: string): Promise<Buffer> => {
			await ensureSandboxCopy(absolutePath);
			return fsReadFile(mapToSandboxPath(absolutePath, realRoot, sandboxRoot));
		},
		access: async (absolutePath: string): Promise<void> => {
			await ensureSandboxCopy(absolutePath);
			await fsAccess(
				mapToSandboxPath(absolutePath, realRoot, sandboxRoot),
				constants.R_OK,
			);
		},
		detectImageMimeType: async (
			absolutePath: string,
		): Promise<string | null> => {
			const mapped = mapToSandboxPath(absolutePath, realRoot, sandboxRoot);
			const ext = path.extname(mapped).toLowerCase();
			return IMAGE_MIME_TYPES[ext] ?? null;
		},
	};

	const editOps = {
		readFile: async (absolutePath: string): Promise<Buffer> => {
			await ensureSandboxCopy(absolutePath);
			return fsReadFile(mapToSandboxPath(absolutePath, realRoot, sandboxRoot));
		},
		writeFile: async (absolutePath: string, content: string): Promise<void> => {
			await ensureSandboxCopy(absolutePath);
			await fsWriteFile(
				mapToSandboxPath(absolutePath, realRoot, sandboxRoot),
				content,
				"utf-8",
			);
		},
		access: async (absolutePath: string): Promise<void> => {
			await ensureSandboxCopy(absolutePath);
			await fsAccess(
				mapToSandboxPath(absolutePath, realRoot, sandboxRoot),
				constants.R_OK | constants.W_OK,
			);
		},
	};

	const writeOps = {
		writeFile: async (absolutePath: string, content: string): Promise<void> => {
			await ensureSandboxCopy(absolutePath);
			await fsWriteFile(
				mapToSandboxPath(absolutePath, realRoot, sandboxRoot),
				content,
				"utf-8",
			);
		},
		mkdir: async (dir: string): Promise<void> =>
			fsMkdir(mapToSandboxPath(dir, realRoot, sandboxRoot), {
				recursive: true,
			}).then(() => {}),
	};

	const baseReadTool = createReadTool(sandboxRoot, { operations: readOps });
	const baseEditTool = createEditTool(sandboxRoot, { operations: editOps });
	const baseWriteTool = createWriteTool(sandboxRoot, { operations: writeOps });
	const baseFindTool = createFindTool(sandboxRoot);
	const baseLsTool = createLsTool(sandboxRoot);
	const baseGrepTool = createGrepTool(sandboxRoot);

	const baseBashTool = createBashTool(realRoot, {
		spawnHook: (context: BashSpawnContext) => ({
			...context,
			cwd: sandboxRoot,
			command: replaceRootInText(context.command, realRoot, sandboxRoot),
		}),
	});

	const readExecute: typeof baseReadTool.execute = async (
		toolCallId,
		input,
		signal,
		onUpdate,
	) => {
		const result = await baseReadTool.execute(
			toolCallId,
			input,
			signal,
			onUpdate,
		);
		await trackRead(input.path, realRoot, tracker, updateStatus);
		return rewriteResultPaths(result, sandboxRoot, realRoot);
	};

	const readTool: ToolDefinition = {
		...baseReadTool,
		execute: readExecute,
	};

	const editExecute: typeof baseEditTool.execute = async (
		toolCallId,
		input,
		signal,
		onUpdate,
	) => {
		const absolutePath = resolveUserPath(input.path, realRoot);
		const relativePath = toRelativePath(absolutePath, realRoot);
		if (relativePath) {
			await tracker.ensureBaseFromSandbox(relativePath);
		}
		const result = await baseEditTool.execute(
			toolCallId,
			input,
			signal,
			onUpdate,
		);
		if (relativePath) {
			await tracker.updateFromSandbox(relativePath);
			await syncFileFromSandbox(relativePath, sandboxRoot, realRoot);
			await sandboxState.updateFile(relativePath);
			updateStatus();
		}
		return rewriteResultPaths(result, sandboxRoot, realRoot);
	};

	const editTool: ToolDefinition = {
		...baseEditTool,
		execute: editExecute,
	};

	const writeExecute: typeof baseWriteTool.execute = async (
		toolCallId,
		input,
		signal,
		onUpdate,
	) => {
		const absolutePath = resolveUserPath(input.path, realRoot);
		const relativePath = toRelativePath(absolutePath, realRoot);
		if (relativePath) {
			await tracker.ensureBaseFromSandbox(relativePath);
		}
		const result = await baseWriteTool.execute(
			toolCallId,
			input,
			signal,
			onUpdate,
		);
		if (relativePath) {
			await tracker.updateFromSandbox(relativePath);
			await syncFileFromSandbox(relativePath, sandboxRoot, realRoot);
			await sandboxState.updateFile(relativePath);
			updateStatus();
		}
		return rewriteResultPaths(result, sandboxRoot, realRoot);
	};

	const writeTool: ToolDefinition = {
		...baseWriteTool,
		execute: writeExecute,
	};

	const findExecute: typeof baseFindTool.execute = async (
		toolCallId,
		input,
		signal,
		onUpdate,
	) => {
		const mappedInput = {
			...input,
			path: mapInputPath(input.path, realRoot, sandboxRoot),
		};
		try {
			const result = await baseFindTool.execute(
				toolCallId,
				mappedInput,
				signal,
				onUpdate,
			);
			return rewriteResultPaths(result, sandboxRoot, realRoot);
		} catch (error) {
			throw rewriteError(error, sandboxRoot, realRoot);
		}
	};

	const findTool: ToolDefinition = {
		...baseFindTool,
		execute: findExecute,
	};

	const lsExecute: typeof baseLsTool.execute = async (
		toolCallId,
		input,
		signal,
		onUpdate,
	) => {
		const mappedInput = {
			...input,
			path: mapInputPath(input.path, realRoot, sandboxRoot),
		};
		try {
			const result = await baseLsTool.execute(
				toolCallId,
				mappedInput,
				signal,
				onUpdate,
			);
			return rewriteResultPaths(result, sandboxRoot, realRoot);
		} catch (error) {
			throw rewriteError(error, sandboxRoot, realRoot);
		}
	};

	const lsTool: ToolDefinition = {
		...baseLsTool,
		execute: lsExecute,
	};

	const grepExecute: typeof baseGrepTool.execute = async (
		toolCallId,
		input,
		signal,
		onUpdate,
	) => {
		const mappedInput = {
			...input,
			path: mapInputPath(input.path, realRoot, sandboxRoot),
		};
		try {
			const result = await baseGrepTool.execute(
				toolCallId,
				mappedInput,
				signal,
				onUpdate,
			);
			return rewriteResultPaths(result, sandboxRoot, realRoot);
		} catch (error) {
			throw rewriteError(error, sandboxRoot, realRoot);
		}
	};

	const grepTool: ToolDefinition = {
		...baseGrepTool,
		execute: grepExecute,
	};

	const bashExecute: typeof baseBashTool.execute = async (
		toolCallId,
		input,
		signal,
		onUpdate,
	) => {
		const beforeStats = sandboxState.getStats();
		let result: Awaited<ReturnType<typeof baseBashTool.execute>> | undefined;
		let error: Error | undefined;

		const wrappedUpdate: typeof onUpdate = onUpdate
			? (update) => {
					const rewritten = rewriteResultPaths(update, sandboxRoot, realRoot);
					onUpdate(rewritten);
				}
			: undefined;

		try {
			result = await baseBashTool.execute(
				toolCallId,
				input,
				signal,
				wrappedUpdate,
			);
		} catch (err) {
			error = rewriteError(err, sandboxRoot, realRoot);
		}

		const afterStats = await sandboxState.rescan();
		const diff = diffSandboxStats(beforeStats, afterStats);
		sandboxState.setStats(afterStats);

		for (const relativePath of diff.added) {
			await tracker.ensureBaseFromDisk(relativePath);
			await tracker.updateFromSandbox(relativePath);
			await syncFileFromSandbox(relativePath, sandboxRoot, realRoot);
		}

		for (const relativePath of diff.changed) {
			await tracker.ensureBaseFromDisk(relativePath);
			await tracker.updateFromSandbox(relativePath);
			await syncFileFromSandbox(relativePath, sandboxRoot, realRoot);
		}

		for (const relativePath of diff.removed) {
			await tracker.ensureBaseFromDisk(relativePath);
			tracker.markDeleted(relativePath);
			await removeFileFromDisk(relativePath, realRoot);
		}

		if (diff.added.length + diff.changed.length + diff.removed.length > 0) {
			updateStatus();
		}

		if (error) {
			throw error;
		}

		if (!result) {
			throw new Error("bash command failed without output");
		}

		return rewriteResultPaths(result, sandboxRoot, realRoot);
	};

	const bashTool: ToolDefinition = {
		...baseBashTool,
		execute: bashExecute,
	};

	return {
		readTool,
		editTool,
		writeTool,
		findTool,
		lsTool,
		grepTool,
		bashTool,
	};
}

export function registerBufferedTools(options: ToolRegistrationOptions): void {
	const { pi } = options;
	const tools = createBufferedToolSet(options);

	pi.registerTool(tools.readTool);
	pi.registerTool(tools.editTool);
	pi.registerTool(tools.writeTool);
	pi.registerTool(tools.findTool);
	pi.registerTool(tools.lsTool);
	pi.registerTool(tools.grepTool);
	pi.registerTool(tools.bashTool);
}
