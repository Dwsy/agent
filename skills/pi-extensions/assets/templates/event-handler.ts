/**
 * 事件处理器模板
 *
 * 功能：响应 pi 生命周期事件
 * 使用场景：权限检查、日志记录、状态管理
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// ========== 会话事件 ==========

	pi.on("session_start", async (_event, ctx) => {
		// 会话开始时的初始化
		ctx.ui.notify("扩展已加载!", "info");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		// 清理工作、保存状态
		console.log("会话结束，执行清理...");
	});

	// ========== Agent 事件 ==========

	pi.on("before_agent_start", async (event, ctx) => {
		// 在 Agent 开始前修改系统提示或注入消息
		return {
			// 注入持久消息
			message: {
				customType: "my-extension",
				content: "附加上下文信息",
				display: true,
			},
			// 修改系统提示
			systemPrompt: event.systemPrompt + "\n\n额外指令...",
		};
	});

	pi.on("agent_start", async (_event, ctx) => {
		// Agent 开始处理用户输入
		ctx.ui.setStatus("my-ext", "Agent 运行中...");
	});

	pi.on("agent_end", async (event, ctx) => {
		// Agent 完成处理
		ctx.ui.setStatus("my-ext", undefined);
	});

	// ========== 工具事件（可拦截） ==========

	pi.on("tool_call", async (event, ctx) => {
		// 检查危险命令
		if (isToolCallEventType("bash", event)) {
			const cmd = event.input.command;

			// 拦截危险命令
			if (cmd?.includes("rm -rf") || cmd?.includes("sudo ")) {
				const ok = await ctx.ui.confirm(
					"危险操作!",
					`允许执行: ${cmd}?`
				);

				if (!ok) {
					return {
						block: true,
						reason: "用户拒绝执行危险命令",
					};
				}
			}
		}

		// 检查敏感路径
		if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
			const path = event.input.path;
			const protectedPaths = [".env", ".env.local", "secrets.json"];

			if (protectedPaths.some((p) => path?.includes(p))) {
				const ok = await ctx.ui.confirm(
					"敏感文件!",
					`允许修改: ${path}?`
				);

				if (!ok) {
					return {
						block: true,
						reason: "用户拒绝修改敏感文件",
					};
				}
			}
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		// 修改工具结果（可选）
		if (event.isError) {
			// 处理错误...
		}
		// 返回修改后的结果
		// return { content: [...], details: {...} };
	});

	// ========== 输入事件 ==========

	pi.on("input", async (event, ctx) => {
		const text = event.text;

		// 快捷指令转换
		if (text.startsWith("?quick ")) {
			return {
				action: "transform",
				text: `简洁回答: ${text.slice(7)}`,
			};
		}

		// 直接处理特定输入
		if (text === "ping") {
			ctx.ui.notify("pong!", "info");
			return { action: "handled" };
		}

		// 继续正常处理
		return { action: "continue" };
	});

	// ========== 会话切换事件 ==========

	pi.on("session_before_switch", async (event, ctx) => {
		// event.reason: "new" | "resume"
		// 返回 { cancel: true } 可取消切换
	});

	pi.on("session_before_fork", async (event, ctx) => {
		// event.entryId: 分叉点的条目 ID
		// 返回 { cancel: true } 可取消
		// 返回 { skipConversationRestore: true } 不恢复对话
	});

	// ========== 压缩事件 ==========

	pi.on("session_before_compact", async (event, ctx) => {
		// 可自定义压缩行为或取消
		// return { cancel: true };
		// 或提供自定义摘要
		// return { compaction: { summary: "...", ... } };
	});
}
