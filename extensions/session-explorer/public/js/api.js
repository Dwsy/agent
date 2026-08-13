/**
 * Typed-ish wrappers over the JSON API.
 *
 * Each call takes an optional AbortSignal so a superseded request (the user
 * kept typing, or clicked another session) stops instead of racing the one
 * that replaced it.
 */

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function get(path, params = {}, signal) {
  const url = new URL(path, location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetch(url, { signal, headers: { accept: "application/json" } });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(error.message, 0);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(body?.error ?? `HTTP ${response.status}`, response.status);
  }
  return body;
}

export const api = {
  status: (signal) => get("/api/status", {}, signal),
  sessions: (params, signal) => get("/api/sessions", params, signal),
  projects: (signal) => get("/api/projects", {}, signal),
  search: (params, signal) => get("/api/search", params, signal),
  session: (params, signal) => get("/api/session", params, signal),
};

export { ApiError };
