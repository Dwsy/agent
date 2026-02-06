/**
 * 完整扩展示例
 *
 * 展示如何组合工具、命令、事件和 UI
 * 功能：简单的待办事项管理
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, Container, SettingsList, getSettingsListTheme } from "@mariozechner/pi-tui";

// 状态类型
interface TodoItem {
	id: string;
	text: string;
	completed: boolean;
	createdAt: number;
}

interface TodoState {
	items: TodoItem[];
}

export default function (pi: ExtensionAPI) {
	// 内存中的状态
	let todos: TodoItem[] = [];

	// ========== 状态管理 ==========

	function persistState() {
		pi.appendEntry<TodoState>("todo-state", { items: todos });
	}

	function restoreFromBranch(ctx: ExtensionContext) {
		const branchEntries = ctx.sessionManager.getBranch();

		for (const entry of branchEntries) {
			if (entry.type === "custom" && entry.customType === "todo-state") {
				const data = entry.data as TodoState | undefined;
				if (data?.items) {
					todos = data.items;
				}
			}
		}
	}

	// ========== 工具 ==========

	pi.registerTool({
		name: "todo",
		label: "Todo",
		description: "管理待办事项：列出、添加、完成、删除任务",

		parameters: Type.Object({
			action: Type.String({
				description: "操作: list, add, complete, delete",
			}),
			text: Type.Optional(Type.String({
				description: "任务内容（add 时需要）",
			})),
			id: Type.Optional(Type.String({
				description: "任务 ID（complete/delete 时需要）",
			})),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { action, text, id } = params;

			switch (action) {
				case "list": {
					if (todos.length === 0) {
						return {
							content: [{ type: "text", text: "暂无待办事项" }],
							details: { items: [] },
						};
					}

					const list = todos
						.map((t) => `${t.completed ? "✓" : "○"} ${t.text} (${t.id})`)
						.join("\n");

					return {
						content: [{ type: "text", text: list }],
						details: { items: todos },
					};
				}

				case "add": {
					if (!text?.trim()) {
						return {
							content: [{ type: "text", text: "请提供任务内容" }],
							isError: true,
						};
					}

					const newTodo: TodoItem = {
						id: Date.now().toString(36),
						text: text.trim(),
						completed: false,
						createdAt: Date.now(),
					};

					todos.push(newTodo);
					persistState();

					return {
						content: [{ type: "text", text: `添加: ${newTodo.text}` }],
						details: { items: todos },
					};
				}

				case "complete": {
					if (!id) {
						return {
							content: [{ type: "text", text: "请提供任务 ID" }],
							isError: true,
						};
					}

					const todo = todos.find((t) => t.id === id);
					if (!todo) {
						return {
							content: [{ type: "text", text: `未找到任务: ${id}` }],
							isError: true,
						};
					}

					todo.completed = !todo.completed;
					persistState();

					return {
						content: [{ type: "text", text: `${todo.completed ? "完成" : "取消完成"}: ${todo.text}` }],
						details: { items: todos },
					};
				}

				case "delete": {
					if (!id) {
						return {
							content: [{ type: "text", text: "请提供任务 ID" }],
							isError: true,
						};
					}

					const index = todos.findIndex((t) => t.id === id);
					if (index === -1) {
						return {
							content: [{ type: "text", text: `未找到任务: ${id}` }],
							isError: true,
						};
					}

					const deleted = todos.splice(index, 1)[0];
					persistState();

					return {
						content: [{ type: "text", text: `删除: ${deleted.text}` }],
						details: { items: todos },
					};
				}

				default:
					return {
						content: [{ type: "text", text: `未知操作: ${action}` }],
						isError: true,
					};
			}
		},

		renderCall(args, theme) {
			return new Text(
				theme.fg("toolTitle", theme.bold("todo ")) +
				theme.fg("muted", `${args.action}${args.text ? " " + args.text : ""}`),
				0, 0
			);
		},

		renderResult(result, { isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "处理中..."), 0, 0);
			if (result.isError) return new Text(theme.fg("error", "✗ 失败"), 0, 0);
			return new Text(theme.fg("success", "✓ 成功"), 0, 0);
		},
	});

	// ========== 命令 ==========

	pi.registerCommand("todos", {
		description: "打开待办事项管理器",

		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("需要交互模式", "error");
				return;
			}

			await ctx.ui.custom((tui, theme, _kb, done) => {
				const items = todos.map((t) => ({
					id: t.id,
					label: t.text,
					currentValue: t.completed ? "已完成" : "未完成",
					values: ["已完成", "未完成", "删除"],
				}));

				const container = new Container();

				container.addChild({
					render(_w) {
						return [theme.fg("accent", theme.bold("待办事项")), ""];
					},
					invalidate() {},
				});

				const settingsList = new SettingsList(
					items,
					Math.min(items.length + 2, 10),
					getSettingsListTheme(),
					(id, newValue) => {
						if (newValue === "删除") {
							todos = todos.filter((t) => t.id !== id);
						} else {
							const todo = todos.find((t) => t.id === id);
							if (todo) {
								todo.completed = newValue === "已完成";
							}
						}
						persistState();
						tui.requestRender();
					},
					() => done(undefined),
					(newText) => {
						// 添加新任务
						if (newText?.trim()) {
							todos.push({
								id: Date.now().toString(36),
								text: newText.trim(),
								completed: false,
								createdAt: Date.now(),
							});
							persistState();
							tui.requestRender();
						}
					}
				);

				container.addChild(settingsList);

				return {
					render(width: number) {
						return container.render(width);
					},
					invalidate() {
						container.invalidate();
					},
					handleInput(data: string) {
						settingsList.handleInput?.(data);
						tui.requestRender();
					},
				};
			});
		},
	});

	// ========== 事件 ==========

	pi.on("session_start", async (_event, ctx) => {
		restoreFromBranch(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreFromBranch(ctx);
	});

	pi.on("session_fork", async (_event, ctx) => {
		restoreFromBranch(ctx);
	});
}
