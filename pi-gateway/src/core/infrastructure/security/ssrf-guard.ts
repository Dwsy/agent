//**
 /**
 * Infrastructure Layer - SSRF Guard
 *
 * Server-Side Request Forgery protection for URL fetching.
 */

import type { LoggerPort } from "../../application/ports/outbound/index.ts";

// ============================================================================
// Types
// ============================================================================

export interface SsrfGuardOptions {
  allowedSchemes?: string[];
  blockedHosts?: string[];
  allowedHosts?: string[];
  maxUrlLength?: number;
  maxRedirects?: number;
  logger: LoggerPort;
}

export interface SsrfValidationResult {
  allowed: boolean;
  reason?: string;
  normalizedUrl?: string;
}

// ============================================================================
// SSRF Guard Service
// ============================================================================

export class SsrfGuardService {
  private allowedSchemes: Set<string>;
  private blockedHosts: Set<string>;
  private allowedHosts: Set<string> | null;
  private maxUrlLength: number;
  private maxRedirects: number;
  private logger: LoggerPort;

  // Private IP ranges
  private static PRIVATE_IP_PATTERNS = [
    /^127\./, // 127.0.0.0/8
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^169\.254\./, // 169.254.0.0/16 (link-local)
    /^0\./, // 0.0.0.0/8
    /^::1$/, // IPv6 loopback
    /^fc00:/i, // IPv6 unique local
    /^fe80:/i, // IPv6 link-local
  ];

  constructor(options: SsrfGuardOptions) {
    this.allowedSchemes = new Set(options.allowedSchemes ?? ["http", "https"]);
    this.blockedHosts = new Set(options.blockedHosts ?? []);
    this.allowedHosts = options.allowedHosts?.length
      ? new Set(options.allowedHosts)
      : null;
    this.maxUrlLength = options.maxUrlLength ?? 2048;
    this.maxRedirects = options.maxRedirects ?? 5;
    this.logger = options.logger;
  }

  /**
   * Validate a URL for SSRF protection.
   */
  validate(urlString: string): SsrfValidationResult {
    // Check length
    if (urlString.length > this.maxUrlLength) {
      return {
        allowed: false,
        reason: `URL exceeds maximum length of ${this.maxUrlLength}`,
      };
    }

    // Parse URL
    let url: URL;
    try {
      url = new URL(urlString);
    } catch {
      return { allowed: false, reason: "Invalid URL format" };
    }

    // Check scheme
    if (!this.allowedSchemes.has(url.protocol.slice(0, -1))) {
      return {
        allowed: false,
        reason: `Scheme "${url.protocol}" is not allowed`,
      };
    }

    // Check blocked hosts
    const hostname = url.hostname.toLowerCase();
    if (this.blockedHosts.has(hostname)) {
      return { allowed: false, reason: "Host is blocked" };
    }

    // Check allowed hosts whitelist
    if (this.allowedHosts && !this.allowedHosts.has(hostname)) {
      return { allowed: false, reason: "Host is not in allowed list" };
    }

    // Check for private IP addresses (SSRF protection)
    if (this.isPrivateIp(hostname)) {
      this.logger.warn("Blocked request to private IP", { hostname, url: urlString });
      return { allowed: false, reason: "Private IP addresses are not allowed" };
    }

    return {
      allowed: true,
      normalizedUrl: url.toString(),
    };
  }

  /**
   * Check if max redirects exceeded.
   */
  checkRedirectCount(current: number): boolean {
    return current < this.maxRedirects;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private isPrivateIp(hostname: string): boolean {
    // Check if it's an IP address
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Pattern = /^[0-9a-fA-F:]+$/;

    if (!ipv4Pattern.test(hostname) && !ipv6Pattern.test(hostname)) {
      // It's a domain name, not an IP
      // DNS rebinding protection would require resolving the hostname
      return false;
    }

    return SsrfGuardService.PRIVATE_IP_PATTERNS.some((pattern) =>
      pattern.test(hostname)
    );
  }
}
