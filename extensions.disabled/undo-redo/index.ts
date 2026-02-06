import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { StringEnum } from "@mariozechner/pi-ai";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ExtensionUIContext,
	formatSize,
	type KeybindingsManager,
	type SessionForkEvent,
	type SessionStartEvent,
	type SessionSwitchEvent,
	type SessionTreeEvent,
	type ToolDefinition,
	type TurnEndEvent,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { createCache } from "./cache.js";
import { formatDiffText, listDiffItems, showDiffStack } from "./diff-stack.js";
import { UndoRedoEditor } from "./editor.js";
import { resolveUserPath } from "./paths.js";
import { SandboxState } from "./sandbox.js";
import type { BufferedToolSet } from "./tools.js";
import { createBufferedToolSet } from "./tools.js";
import { SnapshotTracker } from "./tracker.js";
import type { SandboxProgress, TrackedStats } from "./types.js";

const STATUS_KEY = "undo-redo";
const TOOL_OUTPUT_DIR = "diffs";

const undoRedoToolSchema = Type.Object({
	action: StringEnum(["undo", "redo", "list_diffs", "diff"] as const),
	leafId: Type.Optional(
		Type.String({
			description: "Leaf id to target (defaults to the current leaf for diff).",
		}),
	),
	path: Type.Optional(
		Type.String({
			description:
				"File path for diff (relative to the project root or absolute).",
		}),
	),
});

interface SessionState {
	realRoot: string;
	sandboxRoot: string;
	cache: ReturnType<typeof createCache>;
	tracker: SnapshotTracker;
	sandboxState: SandboxState;
	ui?: ExtensionUIContext;
	currentLeafId: string | null;
	undoStack: string[];
	redoStack: string[];
	navigating: boolean;
}

interface SessionBranching {
	branch(entryId: string): void;
	resetLeaf(): void;
}

export default function (pi: ExtensionAPI) {
	let state: SessionState | undefined;
	let toolSet: BufferedToolSet | undefined;

	const toolTemplates = {
		read: createReadTool(process.cwd()) as ToolDefinition,
		edit: createEditTool(process.cwd()) as ToolDefinition,
		write: createWriteTool(process.cwd()) as ToolDefinition,
		find: createFindTool(process.cwd()) as ToolDefinition,
		ls: createLsTool(process.cwd()) as ToolDefinition,
		grep: createGrepTool(process.cwd()) as ToolDefinition,
		bash: createBashTool(process.cwd()) as ToolDefinition,
	};

	const buildDeferredTool = (
		template: ToolDefinition,
		selector: (tools: BufferedToolSet) => ToolDefinition,
	): ToolDefinition => {
		const execute: typeof template.execute = async (
			toolCallId,
			input,
			signal,
			onUpdate,
			ctx,
		) => {
			if (!toolSet) {
				throw new Error("Undo/redo extension not initialized");
			}
			const tool = selector(toolSet);
			return tool.execute(toolCallId, input, signal, onUpdate, ctx);
		};

		return {
			...template,
			execute,
		};
	};

	const deferredTools: ToolDefinition[] = [
		buildDeferredTool(toolTemplates.read, (tools) => tools.readTool),
		buildDeferredTool(toolTemplates.edit, (tools) => tools.editTool),
		buildDeferredTool(toolTemplates.write, (tools) => tools.writeTool),
		buildDeferredTool(toolTemplates.find, (tools) => tools.findTool),
		buildDeferredTool(toolTemplates.ls, (tools) => tools.lsTool),
		buildDeferredTool(toolTemplates.grep, (tools) => tools.grepTool),
		buildDeferredTool(toolTemplates.bash, (tools) => tools.bashTool),
	];

	for (const tool of deferredTools) {
		pi.registerTool(tool);
	}

	const updateStatus = (
		stats: TrackedStats,
		ui: ExtensionUIContext | undefined,
	): void => {
		if (!ui) return;
		if (stats.fileCount === 0) {
			ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		const suffix = stats.fileCount === 1 ? "file" : "files";
		ui.setStatus(
			STATUS_KEY,
			`Tracked: ${stats.fileCount} ${suffix} (${formatSize(stats.totalBytes)})`,
		);
	};

	const formatProgressMessage = (progress: SandboxProgress): string => {
		const suffix =
			progress.current && progress.total
				? ` (${progress.current}/${progress.total})`
				: "";
		return `${progress.message}${suffix}`;
	};

	const createProgressReporter = (ctx: ExtensionContext) => {
		let lastStage: SandboxProgress["stage"] | null = null;
		return (progress: SandboxProgress): void => {
			pi.events.emit("undo-redo.progress", progress);
			const message = formatProgressMessage(progress);
			if (ctx.hasUI) {
				if (progress.stage === "done") {
					ctx.ui.setWorkingMessage();
				} else {
					ctx.ui.setWorkingMessage(message);
				}
				return;
			}
			if (progress.stage !== lastStage || progress.stage === "done") {
				pi.sendMessage(
					{
						customType: "undo-redo.progress",
						content: message,
						display: true,
						details: progress,
					},
					{ triggerTurn: false },
				);
			}
			lastStage = progress.stage;
		};
	};

	const notify = (
		ctx: ExtensionCommandContext,
		message: string,
		level: "info" | "warning" | "error",
	): void => {
		if (ctx.hasUI) {
			ctx.ui.notify(message, level);
			return;
		}
		pi.sendMessage(
			{
				customType: "undo-redo.notice",
				content: message,
				display: true,
				details: { level },
			},
			{ triggerTurn: false },
		);
	};

	const ensureState = (
		ctx: ExtensionCommandContext,
	): SessionState | undefined => {
		if (!state) {
			notify(ctx, "Undo/redo extension not initialized", "error");
			return undefined;
		}
		return state;
	};

	const isToolCallTurn = (message: unknown): boolean => {
		if (!message || typeof message !== "object") return false;
		const candidate = message as {
			role?: string;
			content?: unknown;
			stopReason?: string;
		};
		if (candidate.role !== "assistant") return false;
		if (candidate.stopReason === "toolUse") return true;
		if (!Array.isArray(candidate.content)) return false;
		return candidate.content.some((item) => {
			if (!item || typeof item !== "object") return false;
			return (item as { type?: string }).type === "toolCall";
		});
	};

	const navigateTo = async (
		ctx: ExtensionCommandContext,
		session: SessionState,
		targetId: string,
	): Promise<void> => {
		const previousLeaf = session.currentLeafId;
		const previousUndo = [...session.undoStack];
		const previousRedo = [...session.redoStack];
		session.navigating = true;

		const commandCtx = ctx as Partial<ExtensionCommandContext>;
		if (!commandCtx.waitForIdle || !commandCtx.navigateTree) {
			session.navigating = false;
			notify(ctx, "Undo/redo navigation requires interactive mode", "warning");
			return;
		}

		try {
			await commandCtx.waitForIdle();
			const result = await commandCtx.navigateTree(targetId, {
				summarize: false,
			});
			if (result.cancelled) {
				throw new Error("Navigation cancelled");
			}
		} catch (error) {
			session.undoStack.length = 0;
			session.undoStack.push(...previousUndo);
			session.redoStack.length = 0;
			session.redoStack.push(...previousRedo);
			session.currentLeafId = previousLeaf;
			session.navigating = false;
			const message = error instanceof Error ? error.message : String(error);
			notify(ctx, message, "warning");
		}
	};

	pi.registerCommand("undo", {
		description:
			"Navigate to the previous conversation leaf and restore buffered files",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const session = ensureState(ctx);
			if (!session) return;
			const targetId = session.undoStack.pop();
			if (!targetId) {
				notify(ctx, "No undo history", "info");
				return;
			}
			if (session.currentLeafId) {
				session.redoStack.push(session.currentLeafId);
			}
			await navigateTo(ctx, session, targetId);
		},
	});

	pi.registerCommand("redo", {
		description:
			"Navigate to the next conversation leaf and restore buffered files",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const session = ensureState(ctx);
			if (!session) return;
			const targetId = session.redoStack.pop();
			if (!targetId) {
				notify(ctx, "No redo history", "info");
				return;
			}
			if (session.currentLeafId) {
				session.undoStack.push(session.currentLeafId);
			}
			await navigateTo(ctx, session, targetId);
		},
	});

	pi.registerCommand("diff-stack", {
		description: "Show buffered diffs for each conversation leaf",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const session = ensureState(ctx);
			if (!session) return;
			await showDiffStack(pi, ctx, session.tracker, session.cache);
		},
	});

	const formatToolOutput = async (
		session: SessionState,
		label: string,
		content: string,
	): Promise<{ text: string; outputPath?: string; truncated: boolean }> => {
		const truncation = truncateHead(content, {
			maxLines: DEFAULT_MAX_LINES,
			maxBytes: DEFAULT_MAX_BYTES,
		});

		if (!truncation.truncated) {
			return { text: truncation.content, truncated: false };
		}

		const outputDir = path.join(session.cache.root, TOOL_OUTPUT_DIR);
		await mkdir(outputDir, { recursive: true });
		const outputPath = path.join(outputDir, `${label}-${Date.now()}.txt`);
		await writeFile(outputPath, content, "utf-8");

		let text = truncation.content;
		const lineInfo = `${truncation.outputLines} of ${truncation.totalLines} lines`;
		const byteInfo = `${formatSize(truncation.outputBytes)} of ${formatSize(
			truncation.totalBytes,
		)}`;
		text += `\n\n[Output truncated: ${lineInfo} (${byteInfo}). Full output saved to: ${outputPath}]`;

		return { text, outputPath, truncated: true };
	};

	const syncLeafToSession = async (
		session: SessionState,
		ctx: ExtensionContext,
		targetId: string | null,
	): Promise<void> => {
		const sessionManager = ctx.sessionManager as unknown as SessionBranching;
		if (targetId === null) {
			sessionManager.resetLeaf();
		} else {
			sessionManager.branch(targetId);
		}
		session.currentLeafId = ctx.sessionManager.getLeafId();
		await session.tracker.restoreLeaf(targetId, [
			session.sandboxRoot,
			session.realRoot,
		]);
		session.sandboxState.setStats(await session.sandboxState.rescan());
	};

	const applyToolNavigation = async (
		session: SessionState,
		ctx: ExtensionContext,
		action: "undo" | "redo",
	): Promise<{ targetId?: string; message: string }> => {
		const previousLeaf = session.currentLeafId;
		const previousUndo = [...session.undoStack];
		const previousRedo = [...session.redoStack];

		const targetId =
			action === "undo" ? session.undoStack.pop() : session.redoStack.pop();
		if (!targetId) {
			return { message: `No ${action} history.` };
		}

		if (previousLeaf) {
			if (action === "undo") {
				session.redoStack.push(previousLeaf);
			} else {
				session.undoStack.push(previousLeaf);
			}
		}

		try {
			await session.tracker.saveLeaf(previousLeaf);
			await syncLeafToSession(session, ctx, targetId);
			const label = action === "undo" ? "Undo" : "Redo";
			return {
				targetId,
				message:
					`${label} applied: restored file snapshots for leaf ${targetId}. ` +
					"This tool does not update the UI or current turn context; changes apply on the next user prompt.",
			};
		} catch (error) {
			session.undoStack.length = 0;
			session.undoStack.push(...previousUndo);
			session.redoStack.length = 0;
			session.redoStack.push(...previousRedo);
			session.currentLeafId = previousLeaf ?? null;
			await syncLeafToSession(session, ctx, previousLeaf ?? null);
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Undo/redo tool failed: ${message}`);
		}
	};

	pi.registerTool({
		name: "undo_redo",
		label: "Undo/Redo",
		description:
			"Navigate undo/redo history and inspect buffered diffs without UI navigation. This tool updates the session leaf and restores files, but it does not update the current turn context or UI; changes apply on the next user prompt.",
		parameters: undoRedoToolSchema,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const respond = (
				text: string,
				details: Record<string, unknown>,
				isError = false,
			) => {
				const content = [{ type: "text" as const, text }];
				return {
					content,
					details,
					isError,
				};
			};

			if (!state) {
				return respond(
					"Undo/redo extension not initialized.",
					{ action: params.action },
					true,
				);
			}
			if (signal?.aborted) {
				return respond(
					"Undo/redo tool cancelled.",
					{ action: params.action },
					true,
				);
			}

			const session = state;
			const currentLeafId = ctx.sessionManager.getLeafId();
			if (currentLeafId !== session.currentLeafId) {
				session.currentLeafId = currentLeafId;
			}

			if (params.action === "undo" || params.action === "redo") {
				const result = await applyToolNavigation(session, ctx, params.action);
				return respond(result.message, {
					action: params.action,
					targetId: result.targetId,
				});
			}

			if (params.action === "list_diffs") {
				const items = await listDiffItems(session.tracker, session.cache);
				if (items.length === 0) {
					return respond("No buffered diffs available.", {
						action: params.action,
						items,
					});
				}

				const lines = items
					.map((item) => `[${item.leafId}] ${item.change} ${item.path}`)
					.join("\n");
				const output = await formatToolOutput(
					session,
					"undo-redo-diff-list",
					`Buffered diffs:\n${lines}`,
				);
				return respond(output.text, {
					action: params.action,
					items,
					truncated: output.truncated,
					outputPath: output.outputPath,
				});
			}

			if (!params.path) {
				return respond(
					"Diff action requires a path.",
					{ action: params.action },
					true,
				);
			}

			const leafId = params.leafId ?? session.currentLeafId;
			if (!leafId) {
				return respond(
					"No leaf selected for diff.",
					{ action: params.action },
					true,
				);
			}

			const absolutePath = resolveUserPath(params.path, session.realRoot);
			const relativePath = session.tracker.resolveRelativePath(absolutePath);
			if (!relativePath) {
				return respond(
					"Diff path must be inside the project root.",
					{ action: params.action },
					true,
				);
			}

			const leafManifest = await session.tracker.loadLeaf(leafId);
			if (!leafManifest) {
				return respond(
					`No buffered snapshot for leaf ${leafId}.`,
					{ action: params.action, leafId, path: relativePath },
					true,
				);
			}

			const baseManifest = session.tracker.getBaseManifest();
			const baseEntry = baseManifest.get(relativePath);
			const leafEntry = leafManifest.get(relativePath);
			const diffText = await formatDiffText(
				session.cache,
				baseEntry,
				leafEntry,
			);
			const output = await formatToolOutput(
				session,
				`undo-redo-diff-${leafId}`,
				`Diff for ${relativePath} (leaf ${leafId})\n\n${diffText}`,
			);
			return respond(output.text, {
				action: params.action,
				leafId,
				path: relativePath,
				truncated: output.truncated,
				outputPath: output.outputPath,
			});
		},
	});

	const initializeSession = async (
		ctx: ExtensionContext,
	): Promise<SessionState> => {
		const sessionId = ctx.sessionManager.getSessionId();
		const realRoot = ctx.cwd;
		const uiContext = ctx.hasUI ? ctx.ui : undefined;
		const cache = createCache(sessionId);
		await cache.ensure();

		const sandboxRoot = path.join(cache.root, "sandbox");
		const progressReporter = createProgressReporter(ctx);
		const sandboxState = new SandboxState(
			realRoot,
			sandboxRoot,
			progressReporter,
		);
		await sandboxState.initialize();

		const tracker = new SnapshotTracker(cache, realRoot, sandboxRoot, (stats) =>
			updateStatus(stats, uiContext),
		);
		await tracker.loadBase();

		const currentLeafId = ctx.sessionManager.getLeafId();
		if (currentLeafId) {
			const leafManifest = await tracker.loadLeaf(currentLeafId);
			if (leafManifest) {
				await tracker.restoreLeaf(currentLeafId, [sandboxRoot, realRoot]);
			}
		}

		sandboxState.setStats(await sandboxState.rescan());

		toolSet = createBufferedToolSet({
			realRoot,
			sandboxRoot,
			tracker,
			sandboxState,
			updateStatus: () => updateStatus(tracker.getTrackedStats(), uiContext),
		});

		if (ctx.hasUI) {
			ctx.ui.setEditorComponent(
				(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) =>
					new UndoRedoEditor(tui, theme, keybindings),
			);
			ctx.ui.notify(
				"Buffered undo enabled: tools operate in a sandbox with automatic file restores on undo/redo.",
				"info",
			);
		}

		const sessionState: SessionState = {
			realRoot,
			sandboxRoot,
			cache,
			tracker,
			sandboxState,
			ui: uiContext,
			currentLeafId,
			undoStack: [],
			redoStack: [],
			navigating: false,
		};

		if (currentLeafId) {
			await tracker.saveLeaf(currentLeafId);
		}

		updateStatus(tracker.getTrackedStats(), uiContext);
		return sessionState;
	};

	pi.registerCommand("undo-redo-clear-cache", {
		description:
			"Clear the undo/redo extension cache (snapshots, diffs, sandbox) for the current session",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const session = ensureState(ctx);
			if (!session) return;
			try {
				await rm(session.cache.root, { recursive: true, force: true });
				state = await initializeSession(ctx);
				notify(
					ctx,
					"Undo/redo cache cleared. Undo/redo history has been reset.",
					"info",
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				notify(ctx, `Failed to clear undo/redo cache: ${message}`, "error");
			}
		},
	});

	const initializeFromContext = async (
		ctx: ExtensionContext,
	): Promise<void> => {
		state = await initializeSession(ctx);
	};

	const handleTurnEnd = async (
		event: TurnEndEvent,
		ctx: ExtensionContext,
	): Promise<void> => {
		if (!state) return;
		if (isToolCallTurn(event.message)) return;
		const leafId = ctx.sessionManager.getLeafId();
		if (leafId && leafId !== state.currentLeafId) {
			if (state.currentLeafId) {
				state.undoStack.push(state.currentLeafId);
			}
			state.currentLeafId = leafId;
		}
		await state.tracker.saveLeaf(state.currentLeafId);
	};

	const handleSessionTree = async (event: SessionTreeEvent): Promise<void> => {
		if (!state) return;
		const newLeafId = event.newLeafId;
		const oldLeafId = event.oldLeafId;

		if (!state.navigating && oldLeafId && oldLeafId !== newLeafId) {
			state.undoStack.push(oldLeafId);
		}

		state.currentLeafId = newLeafId;
		await state.tracker.restoreLeaf(newLeafId, [
			state.sandboxRoot,
			state.realRoot,
		]);
		state.sandboxState.setStats(await state.sandboxState.rescan());
		state.navigating = false;
	};

	pi.on(
		"session_start",
		async (_event: SessionStartEvent, ctx: ExtensionContext) => {
			await initializeFromContext(ctx);
		},
	);

	pi.on(
		"session_switch",
		async (_event: SessionSwitchEvent, ctx: ExtensionContext) => {
			await initializeFromContext(ctx);
		},
	);

	pi.on(
		"session_fork",
		async (_event: SessionForkEvent, ctx: ExtensionContext) => {
			await initializeFromContext(ctx);
		},
	);

	pi.on("turn_end", async (event: TurnEndEvent, ctx: ExtensionContext) => {
		await handleTurnEnd(event, ctx);
	});

	pi.on("session_tree", async (event: SessionTreeEvent) => {
		await handleSessionTree(event);
	});
}
