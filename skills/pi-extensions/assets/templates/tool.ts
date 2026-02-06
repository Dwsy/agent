/**
 * 基础工具模板
 *
 * 功能：描述工具的功能
 * 使用场景：何时使用此工具
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "{{tool_name}}",
		label: "{{Tool Label}}",
		description: "{{工具功能描述，LLM 将看到此描述}}",

		parameters: Type.Object({
			action: StringEnum(["list", "add", "delete"] as const, {
				description: "要执行的操作",
			}),
			name: Type.Optional(Type.String({
				description: "项目名称",
			})),
		}),

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const { action, name } = params;

			// 检查取消信号
			if (signal?.aborted) {
				return {
					content: [{ type: "text", text: "已取消" }],
					details: { cancelled: true },
				};
			}

			// 流式更新进度
			onUpdate?.({
				content: [{ type: "text", text: "处理中..." }],
				details: { progress: 50 },
			});

			try {
				// 执行实际逻辑
				let result: string;

				switch (action) {
					case "list":
						result = "列出所有项目";
						break;
					case "add":
						result = name ? `添加项目: ${name}` : "请提供项目名称";
						break;
					case "delete":
						result = name ? `删除项目: ${name}` : "请提供项目名称";
						break;
				}

				return {
					content: [{ type: "text", text: result }],
					details: { action, name, success: true },
				};
			} catch (error) {
				return {
					content: [{ type: "text", text: `错误: ${error}` }],
					isError: true,
					details: { error: String(error) },
				};
			}
		},

		// 自定义工具调用渲染（可选）
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold(`${args.action} `));
			if (args.name) {
				text += theme.fg("muted", args.name);
			}
			return new Text(text, 0, 0);
		},

		// 自定义结果渲染（可选）
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("warning", "处理中..."), 0, 0);
			}

			if (result.isError) {
				return new Text(theme.fg("error", `✗ ${result.content[0]?.text}`), 0, 0);
			}

			return new Text(theme.fg("success", "✓ 完成"), 0, 0);
		},
	});
}
