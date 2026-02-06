/**
 * 会话统计扩展
 *
 * 提供 /stats 命令查看会话统计信息
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("stats", {
		description: "显示会话统计信息",

		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				// 非交互模式：输出到控制台
				const entries = ctx.sessionManager.getEntries();
				console.log(`条目数: ${entries.length}`);
				return;
			}

			// 收集统计信息
			const entries = ctx.sessionManager.getEntries();
			const branch = ctx.sessionManager.getBranch();
			const leafId = ctx.sessionManager.getLeafId();

			let userMessages = 0;
			let assistantMessages = 0;
			let toolCalls = 0;

			for (const entry of entries) {
				if (entry.type === "message") {
					const msg = entry.message;
					if ("role" in msg) {
						if (msg.role === "user") userMessages++;
						if (msg.role === "assistant") assistantMessages++;
						if (msg.role === "toolResult") toolCalls++;
					}
				}
			}

			const usage = ctx.getContextUsage();

			// 格式化输出
			const lines = [
				"",
				"📊 会话统计",
				"─".repeat(30),
				`总条目: ${entries.length}`,
				`当前分支: ${branch.length}`,
				`当前叶子: ${leafId?.slice(0, 8) || "N/A"}...`,
				"",
				`用户消息: ${userMessages}`,
				`助手消息: ${assistantMessages}`,
				`工具调用: ${toolCalls}`,
			];

			if (usage) {
				lines.push(
					"",
					`Token 使用: ${usage.tokens.toLocaleString()}`,
					`上下文窗口: ${usage.contextWindow.toLocaleString()}`,
					`使用率: ${(usage.tokens / usage.contextWindow * 100).toFixed(1)}%`,
				);
			}

			lines.push("─".repeat(30), "");

			// 显示为控件
			ctx.ui.setWidget("session-stats", lines, { placement: "belowEditor" });

			// 3 秒后自动清除
			setTimeout(() => {
				ctx.ui.setWidget("session-stats", undefined);
			}, 5000);
		},
	});

	// 注册工具让 LLM 也能获取统计
	pi.registerTool({
		name: "get_session_stats",
		label: "Get Session Stats",
		description: "获取当前会话的统计信息",
		parameters: {},

		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const entries = ctx.sessionManager.getEntries();
			const usage = ctx.getContextUsage();

			return {
				content: [{
					type: "text",
					text: `会话统计:\n- 总条目: ${entries.length}\n- Token 使用: ${usage?.tokens || "N/A"}`,
				}],
				details: { entryCount: entries.length, usage },
			};
		},

		renderResult(result, _opts, theme) {
			return new Text(theme.fg("success", "✓ 已获取会话统计"), 0, 0);
		},
	});
}
