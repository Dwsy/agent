/**
 * Application Layer - Use Case Orchestration
 *
 * Contains:
 * - Ports: Interface definitions for inbound/outbound communication
 * - Services: Application service implementations
 * - Use Cases: Specific business use cases
 *
 * Dependencies:
 * - Depends only on domain layer
 * - Does NOT depend on infrastructure or interface layers
 */

// ============================================================================
// Inbound Ports (Interface layer calls these)
// ============================================================================

export type {
  MessageHandlerPort,
  MessageProcessingResult,
  MessageHandlingOptions,
  CronHandlerPort,
  CronExecutionResult,
  CommandHandlerPort,
  GatewayCommand,
  CommandResult,
  WebhookHandlerPort,
  WebhookRequest,
  WebhookResponse,
} from "./ports/inbound/index.ts";

// ============================================================================
// Outbound Ports (Application calls these, Infrastructure implements)
// ============================================================================

export type {
  SessionStorePort,
  OutboundMessage,
  MessageSendResult,
  MessageSenderPort,
  RpcCommand,
  RpcResponse,
  RpcPoolPort,
  CronStorePort,
  PluginManagerPort,
  LoggerPort,
  ConfigPort,
} from "./ports/outbound/index.ts";

// ============================================================================
// Services
// ============================================================================

export {
  SessionRouterService,
  type SessionRouterOptions,
  type RoleResolution,
  type RoleSource,
  type AgentRouteResolution,
  type AgentRouteSource,
} from "./services/session-router.ts";

export {
  MessageDispatcherService,
  type MessageDispatcherOptions,
} from "./services/message-dispatcher.ts";

export {
  HandleInboundMessageUseCase,
  type HandleInboundMessageOptions,
} from "./use-cases/handle-inbound-message.ts";

// ============================================================================
// Use Cases (to be implemented)
// ============================================================================

// export { HandleInboundMessageUseCase } from "./use-cases/handle-inbound-message.ts";
// export { ExecuteCronJobUseCase } from "./use-cases/execute-cron-job.ts";
// export { DelegateToAgentUseCase } from "./use-cases/delegate-to-agent.ts";
