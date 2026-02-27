/**
 * Gateway-aware state adapter.
 *
 * Wraps an underlying StateAdapter (e.g., MemoryStateAdapter) and integrates
 * with gateway's session store for subscription persistence.
 */

import type { StateAdapter, Lock } from "chat";

/**
 * Thin wrapper around a StateAdapter that can be extended
 * to integrate with gateway session persistence.
 */
export class GatewayStateAdapter implements StateAdapter {
  constructor(private readonly inner: StateAdapter) {}

  async connect(): Promise<void> {
    await this.inner.connect();
  }

  async disconnect(): Promise<void> {
    await this.inner.disconnect();
  }

  async subscribe(threadId: string): Promise<void> {
    await this.inner.subscribe(threadId);
  }

  async unsubscribe(threadId: string): Promise<void> {
    await this.inner.unsubscribe(threadId);
  }

  async isSubscribed(threadId: string): Promise<boolean> {
    return this.inner.isSubscribed(threadId);
  }

  async acquireLock(threadId: string, ttlMs: number): Promise<Lock | null> {
    return this.inner.acquireLock(threadId, ttlMs);
  }

  async releaseLock(lock: Lock): Promise<void> {
    await this.inner.releaseLock(lock);
  }

  async extendLock(lock: Lock, ttlMs: number): Promise<boolean> {
    return this.inner.extendLock(lock, ttlMs);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.inner.get<T>(key);
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.inner.set(key, value, ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.inner.delete(key);
  }
}
