import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	Key,
	matchesKey,
	truncateToWidth,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { buildStatusReport, FEATURE_DEFINITIONS, FFF_RUNTIME_NOT_READY_TEXT, type FeatureKey } from "./extension-common.ts";
import { FffRuntime } from "./fff.ts";

export type CommandRegistrationDeps = {
	getRuntime(): FffRuntime | null;
	isFeatureEnabled(feature: FeatureKey): boolean;
	getEnabledFeatures(): Set<FeatureKey>;
	setEnabledFeatures(next: Set<FeatureKey>): void;
	persistFeatures(): Promise<void>;
	applyUiConfiguration(ctx: ExtensionContext): void;
};

export function registerCommands(pi: ExtensionAPI, deps: CommandRegistrationDeps): void {
	const requireSlashRuntime = (ctx: ExtensionContext): FffRuntime | null => {
		const runtime = deps.getRuntime();
		if (!runtime) {
			ctx.ui.notify(FFF_RUNTIME_NOT_READY_TEXT, "warning");
			return null;
		}
		return runtime;
	};

	pi.registerCommand("fff-features", {
		description: "Toggle pi-fff features on or off",
		handler: async (_args, ctx) => {
			await ctx.ui.custom((tui, theme, _kb, done) => {
				let selectedIndex = 0;
				let cachedLines: string[] | undefined;
				let rowMap: number[] = [];
				let pressedIndex: number | undefined;
				const draft = new Set<FeatureKey>(deps.getEnabledFeatures());

				const refresh = () => {
					cachedLines = undefined;
					tui.requestRender();
				};

				const toggleSelected = () => {
					const feature = FEATURE_DEFINITIONS[selectedIndex]?.id;
					if (!feature) return;
					if (draft.has(feature)) draft.delete(feature);
					else draft.add(feature);
					refresh();
				};

				return {
					render(width: number) {
						if (cachedLines) return cachedLines;
						rowMap = [];
						const lines: string[] = [];
						const add = (text: string, index = -1) => {
							lines.push(truncateToWidth(text, width));
							rowMap.push(index);
						};

						add(theme.fg("accent", theme.bold("pi-fff feature flags")));
						add(theme.fg("dim", "Space toggles • Enter saves • Esc cancels"));
						lines.push("");
						rowMap.push(-1);

						for (let i = 0; i < FEATURE_DEFINITIONS.length; i += 1) {
							const feature = FEATURE_DEFINITIONS[i]!;
							const selected = i === selectedIndex;
							const checked = draft.has(feature.id);
							const marker = checked ? "[x]" : "[ ]";
							const prefix = selected ? theme.fg("accent", "> ") : "  ";
							const label = `${marker} ${feature.label}`;
							add(selected ? `${prefix}${theme.fg("accent", label)}` : `${prefix}${theme.fg("text", label)}`, i);
							add(`    ${theme.fg("muted", feature.description)}`);
						}

						lines.push("");
						rowMap.push(-1);
						add(theme.fg("dim", `Enabled: ${Array.from(draft).length}/${FEATURE_DEFINITIONS.length}`));
						cachedLines = lines;
						return lines;
					},
					invalidate() {
						cachedLines = undefined;
					},
					handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
						if (event.type !== "wheel" || !event.wheelDelta) {
							// Not a wheel event: fall through to the press/click handling below.
						} else {
							selectedIndex = Math.max(0, Math.min(FEATURE_DEFINITIONS.length - 1, selectedIndex + event.wheelDelta));
							refresh();
							return { handled: true, render: false };
						}

						if (event.button !== "left" || (event.type !== "press" && event.type !== "click")) return undefined;
						const index = rowMap[event.y];
						if (index === undefined || index < 0) return undefined;
						if (event.type === "press") {
							pressedIndex = index;
							selectedIndex = index;
							refresh();
							return { handled: true, focus: true, render: false };
						}
						const target = pressedIndex ?? index;
						pressedIndex = undefined;
						selectedIndex = target;
						// Enter saves and closes; a click should just toggle this one flag (Space equivalent).
						toggleSelected();
						refresh();
						return { handled: true, render: false };
					},
					handleInput(data: string) {
						if (matchesKey(data, Key.up)) {
							selectedIndex = Math.max(0, selectedIndex - 1);
							refresh();
							return;
						}
						if (matchesKey(data, Key.down)) {
							selectedIndex = Math.min(FEATURE_DEFINITIONS.length - 1, selectedIndex + 1);
							refresh();
							return;
						}
						if (matchesKey(data, Key.space) || matchesKey(data, Key.left) || matchesKey(data, Key.right) || data === " ") {
							toggleSelected();
							return;
						}
						if (matchesKey(data, Key.enter)) {
							deps.setEnabledFeatures(new Set(draft));
							void deps.persistFeatures();
							deps.applyUiConfiguration(ctx);
							ctx.ui.notify(`pi-fff features saved (${Array.from(draft).length} enabled)`, "info");
							done(undefined);
							return;
						}
						if (matchesKey(data, Key.escape)) {
							ctx.ui.notify("pi-fff feature changes cancelled", "info");
							done(undefined);
						}
					},
				};
			});
		},
	});

	pi.registerCommand("reindex-fff", {
		description: "Trigger an fff rescan for the current project",
		handler: async (_args, ctx) => {
			const runtime = requireSlashRuntime(ctx);
			if (!runtime) return;
			const result = await runtime.reindex();
			if (result.isErr()) {
				ctx.ui.notify(`FFF reindex failed: ${result.error.message}`, "error");
				return;
			}
			ctx.ui.notify("FFF reindex started", "info");
		},
	});

	pi.registerCommand("fff-status", {
		description: "Show fff runtime status and index health",
		handler: async (_args, ctx) => {
			const runtime = requireSlashRuntime(ctx);
			if (!runtime) return;
			const statusResult = await runtime.getStatus();
			if (statusResult.isErr()) {
				ctx.ui.notify(`fff status failed: ${statusResult.error.message}`, "error");
				return;
			}
			const metadata = await runtime.getMetadata();
			const healthResult = await runtime.healthCheck();
			const health = healthResult.isOk() ? healthResult.value : undefined;
			const report = buildStatusReport({
				status: statusResult.value,
				health,
				metadata,
				healthError: healthResult.isErr() ? healthResult.error : null,
				features: FEATURE_DEFINITIONS.map((feature) => ({ label: feature.label, enabled: deps.isFeatureEnabled(feature.id) })),
			});
			ctx.ui.notify(report, "info");
		},
	});
}
