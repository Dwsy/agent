/**
 * Service layer context — carries active role state and config.
 * Zero Pi API dependency.
 */

import type {
  ActiveRole,
  RolePersonaConfig,
  LlmCaller,
  EmbeddingProvider,
} from "../core/types.ts";

export interface ServiceContext {
  /** Current active role (null if no role mapped) */
  activeRole: ActiveRole | null;

  /** Resolved configuration */
  config: RolePersonaConfig;

  /** Roles directory path */
  rolesDir: string;

  /** Optional LLM caller for auto-extraction / tidy */
  llm?: LlmCaller;

  /** Optional embedding provider */
  embeddingProvider?: EmbeddingProvider;

  /** Whether vector memory is currently active */
  embeddingActive: boolean;

  /** Log entries from this session */
  memoryLog: Array<{
    time: string;
    source: string;
    op: string;
    content: string;
    stored: boolean;
    detail?: string;
  }>;
}

/** Require an active role or throw */
export function requireActiveRole(ctx: ServiceContext): ActiveRole {
  if (!ctx.activeRole) {
    throw new Error("No active role mapped in current directory.");
  }
  return ctx.activeRole;
}

/** Push a memory log entry */
export function memLogPush(
  ctx: ServiceContext,
  entry: { source: string; op: string; content: string; stored: boolean; detail?: string }
): void {
  const now = new Date();
  ctx.memoryLog.push({
    ...entry,
    time: [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(":"),
  });
}
