import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
	expandPath,
	fromPosix,
	isWithinRoot,
	mapToSandboxPath,
	replaceRootInText,
	resolveUserPath,
	toPosix,
	toRelativePath,
} from "../paths.js";

test("paths utilities", () => {
	assert.equal(expandPath("~"), homedir());
	assert.equal(expandPath("~/demo"), path.join(homedir(), "demo"));

	const cwd = path.join(homedir(), "work");
	assert.equal(resolveUserPath("file.txt", cwd), path.join(cwd, "file.txt"));

	const windowsLike = `foo${path.sep}bar${path.sep}baz`;
	assert.equal(fromPosix(toPosix(windowsLike)), windowsLike);

	const root = path.join(homedir(), "project");
	const child = path.join(root, "src", "index.ts");
	assert.equal(isWithinRoot(child, root), true);
	assert.equal(toRelativePath(child, root), "src/index.ts");
	assert.equal(toRelativePath(path.join(homedir(), "other"), root), null);

	const sandbox = path.join(homedir(), "sandbox");
	assert.equal(
		mapToSandboxPath(child, root, sandbox),
		path.join(sandbox, "src", "index.ts"),
	);

	const replaced = replaceRootInText("root=ROOT/path", "ROOT", "TARGET");
	assert.equal(replaced, "root=TARGET/path");
});
