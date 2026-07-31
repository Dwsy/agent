/**
 * 循环扩展 (Loop Extension)
 *
 * 提供 /loop 命令，启动一个带跳出条件的循环。
 * 循环会在每次回合结束时发送提示，直到 Agent 调用 signal_loop_success 工具。
 */

import { Type } from "@sinclair/typebox";
import { complete, type Api, type Model, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, SessionSwitchEvent } from "@earendil-works/pi-coding-agent";
import { compact } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";

type LoopMode = "tests" | "custom" | "self" | "debug" | "tdd" | "review" | "verify";

type LoopStateData = {
	active: boolean;
	mode?: LoopMode;
	condition?: string;
	prompt?: string;
	summary?: string;
	loopCount?: number;
};

const LOOP_PRESETS = [
	{ value: "self", label: "自主模式 (Agent 自行决定)", description: "自主拆解并完成任务" },
	{ value: "debug", label: "系统调试 (先找根因)", description: "复现、追踪、假设、验证" },
	{ value: "tdd", label: "TDD 修复 (红绿重构)", description: "先写失败测试，再最小实现" },
	{ value: "review", label: "代码审查 (找风险)", description: "按严重度列问题；仅按请求修复" },
	{ value: "verify", label: "验证收尾 (跑检查)", description: "运行验证命令，确认输出再结束" },
	{ value: "tests", label: "直到测试通过", description: "持续修复直到测试绿" },
	{ value: "custom", label: "直到满足自定义条件", description: "按自定义跳出条件循环" },
	{ value: "stop", label: "停止当前循环", description: "结束当前循环" },
] as const;

const LOOP_STATE_ENTRY = "loop-state";

const HAIKU_MODEL_ID = "claude-haiku-4-5";

const SUMMARY_SYSTEM_PROMPT = `你为状态小部件总结循环跳出条件。
返回一个简洁的短语（最多6个字），说明循环应该在何时停止。
仅使用纯文本，不要引号，不要标点，不要前缀。

格式应该是 "当...时停止"、"循环直到..."、"运行至..." 或类似表达。
使用最适合该循环条件的形式。
`;

function buildPrompt(mode: LoopMode, condition?: string): string {
	switch (mode) {
		case "tests":
			return (
				"运行与当前任务或改动范围直接相关的测试；仅在项目规则或失败证据需要时扩大范围。" +
				"确认输出和退出码后，所需测试全部通过才调用 signal_loop_success；测试无法运行或存在阻塞不算成功。"
			);
		case "custom": {
			const customCondition = condition?.trim() || "满足自定义条件";
			return (
				`继续执行，直到满足以下条件：${customCondition}。` +
				"条件满足时，调用 signal_loop_success 工具。"
			);
		}
		case "self":
			return (
				"你将自主执行任务直到完成。\n\n" +
				"执行原则：\n" +
				"1. 明确识别任务范围和目标\n" +
				"2. 分步骤执行，必要时使用工具\n" +
				"3. 不自行扩大范围，也不把“必须修改文件”当作完成条件\n" +
				"4. 用户要求和可验证验收条件均满足后，调用 signal_loop_success 工具\n\n" +
				"只在现有授权内继续；若必须取得用户选择、新权限或外部状态变化，不要把阻塞标记为成功。\n" +
				"如果任务复杂，主动拆解为可验证的里程碑。"
			);
		case "debug":
			return (
				"按系统调试流程继续执行，直到用户要求的诊断或修复目标完成。\n\n" +
				"必须遵循：\n" +
				"1. 先复现或用证据确认故障，不要猜测\n" +
				"2. 沿调用链和数据流追踪根因\n" +
				"3. 诊断型请求在给出有证据的根因和影响后停止，不擅自修改\n" +
				"4. 只有用户要求修复时才做最小改动，并运行相关验证\n\n" +
				"达到本次请求的完成条件后调用 signal_loop_success 工具。"
			);
		case "tdd":
			return (
				"按 TDD 红绿重构流程继续执行，直到目标行为有测试保护且实现通过。\n\n" +
				"必须遵循：\n" +
				"1. 先写一个能证明目标行为或 bug 的失败测试\n" +
				"2. 确认测试因预期原因失败\n" +
				"3. 做最小实现让测试通过\n" +
				"4. 必要时清理代码，并保持测试通过\n\n" +
				"测试与实现均完成后调用 signal_loop_success 工具。"
			);
		case "review":
			return (
				"按代码审查流程继续执行，直到审查范围已覆盖且结论有证据。\n\n" +
				"必须遵循：\n" +
				"1. 先审查当前 diff 和相关上下文\n" +
				"2. 优先寻找 bug、回归风险、安全问题、缺失测试\n" +
				"3. 默认只报告问题、严重度和证据；只有用户明确要求时才修复\n" +
				"4. 运行能验证审查结论的最小相关检查\n\n" +
				"审查报告完成；若用户要求修复，则所需修复和验证也完成后，调用 signal_loop_success 工具。"
			);
		case "verify":
			return (
				"按验证收尾流程继续执行，直到结果被证据支持。\n\n" +
				"必须遵循：\n" +
				"1. 明确哪些命令或检查能证明任务完成\n" +
				"2. 运行相关测试、类型检查、构建或 lint\n" +
				"3. 阅读完整输出与退出码\n" +
				"4. 审查 diff，确认只包含必要改动\n\n" +
				"验证输出支持完成结论后调用 signal_loop_success 工具。"
			);
	}
}

function summarizeCondition(mode: LoopMode, condition?: string): string {
	switch (mode) {
		case "tests":
			return "测试通过";
		case "custom": {
			const summary = condition?.trim() || "自定义条件";
			return summary.length > 48 ? `${summary.slice(0, 45)}...` : summary;
		}
		case "self":
			return "完成";
		case "debug":
			return "根因修复";
		case "tdd":
			return "TDD通过";
		case "review":
			return "审查完成";
		case "verify":
			return "验证完成";
	}
}

function getConditionText(mode: LoopMode, condition?: string): string {
	switch (mode) {
		case "tests":
			return "测试通过";
		case "custom":
			return condition?.trim() || "自定义条件";
		case "self":
			return "完成";
		case "debug":
			return "根因定位、修复完成且验证通过";
		case "tdd":
			return "失败测试已补充，实现已通过测试";
		case "review":
			return "审查结论有证据；明确要求的修复已验证";
		case "verify":
			return "验证命令输出支持完成结论";
	}
}

async function selectSummaryModel(
	ctx: ExtensionContext,
): Promise<{ model: Model<Api>; apiKey: string } | null> {
	if (!ctx.model) return null;

	if (ctx.model.provider === "anthropic") {
		const haikuModel = ctx.modelRegistry.find("anthropic", HAIKU_MODEL_ID);
		if (haikuModel) {
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(haikuModel);
			if (auth.ok && auth.apiKey) {
				return { model: haikuModel, apiKey: auth.apiKey };
			}
		}
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok || !auth.apiKey) return null;
	return { model: ctx.model, apiKey: auth.apiKey };
}

async function summarizeBreakoutCondition(
	ctx: ExtensionContext,
	mode: LoopMode,
	condition?: string,
): Promise<string> {
	// 功能已禁用，直接返回本地摘要
	return Promise.resolve(summarizeCondition(mode, condition));

	/* 原来使用 AI 模型生成摘要的逻辑已禁用
	const fallback = summarizeCondition(mode, condition);
	const selection = await selectSummaryModel(ctx);
	if (!selection) return fallback;

	const conditionText = getConditionText(mode, condition);
	const userMessage: UserMessage = {
		role: "user",
		content: [{ type: "text", text: conditionText }],
		timestamp: Date.now(),
	};

	const response = await complete(
		selection.model,
		{ systemPrompt: SUMMARY_SYSTEM_PROMPT, messages: [userMessage] },
		{ apiKey: selection.apiKey },
	);

	if (response.stopReason === "aborted" || response.stopReason === "error") {
		return fallback;
	}

	const summary = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

	if (!summary) return fallback;
	return summary.length > 60 ? `${summary.slice(0, 57)}...` : summary;
	*/
}

function getCompactionInstructions(mode: LoopMode, condition?: string): string {
	const conditionText = getConditionText(mode, condition);
	return `循环进行中。跳出条件：${conditionText}。请在摘要中保留此循环状态和跳出条件。`;
}

function updateStatus(ctx: ExtensionContext, state: LoopStateData): void {
	if (!ctx.hasUI) return;
	if (!state.active || !state.mode) {
		ctx.ui.setWidget("loop", undefined);
		return;
	}
	const loopCount = state.loopCount ?? 0;
	const turnText = `(第 ${loopCount} 轮)`;
	const summary = state.summary?.trim();
	const text = summary
		? `循环进行中: ${summary} ${turnText}`
		: `循环进行中 ${turnText}`;
	ctx.ui.setWidget("loop", [ctx.ui.theme.fg("accent", text)]);
}

async function loadState(ctx: ExtensionContext): Promise<LoopStateData> {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as { type: string; customType?: string; data?: LoopStateData };
		if (entry.type === "custom" && entry.customType === LOOP_STATE_ENTRY && entry.data) {
			return entry.data;
		}
	}
	return { active: false };
}

/** Check if running in RPC mode (headless, no TUI) */
function isRpcMode(): boolean {
	return process.argv.includes("--mode") && process.argv.includes("rpc");
}

/** Notify user — falls back to console in headless (RPC) mode */
function notify(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI && ctx.ui.notify) {
		ctx.ui.notify(message, type);
	} else if (!isRpcMode()) {
		// eslint-disable-next-line no-console
		console.log(`[${type.toUpperCase()}] ${message}`);
	}
}

export default function loopExtension(pi: ExtensionAPI): void {
	let loopState: LoopStateData = { active: false };

	function persistState(state: LoopStateData): void {
		pi.appendEntry(LOOP_STATE_ENTRY, state);
	}

	function setLoopState(state: LoopStateData, ctx: ExtensionContext): void {
		loopState = state;
		persistState(state);
		updateStatus(ctx, state);
	}

	function clearLoopState(ctx: ExtensionContext): void {
		const cleared: LoopStateData = { active: false };
		loopState = cleared;
		persistState(cleared);
		updateStatus(ctx, cleared);
	}

	function breakLoop(ctx: ExtensionContext): void {
		clearLoopState(ctx);
		notify(ctx, "循环已结束", "info");
	}

	function wasLastAssistantAborted(messages: Array<{ role?: string; stopReason?: string }>): boolean {
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if (message?.role === "assistant") {
				return message.stopReason === "aborted";
			}
		}
		return false;
	}

	function triggerLoopPrompt(ctx: ExtensionContext): void {
		if (!loopState.active || !loopState.mode || !loopState.prompt) return;
		if (ctx.hasPendingMessages()) return;

		const loopCount = (loopState.loopCount ?? 0) + 1;
		loopState = { ...loopState, loopCount };
		persistState(loopState);
		updateStatus(ctx, loopState);

		pi.sendUserMessage(loopState.prompt, { deliverAs: "followUp" });
	}

	async function showLoopSelector(ctx: ExtensionContext): Promise<LoopStateData | "stop" | null> {
		const presets = loopState.active
			? [...LOOP_PRESETS].sort((a, b) => (a.value === "stop" ? -1 : b.value === "stop" ? 1 : 0))
			: LOOP_PRESETS;
		const items: SelectItem[] = presets.map((preset) => ({
			value: preset.value,
			label: preset.label,
			description: preset.description,
		}));

		const selection = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
			container.addChild(new Text(theme.fg("accent", theme.bold("选择循环模式"))));

			const selectList = new SelectList(items, Math.min(items.length, 10), {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			});

			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);

			container.addChild(selectList);
			container.addChild(new Text(theme.fg("dim", "按回车确认，按 Esc 取消")));
			container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

			return {
				render(width: number) {
					return container.render(width);
				},
				invalidate() {
					container.invalidate();
				},
				handleInput(data: string) {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		});

		if (!selection) return null;

		switch (selection) {
			case "stop":
				return "stop";
			case "tests":
				return { active: true, mode: "tests", prompt: buildPrompt("tests") };
			case "self":
				return { active: true, mode: "self", prompt: buildPrompt("self") };
			case "debug":
				return { active: true, mode: "debug", prompt: buildPrompt("debug") };
			case "tdd":
				return { active: true, mode: "tdd", prompt: buildPrompt("tdd") };
			case "review":
				return { active: true, mode: "review", prompt: buildPrompt("review") };
			case "verify":
				return { active: true, mode: "verify", prompt: buildPrompt("verify") };
			case "custom": {
				const condition = await ctx.ui.editor("输入循环跳出条件:", "");
				if (!condition?.trim()) return null;
				return {
					active: true,
					mode: "custom",
					condition: condition.trim(),
					prompt: buildPrompt("custom", condition.trim()),
				};
			}
			default:
				return null;
		}
	}

	function parseArgs(args: string | undefined): LoopStateData | "stop" | null {
		if (!args?.trim()) return null;
		const parts = args.trim().split(/\s+/);
		const mode = parts[0]?.toLowerCase();

		switch (mode) {
			case "stop":
				return "stop";
			case "tests":
				return { active: true, mode: "tests", prompt: buildPrompt("tests") };
			case "self":
				return { active: true, mode: "self", prompt: buildPrompt("self") };
			case "debug":
				return { active: true, mode: "debug", prompt: buildPrompt("debug") };
			case "tdd":
				return { active: true, mode: "tdd", prompt: buildPrompt("tdd") };
			case "review":
				return { active: true, mode: "review", prompt: buildPrompt("review") };
			case "verify":
				return { active: true, mode: "verify", prompt: buildPrompt("verify") };
			case "custom": {
				const condition = parts.slice(1).join(" ").trim();
				if (!condition) return null;
				return {
					active: true,
					mode: "custom",
					condition,
					prompt: buildPrompt("custom", condition),
				};
			}
			default:
				return null;
		}
	}

	pi.registerTool({
		name: "signal_loop_success",
		label: "标记循环成功",
		description: "仅在当前循环模式的跳出条件已由证据满足时停止循环。部分进展、失败、无法验证或等待用户输入都不算成功。",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (!loopState.active) {
				return {
					content: [{ type: "text", text: "没有正在运行的循环。" }],
					details: { active: false },
				};
			}

			clearLoopState(ctx);

			return {
				content: [{ type: "text", text: "循环已结束。" }],
				details: { active: false },
			};
		},
	});

	pi.registerCommand("loop", {
		description: "启动循环执行，直到满足跳出条件",
		handler: async (args, ctx) => {
			let nextState = parseArgs(args);
			if (!nextState) {
				if (!ctx.hasUI) {
					ctx.ui.notify("用法: /loop self | /loop debug | /loop tdd | /loop review | /loop verify | /loop tests | /loop custom <条件> | /loop stop", "warning");
					return;
				}
				nextState = await showLoopSelector(ctx);
			}

			if (!nextState) {
				ctx.ui.notify("循环已取消", "info");
				return;
			}

			if (nextState === "stop") {
				if (!loopState.active) {
					ctx.ui.notify("当前没有运行中的循环", "info");
					return;
				}
				breakLoop(ctx);
				return;
			}

			if (loopState.active) {
				const confirm = ctx.hasUI
					? await ctx.ui.confirm("替换当前循环?", "已有循环在运行，是否替换?")
					: true;
				if (!confirm) {
					ctx.ui.notify("循环未改变", "info");
					return;
				}
			}

			const summarizedState: LoopStateData = { ...nextState, summary: undefined, loopCount: 0 };
			setLoopState(summarizedState, ctx);
			ctx.ui.notify("循环已启动", "info");
			triggerLoopPrompt(ctx);

			const mode = nextState.mode!;
			const condition = nextState.condition;
			void (async () => {
				const summary = await summarizeBreakoutCondition(ctx, mode, condition);
				if (!loopState.active || loopState.mode !== mode || loopState.condition !== condition) return;
				loopState = { ...loopState, summary };
				persistState(loopState);
				updateStatus(ctx, loopState);
			})();
		},
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!loopState.active) return;

		if (ctx.hasUI && wasLastAssistantAborted(event.messages)) {
			const confirm = await ctx.ui.confirm(
				"终止当前循环?",
				"操作已中止。是否跳出循环?",
			);
			if (confirm) {
				breakLoop(ctx);
				return;
			}
		}

		triggerLoopPrompt(ctx);
	});

	pi.on("session_before_compact", async (event, ctx) => {
		if (!loopState.active || !loopState.mode || !ctx.model) return;
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
		if (!auth.ok || !auth.apiKey) return;

		const instructionParts = [event.customInstructions, getCompactionInstructions(loopState.mode, loopState.condition)]
			.filter(Boolean)
			.join("\n\n");

		try {
			const compaction = await compact(event.preparation, ctx.model, auth.apiKey, instructionParts, event.signal);
			return { compaction };
		} catch (error) {
			if (ctx.hasUI) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`循环压缩失败: ${message}`, "warning");
			}
			return;
		}
	});

	async function restoreLoopState(ctx: ExtensionContext): Promise<void> {
		loopState = await loadState(ctx);
		updateStatus(ctx, loopState);

		if (loopState.active && loopState.mode && !loopState.summary) {
			const mode = loopState.mode;
			const condition = loopState.condition;
			void (async () => {
				const summary = await summarizeBreakoutCondition(ctx, mode, condition);
				if (!loopState.active || loopState.mode !== mode || loopState.condition !== condition) return;
				loopState = { ...loopState, summary };
				persistState(loopState);
				updateStatus(ctx, loopState);
			})();
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		await restoreLoopState(ctx);
	});

	pi.on("session_switch", async (_event: SessionSwitchEvent, ctx) => {
		await restoreLoopState(ctx);
	});
}
