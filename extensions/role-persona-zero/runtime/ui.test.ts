import { afterEach, expect, mock, test } from "bun:test";

import { installPiAiMock, installPiCodingAgentMock, installPiTuiMock, installRoleControlCenterMock } from "../test-support.ts";

installPiTuiMock();
installPiCodingAgentMock();
installPiAiMock();
installRoleControlCenterMock();

const { isTuiAvailable } = await import("./ui.ts?fresh=1");

const originalArgv = [...process.argv];

afterEach(() => {
	process.argv.length = 0;
	process.argv.push(...originalArgv);
});

function fakeCtx(custom: unknown, hasUI = true): any {
	return { hasUI, ui: { custom } };
}

test("no UI context is not a TUI", () => {
	expect(isTuiAvailable(fakeCtx(() => undefined, false))).toBe(false);
});

test("interactive mode with ui.custom is a TUI", () => {
	expect(isTuiAvailable(fakeCtx(() => undefined))).toBe(true);
});

test("plain headless RPC (argv says rpc, no bridge) is not a TUI", () => {
	process.argv.push("--mode", "rpc");
	expect(isTuiAvailable(fakeCtx(() => undefined))).toBe(false);
});

test("grok-pi Rust TUI bridge counts as a TUI despite --mode rpc", () => {
	// grok-pi runs pi with --mode rpc but installs pi-grok-rust-tui-bridge,
	// which tags its custom() replacement with __rustTuiBridge.
	process.argv.push("--mode", "rpc");
	const bridged = (() => undefined) as ((...args: unknown[]) => unknown) & { __rustTuiBridge?: boolean };
	bridged.__rustTuiBridge = true;
	expect(isTuiAvailable(fakeCtx(bridged))).toBe(true);
});
