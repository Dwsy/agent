import { homedir } from "node:os";
import path from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

function normalizeUnicodeSpaces(value: string): string {
	return value.replace(UNICODE_SPACES, " ");
}

function normalizeAtPrefix(filePath: string): string {
	return filePath.startsWith("@") ? filePath.slice(1) : filePath;
}

export function expandPath(filePath: string): string {
	const normalized = normalizeUnicodeSpaces(normalizeAtPrefix(filePath));
	if (normalized === "~") {
		return homedir();
	}
	if (normalized.startsWith("~/")) {
		return homedir() + normalized.slice(1);
	}
	return normalized;
}

export function resolveUserPath(filePath: string, cwd: string): string {
	const expanded = expandPath(filePath);
	if (path.isAbsolute(expanded)) {
		return expanded;
	}
	return path.resolve(cwd, expanded);
}

export function normalizePath(value: string): string {
	return path.resolve(value);
}

export function toPosix(value: string): string {
	return value.split(path.sep).join("/");
}

export function fromPosix(value: string): string {
	return value.split("/").join(path.sep);
}

export function isWithinRoot(targetPath: string, rootPath: string): boolean {
	const relative = path.relative(rootPath, targetPath);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

export function toRelativePath(
	absolutePath: string,
	rootPath: string,
): string | null {
	if (!isWithinRoot(absolutePath, rootPath)) {
		return null;
	}
	return toPosix(path.relative(rootPath, absolutePath));
}

export function mapToSandboxPath(
	absolutePath: string,
	realRoot: string,
	sandboxRoot: string,
): string {
	if (isWithinRoot(absolutePath, sandboxRoot)) {
		return absolutePath;
	}
	if (isWithinRoot(absolutePath, realRoot)) {
		const relative = path.relative(realRoot, absolutePath);
		return path.join(sandboxRoot, relative);
	}
	return absolutePath;
}

export function mapToRealPath(
	absolutePath: string,
	realRoot: string,
	sandboxRoot: string,
): string {
	if (isWithinRoot(absolutePath, realRoot)) {
		return absolutePath;
	}
	if (isWithinRoot(absolutePath, sandboxRoot)) {
		const relative = path.relative(sandboxRoot, absolutePath);
		return path.join(realRoot, relative);
	}
	return absolutePath;
}

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceRootInText(
	text: string,
	fromRoot: string,
	toRoot: string,
): string {
	if (!text.includes(fromRoot)) {
		return text;
	}
	const pattern = new RegExp(escapeRegExp(fromRoot), "g");
	return text.replace(pattern, toRoot);
}
