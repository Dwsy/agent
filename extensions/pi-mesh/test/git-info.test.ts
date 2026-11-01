import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveGitInfo } from "../src/git-info.ts";

// git normalizes its output to physical paths (/var -> /private/var on macOS),
// so every expectation compares against realpathSync'd locations.
const tempDirs: string[] = [];

function tempDir(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "pm-git-")));
	tempDirs.push(dir);
	return dir;
}

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "test",
			GIT_AUTHOR_EMAIL: "test@test",
			GIT_COMMITTER_NAME: "test",
			GIT_COMMITTER_EMAIL: "test@test",
		},
	}).trim();
}

function initRepo(): string {
	const repo = join(tempDir(), "repo");
	mkdirSync(repo);
	git(repo, "init", "-b", "main");
	git(repo, "commit", "--allow-empty", "-m", "init");
	return repo;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolveGitInfo", () => {
	test("non-git directory returns all-null GitInfo", () => {
		const plain = join(tempDir(), "plain");
		mkdirSync(plain);
		expect(resolveGitInfo(plain)).toEqual({
			repoRoot: null,
			branch: null,
			worktree: null,
			commonRoot: null,
		});
	});

	test("main worktree: branch, repoRoot == commonRoot", () => {
		const repo = initRepo();
		expect(resolveGitInfo(repo)).toEqual({
			repoRoot: repo,
			branch: "main",
			worktree: "main",
			commonRoot: repo,
		});
	});

	test("subdirectory resolves the same repo info", () => {
		const repo = initRepo();
		const sub = join(repo, "a", "b");
		mkdirSync(sub, { recursive: true });
		expect(resolveGitInfo(sub)).toEqual({
			repoRoot: repo,
			branch: "main",
			worktree: "main",
			commonRoot: repo,
		});
	});

	test("linked worktree: linked, repoRoot is the checkout, commonRoot shared", () => {
		const repo = initRepo();
		const wt = join(tempDir(), "wt");
		git(repo, "worktree", "add", "-b", "wt", wt);
		expect(resolveGitInfo(wt)).toEqual({
			repoRoot: wt,
			branch: "wt",
			worktree: "linked",
			commonRoot: repo,
		});
	});

	test("detached HEAD reports branch HEAD", () => {
		const repo = initRepo();
		git(repo, "checkout", "--detach");
		expect(resolveGitInfo(repo).branch).toBe("HEAD");
	});

	test("unborn branch still reports the branch name", () => {
		const repo = join(tempDir(), "unborn");
		mkdirSync(repo);
		git(repo, "init", "-b", "main");
		expect(resolveGitInfo(repo)).toEqual({
			repoRoot: repo,
			branch: "main",
			worktree: "main",
			commonRoot: repo,
		});
	});
});
