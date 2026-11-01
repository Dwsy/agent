/**
 * `/mesh web` contract — the slash command must delegate to the shared
 * src/webui.ts opener instead of only printing the URL. Static assertions keep
 * this cheap; the import smoke test is the behavioural half (it needs
 * src/webui.ts, owned by the WebUI-core lane).
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const src = readFileSync(join(root, "src/command.ts"), "utf8");

// Slice the web branch so a lookalike elsewhere in the file cannot satisfy it.
const branchStart = src.indexOf('if (args.trim() === "web") {');
const branchEnd = src.indexOf("if (!ctx.hasUI)");
const webBranch = branchStart === -1 || branchEnd === -1 ? "" : src.slice(branchStart, branchEnd);

test("command imports openWebUi from the shared webui module", () => {
	expect(src).toContain('import { openWebUi } from "./webui.ts";');
});

test("web branch opens the WebUI via openWebUi(home)", () => {
	expect(webBranch).not.toBe("");
	expect(webBranch).toContain("await openWebUi({ home: os.homedir() })");
	expect(webBranch).toContain("return;");
});

test("web branch surfaces result.message on both ok and warning paths", () => {
	expect(webBranch).toContain("if (result.ok) ctx.ui.notify(result.message);");
	expect(webBranch).toContain('else ctx.ui.notify(result.message, "warning");');
});

test("old print-only URL behaviour is gone from the web branch", () => {
	expect(webBranch).not.toContain("http://127.0.0.1:5210");
	expect(webBranch).not.toContain("pi-mesh WebUI:");
	expect(src).not.toContain('ctx.ui.notify("pi-mesh WebUI: http://127.0.0.1:5210")');
});

test("command module imports cleanly (requires src/webui.ts)", async () => {
	const mod = await import("../src/command.ts");
	expect(typeof mod.registerMeshCommand).toBe("function");
});

// pi-tui's editor reads `item.value.startsWith(prefix)`; a label-only item crashes
// the whole process (uncaughtException) while the user types `/mesh w`.
test("argument completions carry value, not only label", async () => {
	const { registerMeshCommand } = await import("../src/command.ts");
	let command: { getArgumentCompletions?: (prefix: string) => unknown } | undefined;
	registerMeshCommand({
		registerCommand: (_name: string, def: unknown) => {
			command = def as typeof command;
		},
	} as never);

	expect(command?.getArgumentCompletions).toBeTypeOf("function");
	expect(command?.getArgumentCompletions?.("w")).toEqual([{ value: "web", label: "web" }]);
	expect(command?.getArgumentCompletions?.("")).toEqual([
		{ value: "status", label: "status" },
		{ value: "web", label: "web" },
	]);
});
