import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Container, Text } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      const cmd = event.input.command as string;

      // 精确检测 rm 命令（作为独立命令或管道/链式命令的一部分）
      // 匹配：rm、rm -rf、sudo rm、&& rm、| rm、; rm 等
      const rmPattern = /(^|[;&|]\s*)(sudo\s+)?rm(\s|$)/;
      
      if (rmPattern.test(cmd)) {
        // 检查是否在 /tmp/ 或 /var/cache/ 内（这些是例外场景）
        const isExceptionPath = /\/(tmp|var\/cache)\//.test(cmd);

        if (!isExceptionPath) {
          const TIMEOUT_SECONDS = 30;
          let remainingSeconds = TIMEOUT_SECONDS;
          let timerInterval: NodeJS.Timeout | null = null;

          const result = await ctx.ui.custom<boolean>((tui, theme, _kb, done) => {
            const container = new Container();
            const titleText = new Text(theme.fg("error", theme.bold("⚠️ 危险操作！")), 1, 0);
            const warningText = new Text(
              theme.fg("warning", "检测到 rm 命令，请使用 trash 命令回收文件到垃圾桶。"),
              1, 0
            );
            const cmdText = new Text(theme.fg("muted", `命令：${cmd}`), 1, 0);
            const timerText = new Text("", 1, 0);
            const helpText = new Text(
              theme.fg("dim", "y 允许 • n 拒绝 • esc 取消"),
              1, 0
            );

            const updateTimer = () => {
              timerText.setText(
                theme.fg("accent", `⏱️  ${remainingSeconds} 秒后自动拒绝`)
              );
              tui.requestRender();
            };

            container.addChild(titleText);
            container.addChild(warningText);
            container.addChild(cmdText);
            container.addChild(timerText);
            container.addChild(helpText);

            updateTimer();

            // 启动倒计时
            timerInterval = setInterval(() => {
              remainingSeconds--;
              if (remainingSeconds <= 0) {
                if (timerInterval) clearInterval(timerInterval);
                done(false);
              } else {
                updateTimer();
              }
            }, 1000);

            return {
              render: (w) => container.render(w),
              invalidate: () => container.invalidate(),
              handleInput: (data) => {
                if (data === "y" || data === "Y") {
                  if (timerInterval) clearInterval(timerInterval);
                  done(true);
                } else if (data === "n" || data === "N" || data === "\x1b") {
                  if (timerInterval) clearInterval(timerInterval);
                  done(false);
                }
              },
            };
          });

          if (!result) {
            return {
              block: true,
              reason: "rm 命令被阻止，请使用 trash 替代",
              suggestion: "使用 trash <file> 或 trash <directory>/ 代替"
            };
          }
        }
      }
    }
  });
}