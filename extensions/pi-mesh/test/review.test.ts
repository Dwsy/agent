import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildReview,
	buildReviewFromText,
	buildTree,
	canonicalizeReviewPath,
	displayReviewPath,
	handleReviewRequest,
	normalizeReviewPath,
	resolveFileTreeDisplayPaths,
} from "../src/hub/review.ts";

const FIXTURE = join(import.meta.dir, "fixtures", "review-session.jsonl");

function tmpSession(lines: unknown[]): string {
	const home = mkdtempSync(join(tmpdir(), "pi-mesh-review-"));
	const file = join(home, "session.jsonl");
	writeFileSync(file, lines.map(l => JSON.stringify(l)).join("\n") + "\n");
	return file;
}

describe("buildReview", () => {
	test("extracts file list with statuses (noise entries ignored)", async () => {
		const review = await buildReview(FIXTURE);
		// 3 changed files, sorted by path; model_change + user message add nothing
		expect(review.files.map(f => f.path)).toEqual(["README.md", "src/app.ts", "src/newfile.ts"]);
		expect(review.files.map(f => f.status)).toEqual(["modified", "modified", "added"]);
	});

	test("write becomes a whole-file add hunk", async () => {
		const review = await buildReview(FIXTURE);
		const file = review.files.find(f => f.path === "src/newfile.ts")!;
		expect(file.hunks.length).toBe(1);
		const hunk = file.hunks[0]!;
		expect(hunk.toolName).toBe("write");
		expect(hunk.oldText).toBe("");
		expect(hunk.newText).toBe("export const a = 1;\nexport const b = 2;\n");
		// unified-diff hunk content: old side empty, new lines prefixed with +
		expect(hunk.patch).toContain("@@");
		expect(hunk.patch).toContain("+export const a = 1;");
		expect(hunk.patch).toContain("+export const b = 2;");
		expect(hunk.patch).not.toContain("-export");
		expect(hunk.additions).toBe(2);
		expect(hunk.deletions).toBe(0);
		expect(file.additions).toBe(2);
		expect(file.deletions).toBe(0);
	});

	test("consecutive edits to one file dedupe into one ReviewFile with ordered hunks", async () => {
		const review = await buildReview(FIXTURE);
		const file = review.files.find(f => f.path === "src/app.ts")!;
		expect(file.hunks.length).toBe(2);
		expect(file.toolCalls.length).toBe(2);
		// hunk old/new content, in timestamp order (edit1 -> edit2)
		expect(file.hunks[0]!.oldText).toBe("foo");
		expect(file.hunks[0]!.newText).toBe("bar");
		expect(file.hunks[1]!.oldText).toBe("baz");
		expect(file.hunks[1]!.newText).toBe("qux");
		// unified-diff content for each hunk
		expect(file.hunks[0]!.patch).toContain("-foo");
		expect(file.hunks[0]!.patch).toContain("+bar");
		expect(file.hunks[1]!.patch).toContain("-baz");
		expect(file.hunks[1]!.patch).toContain("+qux");
		// timestamps ascending across deduped hunks
		expect(file.hunks[0]!.timestamp < file.hunks[1]!.timestamp).toBe(true);
		expect(file.additions).toBe(2);
		expect(file.deletions).toBe(2);
		// file-level patch concatenates both hunk patches in order
		expect(file.patch.indexOf("+bar")).toBeLessThan(file.patch.indexOf("-baz"));
	});

	test("tree nests directories and lists files at their nodes", async () => {
		const review = await buildReview(FIXTURE);
		expect(review.tree.name).toBe("");
		expect(review.tree.files.map(f => f.name)).toEqual(["README.md"]);
		expect(review.tree.dirs.map(d => d.name)).toEqual(["src"]);
		const src = review.tree.dirs[0]!;
		expect(src.path).toBe("src");
		expect(src.files.map(f => f.path)).toEqual(["src/app.ts", "src/newfile.ts"]);
		expect(src.files.map(f => f.status)).toEqual(["modified", "added"]);
		expect(src.files[0]!.additions).toBe(2);
		expect(src.files[1]!.additions).toBe(2);
	});

	test("stats aggregate files, hunks, tool calls, status counts and shell notes", async () => {
		const review = await buildReview(FIXTURE);
		expect(review.stats.files).toBe(3);
		expect(review.stats.hunks).toBe(4);
		expect(review.stats.toolCalls).toBe(4);
		expect(review.stats.additions).toBe(5); // 2 (write) + 2 (app.ts) + 1 (README)
		expect(review.stats.deletions).toBe(3); // 2 (app.ts) + 1 (README)
		expect(review.stats.byStatus).toEqual({ added: 1, modified: 2, deleted: 0, renamed: 0 });
		expect(review.stats.shell).toBe(1);
		// bash op is an external note, not a file change
		expect(review.shell.length).toBe(1);
		expect(review.shell[0]!.command).toBe("npm test echo done"); // whitespace-collapsed
		expect(review.shell[0]!.isError).toBe(false);
		expect(review.files.some(f => f.path.includes("npm"))).toBe(false);
	});
});

describe("review helpers", () => {
	test("normalizeReviewPath strips the session cwd and source-root markers", () => {
		expect(normalizeReviewPath("/work/demo/src/app.ts", "/work/demo")).toBe("src/app.ts");
		expect(normalizeReviewPath("/work/demo/README.md", "/work/demo")).toBe("README.md");
		expect(normalizeReviewPath("C:\\repo\\src\\main\\java\\A.java")).toBe("C:/repo/src/main/java/A.java");
		expect(normalizeReviewPath("  ")).toBe("");
	});

	test("canonical identity resolves absolute and relative paths without collapsing monorepo packages", () => {
		const cwd = "/repo";
		const absolute = canonicalizeReviewPath("/repo/packages/a/src/index.ts", cwd);
		const relative = canonicalizeReviewPath("packages/a/src/index.ts", cwd);
		const otherPackage = canonicalizeReviewPath("packages/b/src/index.ts", cwd);
		expect(absolute).toBe("/repo/packages/a/src/index.ts");
		expect(relative).toBe(absolute);
		expect(otherPackage).not.toBe(absolute);
		expect(displayReviewPath(absolute, cwd)).toBe("packages/a/src/index.ts");
		expect(displayReviewPath(otherPackage, cwd)).toBe("packages/b/src/index.ts");
	});

	test("absolute and relative tool paths merge to one file while same-basename packages stay distinct", () => {
		const message = (id: string, path: string, name = "edit") => ({
			type: "message", id, timestamp: `2026-10-01T11:00:0${id}Z`, parentId: null,
			message: { role: "assistant", content: [{
				type: "toolCall", id: `tc-${id}`, name,
				arguments: name === "write" ? { path, content: "new line\\n" } : { path, old_string: "old", new_string: "new" },
			}] },
		});
		const result = (id: string) => ({
			type: "message", id: `r-${id}`, timestamp: `2026-10-01T11:01:0${id}Z`, parentId: `m-${id}`,
			message: { role: "toolResult", toolCallId: `tc-${id}`, toolName: "edit", content: [], isError: false },
		});
		const raw = [
			JSON.stringify({ type: "session", cwd: "/repo" }),
			JSON.stringify(message("1", "/repo/packages/a/src/index.ts")),
			JSON.stringify(result("1")),
			JSON.stringify(message("2", "packages/a/src/index.ts")),
			JSON.stringify(result("2")),
			JSON.stringify(message("3", "/repo/packages/b/src/index.ts")),
			JSON.stringify(result("3")),
		].join("\n");
		const review = buildReviewFromText(raw);
		expect(review.files).toHaveLength(2);
		const a = review.files.find(file => file.displayPath === "packages/a/src/index.ts")!;
		const b = review.files.find(file => file.displayPath === "packages/b/src/index.ts")!;
		expect(a.fileKey).toBe("/repo/packages/a/src/index.ts");
		expect(a.hunks).toHaveLength(2);
		expect(a.sourcePaths).toContain("/repo/packages/a/src/index.ts");
		expect(a.sourcePaths).toContain("packages/a/src/index.ts");
		expect(b.fileKey).toBe("/repo/packages/b/src/index.ts");
		expect(review.tree.dirs.map(dir => dir.name)).toEqual(["packages"]);
		expect(review.tree.dirs[0]!.dirs.map(dir => dir.name)).toEqual(["a", "b"]);
	});

	test("failed and pending tool results are visible but excluded from successful line totals", () => {
		const call = (id: string, path: string) => JSON.stringify({
			type: "message", id: `m-${id}`, timestamp: `2026-10-01T11:00:0${id}Z`, parentId: null,
			message: { role: "assistant", content: [{ type: "toolCall", id: `tc-${id}`, name: "write", arguments: { path, content: "line\\n" } }] },
		});
		const result = (id: string, isError: boolean) => JSON.stringify({
			type: "message", id: `r-${id}`, timestamp: `2026-10-01T11:01:0${id}Z`, parentId: `m-${id}`,
			message: { role: "toolResult", toolCallId: `tc-${id}`, toolName: "write", content: [], isError },
		});
		const review = buildReviewFromText([
			JSON.stringify({ type: "session", cwd: "/repo" }),
			call("1", "ok.ts"), result("1", false),
			call("2", "failed.ts"), result("2", true),
			call("3", "pending.ts"),
		].join("\n"));
		expect(review.stats.toolCalls).toBe(3);
		expect(review.stats.successfulToolCalls).toBe(1);
		expect(review.stats.failedToolCalls).toBe(1);
		expect(review.stats.pendingToolCalls).toBe(1);
		expect(review.stats.successfulHunks).toBe(1);
		expect(review.stats.failedHunks).toBe(1);
		expect(review.stats.pendingHunks).toBe(1);
		expect(review.stats.additions).toBe(1);
		expect(review.stats.deletions).toBe(0);
		expect(review.files.find(file => file.path === "failed.ts")!.additions).toBe(0);
		expect(review.files.find(file => file.path === "pending.ts")!.additions).toBe(0);
		expect(review.files.find(file => file.path === "failed.ts")!.hunks[0]!.outcome).toBe("failed");
		expect(review.files.find(file => file.path === "pending.ts")!.hunks[0]!.outcome).toBe("pending");
	});

	test("resolveFileTreeDisplayPaths disambiguates file/directory prefix collisions", () => {
		const display = resolveFileTreeDisplayPaths(["payment-core/foo.ts", "payment-core"]);
		expect(display.get("payment-core")).toBe("payment-core (file)");
		expect(display.get("payment-core/foo.ts")).toBe("payment-core/foo.ts");
	});

	test("multi_edit pairs become one hunk per old/new pair", () => {
		const raw = JSON.stringify({
			type: "message",
			id: "m1",
			parentId: null,
			timestamp: "2026-10-01T11:00:00.000Z",
			message: {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc-multi",
						name: "multi_edit",
						arguments: {
							path: "a.ts",
							edits: [
								{ old_string: "one", new_string: "two" },
								{ old_string: "three", new_string: "four" },
							],
						},
					},
				],
			},
		});
		const review = buildReviewFromText(raw);
		expect(review.files.length).toBe(1);
		expect(review.files[0]!.hunks.map(h => h.oldText)).toEqual(["one", "three"]);
		expect(review.files[0]!.toolCalls.length).toBe(1); // deduped per call
		expect(review.stats.hunks).toBe(2);
	});

	test("toolResult details.patch hints map to deleted/renamed statuses", () => {
		const call = (id: string, path: string) => ({
			type: "message",
			id,
			parentId: null,
			timestamp: "2026-10-01T11:00:00.000Z",
			message: {
				role: "assistant",
				content: [{ type: "toolCall", id: `tc-${id}`, name: "edit", arguments: { path, old_string: "x", new_string: "y" } }],
			},
		});
		const result = (id: string, patch: string) => ({
			type: "message",
			id: `${id}r`,
			parentId: null,
			timestamp: "2026-10-01T11:00:01.000Z",
			message: { role: "toolResult", toolCallId: `tc-${id}`, toolName: "edit", content: [], isError: false, details: { patch } },
		});
		const review = buildReviewFromText(
			[
				JSON.stringify(call("d1", "gone.ts")),
				JSON.stringify(result("d1", "--- gone.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n")),
				JSON.stringify(call("r1", "moved.ts")),
				JSON.stringify(result("r1", "rename from old.ts\nrename to moved.ts\n")),
			].join("\n"),
		);
		const byPath = new Map(review.files.map(f => [f.path, f.status]));
		expect(byPath.get("gone.ts")).toBe("deleted");
		expect(byPath.get("moved.ts")).toBe("renamed");
	});

	test("buildTree works standalone and sorts dirs before files", () => {
		const review = buildReviewFromText(
			[
				JSON.stringify({
					type: "message",
					id: "z1",
					parentId: null,
					timestamp: "2026-10-01T11:00:00.000Z",
					message: {
						role: "assistant",
						content: [
							{ type: "toolCall", id: "tc-z1", name: "write", arguments: { path: "b.txt", content: "hi\n" } },
							{ type: "toolCall", id: "tc-z2", name: "write", arguments: { path: "a/z.txt", content: "hi\n" } },
						],
					},
				}),
			].join("\n"),
		);
		const tree = buildTree(review.files);
		expect(tree.dirs.map(d => d.name)).toEqual(["a"]);
		expect(tree.files.map(f => f.name)).toEqual(["b.txt"]);
	});
});

describe("handleReviewRequest", () => {
	test("returns structured data for an existing session file", async () => {
		const out = await handleReviewRequest(FIXTURE);
		expect(out.ok).toBe(true);
		if (out.ok) {
			expect(out.data.files.length).toBe(3);
			expect(out.data.stats.files).toBe(3);
		}
	});

	test("missing file returns ok:false with an error", async () => {
		const out = await handleReviewRequest("/nonexistent/definitely-missing-session.jsonl");
		expect(out.ok).toBe(false);
		if (!out.ok) {
			expect(out.error).toContain("cannot read review session");
		}
	});
});
