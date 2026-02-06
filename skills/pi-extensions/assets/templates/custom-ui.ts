/**
 * 自定义 UI 模板
 *
 * 功能：创建复杂的自定义交互界面
 * 使用场景：表单、向导、游戏、仪表盘
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	Editor,
	Text,
	Container,
	matchesKey,
	Key,
	truncateToWidth,
} from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("{{ui_command}}", {
		description: "打开自定义界面",

		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("需要交互模式", "error");
				return;
			}

			const result = await ctx.ui.custom<string | null>((tui, theme, keybindings, done) => {
				// 状态
				let selectedIndex = 0;
				let editMode = false;
				let inputText = "";

				// 选项
				const options = ["选项 A", "选项 B", "选项 C", "自定义输入"];

				// 编辑器（用于自定义输入模式）
				const editor = new Editor(tui, {
					borderColor: (s) => theme.fg("accent", s),
				});

				editor.onSubmit = (value) => {
					if (value.trim()) {
						done(`自定义: ${value.trim()}`);
					} else {
						editMode = false;
						tui.requestRender();
					}
				};

				// 输入处理
				function handleInput(data: string) {
					if (editMode) {
						if (matchesKey(data, Key.escape)) {
							editMode = false;
							tui.requestRender();
							return;
						}
						editor.handleInput(data);
						tui.requestRender();
						return;
					}

					if (matchesKey(data, Key.up)) {
						selectedIndex = Math.max(0, selectedIndex - 1);
						tui.requestRender();
						return;
					}

					if (matchesKey(data, Key.down)) {
						selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
						tui.requestRender();
						return;
					}

					if (matchesKey(data, Key.enter)) {
						const selected = options[selectedIndex];

						if (selected === "自定义输入") {
							editMode = true;
							tui.requestRender();
						} else {
							done(selected);
						}
						return;
					}

					if (matchesKey(data, Key.escape)) {
						done(null);
					}
				}

				// 渲染
				function render(width: number): string[] {
					const lines: string[] = [];
					const add = (s: string) => lines.push(truncateToWidth(s, width));

					// 标题
					add(theme.fg("accent", "═".repeat(width)));
					add(theme.fg("text", "  自定义界面示例"));
					add(theme.fg("accent", "═".repeat(width)));
					lines.push("");

					// 选项列表
					for (let i = 0; i < options.length; i++) {
						const opt = options[i];
						const selected = i === selectedIndex;
						const prefix = selected ? theme.fg("accent", "▸ ") : "  ";
						const text = selected
							? theme.fg("accent", opt)
							: theme.fg("text", opt);

						add(`${prefix}${text}`);
					}

					// 编辑模式
					if (editMode) {
						lines.push("");
						add(theme.fg("muted", "  输入内容:"));
						for (const line of editor.render(width - 4)) {
							add(`  ${line}`);
						}
					}

					// 帮助
					lines.push("");
					if (editMode) {
						add(theme.fg("dim", "  Enter 确认 • Esc 返回"));
					} else {
						add(theme.fg("dim", "  ↑↓ 导航 • Enter 选择 • Esc 取消"));
					}
					add(theme.fg("accent", "═".repeat(width)));

					return lines;
				}

				return {
					render,
					invalidate: () => {},
					handleInput,
				};
			});

			if (result) {
				ctx.ui.notify(`选择: ${result}`, "success");
			} else {
				ctx.ui.notify("已取消", "info");
			}
		},
	});
}
