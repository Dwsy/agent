/**
 * Config Validation API Endpoint
 *
 * HTTP endpoint for validating gateway configuration.
 */

import type { Config } from "../core/config.ts";
import { validateConfig, type ValidationResult } from "../core/config-validator.ts";

export interface ValidateResponse {
  ok: boolean;
  valid: boolean;
  summary: {
    errors: number;
    warnings: number;
    info: number;
    total: number;
  };
  issues: Array<{
    path: string;
    message: string;
    severity: "error" | "warning" | "info";
    suggestion?: string;
  }>;
}

const MAX_BODY_SIZE = 100 * 1024; // 100KB limit

/**
 * Handle config validation request
 * @param req - HTTP request
 * @param authToken - Optional auth token for validation (from gateway config)
 */
export async function handleValidateRequest(
  req: Request,
  authToken?: string
): Promise<Response> {
  // Check auth if token is configured
  if (authToken) {
    const reqToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (reqToken !== authToken) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return Response.json(
      { error: "Method not allowed", allowed: ["GET", "POST"] },
      { status: 405 }
    );
  }

  let config: Config;

  if (req.method === "POST") {
    // Check content length
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_SIZE) {
      return Response.json(
        { error: "Request body too large", max: MAX_BODY_SIZE },
        { status: 413 }
      );
    }

    // Validate provided config
    try {
      const body = await req.json();
      if (!body || typeof body !== "object") {
        return Response.json(
          { error: "Invalid request body: expected config object" },
          { status: 400 }
        );
      }
      config = body as Config;
    } catch (err) {
      return Response.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
  } else {
    // GET: validate current loaded config (passed via context in real implementation)
    return Response.json(
      { error: "GET not implemented: use POST with config body" },
      { status: 501 }
    );
  }

  // Run validation
  const result = await validateConfig(config);
  const response: ValidateResponse = {
    ok: true,
    valid: result.valid,
    summary: {
      errors: result.stats.error,
      warnings: result.stats.warning,
      info: result.stats.info,
      total: result.issues.length,
    },
    issues: result.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
      severity: issue.severity,
      suggestion: issue.suggestion,
    })),
  };

  const status = result.valid ? 200 : 422;
  return Response.json(response, { status });
}

/**
 * Handle validate request with context (for use in http-router)
 * @param req - HTTP request
 * @param config - Current gateway config
 * @param authToken - Optional auth token
 */
export async function handleValidateWithContext(
  req: Request,
  config: Config,
  authToken?: string
): Promise<Response> {
  // Check auth if token is configured
  if (authToken) {
    const reqToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (reqToken !== authToken) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  if (req.method === "GET") {
    // Validate the current runtime config
    const result = await validateConfig(config);
    const response: ValidateResponse = {
      ok: true,
      valid: result.valid,
      summary: {
        errors: result.stats.error,
        warnings: result.stats.warning,
        info: result.stats.info,
        total: result.issues.length,
      },
      issues: result.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        severity: issue.severity,
        suggestion: issue.suggestion,
      })),
    };

    const status = result.valid ? 200 : 422;
    return Response.json(response, { status });
  }

  if (req.method === "POST") {
    return handleValidateRequest(req, authToken);
  }

  return Response.json(
    { error: "Method not allowed", allowed: ["GET", "POST"] },
    { status: 405 }
  );
}
