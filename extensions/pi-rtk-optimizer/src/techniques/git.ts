import { matchesCommandPatterns, normalizeCommandForDetection } from "./command-detection.js";

const GIT_COMMAND_PATTERNS = [/^git\s+(diff|status|log|show|stash)\b/] as const;
const RAW_GIT_DIFF_PATTERN = /^diff --git /m;
const RAW_GIT_STATUS_PATTERN = /^(?:## |(?:M|A|D|R|C|U|\?| )\S)/m;

export function isGitCommand(command: string | undefined | null): boolean {
	return matchesCommandPatterns(command, GIT_COMMAND_PATTERNS);
}

export function compactDiff(output: string, maxLines = 50): string {
	const lines = output.split("\n");
	const result: string[] = [];
	let currentFile = "";
	let added = 0;
	let removed = 0;
	let inHunk = false;
	let hunkLines = 0;
	const maxHunkLines = 10;

	for (const line of lines) {
		if (result.length >= maxLines) {
			result.push("\n... (more changes truncated)");
			break;
		}

		if (line.startsWith("diff --git")) {
			if (currentFile && (added > 0 || removed > 0)) {
				result.push(`  +${added} -${removed}`);
			}

			const match = line.match(/diff --git a\/(.+) b\/(.+)/);
			currentFile = match?.[2] ?? "unknown";
			result.push(`\n> ${currentFile}`);
			added = 0;
			removed = 0;
			inHunk = false;
			continue;
		}

		if (line.startsWith("@@")) {
			inHunk = true;
			hunkLines = 0;
			const hunkInfo = line.match(/@@ .+ @@/)?.[0] ?? "@@";
			result.push(`  ${hunkInfo}`);
			continue;
		}

		if (!inHunk) {
			continue;
		}

		if (line.startsWith("+") && !line.startsWith("+++")) {
			added++;
			if (hunkLines < maxHunkLines) {
				result.push(`  ${line}`);
				hunkLines++;
			}
		} else if (line.startsWith("-") && !line.startsWith("---")) {
			removed++;
			if (hunkLines < maxHunkLines) {
				result.push(`  ${line}`);
				hunkLines++;
			}
		} else if (hunkLines < maxHunkLines && !line.startsWith("\\")) {
			if (hunkLines > 0) {
				result.push(`  ${line}`);
				hunkLines++;
			}
		}

		if (hunkLines === maxHunkLines) {
			result.push("  ... (truncated)");
			hunkLines++;
		}
	}

	if (currentFile && (added > 0 || removed > 0)) {
		result.push(`  +${added} -${removed}`);
	}

	return result.join("\n");
}

interface StatusStats {
	staged: number;
	modified: number;
	untracked: number;
	conflicts: number;
	stagedFiles: string[];
	modifiedFiles: string[];
	untrackedFiles: string[];
}

export function compactStatus(output: string): string {
	const lines = output.split("\n");

	if (lines.length === 0 || (lines.length === 1 && lines[0]?.trim() === "")) {
		return "Clean working tree";
	}

	const stats: StatusStats = {
		staged: 0,
		modified: 0,
		untracked: 0,
		conflicts: 0,
		stagedFiles: [],
		modifiedFiles: [],
		untrackedFiles: [],
	};

	let branchName = "";

	for (const line of lines) {
		if (line.startsWith("##")) {
			const match = line.match(/## (.+)/);
			if (match?.[1]) {
				branchName = match[1].split("...")[0] ?? match[1];
			}
			continue;
		}

		if (line.length < 3) {
			continue;
		}

		const status = line.slice(0, 2);
		const filename = line.slice(3);
		const indexStatus = status[0];
		const worktreeStatus = status[1];

		if (["M", "A", "D", "R", "C"].includes(indexStatus)) {
			stats.staged++;
			stats.stagedFiles.push(filename);
		}

		if (indexStatus === "U") {
			stats.conflicts++;
		}

		if (["M", "D"].includes(worktreeStatus)) {
			stats.modified++;
			stats.modifiedFiles.push(filename);
		}

		if (status === "??") {
			stats.untracked++;
			stats.untrackedFiles.push(filename);
		}
	}

	let result = `Branch: ${branchName}\n`;

	if (stats.staged > 0) {
		result += `Staged: ${stats.staged} files\n`;
		for (const file of stats.stagedFiles.slice(0, 5)) {
			result += `  ${file}\n`;
		}
		if (stats.staged > 5) {
			result += `  ... +${stats.staged - 5} more\n`;
		}
	}

	if (stats.modified > 0) {
		result += `Modified: ${stats.modified} files\n`;
		for (const file of stats.modifiedFiles.slice(0, 5)) {
			result += `  ${file}\n`;
		}
		if (stats.modified > 5) {
			result += `  ... +${stats.modified - 5} more\n`;
		}
	}

	if (stats.untracked > 0) {
		result += `Untracked: ${stats.untracked} files\n`;
		for (const file of stats.untrackedFiles.slice(0, 3)) {
			result += `  ${file}\n`;
		}
		if (stats.untracked > 3) {
			result += `  ... +${stats.untracked - 3} more\n`;
		}
	}

	if (stats.conflicts > 0) {
		result += `Conflicts: ${stats.conflicts} files\n`;
	}

	return result.trim();
}

export function compactLog(output: string, limit = 20): string {
	const lines = output.split("\n");
	const result: string[] = [];

	for (const line of lines.slice(0, limit)) {
		if (line.length > 80) {
			result.push(`${line.slice(0, 77)}...`);
		} else {
			result.push(line);
		}
	}

	if (lines.length > limit) {
		result.push(`... and ${lines.length - limit} more commits`);
	}

	return result.join("\n");
}

export function compactGitOutput(output: string, command: string | undefined | null): string | null {
	if (!isGitCommand(command)) {
		return null;
	}

	const normalized = normalizeCommandForDetection(command);
	if (!normalized) {
		return null;
	}

	if (normalized.startsWith("git diff")) {
		return RAW_GIT_DIFF_PATTERN.test(output) ? compactDiff(output) : null;
	}
	if (normalized.startsWith("git status")) {
		return RAW_GIT_STATUS_PATTERN.test(output) ? compactStatus(output) : null;
	}
	if (normalized.startsWith("git log")) {
		return compactLog(output);
	}

	return null;
}
