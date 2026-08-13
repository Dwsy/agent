import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");

const MIME: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".png": "image/png",
	".woff2": "font/woff2",
	".map": "application/json; charset=utf-8",
};

export interface StaticFile {
	body: Buffer;
	contentType: string;
}

export function getPublicDir(): string {
	return PUBLIC_DIR;
}

/** Reads a file under public/, or null when it is missing or escapes the directory. */
export function readPublicFile(urlPath: string): StaticFile | null {
	const rel = urlPath === "/" ? "index.html" : decodeSafe(urlPath).replace(/^\/+/, "");
	if (!rel) return null;

	const resolved = normalize(join(PUBLIC_DIR, rel));
	if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + sep)) return null;
	if (!existsSync(resolved) || !statSync(resolved).isFile()) return null;

	return {
		body: readFileSync(resolved),
		contentType: MIME[extname(resolved).toLowerCase()] ?? "application/octet-stream",
	};
}

/** The SPA shell served for unknown non-API paths. */
export function readPublicIndex(): StaticFile | null {
	return readPublicFile("/index.html");
}

function decodeSafe(urlPath: string): string {
	try {
		return decodeURIComponent(urlPath);
	} catch {
		return urlPath;
	}
}
