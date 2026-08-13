/**
 * The local HTTP server.
 *
 * Binds to 127.0.0.1 only. It reads Pi's session index and the transcript
 * files and serves the static UI; it never writes to either.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream, existsSync, realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { INDEX_PATH, SESSIONS_DIR, SessionIndex } from "./index-db.ts";
import { TranscriptCache } from "./transcript.ts";
import {
  RANGE_KEYS,
  SEARCH_SCOPES,
  SORT_KEYS,
  type RangeKey,
  type SearchScope,
  type SessionTranscript,
  type SortKey,
  type StatusResponse,
} from "./types.ts";

const VERSION = "0.1.0";

const PUBLIC_DIR = resolve(fileURLToPath(new URL("../public", import.meta.url)));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

/** Resolved once so path checks compare like with like through symlinks. */
const SESSIONS_ROOT = existsSync(SESSIONS_DIR) ? realpathSync(SESSIONS_DIR) : SESSIONS_DIR;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function intParam(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new HttpError(400, `${key} must be an integer`);
  return value;
}

/** Validate against a closed set rather than silently falling back. */
function enumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = params.get(key);
  if (raw === null || raw === "") return fallback;
  if (!allowed.includes(raw as T)) {
    throw new HttpError(400, `${key} must be one of: ${allowed.join(", ")}`);
  }
  return raw as T;
}

/**
 * Resolve a requested transcript path.
 *
 * The index is the allow-list: a path is readable only if Pi already knows
 * about it. That is stricter than a directory prefix check — arbitrary files
 * are unreachable even inside the sessions root — and it still covers the
 * Codex transcripts Pi indexes from outside that root.
 */
function resolveSessionPath(raw: string | null, index: SessionIndex): string {
  if (!raw) throw new HttpError(400, "path is required");
  if (!index.has(raw)) throw new HttpError(403, "unknown transcript");
  if (!raw.endsWith(".jsonl")) throw new HttpError(400, "not a transcript file");
  if (!existsSync(raw)) throw new HttpError(404, "transcript file is missing from disk");

  return realpathSync(raw);
}

export interface ExplorerServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export interface StartOptions {
  /** 0 picks a free port, which is the default. */
  port?: number;
  host?: string;
}

export async function startServer(options: StartOptions = {}): Promise<ExplorerServer> {
  const host = options.host ?? "127.0.0.1";
  const transcripts = new TranscriptCache();

  let index: SessionIndex | undefined;
  let indexError: string | undefined;
  try {
    index = SessionIndex.open();
  } catch (error) {
    indexError = error instanceof Error ? error.message : String(error);
  }

  /** Every route that needs data goes through here so the error is uniform. */
  const requireIndex = (): SessionIndex => {
    if (!index) {
      throw new HttpError(503, indexError ?? "Pi session index is unavailable");
    }
    return index;
  };

  const handleApi = async (pathname: string, params: URLSearchParams, res: ServerResponse): Promise<boolean> => {
    switch (pathname) {
      case "/api/status": {
        const counts = index?.counts() ?? { sessions: 0, messages: 0 };
        const body: StatusResponse = {
          ok: true,
          version: VERSION,
          sessionsDir: SESSIONS_ROOT,
          indexPath: index ? INDEX_PATH : undefined,
          indexAvailable: Boolean(index),
          indexError,
          sessionCount: counts.sessions,
          messageCount: counts.messages,
        };
        sendJson(res, 200, body);
        return true;
      }

      case "/api/sessions": {
        const db = requireIndex();
        const limit = intParam(params, "limit", 50);
        const offset = intParam(params, "offset", 0);
        const { sessions, total } = db.list({
          q: params.get("q") ?? undefined,
          cwd: params.get("cwd") ?? undefined,
          model: params.get("model") ?? undefined,
          range: enumParam<RangeKey>(params, "range", RANGE_KEYS, "all"),
          sort: enumParam<SortKey>(params, "sort", SORT_KEYS, "recent"),
          limit,
          offset,
        });
        sendJson(res, 200, { sessions, total, offset, limit });
        return true;
      }

      case "/api/projects": {
        sendJson(res, 200, { projects: requireIndex().projects() });
        return true;
      }

      case "/api/models": {
        sendJson(res, 200, { models: requireIndex().models() });
        return true;
      }

      case "/api/search": {
        const db = requireIndex();
        const q = params.get("q") ?? "";
        if (!q.trim()) throw new HttpError(400, "q is required");

        const limit = intParam(params, "limit", 40);
        const offset = intParam(params, "offset", 0);
        const scope = enumParam<SearchScope>(params, "scope", SEARCH_SCOPES, "all");
        const cwd = params.get("cwd") ?? undefined;

        const startedAt = Date.now();
        const { hits, total } = db.search({ q, scope, cwd, limit, offset });
        // Session-title matches only make sense on the first page.
        const sessions = offset === 0 && !cwd ? db.searchSessions(q) : [];

        sendJson(res, 200, { sessions, hits, total, offset, limit, tookMs: Date.now() - startedAt });
        return true;
      }

      case "/api/session": {
        const db = requireIndex();
        const requested = params.get("path");
        const path = resolveSessionPath(requested, db);
        const limit = Math.min(Math.max(intParam(params, "limit", 300), 1), 2_000);
        const offset = Math.max(intParam(params, "offset", 0), 0);

        const parsed = transcripts.get(path);
        // Look the summary up by the path the index knows, not the resolved one.
        const summary = db.get(requested as string) ?? db.get(path) ?? {
          // The file exists but Pi has not indexed it yet; show what the file says.
          id: parsed.sessionId ?? path,
          path,
          cwd: parsed.cwd ?? "",
          project: parsed.cwd?.split(sep).pop() || "—",
          name: parsed.name,
          createdAt: parsed.items[0]?.timestamp ?? "",
          modifiedAt: parsed.items[parsed.items.length - 1]?.timestamp ?? "",
          messageCount: parsed.stats.userMessages + parsed.stats.assistantMessages,
        };

        const body: SessionTranscript = {
          summary,
          format: parsed.format,
          items: parsed.items.slice(offset, offset + limit),
          outline: parsed.outline,
          total: parsed.items.length,
          offset,
          limit,
          stats: parsed.stats,
        };
        sendJson(res, 200, body);
        return true;
      }

      default:
        return false;
    }
  };

  const serveStatic = async (pathname: string, res: ServerResponse): Promise<void> => {
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    // `normalize` collapses `..`; the prefix check then rejects any escape.
    const candidate = resolve(join(PUBLIC_DIR, normalize(relative)));
    const target =
      candidate.startsWith(PUBLIC_DIR + sep) || candidate === PUBLIC_DIR
        ? candidate
        : join(PUBLIC_DIR, "index.html");

    let file = target;
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, "index.html");
    } catch {
      // Unknown paths fall back to the app shell so client routing works.
      file = join(PUBLIC_DIR, "index.html");
    }

    if (!existsSync(file)) {
      sendJson(res, 404, { error: "not found" });
      return;
    }

    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
  };

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);

        if (req.method !== "GET" && req.method !== "HEAD") {
          throw new HttpError(405, "only GET is supported");
        }

        if (url.pathname.startsWith("/api/")) {
          const handled = await handleApi(url.pathname, url.searchParams, res);
          if (!handled) throw new HttpError(404, `unknown endpoint ${url.pathname}`);
          return;
        }

        await serveStatic(url.pathname, res);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        const message = error instanceof Error ? error.message : String(error);
        if (!res.headersSent) sendJson(res, status, { error: message });
        else res.end();
      }
    })();
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(options.port ?? 0, host, () => {
      server.removeListener("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : (options.port ?? 0);

  return {
    url: `http://${host}:${port}`,
    port,
    close: () =>
      new Promise<void>((resolveClose) => {
        index?.close();
        transcripts.clear();
        server.close(() => resolveClose());
      }),
  };
}
