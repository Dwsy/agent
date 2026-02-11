/**
 * Declarative HTTP Router — replaces handleHttp's if-else chain with a route table.
 *
 * Design: spec §4.1 (docs/SERVER-REFACTOR-SPEC.md)
 * Phase: P2 prep (route table + dispatcher now, server.ts replacement later)
 *
 * @owner MintHawk (KeenUnion)
 */

import type { GatewayContext } from "../gateway/types.ts";

// ============================================================================
// Types
// ============================================================================

export type RouteHandler = (req: Request, url: URL, ctx: GatewayContext) => Promise<Response> | Response;

export interface Route {
  method: string;       // HTTP method (GET, POST, etc.)
  path?: string;        // Exact pathname match
  prefix?: string;      // startsWith match (for parameterized routes)
  handler: RouteHandler;
}

// ============================================================================
// Route Table
// ============================================================================
// Source: server.ts handleHttp lines ~1068-1254
//
// Routes are matched in order: plugin routes → exact match → prefix match → static files.
// Auth is handled upstream (before routing), not per-route.

export function buildRouteTable(ctx: GatewayContext): Route[] {
  return [
    // --- Health ---
    { method: "GET",  path: "/health",              handler: (_, __, c) => handleHealth(c) },
    { method: "GET",  path: "/api/health",          handler: (_, __, c) => handleHealth(c) },

    // --- Metrics ---
    { method: "GET",  path: "/api/metrics",         handler: handleMetrics },

    // --- Chat / Send ---
    { method: "POST", path: "/api/send",            handler: handleApiSend },
    { method: "POST", path: "/api/chat",            handler: handleApiChat },
    { method: "POST", path: "/api/chat/stream",     handler: handleApiChatStream },

    // --- Sessions ---
    { method: "GET",  path: "/api/sessions",        handler: handleSessionsList },
    { method: "GET",  prefix: "/api/sessions/",     handler: handleSessionDetail },
    { method: "GET",  prefix: "/api/transcript/",   handler: handleTranscript },
    { method: "GET",  path: "/api/transcripts",     handler: handleTranscriptsList },
    { method: "POST", path: "/api/session/reset",   handler: handleSessionReset },
    { method: "POST", path: "/api/session/think",   handler: handleSessionThink },
    { method: "POST", path: "/api/session/model",   handler: handleSessionModel },
    { method: "GET",  path: "/api/session/usage",   handler: handleSessionUsage },

    // --- Models ---
    { method: "GET",  path: "/api/models",          handler: handleModelsList },

    // --- Cron ---
    { method: "GET",  prefix: "/api/cron/",         handler: handleCronApi },
    { method: "POST", prefix: "/api/cron/",         handler: handleCronApi },
    { method: "DELETE", prefix: "/api/cron/",       handler: handleCronApi },
    { method: "PATCH", prefix: "/api/cron/",        handler: handleCronApi },

    // --- Memory ---
    { method: "GET",  path: "/api/memory/search",   handler: handleMemorySearch },
    { method: "GET",  path: "/api/memory/stats",    handler: handleMemoryStats },
    { method: "GET",  path: "/api/memory/roles",    handler: handleMemoryRoles },

    // --- OpenAI-compatible ---
    { method: "POST", path: "/v1/chat/completions", handler: handleOpenAICompat },

    // --- Pool ---
    { method: "GET",  path: "/api/pool",            handler: handlePoolStatus },

    // --- Plugins (no method restriction, matches server.ts behavior) ---
    { method: "GET",  path: "/api/plugins",         handler: handlePluginsList },
    { method: "POST", path: "/api/plugins",         handler: handlePluginsList },

    // --- Tools ---
    { method: "GET",  path: "/api/tools",           handler: handleToolsList },
    { method: "POST", path: "/api/tools/call",      handler: handleToolCall },

    // --- Webhooks (dynamic base path from config) ---
    { method: "POST", path: `${ctx.config.hooks?.path ?? "/hooks"}/wake`,  handler: handleWebhookWake },
    { method: "POST", path: `${ctx.config.hooks?.path ?? "/hooks"}/event`, handler: handleWebhookEvent },

    // --- Media ---
    { method: "GET",  prefix: "/api/media/",        handler: handleMediaServe },
    { method: "POST", path: "/api/media/send",      handler: handleMediaSend },
  ];
}

// ============================================================================
// Router Dispatcher
// ============================================================================

/**
 * Match a route against method + pathname.
 * Exact path match takes priority over prefix match.
 */
function matchRoute(route: Route, method: string, pathname: string): boolean {
  if (route.method !== method) return false;
  if (route.path && route.path === pathname) return true;
  if (route.prefix && pathname.startsWith(route.prefix)) return true;
  return false;
}

/**
 * Create the HTTP dispatch function.
 * Plugin routes are checked first, then built-in routes, then static files.
 */
export function createHttpRouter(ctx: GatewayContext): (req: Request, url: URL) => Promise<Response> {
  const routes = buildRouteTable(ctx);

  return async (req: Request, url: URL): Promise<Response> => {
    const method = req.method;
    const pathname = url.pathname;

    // 1. Plugin-registered HTTP routes (highest priority)
    for (const route of ctx.registry.httpRoutes) {
      if (route.method === method && pathname === route.path) {
        return route.handler(req);
      }
    }

    // 2. Built-in routes via table
    for (const route of routes) {
      if (matchRoute(route, method, pathname)) {
        return route.handler(req, url, ctx);
      }
    }

    // 3. Static files (/ and /web/*)
    if (pathname === "/" || pathname.startsWith("/web/")) {
      return serveStaticFile(pathname, ctx);
    }

    return new Response("Not Found", { status: 404 });
  };
}

// ============================================================================
// Handler Stubs
// ============================================================================
// These will be filled with implementations extracted from server.ts in P2.
// For now they serve as the contract — each matches the RouteHandler signature.
//
// Handlers already extracted to other modules:
//   - handleToolsList, handleToolCall     → gateway/tool-executor.ts
//   - handleSessionsList, handleSessionDetail, handleSessionReset → gateway/session-api.ts
//   - handleMediaServe                    → api/media-routes.ts
//   - handleMediaSend                     → api/media-send.ts

// --- Stubs for handlers still in server.ts ---

function handleHealth(ctx: GatewayContext): Response {
  return Response.json({
    status: "ok",
    pool: ctx.pool.getStats(),
    queue: ctx.queue.getStats(),
    sessions: ctx.sessions.size,
  });
}

// Placeholder types — these will be replaced with real imports in P2
const handleMetrics: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleApiSend: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleApiChat: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleApiChatStream: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleSessionsList: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleSessionDetail: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleTranscript: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleTranscriptsList: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleSessionReset: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleSessionThink: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleSessionModel: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleSessionUsage: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleModelsList: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleCronApi: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleMemorySearch: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleMemoryStats: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleMemoryRoles: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleOpenAICompat: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handlePoolStatus: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handlePluginsList: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleToolsList: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleToolCall: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleWebhookWake: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleWebhookEvent: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleMediaServe: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });
const handleMediaSend: RouteHandler = async (_req, _url, _ctx) => new Response("Not implemented", { status: 501 });

function serveStaticFile(_pathname: string, _ctx: GatewayContext): Response {
  return new Response("Not implemented", { status: 501 });
}
