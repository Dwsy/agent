import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event, ctx) => {
		if (!ctx.hasUI) return;
		const now = new Date();
		const timestamp = now.toLocaleString();
		ctx.ui.notify(`[${event.toolName}] ${timestamp}`, "info");
	});
}