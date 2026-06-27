import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	if (process.argv.includes("--mode") && process.argv.includes("rpc")) return;

	const notify = (ctx: ExtensionContext, message: string, level: string) => {
		try {
			if (ctx.hasUI && ctx.ui?.notify) {
				ctx.ui.notify(message, level as any);
				return;
			}
		} catch {}
		pi.sendMessage(
			{ customType: "continue-notify", content: message, display: true },
			{ triggerTurn: false },
		);
	};

	const continueHandler = async (ctx: ExtensionContext) => {
		try {
			if (ctx.hasUI && ctx.ui?.setEditorText) {
				ctx.ui.setEditorText("继续");
			}
			notify(ctx, "Sending '继续'...", "info");
			setTimeout(() => {
				pi.sendMessage(
					{ content: "继续", display: false },
					{ triggerTurn: true },
				);
			}, 100);
		} catch (error) {
			notify(ctx, `Failed to continue: ${error}`, "error");
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
