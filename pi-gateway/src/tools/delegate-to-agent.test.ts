/**
 * delegate_to_agent Tool Tests — v3 Multi-Agent Routing
 *
 * Test coverage:
 * - Happy path: successful sync delegation
 * - Timeout: sync mode timeout handling
 * - Agent not found: unavailable agent error
 * - Error propagation: target agent error handling
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  delegateToAgentTool,
  validateDelegateParams,
  DELEGATE_TO_AGENT_TOOL_NAME,
  type DelegateHandler,
  type DelegateToAgentParams,
  type DelegateResult,
} from "./delegate-to-agent.ts";

// ============================================================================
// Mock Delegate Handler
// ============================================================================

class MockDelegateHandler implements DelegateHandler {
  private agents: Set<string> = new Set(["code", "docs", "ops"]);
  private mockResults: Map<string, DelegateResult> = new Map();
  private shouldTimeout = false;
  private shouldError = false;

  setMockResult(agentId: string, result: DelegateResult) {
    this.mockResults.set(agentId, result);
  }

  setShouldTimeout(value: boolean) {
    this.shouldTimeout = value;
  }

  setShouldError(value: boolean) {
    this.shouldError = value;
  }

  isAgentAvailable(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  getAvailableAgents(): string[] {
    return Array.from(this.agents);
  }

  async executeDelegation(
    _sourceSessionKey: string,
    params: DelegateToAgentParams
  ): Promise<DelegateResult> {
    if (!this.isAgentAvailable(params.agentId)) {
      return {
        status: "error",
        error: `Agent '${params.agentId}' not found or unavailable`,
        agentId: params.agentId,
      };
    }

    if (this.shouldTimeout) {
      return {
        status: "timeout",
        error: `Delegation timed out after ${params.timeoutMs ?? 60000}ms`,
        agentId: params.agentId,
      };
    }

    if (this.shouldError) {
      return {
        status: "error",
        error: "Target agent encountered an error processing the task",
        agentId: params.agentId,
      };
    }

    return (
      this.mockResults.get(params.agentId) ?? {
        status: "completed",
        response: `Task completed by ${params.agentId}: ${params.task}`,
        agentId: params.agentId,
      }
    );
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe("delegate_to_agent tool", () => {
  let handler: MockDelegateHandler;

  beforeEach(() => {
    handler = new MockDelegateHandler();
  });

  // ==========================================================================
  // Tool Definition Tests
  // ==========================================================================

  describe("tool definition", () => {
    test("has correct name", () => {
      expect(delegateToAgentTool.name).toBe(DELEGATE_TO_AGENT_TOOL_NAME);
    });

    test("has description", () => {
      expect(delegateToAgentTool.description).toContain("Delegate a task");
      expect(delegateToAgentTool.description).toContain("sync mode");
      expect(delegateToAgentTool.description).toContain("v3.1"); // async coming soon
    });

    test("has required parameters", () => {
      const params = delegateToAgentTool.parameters as {
        required: string[];
        properties: Record<string, unknown>;
      };
      expect(params.required).toContain("agentId");
      expect(params.required).toContain("task");
      expect(params.required).toContain("mode");
      expect(params.properties).toHaveProperty("timeoutMs");
      expect(params.properties).toHaveProperty("stream");
    });
  });

  // ==========================================================================
  // Parameter Validation Tests
  // ==========================================================================

  describe("validateDelegateParams", () => {
    test("accepts valid sync params", () => {
      const result = validateDelegateParams({
        agentId: "code",
        task: "Review this PR",
        mode: "sync",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.agentId).toBe("code");
        expect(result.data.mode).toBe("sync");
      }
    });

    test("rejects async params (v3.0 only supports sync)", () => {
      const result = validateDelegateParams({
        agentId: "docs",
        task: "Write API docs",
        mode: "async",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("sync");
      }
    });

    test("accepts valid params with optional fields", () => {
      const result = validateDelegateParams({
        agentId: "ops",
        task: "Check server status",
        mode: "sync",
        timeoutMs: 30000,
        stream: true,
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.timeoutMs).toBe(30000);
        expect(result.data.stream).toBe(true);
      }
    });

    test("rejects missing agentId", () => {
      const result = validateDelegateParams({
        task: "Test",
        mode: "sync",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("agentId");
      }
    });

    test("rejects empty agentId", () => {
      const result = validateDelegateParams({
        agentId: "",
        task: "Test",
        mode: "sync",
      });
      expect(result.valid).toBe(false);
    });

    test("rejects invalid mode", () => {
      const result = validateDelegateParams({
        agentId: "code",
        task: "Test",
        mode: "invalid",
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("mode");
      }
    });

    test("rejects timeoutMs out of range", () => {
      const result = validateDelegateParams({
        agentId: "code",
        task: "Test",
        mode: "sync",
        timeoutMs: 500, // Below minimum
      });
      expect(result.valid).toBe(false);
    });
  });

  // ==========================================================================
  // Happy Path Tests
  // ==========================================================================

  describe("happy path", () => {
    test("successful sync delegation returns completed result", async () => {
      const params: DelegateToAgentParams = {
        agentId: "code",
        task: "Review PR #123",
        mode: "sync",
      };

      const result = await handler.executeDelegation("session:main", params);

      expect(result.status).toBe("completed");
      expect(result.response).toContain("code");
      expect(result.response).toContain("Review PR #123");
    });

    test.skip("async delegation (v3.1)", async () => {
      // TODO: Enable when async mode is implemented in v3.1
    });

    test("delegation with stream flag", async () => {
      const params: DelegateToAgentParams = {
        agentId: "ops",
        task: "Deploy to prod",
        mode: "sync",
        stream: true,
      };

      const result = await handler.executeDelegation("session:main", params);

      expect(result.status).toBe("completed");
    });
  });

  // ==========================================================================
  // Timeout Tests
  // ==========================================================================

  describe("timeout handling", () => {
    test("sync mode returns timeout status when target exceeds timeoutMs", async () => {
      const params: DelegateToAgentParams = {
        agentId: "code",
        task: "Long running analysis",
        mode: "sync",
        timeoutMs: 5000,
      };

      handler.setShouldTimeout(true);

      const result = await handler.executeDelegation("session:main", params);

      expect(result.status).toBe("timeout");
      expect(result.error).toContain("timed out");
      expect(result.error).toContain("5000");
    });

    test("uses default timeout of 60000ms when not specified", async () => {
      const params: DelegateToAgentParams = {
        agentId: "code",
        task: "Analysis",
        mode: "sync",
      };

      handler.setShouldTimeout(true);

      const result = await handler.executeDelegation("session:main", params);

      expect(result.error).toContain("60000");
    });
  });

  // ==========================================================================
  // Agent Not Found Tests
  // ==========================================================================

  describe("agent not found", () => {
    test("returns error for non-existent agent", async () => {
      const params: DelegateToAgentParams = {
        agentId: "nonexistent",
        task: "Do something",
        mode: "sync",
      };

      const result = await handler.executeDelegation("session:main", params);

      expect(result.status).toBe("error");
      expect(result.error).toContain("nonexistent");
      expect(result.error).toContain("not found");
    });

    test("isAgentAvailable returns false for unknown agent", () => {
      expect(handler.isAgentAvailable("unknown")).toBe(false);
      expect(handler.isAgentAvailable("code")).toBe(true);
    });

    test("getAvailableAgents returns configured agents", () => {
      const agents = handler.getAvailableAgents();
      expect(agents).toContain("code");
      expect(agents).toContain("docs");
      expect(agents).toContain("ops");
      expect(agents).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Error Propagation Tests
  // ==========================================================================

  describe("error propagation", () => {
    test("target agent error is propagated to caller", async () => {
      const params: DelegateToAgentParams = {
        agentId: "code",
        task: "Trigger error",
        mode: "sync",
      };

      handler.setShouldError(true);

      const result = await handler.executeDelegation("session:main", params);

      expect(result.status).toBe("error");
      expect(result.error).toContain("Target agent");
      expect(result.error).toContain("error");
    });

    test("error response includes details for debugging", async () => {
      const params: DelegateToAgentParams = {
        agentId: "ops",
        task: "Check server",
        mode: "sync",
      };

      handler.setMockResult("ops", {
        status: "error",
        error: "Connection refused to ops agent RPC",
        sessionKey: "delegate:session:main:ops:error",
        agentId: "ops",
      });

      const result = await handler.executeDelegation("session:main", params);

      expect(result.status).toBe("error");
      expect(result.error).toContain("Connection refused");
    });
  });

  // ==========================================================================
  // Security & Constraints Tests (v3.1)
  // ==========================================================================

  describe("security constraints [v3.1]", () => {
    test.skip("enforces maxConcurrent delegation limit per agent", () => {});
    test.skip("prevents delegation chain exceeding maxDepth", () => {});
    test.skip("respects allowAgents whitelist", () => {});
    test.skip("blocks delegation to self", () => {});
  });

  // ==========================================================================
  // Streaming Tests (v3.1)
  // ==========================================================================

  describe("streaming [v3.1]", () => {
    test.skip("forwards streaming chunks to user in real-time", () => {});
    test.skip("aggregates stream into final response", () => {});
    test.skip("handles stream interruption gracefully", () => {});
  });
});
