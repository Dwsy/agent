/**
 * GitInfo resolution for a working directory.
 *
 * WHY: the hub groups peers by repository (branch / worktree / commonRoot), so
 * this must be cheap, synchronous, and safe to call from any session without
 * throwing git noise into the pi session.
 */
import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import type { GitInfo } from "./protocol.ts";

const EMPTY_GIT: GitInfo = { repoRoot: null, branch: null, worktree: null, commonRoot: null };

/** Run one git command, trimmed. Throws when git exits non-zero. */
function git(cwd: string, args: string[]): string {
	// stderr is discarded: "not a git repo" diagnostics must not leak anywhere.
	return execFileSync("git", ["-C", cwd, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	}).trim();
}

/**
 * Resolve GitInfo for `cwd`. Not a git repo (or git missing) -> all-null info.
 *
 * Contract gap fill: protocol.ts says commonRoot equals repoRoot "for the main
 * worktree", implying they differ for linked worktrees. The delegated spec
 * pins repoRoot = dirname(commonDir) for the main case but leaves the linked
 * case open; we fill it with `rev-parse --show-toplevel` (the worktree's own
 * checkout root), falling back to dirname(commonDir).
 */
export function resolveGitInfo(cwd: string): GitInfo {
	let gitDir: string;
	let commonDir: string;
	try {
		const out = git(cwd, ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"]);
		const [dirLine, commonLine] = out.split("\n");
		if (!dirLine || !commonLine) return { ...EMPTY_GIT };
		gitDir = dirLine.trim();
		commonDir = commonLine.trim();
	} catch {
		return { ...EMPTY_GIT };
	}

	const commonRoot = dirname(commonDir);
	const isLinked = gitDir !== commonDir && basename(commonDir) === ".git";

	let branch: string | null = null;
	try {
		branch = git(cwd, ["branch", "--show-current"]) || null;
	} catch {}
	if (!branch) {
		// Detached HEAD reports "HEAD" here; an unborn branch can throw -> "HEAD".
		try {
			branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";
		} catch {
			branch = "HEAD";
		}
	}

	let repoRoot = commonRoot;
	if (isLinked) {
		try {
			repoRoot = git(cwd, ["rev-parse", "--show-toplevel"]) || commonRoot;
		} catch {}
	}

	return {
		repoRoot,
		branch,
		worktree: isLinked ? "linked" : "main",
		commonRoot,
	};
}
