/**
 * Exec Guard — Command execution allowlist and audit logging.
 *
 * Controls what executables the gateway can spawn, with audit trail.
 * Primary defense against malicious plugins or config injection.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecGuardConfig {
  enabled: boolean;
  /** Allowed executable basenames or absolute paths. Default: ["pi", "ps"] */
  allowedExecutables: string[];
  /** Log all spawn attempts (allowed + blocked). Default: true */
  auditLog: boolean;
  /** Block spawns not in allowlist. Default: true (fail-closed) */
  blockUnlisted: boolean;
}

export interface ExecAuditEntry {
  timestamp: number;
  executable: string;
  args: string[];
  cwd?: string;
  allowed: boolean;
  reason?: string;
  caller?: string;
}

export type AuditListener = (entry: ExecAuditEntry) => void;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_ALLOWED = ["pi", "ps"];

export const DEFAULT_EXEC_GUARD_CONFIG: ExecGuardConfig = {
  enabled: true,
  allowedExecutables: DEFAULT_ALLOWED,
  auditLog: true,
  blockUnlisted: true,
};

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

export class ExecGuard {
  private config: ExecGuardConfig;
  private auditLog: ExecAuditEntry[] = [];
  private listeners: AuditListener[] = [];
  private maxAuditEntries: number;

  constructor(config?: Partial<ExecGuardConfig>, maxAuditEntries = 1000) {
    this.config = { ...DEFAULT_EXEC_GUARD_CONFIG, ...config };
    this.maxAuditEntries = maxAuditEntries;
  }

  /** Register an audit listener (e.g., file logger, metrics). */
  onAudit(listener: AuditListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Check if an executable is allowed to run.
   * Returns { allowed, reason } — caller decides whether to proceed.
   */
  check(
    executable: string,
    args: string[] = [],
    opts?: { cwd?: string; caller?: string },
  ): { allowed: boolean; reason?: string } {
    if (!this.config.enabled) {
      this.record(executable, args, true, "guard disabled", opts);
      return { allowed: true };
    }

    const basename = extractBasename(executable);
    const allowed = this.config.allowedExecutables.some(
      (entry) => entry === basename || entry === executable,
    );

    if (allowed) {
      this.record(executable, args, true, undefined, opts);
      return { allowed: true };
    }

    const reason = `Executable not in allowlist: ${executable} (basename: ${basename})`;
    this.record(executable, args, false, reason, opts);

    if (this.config.blockUnlisted) {
      return { allowed: false, reason };
    }

    // Warn but allow (blockUnlisted: false)
    return { allowed: true, reason: `Warning: ${reason}` };
  }

  /** Validate piCliPath at startup. */
  validatePiCliPath(piCliPath: string): void {
    const basename = extractBasename(piCliPath);
    if (basename !== "pi" && !this.config.allowedExecutables.includes(basename)) {
      throw new Error(
        `piCliPath "${piCliPath}" (basename: ${basename}) is not in exec allowlist. ` +
        `Add it to security.exec.allowedExecutables or use the default "pi".`,
      );
    }
  }

  /** Get recent audit entries. */
  getAuditLog(limit = 50): ExecAuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  /** Get stats. */
  getStats(): { total: number; allowed: number; blocked: number } {
    const allowed = this.auditLog.filter((e) => e.allowed).length;
    return {
      total: this.auditLog.length,
      allowed,
      blocked: this.auditLog.length - allowed,
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private record(
    executable: string,
    args: string[],
    allowed: boolean,
    reason?: string,
    opts?: { cwd?: string; caller?: string },
  ): void {
    const entry: ExecAuditEntry = {
      timestamp: Date.now(),
      executable,
      args: sanitizeArgs(args),
      cwd: opts?.cwd,
      allowed,
      reason,
      caller: opts?.caller,
    };

    if (this.config.auditLog) {
      this.auditLog.push(entry);
      if (this.auditLog.length > this.maxAuditEntries) {
        this.auditLog = this.auditLog.slice(-Math.floor(this.maxAuditEntries * 0.8));
      }
    }

    for (const listener of this.listeners) {
      try { listener(entry); } catch { /* ignore listener errors */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractBasename(execPath: string): string {
  const parts = execPath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || execPath;
}

/** Redact sensitive args (tokens, keys) for audit log. */
function sanitizeArgs(args: string[]): string[] {
  const sensitiveFlags = new Set<number>(); // indices whose next value should be redacted
  
  // First pass: find sensitive flags
  for (let i = 0; i < args.length; i++) {
    const lower = args[i].toLowerCase();
    if (lower.startsWith("--") || lower.startsWith("-")) {
      // Handle --flag=value inline format
      if (lower.includes("=")) {
        const flagPart = lower.split("=")[0];
        if (flagPart.includes("token") || flagPart.includes("key") || flagPart.includes("secret") || flagPart.includes("password")) {
          sensitiveFlags.add(i); // mark for inline redaction
        }
      } else if (lower.includes("token") || lower.includes("key") || lower.includes("secret") || lower.includes("password")) {
        sensitiveFlags.add(i);
      }
    }
  }

  // Second pass: redact
  return args.map((arg, i) => {
    // Redact value after a sensitive flag (--token <value>)
    if (i > 0 && sensitiveFlags.has(i - 1) && !args[i - 1].includes("=")) {
      return "[REDACTED]";
    }
    // Redact inline --flag=value
    if (sensitiveFlags.has(i) && arg.includes("=")) {
      return arg.split("=")[0] + "=[REDACTED]";
    }
    // Redact bare key=value patterns
    if (/^(token|key|secret|password|auth)=/i.test(arg)) {
      return arg.split("=")[0] + "=[REDACTED]";
    }
    return arg;
  });
}
