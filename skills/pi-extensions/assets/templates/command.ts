/**
 * 基础命令模板
 *
 * 功能：描述命令的功能
 * 触发方式：/commandname <参数>
 */

import type { ExtensionAPI, AutocompleteItem } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("{{command_name}}", {
		description: "{{命令描述}}",

		// 可选：参数自动补全
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const options = ["option1", "option2", "option3"];
			const items = options.map((e) => ({ value: e, label: e }));
			const filtered = items.filter((i) => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : null;
		},

		handler: async (args, ctx) => {
			// 检查 UI 可用性
			if (!ctx.hasUI) {
				// 非交互模式下无法使用 UI
				return;
			}

			const trimmedArgs = args.trim();

			// 无参数时显示帮助
			if (!trimmedArgs) {
				ctx.ui.notify("用法: /{{command_name}} <参数>", "warning");
				return;
			}

			// 执行命令逻辑
			try {
				// 示例：选择对话框
				const choice = await ctx.ui.select("选择操作:", [
					"查看状态",
					"执行操作",
					"取消",
				]);

				if (choice === "取消" || choice === undefined) {
					ctx.ui.notify("已取消", "info");
					return;
				}

				// 处理选择
				switch (choice) {
					case "查看状态":
						ctx.ui.notify(`当前参数: ${trimmedArgs}`, "info");
						break;
					case "执行操作":
						// 执行操作...
						ctx.ui.notify("操作完成!", "success");
						break;
				}
			} catch (error) {
				ctx.ui.notify(`错误: ${error}`, "error");
			}
		},
	});
}
