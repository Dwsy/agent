import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// default off
	return;
	if (process.env.PI_GROK === "1") return;

	pi.on("tool_result", async (event, ctx) => {
		if (!ctx.hasUI) return;
		const now = new Date();
		const timestamp = now.toLocaleString();
		ctx.ui.notify(`[${event.toolName}] ${timestamp}`, "info");
	});
}
