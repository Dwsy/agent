/**
 * Config Validation System
 * 
 * Provides comprehensive validation for pi-gateway configuration with:
 * - Severity levels: error, warning, info
 * - Auto-fixable issues
 * - Extensible rule system
 * 
 * @owner Config Validation System (Issue #4)
 */

import { Value, type ValueError } from "@sinclair/typebox/value";
import { existsSync, accessSync, constants } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { net } from "node:net";
import type { Config } from "./config.ts";
import { ConfigSchema } from "./config-schema.ts";

// ============================================================================
// Types
// ============================================================================

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  /** Unique path to the config property (e.g., "gateway.port") */
  path: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: ValidationSeverity;
  /** Suggested fix or improvement */
  suggestion?: string;
  /** Whether this issue can be auto-fixed */
  autoFixable: boolean;
  /** Optional auto-fix function (mutates config) */
  fix?: (config: Config) => void;
}

export interface ValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean;
  /** All validation issues found */
  issues: ValidationIssue[];
  /** Count by severity */
  stats: {
    error: number;
    warning: number;
    info: number;
  };
  /** Auto-fixable issues */
  autoFixableCount: number;
}

export interface ValidationRule {
  /** Rule identifier */
  id: string;
  /** Rule description */
  description: string;
  /** Validate function returns issues */
  validate: (config: Config) => ValidationIssue[] | Promise<ValidationIssue[]>;
}

export interface ValidationOptions {
  /** Enable strict mode (warnings become errors) */
  strict?: boolean;
  /** Check port availability (may be slow) */
  checkPorts?: boolean;
  /** Check directory existence (may be slow) */
  checkDirectories?: boolean;
  /** Validate token format */
  validateTokens?: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

function resolvePath(p: string): string {
  return p.replace(/^~/, homedir());
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function isTokenFormatValid(token: string): boolean {
  // Basic token format checks
  if (!token || token.length < 8) return false;
  // Check for common placeholder patterns
  const placeholders = ["${", "your_", "placeholder", "xxx", "..."];
  return !placeholders.some(p => token.toLowerCase().includes(p));
}

async function isPortInUse(port: number, host = "0.0.0.0"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, host);
  });
}

function directoryExists(dir: string): boolean {
  try {
    const resolved = resolvePath(dir);
    if (!existsSync(resolved)) return false;
    accessSync(resolved, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function isDirectoryWritable(dir: string): boolean {
  try {
    const resolved = resolvePath(dir);
    accessSync(resolved, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Built-in Validation Rules
// ============================================================================

/** Schema validation rule using TypeBox */
export const SchemaValidationRule: ValidationRule = {
  id: "schema",
  description: "Validate config against JSON Schema",
  validate: (config: Config): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    const errors = [...Value.Errors(ConfigSchema, config)];
    
    for (const err of errors) {
      issues.push({
        path: err.path.slice(1).replace(/\//g, ".") || "config",
        message: err.message,
        severity: "error",
        suggestion: getSchemaFixSuggestion(err),
        autoFixable: false,
      });
    }
    
    return issues;
  },
};

function getSchemaFixSuggestion(error: ValueError): string | undefined {
  const path = error.path.slice(1);
  
  // Common schema errors with specific suggestions
  if (path.includes("port")) {
    return "Port must be an integer between 1 and 65535";
  }
  if (path.includes("pool.min") || path.includes("pool.max")) {
    return "Pool min/max must be integers between 0 and 100";
  }
  if (path.includes("auth.mode")) {
    return "Auth mode must be one of: off, token, password";
  }
  if (path.includes("bind")) {
    return "Bind must be one of: loopback, lan, auto";
  }
  if (path.includes("allowFrom")) {
    return "allowFrom must be an array of user IDs or '*' for wildcard";
  }
  
  return undefined;
}

/** Port availability validation rule */
export const PortAvailabilityRule: ValidationRule = {
  id: "port-availability",
  description: "Check if configured ports are available",
  validate: async (config: Config): Promise<ValidationIssue[]> => {
    const issues: ValidationIssue[] = [];
    const port = config.gateway.port;
    const host = config.gateway.bind === "loopback" ? "127.0.0.1" : "0.0.0.0";
    
    if (isValidPort(port)) {
      const inUse = await isPortInUse(port, host);
      if (inUse) {
        issues.push({
          path: "gateway.port",
          message: `Port ${port} is already in use`,
          severity: "error",
          suggestion: `Choose a different port or stop the process using port ${port}`,
          autoFixable: false,
        });
      }
    }
    
    return issues;
  },
};

/** Token format validation rule */
export const TokenFormatRule: ValidationRule = {
  id: "token-format",
  description: "Validate token format and placeholders",
  validate: (config: Config): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    const { auth } = config.gateway;
    
    // Auth token validation
    if (auth.mode === "token" && auth.token) {
      if (!isTokenFormatValid(auth.token)) {
        issues.push({
          path: "gateway.auth.token",
          message: "Auth token appears to be a placeholder or too short",
          severity: "warning",
          suggestion: "Set a strong token (at least 16 characters) or use environment variable",
          autoFixable: false,
        });
      }
    }
    
    // Telegram bot token validation
    const tg = config.channels.telegram;
    if (tg?.enabled) {
      const tokensToCheck: Array<{ path: string; token?: string }> = [
        { path: "channels.telegram.botToken", token: tg.botToken },
      ];
      
      // Check account tokens
      if (tg.accounts) {
        for (const [accountId, account] of Object.entries(tg.accounts)) {
          if (account?.botToken) {
            tokensToCheck.push({
              path: `channels.telegram.accounts.${accountId}.botToken`,
              token: account.botToken,
            });
          }
        }
      }
      
      for (const { path, token } of tokensToCheck) {
        if (token && !isTokenFormatValid(token)) {
          issues.push({
            path,
            message: "Bot token appears to be a placeholder or invalid format",
            severity: "error",
            suggestion: "Set a valid Telegram bot token from @BotFather or use environment variable",
            autoFixable: false,
          });
        }
      }
    }
    
    // Discord token validation
    const discord = config.channels.discord;
    if (discord?.enabled && discord.token) {
      if (!isTokenFormatValid(discord.token)) {
        issues.push({
          path: "channels.discord.token",
          message: "Discord token appears to be a placeholder",
          severity: "error",
          suggestion: "Set a valid Discord bot token from the Developer Portal",
          autoFixable: false,
        });
      }
    }
    
    return issues;
  },
};

/** Directory existence and permissions validation rule */
export const DirectoryExistenceRule: ValidationRule = {
  id: "directory-existence",
  description: "Check if configured directories exist and are writable",
  validate: (config: Config): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    
    // Session data directory
    if (config.session?.dataDir) {
      const sessionDir = config.session.dataDir;
      if (!directoryExists(sessionDir)) {
        issues.push({
          path: "session.dataDir",
          message: `Session data directory does not exist: ${sessionDir}`,
          severity: "warning",
          suggestion: "Directory will be created on startup",
          autoFixable: true,
          fix: (cfg) => {
            // Directory creation is handled by ensureDataDir
            // This is just a marker for auto-fix capability
          },
        });
      } else if (!isDirectoryWritable(sessionDir)) {
        issues.push({
          path: "session.dataDir",
          message: `Session data directory is not writable: ${sessionDir}`,
          severity: "error",
          suggestion: "Check directory permissions or choose a different path",
          autoFixable: false,
        });
      }
    }
    
    // Agent workspace directories
    const agents = config.agents?.list ?? [];
    for (const agent of agents) {
      if (agent.workspace) {
        const workspaceDir = resolvePath(agent.workspace);
        if (!directoryExists(workspaceDir)) {
          issues.push({
            path: `agents.list[${agent.id}].workspace`,
            message: `Agent workspace does not exist: ${agent.workspace}`,
            severity: "warning",
            suggestion: `Create the directory or the agent may fail to start`,
            autoFixable: false,
          });
        }
      }
    }
    
    // Role workspace directories
    if (config.roles?.workspaceDirs) {
      for (const [role, dir] of Object.entries(config.roles.workspaceDirs)) {
        const roleDir = resolvePath(dir);
        if (!directoryExists(roleDir)) {
          issues.push({
            path: `roles.workspaceDirs.${role}`,
            message: `Role workspace does not exist: ${dir}`,
            severity: "info",
            suggestion: `Directory will be created when role is first used`,
            autoFixable: false,
          });
        }
      }
    }
    
    // Plugin directories
    if (config.plugins?.dirs) {
      for (const [index, dir] of config.plugins.dirs.entries()) {
        const pluginDir = resolvePath(dir);
        if (!directoryExists(pluginDir)) {
          issues.push({
            path: `plugins.dirs[${index}]`,
            message: `Plugin directory does not exist: ${dir}`,
            severity: "warning",
            suggestion: `Create the directory or remove from config`,
            autoFixable: false,
          });
        }
      }
    }
    
    return issues;
  },
};

/** Security best practices validation rule */
export const SecurityBestPracticesRule: ValidationRule = {
  id: "security-best-practices",
  description: "Check security configurations",
  validate: (config: Config): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    
    // Auth mode warnings
    if (config.gateway.auth.mode === "off") {
      issues.push({
        path: "gateway.auth.mode",
        message: "Authentication is disabled - gateway is open to anyone",
        severity: "warning",
        suggestion: "Enable token or password auth for production use",
        autoFixable: false,
      });
    }
    
    // Token in production
    if (config.gateway.auth.mode === "token" && !config.gateway.auth.token) {
      issues.push({
        path: "gateway.auth.token",
        message: "Token auth enabled but no token configured",
        severity: "warning",
        suggestion: "Set gateway.auth.token or use PI_GATEWAY_AUTH_TOKEN environment variable",
        autoFixable: false,
      });
    }
    
    // Telegram open policy
    const tg = config.channels.telegram;
    if (tg?.enabled && tg.dmPolicy === "open") {
      const allowFrom = tg.allowFrom?.map(String) ?? [];
      if (!allowFrom.includes("*")) {
        issues.push({
          path: "channels.telegram.dmPolicy",
          message: 'dmPolicy is "open" but allowFrom does not include "*"',
          severity: "error",
          suggestion: 'Add "*" to allowFrom or change dmPolicy to "allowlist" or "pairing"',
          autoFixable: false,
        });
      }
    }
    
    // Webhook without secret
    if (tg?.webhookUrl && !tg.webhookSecret) {
      issues.push({
        path: "channels.telegram.webhookSecret",
        message: "Webhook configured without secret - insecure",
        severity: "warning",
        suggestion: "Set webhookSecret to verify incoming webhook requests",
        autoFixable: false,
      });
    }
    
    return issues;
  },
};

/** Pool configuration validation rule */
export const PoolConfigurationRule: ValidationRule = {
  id: "pool-configuration",
  description: "Validate agent pool settings",
  validate: (config: Config): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    const pool = config.agent.pool;
    
    if (pool) {
      if (pool.min > pool.max) {
        issues.push({
          path: "agent.pool.min",
          message: `Pool min (${pool.min}) is greater than max (${pool.max})`,
          severity: "error",
          suggestion: "Set min <= max for proper pool sizing",
          autoFixable: true,
          fix: (cfg) => {
            cfg.agent.pool.min = cfg.agent.pool.max;
          },
        });
      }
      
      if (pool.max > 10) {
        issues.push({
          path: "agent.pool.max",
          message: `Pool max (${pool.max}) is unusually high`,
          severity: "info",
          suggestion: "Consider lower max to conserve resources",
          autoFixable: false,
        });
      }
      
      if (pool.idleTimeoutMs < 10000) {
        issues.push({
          path: "agent.pool.idleTimeoutMs",
          message: `Idle timeout (${pool.idleTimeoutMs}ms) is very short`,
          severity: "info",
          suggestion: "Consider longer timeout (60s+) to reduce process churn",
          autoFixable: false,
        });
      }
    }
    
    return issues;
  },
};

/** Cron job validation rule */
export const CronConfigurationRule: ValidationRule = {
  id: "cron-configuration",
  description: "Validate cron job configurations",
  validate: (config: Config): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    
    if (config.cron?.enabled && config.cron.jobs) {
      const jobIds = new Set<string>();
      
      for (let i = 0; i < config.cron.jobs.length; i++) {
        const job = config.cron.jobs[i];
        
        // Check for duplicate IDs
        if (jobIds.has(job.id)) {
          issues.push({
            path: `cron.jobs[${i}].id`,
            message: `Duplicate job ID: ${job.id}`,
            severity: "error",
            suggestion: "Use unique IDs for each cron job",
            autoFixable: false,
          });
        }
        jobIds.add(job.id);
        
        // Validate schedule expression format
        if (job.schedule.kind === "cron") {
          const parts = job.schedule.expr.trim().split(/\s+/);
          if (parts.length < 5 || parts.length > 6) {
            issues.push({
              path: `cron.jobs[${i}].schedule.expr`,
              message: `Invalid cron expression: ${job.schedule.expr}`,
              severity: "warning",
              suggestion: "Use standard 5-field (min hour day month dow) or 6-field (with seconds) cron format",
              autoFixable: false,
            });
          }
        }
        
        // Validate agentId exists
        if (job.agentId && config.agents?.list) {
          const agentExists = config.agents.list.some(a => a.id === job.agentId);
          if (!agentExists) {
            issues.push({
              path: `cron.jobs[${i}].agentId`,
              message: `Agent "${job.agentId}" not found in agents.list`,
              severity: "warning",
              suggestion: `Add agent "${job.agentId}" to agents.list or use existing agent ID`,
              autoFixable: false,
            });
          }
        }
      }
    }
    
    return issues;
  },
};

/** Multi-agent configuration validation rule */
export const AgentsConfigurationRule: ValidationRule = {
  id: "agents-configuration",
  description: "Validate multi-agent settings",
  validate: (config: Config): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    const agents = config.agents;
    
    if (agents?.list && agents.list.length > 0) {
      const agentIds = new Set<string>();
      
      for (let i = 0; i < agents.list.length; i++) {
        const agent = agents.list[i];
        
        // Check for duplicate IDs
        if (agentIds.has(agent.id)) {
          issues.push({
            path: `agents.list[${i}].id`,
            message: `Duplicate agent ID: ${agent.id}`,
            severity: "error",
            suggestion: "Use unique IDs for each agent",
            autoFixable: false,
          });
        }
        agentIds.add(agent.id);
        
        // Validate workspace path
        if (!agent.workspace) {
          issues.push({
            path: `agents.list[${i}].workspace`,
            message: `Agent "${agent.id}" has no workspace configured`,
            severity: "warning",
            suggestion: "Set a workspace directory for this agent",
            autoFixable: false,
          });
        }
        
        // Validate delegation constraints
        if (agent.delegation) {
          if (agent.delegation.maxDepth > 3) {
            issues.push({
              path: `agents.list[${i}].delegation.maxDepth`,
              message: `Agent "${agent.id}" has deep delegation chain (${agent.delegation.maxDepth})`,
              severity: "info",
              suggestion: "Consider limiting delegation depth to prevent complex chains",
              autoFixable: false,
            });
          }
        }
      }
      
      // Validate default agent exists
      if (!agentIds.has(agents.default)) {
        issues.push({
          path: "agents.default",
          message: `Default agent "${agents.default}" not found in agents.list`,
          severity: "error",
          suggestion: `Set agents.default to one of: ${Array.from(agentIds).join(", ")}`,
          autoFixable: false,
        });
      }
      
      // Validate bindings
      if (agents.bindings) {
        for (let i = 0; i < agents.bindings.length; i++) {
          const binding = agents.bindings[i];
          if (!agentIds.has(binding.agentId)) {
            issues.push({
              path: `agents.bindings[${i}].agentId`,
              message: `Binding references unknown agent: ${binding.agentId}`,
              severity: "warning",
              suggestion: `Use one of: ${Array.from(agentIds).join(", ")}`,
              autoFixable: false,
            });
          }
        }
      }
    }
    
    return issues;
  },
};

// ============================================================================
// ConfigValidator Class
// ============================================================================

export class ConfigValidator {
  private rules: ValidationRule[] = [];
  
  constructor(private options: ValidationOptions = {}) {
    // Register built-in rules
    this.registerRule(SchemaValidationRule);
    this.registerRule(TokenFormatRule);
    this.registerRule(SecurityBestPracticesRule);
    this.registerRule(PoolConfigurationRule);
    this.registerRule(CronConfigurationRule);
    this.registerRule(AgentsConfigurationRule);
    
    // Register optional rules based on options
    if (options.checkPorts !== false) {
      this.registerRule(PortAvailabilityRule);
    }
    if (options.checkDirectories !== false) {
      this.registerRule(DirectoryExistenceRule);
    }
  }
  
  /** Register a custom validation rule */
  registerRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }
  
  /** Validate configuration against all registered rules */
  async validate(config: Config): Promise<ValidationResult> {
    const allIssues: ValidationIssue[] = [];
    
    for (const rule of this.rules) {
      try {
        const issues = await rule.validate(config);
        allIssues.push(...issues);
      } catch (err) {
        allIssues.push({
          path: "config",
          message: `Rule "${rule.id}" failed: ${err instanceof Error ? err.message : String(err)}`,
          severity: "error",
          autoFixable: false,
        });
      }
    }
    
    // Apply strict mode: upgrade warnings to errors
    if (this.options.strict) {
      for (const issue of allIssues) {
        if (issue.severity === "warning") {
          issue.severity = "error";
        }
      }
    }
    
    // Calculate stats
    const stats = {
      error: allIssues.filter(i => i.severity === "error").length,
      warning: allIssues.filter(i => i.severity === "warning").length,
      info: allIssues.filter(i => i.severity === "info").length,
    };
    
    const autoFixableCount = allIssues.filter(i => i.autoFixable).length;
    
    return {
      valid: stats.error === 0,
      issues: allIssues,
      stats,
      autoFixableCount,
    };
  }
  
  /** Auto-fix all fixable issues */
  async fix(config: Config): Promise<{ fixed: number; remaining: ValidationIssue[] }> {
    const result = await this.validate(config);
    let fixed = 0;
    
    for (const issue of result.issues) {
      if (issue.autoFixable && issue.fix) {
        try {
          issue.fix(config);
          fixed++;
        } catch (err) {
          // Fix failed, keep as issue
        }
      }
    }
    
    // Re-validate to get remaining issues
    const newResult = await this.validate(config);
    
    return {
      fixed,
      remaining: newResult.issues.filter(i => !i.autoFixable || (i.autoFixable && !i.fix)),
    };
  }
  
  /** Quick validation - returns true if valid */
  async isValid(config: Config): Promise<boolean> {
    const result = await this.validate(config);
    return result.valid;
  }
  
  /** Get list of registered rule IDs */
  getRegisteredRules(): string[] {
    return this.rules.map(r => r.id);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/** Validate config with default options */
export async function validateConfig(
  config: Config,
  options?: ValidationOptions,
): Promise<ValidationResult> {
  const validator = new ConfigValidator(options);
  return validator.validate(config);
}

/** Quick check if config is valid */
export async function isConfigValid(config: Config): Promise<boolean> {
  const validator = new ConfigValidator({ checkPorts: false, checkDirectories: false });
  return validator.isValid(config);
}

/** Format validation result for display */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];
  
  lines.push(`Validation Result: ${result.valid ? "✓ Valid" : "✗ Invalid"}`);
  lines.push(`  Errors: ${result.stats.error}, Warnings: ${result.stats.warning}, Info: ${result.stats.info}`);
  
  if (result.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");
    
    // Group by severity
    const bySeverity: Record<ValidationSeverity, ValidationIssue[]> = {
      error: result.issues.filter(i => i.severity === "error"),
      warning: result.issues.filter(i => i.severity === "warning"),
      info: result.issues.filter(i => i.severity === "info"),
    };
    
    for (const severity of ["error", "warning", "info"] as ValidationSeverity[]) {
      const issues = bySeverity[severity];
      if (issues.length === 0) continue;
      
      const icon = severity === "error" ? "✗" : severity === "warning" ? "⚠" : "ℹ";
      for (const issue of issues) {
        lines.push(`  ${icon} [${issue.path}] ${issue.message}`);
        if (issue.suggestion) {
          lines.push(`      → ${issue.suggestion}`);
        }
        if (issue.autoFixable) {
          lines.push(`      (auto-fixable)`);
        }
      }
    }
  }
  
  return lines.join("\n");
}

/** Export built-in rules for custom validators */
export const BuiltInRules = {
  SchemaValidationRule,
  PortAvailabilityRule,
  TokenFormatRule,
  DirectoryExistenceRule,
  SecurityBestPracticesRule,
  PoolConfigurationRule,
  CronConfigurationRule,
  AgentsConfigurationRule,
};
