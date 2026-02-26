/**
 * Telegram Callback Router — prefix-based callback_query dispatch registry.
 *
 * Each feature module registers its own prefix + handler.
 * The main callback_query listener dispatches to the first matching handler.
 *
 * This replaces the monolithic if-else chain in model-selector.ts.
 */

import type {
  TelegramAccountRuntime,
  TelegramContext,
  TelegramPluginRuntime,
} from "./types.ts";

export interface CallbackParams {
  data: string;
  ctx: TelegramContext;
  bot: TelegramAccountRuntime["bot"];
  runtime: TelegramPluginRuntime;
  account: TelegramAccountRuntime;
  callbackQuery: any;
}

export type CallbackHandler = (params: CallbackParams) => Promise<void>;

interface CallbackEntry {
  prefix: string;
  handler: CallbackHandler;
}

const registry: CallbackEntry[] = [];

/**
 * Register a callback handler for a given prefix.
 * First match wins — register more specific prefixes first if needed.
 */
export function onCallback(prefix: string, handler: CallbackHandler): void {
  registry.push({ prefix, handler });
}

/**
 * Dispatch callback data to the first matching registered handler.
 * Returns true if handled, false if no handler matched.
 */
export async function dispatchCallback(params: CallbackParams): Promise<boolean> {
  for (const entry of registry) {
    if (params.data.startsWith(entry.prefix)) {
      await entry.handler(params);
      return true;
    }
  }
  return false;
}

/**
 * Clear all registered handlers (for testing).
 */
export function clearCallbackRegistry(): void {
  registry.length = 0;
}
