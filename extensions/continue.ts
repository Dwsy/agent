import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	if (process.argv.includes("--mode") && process.argv.includes("rpc")) return;
	const continueHandler = async (ctx: ExtensionContext) => {
		if (!ctx.hasUI) {
			ctx.ui.notify("continue requires interactive mode", "error");
			return;
		}

		try {
			ctx.ui.setEditorText("继续");
			ctx.ui.notify("Sending '继续'...", "info");
			setTimeout(() => {
				pi.sendMessage(
					{ content: "继续", display: false },
					{ triggerTurn: true },
				);
			}, 100);
		} catch (error) {
			ctx.ui.notify(`Failed to continue: ${error}`, "error");
		}
	};

	pi.registerCommand("continue", {
		description: "Send '继续' to continue the conversation",
		handler: (_args, ctx) => continueHandler(ctx),
	});

	pi.registerShortcut(Key.ctrlAlt("c"), {
		description: "Send '继续' to continue the conversation (Ctrl+Option+C)",
		handler: continueHandler,
	});
}