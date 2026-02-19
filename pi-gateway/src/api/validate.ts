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

/**
 * Handle config validation request
 */
export async function handleValidateRequest(req: Request): Promise<Response> {
  if (req.method !== "POST" && req.method !== "GET") {
    return Response.json(
      { error: "Method not allowed", allowed: ["GET", "POST"] },
      { status: 405 }
    );
  }

  let config: Config;

  if (req.method === "POST") {
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
 */
export async function handleValidateWithContext(
  req: Request,
  config: Config
): Promise<Response> {
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
    return handleValidateRequest(req);
  }

  return Response.json(
    { error: "Method not allowed", allowed: ["GET", "POST"] },
    { status: 405 }
  );
}
