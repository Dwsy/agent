/**
 * Git Commit Command - 原子化提交工具
 *
 * 将 git 提交任务交给 LLM 处理，提供专业的提交规范提示词
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const COMMIT_PROMPT = `请作为专业的软件开发助手，遵循以下步骤完成git原子化提交：

1. 变更分析阶段：
- 检查所有文件变更
- 将相关联的变更分组到同一提交
- 确保每个提交代表一个完整、独立的功能/修复

2. 提交执行阶段：
- 添加单个功能的所有相关文件：git add <文件路径>
- 创建规范的提交消息格式：
  \`\`\`
  <类型>(<范围>): <主题>

  <正文>

  <页脚>
  \`\`\`
  其中类型应为：feat|fix|docs|style|refactor|test|chore

3. 质量检查：
- 验证每个提交是否有清晰单一的目的
- 确保提交信息准确描述变更
- 检查没有未跟踪的文件遗漏

4. 批量处理：
- 如需多个原子提交，请按变更类型分组依次提交
- 确保提交之间有明确的逻辑顺序

使用 commit -F 临时文件 的形式`;

export default function (pi: ExtensionAPI) {
	pi.registerCommand("commit", {
		description: "Git 原子化提交 - 分析变更并创建规范的提交消息",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("commit requires interactive mode", "error");
				return;
			}

			// 构建提示词，包含用户提供的路径参数
			const targetPath = args.trim() || ctx.cwd;
			const prompt = `${COMMIT_PROMPT}

目标路径: ${targetPath}

请先切换到该目录，然后执行 git 提交操作。如果该路径不是 git 仓库根目录，请使用 git rev-parse --show-toplevel 找到真正的仓库根目录。`;

			// 将提示词发送给 LLM，让它自己执行 git 提交操作
			pi.sendMessage(
				{
					customType: "commit-request",
					content: prompt,
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});
}