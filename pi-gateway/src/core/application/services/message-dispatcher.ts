/**
 * Application Layer - Message Dispatcher Service
 *
 * Orchestrates message processing flow:
 * 1. Route to session
 * 2. Enrich with context
 * 3. Send to RPC pool
 * 4. Handle response
 */

import type {
  InboundMessage,
  SessionKey,
  SessionState,
  MessageProcessingResult,
} from "../ports/inbound/index.ts";
import type {
  SessionStorePort,
  RpcPoolPort,
  MessageSenderPort,
  LoggerPort,
} from "../ports/outbound/index.ts";
import type { SessionRouterService } from "./session-router.ts";

// ============================================================================
// Options
// ============================================================================

export interface MessageDispatcherOptions {
  sessionStore: SessionStorePort;
  rpcPool: RpcPoolPort;
  messageSender: MessageSenderPort;
  sessionRouter: SessionRouterService;
  logger: LoggerPort;
}

// ============================================================================
// Service
// ============================================================================

export class MessageDispatcherService {
  private sessionStore: SessionStorePort;
  private rpcPool: RpcPoolPort;
  private messageSender: MessageSenderPort;
  private sessionRouter: SessionRouterService;
  private logger: LoggerPort;

  constructor(options: MessageDispatcherOptions) {
    this.sessionStore = options.sessionStore;
    this.rpcPool = options.rpcPool;
    this.messageSender = options.messageSender;
    this.sessionRouter = options.sessionRouter;
    this.logger = options.logger;
  }

  /**
   * Dispatch an inbound message to the appropriate session.
   */
  async dispatch(message: InboundMessage): Promise<MessageProcessingResult> {
    const startTime = Date.now();

    try {
      // Step 1: Route to agent
      const route = this.sessionRouter.routeAgent(message.text, message.source);

      // Step 2: Resolve session key
      const sessionKey = this.sessionRouter.resolveSessionKey(
        message.source,
        route.agentId
      );

      this.logger.info("Dispatching message", {
        messageId: message.id,
        sessionKey,
        agentId: route.agentId,
      });

      // Step 3: Get or create session
      const session = this.getOrCreateSession(sessionKey, message, route.agentId);

      // Step 4: Send to RPC pool
      const response = await this.rpcPool.prompt(
        sessionKey,
        route.text,
        message.images
      );

      if (!response.success) {
        throw new Error(response.error ?? "RPC prompt failed");
      }

      // Step 5: Update session
      this.sessionStore.touch(sessionKey);

      const processingTimeMs = Date.now() - startTime;

      this.logger.info("Message dispatched successfully", {
        messageId: message.id,
        sessionKey,
        processingTimeMs,
      });

      return {
        success: true,
        sessionKey,
        metadata: {
          processingTimeMs,
          agentId: route.agentId,
        },
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error("Message dispatch failed", {
        messageId: message.id,
        error: errorMessage,
        processingTimeMs,
      });

      return {
        success: false,
        sessionKey: "",
        error: errorMessage,
        metadata: {
          processingTimeMs,
          agentId: "",
        },
      };
    }
  }

  /**
   * Send a message to a specific session.
   */
  async sendToSession(
    sessionKey: SessionKey,
    text: string
  ): Promise<void> {
    await this.messageSender.sendText(sessionKey, text);
  }

  /**
   * Broadcast a message to multiple sessions.
   */
  async broadcast(
    sessionKeys: SessionKey[],
    text: string
  ): Promise<void> {
    const results = await this.messageSender.broadcast(sessionKeys, text);

    const failures: SessionKey[] = [];
    for (const [key, result] of results) {
      if (!result.success) {
        failures.push(key);
      }
    }

    if (failures.length > 0) {
      this.logger.warn("Broadcast partial failure", {
        total: sessionKeys.length,
        failed: failures.length,
        failedSessions: failures,
      });
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private getOrCreateSession(
    sessionKey: SessionKey,
    message: InboundMessage,
    agentId: string
  ): SessionState {
    const role = this.sessionRouter.resolveRole(sessionKey, message.source);

    return this.sessionStore.getOrCreate(sessionKey, {
      role: role.role,
      lastActivity: Date.now(),
      messageCount: 0,
      lastChatId: message.source.chatId,
      lastChannel: message.source.channel,
      lastAccountId: message.source.accountId,
      lastChatType: message.source.chatType,
      lastSenderId: message.source.senderId,
      lastSenderName: message.source.senderName,
      lastTopicId: message.source.topicId,
      lastThreadId: message.source.threadId,
    });
  }
}
