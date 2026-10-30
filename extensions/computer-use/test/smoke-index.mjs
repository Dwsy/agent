// Smoke-test computer-use/index.ts with a mocked ExtensionAPI.
// Self-provisions peer-dependency links and fake-bridge env, then exercises
// mode switching, skill discovery, system-prompt selection, and codemode
// structuredContent (text + image blocks).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve pi's global install from the running node binary (~/.nvm/.../bin/node).
const globalNodeModules = join(dirname(dirname(process.execPath)), "lib", "node_modules");
const linkDir = join(dirname(dirname(fileURLToPath(import.meta.url))), "node_modules", "@earendil-works");
mkdirSync(linkDir, { recursive: true });
for (const name of ["pi-coding-agent", "pi-tui"]) {
	try {
		symlinkSync(join(globalNodeModules, "@earendil-works", name), join(linkDir, name), "dir");
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
	}
}

process.env.COMPUTER_USE_CLIENT_PATH ??= new URL("./fixtures/fake-computer-use.mjs", import.meta.url)
	.pathname;
process.env.COMPUTER_USE_BRIDGE_DIRECT_LAUNCH ??= "1";
// 独立 socket + 快速空闲退出：不干扰真实会话的守护进程，也不残留进程。
process.env.COMPUTER_USE_DAEMON_SOCK ??= join(
	mkdtempSync(join(tmpdir(), "cu-smoke-")),
	"daemon.sock",
);
process.env.COMPUTER_USE_DAEMON_IDLE_MS ??= "150";

// Node ≥ 22.14 strips erasable TypeScript natively; index.ts needs no transform.
const mod = await import(new URL("../index.ts", import.meta.url));

const MODE_FILE = new URL("../.mode", import.meta.url).pathname;
const SKILL_PATH = new URL("../skill", import.meta.url).pathname;
rmSync(MODE_FILE, { force: true });

const handlers = new Map();
const tools = [];
let activeTools = [];

const commands = {};
const pi = {
	registerTool: (tool) => tools.push(tool),
	on: (event, fn) => handlers.set(event, fn),
	registerCommand: (name, cmd) => (commands[name] = cmd),
	getActiveTools: () => [...activeTools],
	setActiveTools: (names) => (activeTools = names),
};

mod.default(pi);

const notify = [];
const ctx = { ui: { notify: (msg, level) => notify.push(`[${level}] ${msg}`) } };
const signal = () => new AbortController().signal;

// 1. Default startup (progressive): catalog loads, only the gateway tool registers
//    (full mode is gone), and it declares an outputSchema for codemode callers.
await handlers.get("session_start")({ reason: "startup" }, ctx);
console.log("notify:", ...notify.splice(0));
assert.ok(activeTools.includes("computer_use"));
assert.equal(tools.length, 1);
const gateway = tools[0];
assert.equal(gateway.name, "computer_use");
assert.ok(gateway.outputSchema, "gateway must declare outputSchema");

// 2. The skill is advertised in every mode (progressive prompt injection).
let res = await handlers.get("resources_discover")({ reason: "startup" }, ctx);
assert.deepEqual(res.skillPaths, [SKILL_PATH]);

// 3. Zero system-prompt injection: the skill self-routes via its frontmatter description,
//    and the tool declaration tells the agent to read the skill first.
assert.equal(handlers.get("before_agent_start"), undefined, "must not inject system prompts");
const skillText = readFileSync(`${SKILL_PATH}/SKILL.md`, "utf8");
assert.match(skillText, /Load before any mutating or risky UI action/);
assert.match(gateway.description, /Read the computer-use skill/);
assert.match(gateway.promptGuidelines.join("\n"), /Read the computer-use skill/);
assert.match(gateway.promptGuidelines.join("\n"), /Stop and ask the user before risky UI actions/);

// 4. Meta actions answer locally and expose structuredContent for codemode.
let out = await gateway.execute("tc1", { action: "action-list" }, signal());
assert.equal(out.details.metaAction, "action-list");
assert.deepEqual(
	JSON.parse(out.structuredContent.content[0].text).map((entry) => entry.action),
	["get_app_state"],
);
// 回包不再携带提示词；structuredContent 保持干净给脚本调用方。
assert.equal(out.content.length, 1, "no per-result prompt injection");
assert.equal(out.structuredContent.content.length, 1, "structuredContent stays clean for scripts");

out = await gateway.execute("tc2", { action: "action-schema", obj: { action: "get_app_state" } }, signal());
assert.equal(out.details.action, "get_app_state");

await assert.rejects(
	() => gateway.execute("tc3", { action: "nope" }, signal()),
	/Unknown action/,
);

// 5. A real action runs through the bridge; structuredContent keeps image blocks.
out = await gateway.execute("tc4", { action: "get_app_state", obj: { app: "Fake App" } }, signal());
assert.equal(out.content[0].text, "auto-approved");
assert.deepEqual(out.structuredContent.content[1], {
	type: "image",
	data: "aGVsbG8=",
	mimeType: "image/jpeg",
});
assert.equal(out.content.length, 2);
assert.equal(out.structuredContent.content.length, 2);

// 6. Switch to skill mode via command.
await commands["computer-use-mode"].handler("skill", ctx);
console.log("notify:", ...notify.splice(0));
assert.equal(readFileSync(MODE_FILE, "utf8").trim(), "skill");
assert.deepEqual(activeTools.filter((n) => n.startsWith("computer_use")), []);
res = await handlers.get("resources_discover")({ reason: "reload" }, ctx);
assert.deepEqual(res.skillPaths, [SKILL_PATH]);

// 7. Persisted mode survives a fresh extension load (simulates /reload).
const pi2 = {
	registerTool: () => {},
	on: (e, fn) => handlers.set(e + ":2", fn),
	registerCommand: () => {},
	getActiveTools: () => [],
	setActiveTools: () => {},
};
mod.default(pi2);
await handlers.get("session_start:2")({ reason: "startup" }, ctx);
res = await handlers.get("resources_discover")({ reason: "startup" }, ctx);
assert.deepEqual(res.skillPaths, [SKILL_PATH]);

// 8. Toggle cycles back to progressive; removed "full" mode reports usage instead.
await commands["computer-use-mode"].handler("", ctx);
assert.equal(readFileSync(MODE_FILE, "utf8").trim(), "progressive");
await commands["computer-use-mode"].handler("full", ctx);
assert.ok(
	notify.some((line) => line.includes("Usage: /computer-use-mode [progressive|skill|toggle|status]")),
);
await commands["computer-use-mode"].handler("status", ctx);
console.log("notify:", ...notify.splice(0));

rmSync(MODE_FILE, { force: true });
await handlers.get("session_shutdown")({}, ctx);
await handlers.get("session_shutdown:2")({}, ctx);
console.log("ALL EXTENSION SMOKE CHECKS PASSED");
