/**
 * Model Providers Registry
 * 
 * Central registry for all provider adapters.
 * Each provider is a separate plugin in the providers/ directory.
 */

import type { ProviderAdapter } from "@earendil-works/pi-coding-agent";

// Import provider plugins
import { qwenOAuthAdapter } from "./providers/qwen-oauth/index.ts";

/**
 * Get all builtin provider adapters
 */
export function getBuiltinAdapters(): ProviderAdapter[] {
  // Only qwen-oauth is enabled by default
  return [qwenOAuthAdapter];
}

/**
 * Get a specific provider adapter by name
 */
export function getAdapter(name: string): ProviderAdapter | undefined {
  const adapters = getBuiltinAdapters();
  return adapters.find((a) => a.name === name);
}
