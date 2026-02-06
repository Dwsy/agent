/**
 * 权限门扩展示例
 *
 * 拦截危险命令和敏感路径访问
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// 危险命令列表
	const DANGEROUS_COMMANDS = [
		{ pattern: /rm\s+-rf\s+\//, name: "删除根目录" },
		{ pattern: /rm\s+-rf\s+~\/\./, name: "删除 home 目录配置" },
		{ pattern: />\s*\/dev\/null/, name: "重定向到 null" },
		{ pattern: /:\(\)\{\s*:\|:&\s*\};:/, name: "Fork 炸弹" },
	];

	// 敏感路径列表
	const SENSITIVE_PATHS = [
		".env",
		".env.local",
		".env.production",
		"secrets.json",
		"credentials.json",
		"private.key",
		"id_rsa",
		"node_modules/",
		".git/",
	];

	pi.on("tool_call", async (event, ctx) => {
		// 检查 bash 命令
		if (isToolCallEventType("bash", event)) {
			const cmd = event.input.command;
			if (!cmd) return;

			for (const { pattern, name } of DANGEROUS_COMMANDS) {
				if (pattern.test(cmd)) {
					const ok = await ctx.ui.confirm(
						"⚠️ 危险命令",
						`检测到: ${name}\n命令: ${cmd}\n\n允许执行?`
					);
					if (!ok) {
						return {
							block: true,
							reason: `用户拒绝执行危险命令: ${name}`,
						};
					}
				}
			}
		}

		// 检查敏感路径
		const path = event.input.path;
		if (!path) return;

		for (const sensitive of SENSITIVE_PATHS) {
			if (path.includes(sensitive)) {
				// 读取操作只警告
				if (isToolCallEventType("read", event)) {
					console.log(`[PermissionGate] 读取敏感路径: ${path}`);
					return;
				}

				// 写入/编辑操作需要确认
				const ok = await ctx.ui.confirm(
					"🔒 敏感路径",
					`正在访问: ${path}\n\n允许操作?`
				);
				if (!ok) {
					return {
						block: true,
						reason: `用户拒绝访问敏感路径: ${sensitive}`,
					};
				}
			}
		}
	});

	// 会话开始时显示提示
	pi.on("session_start", async (_event, ctx) => {
		console.log("[PermissionGate] 权限门已激活");
	});
}
