/**
 * Application Layer - Handle Inbound Message Use Case
 *
 * Primary use case for processing incoming messages.
 * Orchestrates the complete message handling flow.
 */

import type {
  MessageHandlerPort,
  InboundMessage,
  MessageProcessingResult,
} from "../ports/inbound/index.ts";

import type { MessageDispatcherService } from "../services/message-dispatcher.ts";
import type { LoggerPort } from "../ports/outbound/index.ts";

// ============================================================================
// Use Case
// ============================================================================

export interface HandleInboundMessageOptions {
  dispatcher: MessageDispatcherService;
  logger: LoggerPort;
}

/**
 * Use case: Handle an inbound message from any channel.
 *
 * This is the primary entry point for message processing.
 * It delegates to the message dispatcher for actual routing.
 */
export class HandleInboundMessageUseCase implements MessageHandlerPort {
  private dispatcher: MessageDispatcherService;
  private logger: LoggerPort;

  constructor(options: HandleInboundMessageOptions) {
    this.dispatcher = options.dispatcher;
    this.logger = options.logger;
  }

  /**
   * Handle an inbound message.
   *
   * Flow:
   * 1. Validate message
   * 2. Route to appropriate session
   * 3. Dispatch to RPC pool
   * 4. Return processing result
   */
  async handle(message: InboundMessage): Promise<MessageProcessingResult> {
    this.logger.info("Handling inbound message", {
      messageId: message.id,
      channel: message.source.channel,
      chatType: message.source.chatType,
    });

    // Validate message
    const validationError = this.validateMessage(message);
    if (validationError) {
      this.logger.warn("Message validation failed", {
        messageId: message.id,
        error: validationError,
      });

      return {
        success: false,
        sessionKey: "",
        error: validationError,
      };
    }

    // Dispatch to appropriate session
    const result = await this.dispatcher.dispatch(message);

    if (result.success) {
      this.logger.info("Message handled successfully", {
        messageId: message.id,
        sessionKey: result.sessionKey,
      });
    } else {
      this.logger.error("Message handling failed", {
        messageId: message.id,
        error: result.error,
      });
    }

    return result;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private validateMessage(message: InboundMessage): string | undefined {
    if (!message.id) {
      return "Message ID is required";
    }

    if (!message.source) {
      return "Message source is required";
    }

    if (!message.source.channel) {
      return "Message channel is required";
    }

    if (message.text === undefined || message.text === null) {
      return "Message text is required";
    }

    // Check for empty messages (but allow whitespace-only for formatting)
    if (message.text.length === 0) {
      return "Message text cannot be empty";
    }

    return undefined;
  }
}
