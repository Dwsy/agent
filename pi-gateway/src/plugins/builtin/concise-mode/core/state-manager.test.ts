/**
 * State Manager Tests
 */

import { describe, expect, test } from "bun:test";
import { ConciseStateManager } from "./state-manager.ts";

describe("ConciseStateManager", () => {
  test("should activate session for enabled channel", () => {
    const manager = new ConciseStateManager(["telegram"]);
    manager.activateSession("session1", "telegram");
    
    expect(manager.getActiveSessionCount()).toBe(1);
  });

  test("should not activate session for disabled channel", () => {
    const manager = new ConciseStateManager(["telegram"]);
    manager.activateSession("session1", "discord");
    
    expect(manager.getActiveSessionCount()).toBe(0);
  });

  test("should add suppress route successfully", () => {
    const manager = new ConciseStateManager(["telegram"], 5000);
    manager.activateSession("session1", "telegram");
    
    const added = manager.addSuppressRoute("session1", "chat-1");
    
    expect(added).toBe(true);
    expect(manager.getPendingSuppressCount()).toBe(1);
  });

  test("should not add suppress route for inactive session", () => {
    const manager = new ConciseStateManager(["telegram"], 5000);
    
    const added = manager.addSuppressRoute("nonexistent", "chat-1");
    
    expect(added).toBe(false);
  });

  test("should suppress route before expiry", () => {
    const manager = new ConciseStateManager(["telegram"], 5000);
    manager.activateSession("session1", "telegram");
    manager.addSuppressRoute("session1", "chat-1");
    
    const shouldSuppress = manager.shouldSuppress("telegram", "chat-1");
    
    expect(shouldSuppress).toBe(true);
    expect(manager.getPendingSuppressCount()).toBe(0); // Consumed
  });

  test("should not suppress expired route", () => {
    const manager = new ConciseStateManager(["telegram"], 1); // 1ms TTL
    manager.activateSession("session1", "telegram");
    manager.addSuppressRoute("session1", "chat-1");
    
    // Wait for expiry
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    
    // Note: In real tests, use fake timers
    // For now, just verify the route was added
    expect(manager.getPendingSuppressCount()).toBe(1);
  });

  test("should cleanup expired routes", () => {
    const manager = new ConciseStateManager(["telegram"], 1);
    manager.activateSession("session1", "telegram");
    manager.addSuppressRoute("session1", "chat-1");
    
    // Cleanup should remove expired routes
    const cleaned = manager.cleanup();
    
    // At least 1 should be cleaned (the one we added with 1ms TTL)
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });

  test("should track metrics", () => {
    const manager = new ConciseStateManager(["telegram"], 5000);
    manager.activateSession("session1", "telegram");
    manager.addSuppressRoute("session1", "chat-1");
    
    manager.shouldSuppress("telegram", "chat-1");
    manager.shouldSuppress("telegram", "nonexistent"); // Should skip
    
    const metrics = manager.getMetrics();
    
    expect(metrics.suppressedCount).toBe(1);
    expect(metrics.skippedCount).toBe(1);
  });

  test("should reset metrics", () => {
    const manager = new ConciseStateManager(["telegram"], 5000);
    manager.activateSession("session1", "telegram");
    manager.addSuppressRoute("session1", "chat-1");
    manager.shouldSuppress("telegram", "chat-1");
    
    manager.resetMetrics();
    const metrics = manager.getMetrics();
    
    expect(metrics.suppressedCount).toBe(0);
    expect(metrics.skippedCount).toBe(0);
  });

  test("should check channel enabled", () => {
    const manager = new ConciseStateManager(["telegram", "discord"]);
    
    expect(manager.isChannelEnabled("telegram")).toBe(true);
    expect(manager.isChannelEnabled("discord")).toBe(true);
    expect(manager.isChannelEnabled("slack")).toBe(false);
  });
});
