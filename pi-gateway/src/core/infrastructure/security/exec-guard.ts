/**
 * Infrastructure Layer - Execution Guard
 *
 * Security controls for command execution.
 */

import type { LoggerPort } from "../../application/ports/outbound/index.ts";

// ============================================================================
// Types
// ============================================================================

export interface ExecGuardOptions {
  allowedCommands?: string[];
  blockedPatterns?: RegExp[];
  maxCommandLength?: number;
  logger: LoggerPort;
}

export interface ExecValidationResult {
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// Exec Guard Service
// ============================================================================

export class ExecGuardService {
  private allowedCommands: Set<string>;
  private blockedPatterns: RegExp[];
  private maxCommandLength: number;
  private logger: LoggerPort;

  constructor(options: ExecGuardOptions) {
    this.allowedCommands = new Set(options.allowedCommands ?? []);
    this.blockedPatterns = options.blockedPatterns ?? [
      /rm\s+-rf\s+\//, // rm -rf /
      />\s*\/dev\/(null|zero|random)/, // Dangerous redirects
      /:\(\)\{\s*:\|:&\s*\};:/, // Fork bomb
    ];
    this.maxCommandLength = options.maxCommandLength ?? 10000;
    this.logger = options.logger;
  }

  /**
   * Validate a command for execution.
   */
  validate(command: string): ExecValidationResult {
    // Check length
    if (command.length > this.maxCommandLength) {
      return {
        allowed: false,
        reason: `Command exceeds maximum length of ${this.maxCommandLength}`,
      };
    }

    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(command)) {
        this.logger.warn("Blocked dangerous command pattern", { command, pattern: pattern.source });
        return {
          allowed: false,
          reason: "Command contains dangerous pattern",
        };
      }
    }

    // Check allowed commands (if whitelist is configured)
    if (this.allowedCommands.size > 0) {
      const baseCommand = command.trim().split(/\s+/)[0];
      if (!this.allowedCommands.has(baseCommand)) {
        return {
          allowed: false,
          reason: `Command "${baseCommand}" is not in allowed list`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Sanitize a command (basic sanitization).
   */
  sanitize(command: string): string {
    // Remove null bytes
    let sanitized = command.replace(/\x00/g, "");

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }
}
