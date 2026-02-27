/**
 * ChatSdkBridge — core bridge between chat-sdk and pi-gateway.
 *
 * Creates a Chat instance, wires event handlers to gateway dispatch,
 * and produces ChannelPlugin instances for each adapter.
 */

import { Chat, type Adapter, type StateAdapter, type Thread, type Message } from "chat";
import type { GatewayPluginApi } from "../core/interface/plugins/types.ts";
import { ChatSdkChannelPlugin } from "./channel-plugin-adapter.ts";
import {
  toInboundMessage,
  buildSessionKey,
  toPostableMessage,
  createStreamingCallbacks,
  type StreamingCallbackOptions,
} from "./message-mapper.ts";
import { GatewayStateAdapter } from "./state-adapter.ts";

// ============================================================================
// Config
// ============================================================================

export interface ChatSdkBridgeConfig {
  /** Map of adapter name → adapter instance */
  adapters: Record<string, Adapter>;
  /** State adapter (defaults to in-memory via GatewayStateAdapter wrapper) */
  state: StateAdapter;
  /** Bot username across all adapters */
  userName: string;
  /** Agent ID for session key generation */
  agentId?: string;
  /** Streaming options for all adapters */
  streamingOptions?: StreamingCallbackOptions;
}

// ============================================================================
// Bridge
// ============================================================================

export class ChatSdkBridge {
  private chat: Chat;
  private api?: GatewayPluginApi;
  private readonly adapters: Record<string, Adapter>;
  private readonly stateAdapter: GatewayStateAdapter;
  private readonly agentId: string;
  private readonly streamingOptions: StreamingCallbackOptions;

  constructor(config: ChatSdkBridgeConfig) {
    this.adapters = config.adapters;
    this.agentId = config.agentId ?? "main";
    this.stateAdapter = new GatewayStateAdapter(config.state);
    this.streamingOptions = config.streamingOptions ?? {};

    this.chat = new Chat({
      adapters: config.adapters,
      state: this.stateAdapter,
      userName: config.userName,
      logger: "silent",
    });
  }

  /**
   * Set the gateway API reference for dispatching inbound messages.
   */
  setApi(api: GatewayPluginApi): void {
    this.api = api;
  }

  /**
   * Wire chat-sdk event handlers to forward messages to gateway dispatch.
   *
   * Uses processMessage (fire-and-forget with waitUntil) instead of the
   * deprecated handleIncomingMessage.
   */
  wireHandlers(): void {
    // Handle new @-mentions in unsubscribed threads
    this.chat.onNewMention(async (thread: Thread, message: Message) => {
      await this.handleIncomingMessage(thread, message);
      // Auto-subscribe so follow-ups also route through gateway
      await thread.subscribe();
    });

    // Handle messages in subscribed threads
    this.chat.onSubscribedMessage(async (thread: Thread, message: Message) => {
      await this.handleIncomingMessage(thread, message);
    });
  }

  /**
   * Create a ChannelPlugin for a specific adapter.
   */
  createChannelPlugin(adapterName: string): ChatSdkChannelPlugin {
    const adapter = this.adapters[adapterName];
    if (!adapter) {
      throw new Error(`Adapter "${adapterName}" not found in bridge config`);
    }
    return new ChatSdkChannelPlugin(adapter, this);
  }

  /**
   * Start all adapters via the Chat instance.
   */
  async start(): Promise<void> {
    await this.chat.initialize();
  }

  /**
   * Stop all adapters.
   */
  async stop(): Promise<void> {
    await this.chat.shutdown();
  }

  /**
   * Get the underlying Chat instance (for advanced use / command registration).
   */
  getChat(): Chat {
    return this.chat;
  }

  /**
   * Get the state adapter.
   */
  getState(): GatewayStateAdapter {
    return this.stateAdapter;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private async handleIncomingMessage(thread: Thread, message: Message): Promise<void> {
    if (!this.api) {
      throw new Error("ChatSdkBridge: api not set — call setApi() before handling messages");
    }

    const adapterName = thread.adapter.name;
    const adapter = this.adapters[adapterName];
    if (!adapter) return;

    const threadId = thread.id;

    // Create an edit function for streaming callbacks
    let placeholderMsgId: string | null = null;
    const editFn = async (text: string): Promise<boolean> => {
      try {
        if (!placeholderMsgId) {
          // Create placeholder on first streaming update
          const result = await adapter.postMessage(threadId, text);
          placeholderMsgId = result.id;
          return true;
        }
        await adapter.editMessage(threadId, placeholderMsgId, { markdown: text });
        return true;
      } catch {
        return false;
      }
    };

    // Create streaming callbacks
    const streamCallbacks = createStreamingCallbacks(editFn, this.streamingOptions);

    const inbound = toInboundMessage(adapterName, thread, message, {
      respond: async (text: string) => {
        if (placeholderMsgId) {
          // Edit the streaming placeholder with final text
          try {
            await adapter.editMessage(threadId, placeholderMsgId, toPostableMessage(text) as any);
          } catch {
            // Fallback: send new message
            await adapter.postMessage(threadId, toPostableMessage(text) as any);
          }
        } else {
          const postable = toPostableMessage(text);
          await adapter.postMessage(threadId, postable as any);
        }
      },
      setTyping: async (active: boolean) => {
        if (active) {
          await adapter.startTyping(threadId).catch(() => {});
        }
      },
      onStreamDelta: streamCallbacks.onStreamDelta,
      onThinkingDelta: streamCallbacks.onThinkingDelta,
      onToolStart: streamCallbacks.onToolStart,
      onSteerInjected: () => {
        streamCallbacks.onSteerInjected();
        placeholderMsgId = null;
      },
    });

    await this.api.dispatch(inbound as InboundMessage & Record<string, unknown>);
  }
}
