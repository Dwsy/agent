/**
 * Infrastructure Layer - External System Implementations
 *
 * Implements the ports defined by the application layer.
 * Depends only on the domain layer (for entities and repository interfaces).
 *
 * Structure:
 * - persistence/ - Data storage implementations
 * - security/ - Authentication and security
 * - rpc/ - RPC communication
 * - messaging/ - Message queue and events
 * - platform/ - Platform services (logging, static server, etc.)
 * - utils/ - Utility functions
 * - plugins/ - Plugin management
 */

// ============================================================================
// Security
// ============================================================================

export {
  AuthService,
  type AuthServiceOptions,
  type AuthResult,
  safeTokenCompare,
} from "./security/auth.ts";

export {
  ExecGuardService,
  type ExecGuardOptions,
  type ExecValidationResult,
} from "./security/exec-guard.ts";

export {
  SsrfGuardService,
  type SsrfGuardOptions,
  type SsrfValidationResult,
} from "./security/ssrf-guard.ts";

// ============================================================================
// Persistence
// ============================================================================

export {
  SessionStore,
} from "./persistence/session-store.ts";

// ============================================================================
// Utils
// ============================================================================

export {
  splitMessage,
  formatDuration,
  parseDuration,
  debounce,
  sleep,
  retry,
  deepMerge,
  pick,
  omit,
} from "./utils/index.ts";
