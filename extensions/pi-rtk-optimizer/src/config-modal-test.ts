import assert from "node:assert/strict";
import { mock } from "bun:test";

import { cloneDefaultConfig, runTest } from "./test-helpers.ts";

mock.module("@mariozechner/pi-coding-agent", () => ({
	getSettingsListTheme: () => ({}),
}));

mock.module("@mariozechner/pi-tui", () => ({
	Box: class {},
	Container: class {
		addChild(): void {}
		render(): string[] {
			return [];
		}
		invalidate(): void {}
	},
	SettingsList: class {
		handleInput(): void {}
		updateValue(): void {}
	},
	Spacer: class {},
	Text: class {},
	truncateToWidth: (text: string) => text,
	visibleWidth: (text: string) => text.length,
}));

const { registerRtkIntegrationCommand } = await import("./config-modal.ts");
const { getRtkArgumentCompletions } = await import("./command-completions.ts");

type Notification = { message: string; level: "info" | "warning" | "error" };

interface CommandContextStub {
	hasUI: boolean;
	ui: {
		notify(message: string, level: "info" | "warning" | "error"): void;
		custom<T>(): Promise<T>;
	};
}

function createNotifyContext(hasUI: boolean): { ctx: CommandContextStub; notifications: Notification[] } {
	const notifications: Notification[] = [];
	return {
		ctx: {
			hasUI,
			ui: {
				notify(message: string, level: "info" | "warning" | "error") {
					notifications.push({ message, level });
				},
				async custom<T>(): Promise<T> {
					throw new Error("custom UI should not be invoked in config-modal tests");
				},
			},
		},
		notifications,
	};
}

function lastNotification(notifications: Notification[]): Notification {
	return notifications[notifications.length - 1] as Notification;
}

runTest("command completions return top-level and filtered RTK subcommands", () => {
	const topLevel = getRtkArgumentCompletions("");
	assert.ok(Array.isArray(topLevel));
	assert.ok(topLevel.some((item) => item.value === "show"));
	assert.ok(topLevel.some((item) => item.value === "clear-stats"));

	const filtered = getRtkArgumentCompletions("st");
	assert.deepEqual(
		filtered?.map((item) => item.value),
		["stats"],
	);
	assert.equal(getRtkArgumentCompletions("show extra"), null);
	assert.equal(getRtkArgumentCompletions("zzz"), null);
});

async function runAsyncTest(name: string, testFn: () => Promise<void>): Promise<void> {
	await testFn();
	console.log(`[PASS] ${name}`);
}

await runAsyncTest("config modal command handlers route RTK subcommands to controller actions", async () => {
	const config = cloneDefaultConfig();
	const controllerState = {
		config,
		cleared: 0,
		refreshed: 0,
		lastSavedMode: "",
	};

	const controller = {
		getConfig: () => controllerState.config,
		setConfig: (next: typeof config, _ctx: unknown) => {
			controllerState.config = next;
			controllerState.lastSavedMode = next.mode;
		},
		getConfigPath: () => "C:/tmp/pi-rtk-optimizer/config.json",
		getRuntimeStatus: () => ({ rtkAvailable: false, lastError: "not found" }),
		refreshRuntimeStatus: async () => {
			controllerState.refreshed += 1;
			return { rtkAvailable: false, lastError: "not found" };
		},
		getMetricsSummary: () => "metrics summary",
		clearMetrics: () => {
			controllerState.cleared += 1;
		},
	};

	let registeredName = "";
	let definition: {
		description: string;
		getArgumentCompletions?: (argumentPrefix: string) => Array<{ value: string; label: string; description?: string }> | null;
		handler: (args: string, ctx: CommandContextStub) => Promise<void>;
	} | null = null;

	registerRtkIntegrationCommand(
		{
			registerCommand(name: string, nextDefinition: typeof definition) {
				registeredName = name;
				definition = nextDefinition;
			},
		} as never,
		controller as never,
	);

	assert.equal(registeredName, "rtk");
	assert.ok(definition !== null);
	assert.ok((definition?.description ?? "").includes("Configure RTK rewrite"));
	assert.ok(typeof definition?.getArgumentCompletions === "function");

	const infoCtx = createNotifyContext(true);
	await definition?.handler("help", infoCtx.ctx);
	assert.ok(lastNotification(infoCtx.notifications).message.includes("Usage: /rtk"));

	await definition?.handler("show", infoCtx.ctx);
	assert.ok(lastNotification(infoCtx.notifications).message.includes("mode=rewrite"));

	await definition?.handler("path", infoCtx.ctx);
	assert.equal(lastNotification(infoCtx.notifications).message, "rtk config: C:/tmp/pi-rtk-optimizer/config.json");

	await definition?.handler("verify", infoCtx.ctx);
	assert.equal(controllerState.refreshed, 1);
	assert.equal(lastNotification(infoCtx.notifications).level, "warning");
	assert.ok(lastNotification(infoCtx.notifications).message.includes("not available: not found"));

	await definition?.handler("stats", infoCtx.ctx);
	assert.equal(lastNotification(infoCtx.notifications).message, "metrics summary");

	await definition?.handler("clear-stats", infoCtx.ctx);
	assert.equal(controllerState.cleared, 1);
	assert.equal(lastNotification(infoCtx.notifications).message, "RTK metrics cleared.");

	await definition?.handler("reset", infoCtx.ctx);
	assert.equal(controllerState.lastSavedMode, "rewrite");
	assert.equal(lastNotification(infoCtx.notifications).message, "RTK integration settings reset to defaults.");

	await definition?.handler("unknown", infoCtx.ctx);
	assert.equal(lastNotification(infoCtx.notifications).level, "warning");
	assert.ok(lastNotification(infoCtx.notifications).message.includes("Usage: /rtk"));

	const headlessCtx = createNotifyContext(false);
	await definition?.handler("", headlessCtx.ctx);
	assert.equal(lastNotification(headlessCtx.notifications).message, "/rtk requires interactive TUI mode.");
});

console.log("All config-modal tests passed.");
