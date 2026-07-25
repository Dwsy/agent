/** Shared GAPP host control plane — single port, multipath routes. */

export const GAPP_HOST_PORT = Number(process.env.GAPP_HOST_PORT || 54888);
export const GAPP_HOST_BIND = process.env.GAPP_HOST_BIND || "127.0.0.1";
export const GAPP_HOST_BASE =
  process.env.GAPP_HOST_BASE || `http://${GAPP_HOST_BIND}:${GAPP_HOST_PORT}`;

/** URL path prefix (versioned). All routes hang under this on :54888. */
export const GAPP_HTTP_PREFIX = "/v1/gapp";

export const GAPP_PATHS = {
  health: "/health",
  root: GAPP_HTTP_PREFIX,
  sessions: `${GAPP_HTTP_PREFIX}/sessions`,
  session: (sessionId: string) => `${GAPP_HTTP_PREFIX}/sessions/${encodeURIComponent(sessionId)}`,
  leases: `${GAPP_HTTP_PREFIX}/leases`,
  lease: (appId: string) => `${GAPP_HTTP_PREFIX}/leases/${encodeURIComponent(appId)}`,
  apps: `${GAPP_HTTP_PREFIX}/apps`,
  app: (appId: string) => `${GAPP_HTTP_PREFIX}/apps/${encodeURIComponent(appId)}`,
  tools: (appId: string) => `${GAPP_HTTP_PREFIX}/apps/${encodeURIComponent(appId)}/tools`,
  call: (appId: string) => `${GAPP_HTTP_PREFIX}/apps/${encodeURIComponent(appId)}/call`,
  rpc: (appId: string) => `${GAPP_HTTP_PREFIX}/apps/${encodeURIComponent(appId)}/rpc`,
  state: (appId: string) => `${GAPP_HTTP_PREFIX}/apps/${encodeURIComponent(appId)}/state`,
  events: (appId: string) => `${GAPP_HTTP_PREFIX}/apps/${encodeURIComponent(appId)}/events`,
  generate: (appId: string) => `${GAPP_HTTP_PREFIX}/apps/${encodeURIComponent(appId)}/generate`,
  generateJob: (appId: string, requestId: string) =>
    `${GAPP_HTTP_PREFIX}/apps/${encodeURIComponent(appId)}/generate/${encodeURIComponent(requestId)}`,
} as const;

export const TOOL_CALL_TIMEOUT_MS = 15_000;
export const GENERATE_TIMEOUT_MS = 120_000;
export const EVENT_DEBOUNCE_MS = 2_000;
