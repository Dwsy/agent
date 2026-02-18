/**
 * GatewayObservability 单元测试
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { GatewayObservability, parseObservabilityWindow } from "./gateway-observability.ts";

describe("GatewayObservability", () => {
  let obs: GatewayObservability;

  beforeEach(() => {
    obs = new GatewayObservability(10);
  });

  describe("record", () => {
    it("should record an event", () => {
      const event = obs.record("info", "gateway", "test", "Test message");
      expect(event.level).toBe("info");
      expect(event.category).toBe("gateway");
      expect(event.action).toBe("test");
      expect(event.message).toBe("Test message");
      expect(event.ts).toBeGreaterThan(0);
      expect(event.id).toBeDefined();
    });

    it("should record event with meta", () => {
      const meta = { key: "value", num: 42 };
      const event = obs.record("error", "api", "failed", "Error occurred", meta);
      expect(event.meta).toEqual(meta);
    });
  });

  describe("list", () => {
    it("should list all events", () => {
      obs.record("info", "gateway", "a", "Message A");
      obs.record("warn", "api", "b", "Message B");
      const events = obs.list();
      expect(events.length).toBe(2);
    });

    it("should respect limit", () => {
      for (let i = 0; i < 5; i++) {
        obs.record("info", "gateway", `action${i}`, `Message ${i}`);
      }
      const events = obs.list({ limit: 3 });
      expect(events.length).toBe(3);
    });

    it("should filter by level", () => {
      obs.record("info", "gateway", "a", "Info message");
      obs.record("error", "gateway", "b", "Error message");
      obs.record("warn", "gateway", "c", "Warn message");
      const errors = obs.list({ level: "error" });
      expect(errors.length).toBe(1);
      expect(errors[0].level).toBe("error");
    });

    it("should filter by category", () => {
      obs.record("info", "gateway", "a", "Gateway message");
      obs.record("info", "cron", "b", "Cron message");
      obs.record("info", "api", "c", "API message");
      const cronEvents = obs.list({ category: "cron" });
      expect(cronEvents.length).toBe(1);
      expect(cronEvents[0].category).toBe("cron");
    });
  });

  describe("summary", () => {
    it("should return correct summary", () => {
      obs.record("info", "gateway", "a", "Message 1");
      obs.record("info", "gateway", "b", "Message 2");
      obs.record("error", "api", "c", "Error 1");
      obs.record("warn", "cron", "d", "Warn 1");

      const summary = obs.summary();
      expect(summary.total).toBe(4);
      expect(summary.byLevel.info).toBe(2);
      expect(summary.byLevel.error).toBe(1);
      expect(summary.byLevel.warn).toBe(1);
      expect(summary.byLevel.debug).toBe(0);
      expect(summary.byCategory.gateway).toBe(2);
      expect(summary.byCategory.api).toBe(1);
      expect(summary.byCategory.cron).toBe(1);
      expect(summary.topActions.length).toBeGreaterThan(0);
      expect(summary.topActions.some((it) => it.action === "a")).toBe(true);
      expect(summary.errorRatePct).toBe(25);
      expect(summary.windowMs).toBeNull();
    });

    it("should return recent errors", () => {
      obs.record("info", "gateway", "a", "Info");
      obs.record("error", "api", "b", "Error 1");
      obs.record("error", "cron", "c", "Error 2");
      
      const summary = obs.summary();
      expect(summary.recentErrors.length).toBe(2);
    });
  });

  describe("getRecentErrors", () => {
    it("should return only errors", () => {
      obs.record("info", "gateway", "a", "Info");
      obs.record("error", "api", "b", "Error 1");
      obs.record("warn", "cron", "c", "Warn");
      obs.record("error", "gateway", "d", "Error 2");

      const errors = obs.getRecentErrors(10);
      expect(errors.length).toBe(2);
      expect(errors.every((e) => e.level === "error")).toBe(true);
    });

    it("should respect limit", () => {
      for (let i = 0; i < 5; i++) {
        obs.record("error", "gateway", `action${i}`, `Error ${i}`);
      }
      const errors = obs.getRecentErrors(3);
      expect(errors.length).toBe(3);
    });
  });

  describe("ring buffer", () => {
    it("should not exceed max size", () => {
      const smallObs = new GatewayObservability(3);
      smallObs.record("info", "gateway", "a", "1");
      smallObs.record("info", "gateway", "b", "2");
      smallObs.record("info", "gateway", "c", "3");
      smallObs.record("info", "gateway", "d", "4");
      
      expect(smallObs.size()).toBe(3);
      const events = smallObs.list();
      expect(events.length).toBe(3);
      // Oldest should be evicted
      expect(events.some((e) => e.message === "1")).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all events", () => {
      obs.record("info", "gateway", "a", "Message");
      expect(obs.size()).toBe(1);
      obs.clear();
      expect(obs.size()).toBe(0);
    });
  });

  describe("parseObservabilityWindow", () => {
    it("should parse known windows", () => {
      expect(parseObservabilityWindow("5m")).toBe(300000);
      expect(parseObservabilityWindow("1h")).toBe(3600000);
      expect(parseObservabilityWindow("7d")).toBe(604800000);
    });

    it("should parse numeric milliseconds", () => {
      expect(parseObservabilityWindow("120000")).toBe(120000);
    });

    it("should return undefined for invalid input", () => {
      expect(parseObservabilityWindow("bad")).toBeUndefined();
      expect(parseObservabilityWindow(null)).toBeUndefined();
    });
  });
});
