/**
 * pi-desktop-notify-bridge-extension/v1
 *
 * Minimal capability-native desktop notification bridge for Pi Desktop.
 *
 * Why this exists:
 * - Extensions should use ctx.ui.notify(...) for host-native delivery.
 * - Desktop host applies focus/background gating + deep-link metadata.
 *
 * This bridge emits one notify on agent_end:
 * - success => info
 * - run with error => error
 */
export default function (pi) {
	const MIN_INTERVAL_MS = 2000;
	let lastNotifyAt = 0;
	let runHadError = false;

	const shouldNotifyNow = () => {
		const now = Date.now();
		if (now - lastNotifyAt < MIN_INTERVAL_MS) return false;
		lastNotifyAt = now;
		return true;
	};

	const notify = (ctx, message, kind = "info") => {
		if (!ctx || !ctx.hasUI || !ctx.ui || typeof ctx.ui.notify !== "function") return;
		if (!shouldNotifyNow()) return;
		ctx.ui.notify(message, kind);
	};

	const resetRunState = () => {
		runHadError = false;
	};

	pi.on("session_start", resetRunState);
	pi.on("session_switch", resetRunState);
	pi.on("agent_start", resetRunState);
	pi.on("error", () => {
		runHadError = true;
	});
	pi.on("agent_end", (_event, ctx) => {
		if (runHadError) {
			notify(ctx, "Agent run ended with an error.", "error");
		} else {
			notify(ctx, "Agent finished its current task.", "info");
		}
		resetRunState();
	});
}
