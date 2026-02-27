/**
 * Infrastructure Layer - Authentication
 *
 * Security utilities for token validation and request authentication.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { LoggerPort } from "../../application/ports/outbound/index.ts";
import type { AuthConfig, AuthMode } from "../../domain/config/entities.ts";

// ============================================================================
// Types
// ============================================================================

export interface AuthServiceOptions {
  config: AuthConfig;
  logger: LoggerPort;
}

export interface AuthResult {
  authenticated: boolean;
  error?: string;
  token?: string;
}

// ============================================================================
// Auth Service
// ============================================================================

export class AuthService {
  private config: AuthConfig;
  private logger: LoggerPort;
  private resolvedToken?: string;

  constructor(options: AuthServiceOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.resolvedToken = this.resolveToken();
  }

  /**
   * Validate auth config at startup.
   * Fail-closed: mode:"off" requires explicit allowUnauthenticated:true
   */
  validateConfig(): void {
    if (this.config.mode === "off") {
      if (!this.config.allowUnauthenticated) {
        throw new Error(
          'Auth mode is "off" but allowUnauthenticated is not true. ' +
            "Set auth.allowUnauthenticated=true to confirm running without authentication."
        );
      }
      this.logger.warn(
        "Running WITHOUT authentication (allowUnauthenticated=true). Not recommended for production."
      );
      return;
    }

    if (this.config.mode === "password" && !this.config.password) {
      throw new Error('Auth mode is "password" but no password configured.');
    }
  }

  /**
   * Authenticate an HTTP request.
   * Supports Authorization header or ?token= query param.
   */
  authenticate(req: Request, url: URL): AuthResult {
    // Check exempt paths
    if (this.isExemptPath(url.pathname)) {
      return { authenticated: true };
    }

    if (this.config.mode === "off") {
      return { authenticated: true };
    }

    // Check token in header
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (this.verifyToken(token)) {
        return { authenticated: true, token };
      }
    }

    // Check token in query param
    const tokenParam = url.searchParams.get("token");
    if (tokenParam && this.verifyToken(tokenParam)) {
      return { authenticated: true, token: tokenParam };
    }

    return {
      authenticated: false,
      error: "Unauthorized",
    };
  }

  /**
   * Get the resolved token (for WS clients, etc.)
   */
  getResolvedToken(): string | undefined {
    return this.resolvedToken;
  }

  /**
   * Get auth mode.
   */
  getMode(): AuthMode {
    return this.config.mode;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private resolveToken(): string | undefined {
    if (this.config.mode === "token") {
      if (this.config.token) {
        return this.config.token;
      }
      // Auto-generate token
      const generated = randomBytes(24).toString("base64url");
      if (this.config.logToken !== false) {
        this.logger.info(`Auto-generated token: ${generated}`);
      } else {
        this.logger.info(
          "Auto-generated token (hidden by logToken=false). Check gateway config."
        );
      }
      this.logger.info("Set gateway.auth.token in config to use a fixed token.");
      return generated;
    }
    return undefined;
  }

  private verifyToken(token: string): boolean {
    if (!this.resolvedToken) return false;
    return safeTokenCompare(token, this.resolvedToken);
  }

  private isExemptPath(pathname: string): boolean {
    const exemptPaths = ["/health", "/api/health", "/", "/web/"];

    // Webhook paths are exempt (signature verified separately)
    const webhookPrefixes = ["/webhook/telegram", "/webhook/discord"];

    if (exemptPaths.includes(pathname)) return true;
    return webhookPrefixes.some((p) => pathname.startsWith(p));
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Timing-safe token comparison (prevents timing attacks).
 */
export function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
