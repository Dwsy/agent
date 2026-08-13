/**
 * 循环扩展 (Loop Extension)
 *
 * 提供 /loop 命令，启动一个带跳出条件的循环。
 * 循环会在每次回合结束时发送提示，直到 Agent 调用 signal_loop_success 工具，
 * 或达到最大轮数 / 连续错误上限。
 *
 * 用法:
 *   /loop                      交互式选择循环模式 (TUI)
 *   /loop self                 自主模式
 *   /loop debug | tdd | review | verify | tests
 *   /loop custom <条件>        自定义跳出条件
 *   /loop <模式> --max 20      覆盖最大轮数（默认 50）
 *   /loop status               查看当前循环状态
 *   /loop stop                 停止循环
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { compact } from "@earendil-works/pi-coding-agent";
import { type AutocompleteItem, Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";

type LoopMode = "tests" | "custom" | "self" | "debug" | "tdd" | "review" | "verify";

type LoopStateData = {
	active: boolean;
	mode?: LoopMode;
	condition?: string;
	prompt?: string;
	loopCount?: number;
	maxLoops?: number;
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

const LOOP_MODES: readonly LoopMode[] = ["self", "debug", "tdd", "review", "verify", "tests", "custom"];

const LOOP_STATE_ENTRY = "loop-state";

/** 防失控：默认最大轮数与连续错误上限 */
const DEFAULT_MAX_LOOPS = 50;
const MAX_CONSECUTIVE_ERRORS = 3;

const USAGE_TEXT =
	"用法: /loop self | debug | tdd | review | verify | tests | custom <条件> [--max N] | status | stop";

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

/** 状态小部件用的短摘要 */
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

/** 压缩指令等场景用的完整条件描述 */
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
	const maxLoops = state.maxLoops ?? DEFAULT_MAX_LOOPS;
	const summary = summarizeCondition(state.mode, state.condition);
	const text = `循环进行中: ${summary} (第 ${loopCount}/${maxLoops} 轮)`;
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

/** 从参数中提取 --max N（或 --max=N），返回剩余参数与上限 */
function extractMaxLoops(args: string): { rest: string; maxLoops?: number } {
	const match = args.match(/--max[= ]+(\d+)/);
	if (!match) return { rest: args };
	const rest = args.replace(match[0], " ").replace(/\s+/g, " ").trim();
	const value = Number(match[1]);
	return value > 0 ? { rest, maxLoops: value } : { rest };
}

function makeState(mode: LoopMode, condition?: string, maxLoops?: number): LoopStateData {
	return {
		active: true,
		mode,
		condition,
		prompt: buildPrompt(mode, condition),
		loopCount: 0,
		maxLoops,
	};
}

function modeLabel(mode: LoopMode): string {
	return LOOP_PRESETS.find((preset) => preset.value === mode)?.label ?? mode;
}

export default function loopExtension(pi: ExtensionAPI): void {
	let loopState: LoopStateData = { active: false };
	let consecutiveErrors = 0;

	function setLoopState(state: LoopStateData, ctx: ExtensionContext): void {
		loopState = state;
		consecutiveErrors = 0;
		pi.appendEntry(LOOP_STATE_ENTRY, state);
		updateStatus(ctx, state);
	}

	function stopLoop(ctx: ExtensionContext, message: string, type: "info" | "warning" = "info"): void {
		setLoopState({ active: false }, ctx);
		ctx.ui.notify(message, type);
	}

	function lastAssistantStopReason(messages: Array<{ role?: string; stopReason?: string }>): string | undefined {
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if (message?.role === "assistant") {
				return message.stopReason;
			}
		}
		return undefined;
	}

	function triggerLoopPrompt(ctx: ExtensionContext): void {
		const prompt = loopState.prompt;
		if (!loopState.active || !loopState.mode || !prompt) return;
		if (ctx.hasPendingMessages()) return;

		const loopCount = (loopState.loopCount ?? 0) + 1;
		const maxLoops = loopState.maxLoops ?? DEFAULT_MAX_LOOPS;
		if (loopCount > maxLoops) {
			stopLoop(ctx, `循环已达最大 ${maxLoops} 轮，自动停止`, "warning");
			return;
		}

		loopState = { ...loopState, loopCount };
		pi.appendEntry(LOOP_STATE_ENTRY, loopState);
		updateStatus(ctx, loopState);

		pi.sendUserMessage(prompt, { deliverAs: "followUp" });
	}

	function showStatus(ctx: ExtensionContext): void {
		if (!loopState.active || !loopState.mode) {
			ctx.ui.notify("当前没有运行中的循环", "info");
			return;
		}
		const maxLoops = loopState.maxLoops ?? DEFAULT_MAX_LOOPS;
		const text =
			`循环进行中: ${modeLabel(loopState.mode)} · 第 ${loopState.loopCount ?? 0}/${maxLoops} 轮` +
			` · 跳出条件: ${getConditionText(loopState.mode, loopState.condition)}`;
		ctx.ui.notify(text, "info");
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
		if (selection === "stop") return "stop";

		if (selection === "custom") {
			const condition = await ctx.ui.editor("输入循环跳出条件:", "");
			if (!condition?.trim()) return null;
			return makeState("custom", condition.trim());
		}

		return makeState(selection as LoopMode);
	}

	function parseArgs(args: string): LoopStateData | "stop" | null {
		const { rest, maxLoops } = extractMaxLoops(args);
		if (!rest) return null;
		const parts = rest.split(/\s+/);
		const mode = parts[0]?.toLowerCase();

		if (mode === "stop") return "stop";

		if (mode === "custom") {
			const condition = parts.slice(1).join(" ").trim();
			if (!condition) return null;
			return makeState("custom", condition, maxLoops);
		}

		if ((LOOP_MODES as readonly string[]).includes(mode ?? "")) {
			return makeState(mode as LoopMode, undefined, maxLoops);
		}

		return null;
	}

	pi.registerTool({
		name: "signal_loop_success",
		label: "标记循环成功",
		description:
			"仅在当前循环模式的跳出条件已由证据满足时停止循环。部分进展、失败、无法验证或等待用户输入都不算成功。",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (!loopState.active) {
				return {
					content: [{ type: "text", text: "没有正在运行的循环。" }],
					details: { active: false },
				};
			}

			const rounds = loopState.loopCount ?? 0;
			setLoopState({ active: false }, ctx);
			ctx.ui.notify(`循环已完成（共 ${rounds} 轮）`, "info");

			return {
				content: [{ type: "text", text: `循环已结束（共 ${rounds} 轮）。` }],
				details: { active: false, rounds },
			};
		},
	});

	pi.registerCommand("loop", {
		description: "启动循环执行，直到满足跳出条件",
		getArgumentCompletions: (argumentPrefix): AutocompleteItem[] | null => {
			const items: AutocompleteItem[] = [
				...LOOP_PRESETS.map((preset) => ({
					value: preset.value,
					label: preset.value,
					description: preset.description,
				})),
				{ value: "status", label: "status", description: "查看当前循环状态" },
			];
			const prefix = argumentPrefix.trim().toLowerCase();
			const filtered = items.filter((item) => item.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const trimmed = args?.trim() ?? "";

			if (trimmed.toLowerCase() === "status") {
				showStatus(ctx);
				return;
			}

			let nextState = trimmed ? parseArgs(trimmed) : null;
			if (!nextState) {
				if (trimmed || ctx.mode !== "tui") {
					// 参数无法解析，或非 TUI 模式无法弹出选择器
					ctx.ui.notify(USAGE_TEXT, "warning");
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
				stopLoop(ctx, "循环已结束");
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

			setLoopState(nextState, ctx);
			ctx.ui.notify("循环已启动", "info");
			triggerLoopPrompt(ctx);
		},
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!loopState.active) return;

		const stopReason = lastAssistantStopReason(event.messages);

		if (stopReason === "aborted") {
			// 无 UI 时中止即视为用户想停下，避免和用户抢控制权
			if (!ctx.hasUI) {
				stopLoop(ctx, "操作已中止，循环已结束");
				return;
			}
			const confirm = await ctx.ui.confirm("终止当前循环?", "操作已中止。是否跳出循环?");
			if (confirm) {
				stopLoop(ctx, "循环已结束");
				return;
			}
		}

		if (stopReason === "error") {
			consecutiveErrors++;
			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
				stopLoop(ctx, `连续 ${MAX_CONSECUTIVE_ERRORS} 次出错，循环已自动停止`, "warning");
				return;
			}
		} else {
			consecutiveErrors = 0;
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

		// ProviderHeaders 中 null 表示删除该请求头，compact 只接受纯字符串值
		const headers = auth.headers
			? Object.fromEntries(Object.entries(auth.headers).filter(([, v]) => v !== null) as [string, string][])
			: undefined;

		try {
			const compaction = await compact(event.preparation, ctx.model, auth.apiKey, headers, instructionParts, event.signal);
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
		consecutiveErrors = 0;
		updateStatus(ctx, loopState);
	}

	// 会话启动/恢复/重载/fork 时恢复循环状态（此版本已无独立的 session_switch 事件）
	pi.on("session_start", async (_event, ctx) => {
		await restoreLoopState(ctx);
	});
}
