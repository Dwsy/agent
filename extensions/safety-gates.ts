import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	
  if (process.argv.includes("--mode") && process.argv.includes("rpc")) return;
  	
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const cmd = event.input.command as string;
      // 精确检测 rm 命令（作为独立命令或管道/链式命令的一部分）
      // 匹配：rm、rm -rf、sudo rm、&& rm、| rm、; rm、xargs rm、find -exec rm 等
      const rmPattern = /(^|[;&|]\s*\$\(|`)(sudo\s+)?(rm|rmdir)(\s|$)|xargs\s+(sudo\s+)?rm|-exec\s+(sudo\s+)?(rm|rmdir)/;
      if (rmPattern.test(cmd)) {
        // 检查是否在 /tmp/ 或 /var/cache/ 内（这些是例外场景）
        const isExceptionPath = /\/(tmp|var\/cache)\//.test(cmd);
        if (!isExceptionPath) {
          return {
            block: true,
            reason: "rm 命令被阻止，请使用 trash 替代",
            suggestion: "使用 trash <file> 或 trash <directory>/ 代替"
          };
        }
      }
    }
  });
}
