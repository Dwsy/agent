/**
 * Application Layer - Inbound Ports
 *
 * Interfaces for incoming interactions from the outside world.
 * These are the "use case entry points" that the interface layer calls.
 */

import type {
  InboundMessage,
  SessionKey,
  Result,
  SessionState,
} from "../../../domain/types.ts";

// Re-export domain types for consumers
export type { InboundMessage, SessionKey, SessionState };

// ============================================================================
// Message Handling Port
// ============================================================================

/**
 * Result of processing an inbound message.
 */
export interface MessageProcessingResult {
  /** Whether the message was successfully processed */
  success: boolean;
  /** Session key used for processing */
  sessionKey: SessionKey;
  /** Any error that occurred */
  error?: string;
  /** Processing metadata */
  metadata?: {
    processingTimeMs: number;
    agentId: string;
    model?: string;
  };
}

/**
 * Port for handling inbound messages.
 * Implemented by use case, called by interface layer.
 */
export interface MessageHandlerPort {
  /**
   * Handle an incoming message.
   * @param message - The inbound message
   * @returns Processing result
   */
  handle(message: InboundMessage): Promise<MessageProcessingResult>;
}

/**
 * Options for message handling.
 */
export interface MessageHandlingOptions {
  /** Force specific agent ID */
  agentId?: string;
  /** Force specific role */
  role?: string;
  /** Skip queue and process immediately */
  immediate?: boolean;
}

// ============================================================================
// Cron Handling Port
// ============================================================================

/**
 * Cron job execution result.
 */
export interface CronExecutionResult {
  jobId: string;
  success: boolean;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  output?: string;
  error?: string;
}

/**
 * Port for cron job handling.
 */
export interface CronHandlerPort {
  /**
   * Execute a cron job.
   * @param jobId - ID of the job to execute
   * @returns Execution result
   */
  execute(jobId: string): Promise<CronExecutionResult>;

  /**
   * Trigger a manual job run.
   * @param jobId - Job ID
   * @returns Execution result
   */
  trigger(jobId: string): Promise<CronExecutionResult>;
}

// ============================================================================
// Command Handling Port
// ============================================================================

/**
 * Gateway command types.
 */
export type GatewayCommand =
  | { type: "reload" }
  | { type: "restart" }
  | { type: "shutdown"; graceful: boolean }
  | { type: "scale_pool"; min: number; max: number }
  | { type: "broadcast"; message: string };

/**
 * Command execution result.
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

/**
 * Port for gateway command handling.
 */
export interface CommandHandlerPort {
  /**
   * Execute a gateway command.
   * @param command - Command to execute
   * @returns Command result
   */
  execute(command: GatewayCommand): Promise<CommandResult>;
}

// ============================================================================
// Webhook Handling Port
// ============================================================================

/**
 * Webhook request data.
 */
export interface WebhookRequest {
  id: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
}

/**
 * Webhook response data.
 */
export interface WebhookResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

/**
 * Port for webhook handling.
 */
export interface WebhookHandlerPort {
  /**
   * Handle a webhook request.
   * @param request - Webhook request
   * @returns Webhook response
   */
  handle(request: WebhookRequest): Promise<WebhookResponse>;
}
