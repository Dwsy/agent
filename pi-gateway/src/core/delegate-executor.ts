/**
 * Delegate Executor — v3 Multi-Agent Sync Delegation
 *
 * Handles delegate_to_agent tool execution with:
 * - Security constraints (allowlist, maxConcurrent, maxDepth)
 * - RPC pool interaction with capability profile matching
 * - Timeout and error handling
 * - Resource cleanup guarantee
 */

import type { RpcPool } from "./rpc-pool.ts";
import type { RpcClient } from "./rpc-client.ts";
import type {
  DelegateToAgentParams,
  DelegateResult,
  DelegateHandler,
} from "../tools/delegate-to-agent.ts";
import type { AgentsConfig, AgentDefinition, DelegationConstraints } from "./config.ts";
import type { SessionKey, Logger } from "./types.ts";
import { buildCapabilityProfile } from "./capability-profile.ts";
import type { Config } from "./config.ts";
import type { MetricsCollector } from "./metrics.ts";

// ============================================================================
// Types
// ============================================================================

export interface DelegateContext {
  id: string;
  parentSessionKey: SessionKey;
  parentAgentId: string;
  targetAgentId: string;
  delegateSessionKey: SessionKey;
  startTime: number;
  status: "pending" | "running" | "completed" | "error";
  depth: number;
}

export interface DelegateParentContext {
  sessionKey: SessionKey;
  agentId: string;
  userMessage: string;
}

export type DelegateErrorType =
  | "AGENT_NOT_FOUND"
  | "AGENT_NOT_ALLOWED"
  | "POOL_CAPACITY_EXCEEDED"
  | "TIMEOUT"
  | "RPC_ERROR"
  | "AGENT_CRASH"
  | "MAX_DEPTH_EXCEEDED"
  | "MAX_CONCURRENT_EXCEEDED";

export class DelegateError extends Error {
  constructor(
    public type: DelegateErrorType,
    message: string,
    public recoverable: boolean = false,
  ) {
    super(message);
  }
}

// ============================================================================
// Delegate Executor
// ============================================================================

export class DelegateExecutor implements DelegateHandler {
  private contexts = new Map<string, DelegateContext>();
  private activeDelegations = new Map<string, number>(); // agentId -> count

  constructor(
    private config: Config,
    private pool: RpcPool,
    private log: Logger,
    private metrics?: MetricsCollector,
  ) {}

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check if target agent exists
   */
  isAgentAvailable(agentId: string): boolean {
    return this.getAgentConfig(agentId) !== undefined;
  }

  /**
   * Get list of available agent IDs
   */
  getAvailableAgents(): string[] {
    return this.config.agents?.list.map(a => a.id) ?? [];
  }

  /**
   * Execute sync delegation
   */
  async executeDelegation(
    sourceSessionKey: SessionKey,
    params: DelegateToAgentParams,
  ): Promise<DelegateResult> {
    const { agentId, task, timeoutMs = 60000 } = params;
    const startTime = Date.now();

    // Record delegation start
    this.metrics?.recordDelegationStart();

    // Build parent context from source session
    const parentContext = await this.buildParentContext(sourceSessionKey);

    // Get current delegation depth from RPC metadata (passed via context)
    const currentDepth = 0; // Will be populated from RPC metadata in integration layer

    try {
      // 1. Security constraints check
      const check = this.checkDelegationConstraints(
        parentContext.agentId,
        agentId,
        sourceSessionKey,
        currentDepth,
      );
      if (!check.allowed) {
        const result: DelegateResult = {
          status: "rejected",
          error: check.reason,
          agentId,
          durationMs: Date.now() - startTime,
        };
        this.metrics?.recordDelegationComplete(result.durationMs!, "rejected");
        return result;
      }

      // 2. Get target agent config
      const agentConfig = this.getAgentConfig(agentId);
      if (!agentConfig) {
        throw new DelegateError("AGENT_NOT_FOUND", `Agent '${agentId}' not found`);
      }

      // 3. Create delegation context
      const delegateSessionKey = this.generateDelegateSessionKey(
        sourceSessionKey,
        agentId,
      );

      // TODO: Get actual depth from RPC metadata in integration layer
      const depth = currentDepth + 1;
      const context = this.createContext(
        sourceSessionKey,
        parentContext.agentId,
        agentId,
        delegateSessionKey,
        depth,
      );

      // 4. Execute with cleanup guarantee
      return await this.executeWithCleanup(context, async () => {
        // 4.1 Acquire RPC process
        const rpc = await this.acquireRpc(agentConfig, delegateSessionKey);
        if (!rpc) {
          throw new DelegateError(
            "POOL_CAPACITY_EXCEEDED",
            "No idle process available and pool at capacity",
            true,
          );
        }

        // 4.2 Setup session with delegation metadata
        await this.setupDelegationSession(rpc, delegateSessionKey, context);

        // 4.3 Build and send prompt
        const prompt = this.buildDelegatePrompt(task, parentContext);

        // 4.4 Execute with timeout
        const response = await this.executeWithTimeout(
          () => this.executeBlocking(rpc, prompt, timeoutMs),
          timeoutMs,
          "Delegation execution",
        );

        const result: DelegateResult = {
          status: "completed",
          response,
          agentId,
          durationMs: Date.now() - startTime,
        };
        this.metrics?.recordDelegationComplete(result.durationMs!, "completed");
        return result;
      });
    } catch (error) {
      const result = this.handleExecutionError(error, agentId, startTime);
      // Map status to metrics status
      const metricStatus = result.status === "timeout" ? "timeout" :
                          result.status === "error" ? "error" : "error";
      const durationMs = result.durationMs ?? (Date.now() - startTime);
      this.metrics?.recordDelegationComplete(durationMs, metricStatus);
      return result;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private getAgentConfig(agentId: string): AgentDefinition | undefined {
    return this.config.agents?.list.find(a => a.id === agentId);
  }

  private getDefaultAgentId(): string {
    return this.config.agents?.default ?? "main";
  }

  private async buildParentContext(sessionKey: SessionKey): Promise<DelegateParentContext> {
    // Derive agent ID from session key or use default
    // Format: agent:{agentId}:{channel}:...
    const parts = sessionKey.split(":");
    const agentId = parts[1] ?? this.getDefaultAgentId();

    return {
      sessionKey,
      agentId,
      userMessage: "", // Will be populated from actual message context
    };
  }

  private generateDelegateSessionKey(
    parentSessionKey: SessionKey,
    agentId: string,
  ): SessionKey {
    const timestamp = Date.now();
    return `delegate:${parentSessionKey}:${agentId}:${timestamp}` as SessionKey;
  }

  private checkDelegationConstraints(
    sourceAgentId: string,
    targetAgentId: string,
    parentSessionKey: SessionKey,
    currentDepth: number,
  ): { allowed: boolean; reason?: string } {
    const agentConfig = this.getAgentConfig(sourceAgentId);
    const constraints = agentConfig?.delegation;

    if (!constraints) {
      return { allowed: false, reason: "Source agent has no delegation config" };
    }

    // Check allowlist
    if (!constraints.allowAgents.includes(targetAgentId)) {
      return {
        allowed: false,
        reason: `Agent '${targetAgentId}' not in allowlist`,
      };
    }

    // Check concurrent limit
    const currentCount = this.activeDelegations.get(sourceAgentId) ?? 0;
    if (currentCount >= constraints.maxConcurrent) {
      return {
        allowed: false,
        reason: `Max concurrent delegations (${constraints.maxConcurrent}) reached`,
      };
    }

    // Check depth from RPC metadata
    if (currentDepth >= constraints.maxDepth) {
      return {
        allowed: false,
        reason: `Max delegation depth (${constraints.maxDepth}) reached`,
      };
    }

    return { allowed: true };
  }

  private createContext(
    parentSessionKey: SessionKey,
    parentAgentId: string,
    targetAgentId: string,
    delegateSessionKey: SessionKey,
    depth: number,
  ): DelegateContext {
    const context: DelegateContext = {
      id: `delegate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      parentSessionKey,
      parentAgentId,
      targetAgentId,
      delegateSessionKey,
      startTime: Date.now(),
      status: "pending",
      depth,
    };

    this.contexts.set(context.id, context);
    this.incrementActiveCount(parentAgentId);

    return context;
  }

  private incrementActiveCount(agentId: string): void {
    const current = this.activeDelegations.get(agentId) ?? 0;
    this.activeDelegations.set(agentId, current + 1);
  }

  private decrementActiveCount(agentId: string): void {
    const current = this.activeDelegations.get(agentId) ?? 0;
    if (current > 1) {
      this.activeDelegations.set(agentId, current - 1);
    } else {
      this.activeDelegations.delete(agentId);
    }
  }

  private async acquireRpc(
    agentConfig: AgentDefinition,
    sessionKey: SessionKey,
  ): Promise<RpcClient | null> {
    // Build capability profile for matching
    // Note: model/extensions/skills come from role config, not directly from agentConfig
    const profile = buildCapabilityProfile({
      config: this.config,
      role: agentConfig.role ?? agentConfig.id,
      cwd: agentConfig.workspace,
      sessionKey,
    });

    // Use SwiftQuartz's findBestMatch interface
    const idleClient = (this.pool as any).findBestMatch?.(profile);
    if (idleClient) {
      // Bind and setup session
      idleClient.bindSession?.(sessionKey);
      return idleClient;
    }

    // Try to acquire new slot
    try {
      return await this.pool.acquire(sessionKey, profile);
    } catch {
      // Pool at capacity - v3.0: return null (no retry)
      return null;
    }
  }

  private async setupDelegationSession(
    rpc: RpcClient,
    sessionKey: SessionKey,
    context: DelegateContext,
  ): Promise<void> {
    // v3.1: Will set RPC metadata delegationDepth
    // For now, just ensure session is initialized
    context.status = "running";
  }

  private buildDelegatePrompt(
    task: string,
    parentContext: DelegateParentContext,
  ): string {
    // DarkFalcon review: delegation context as user message prefix with conciseness guidance
    return `[Delegated task from agent "${parentContext.agentId}". Respond concisely to the task below.]\n\n${task}`;
  }

  private async executeBlocking(
    rpc: RpcClient,
    promptText: string,
    timeoutMs: number,
  ): Promise<string> {
    // DarkFalcon review: use rpc.promptAndCollect for delegation
    // This sends the message and waits for the response with timeout
    // Returns the collected text directly
    const text = await rpc.promptAndCollect(promptText, timeoutMs);
    return text.trim();
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string,
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new DelegateError("TIMEOUT", `${operationName} timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }

  private async executeWithCleanup<T>(
    context: DelegateContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } finally {
      await this.cleanupContext(context);
    }
  }

  private async cleanupContext(context: DelegateContext): Promise<void> {
    context.status = context.status === "running" ? "completed" : "error";
    this.decrementActiveCount(context.parentAgentId);

    // Release RPC
    try {
      this.pool.release(context.delegateSessionKey);
    } catch (err) {
      this.log.warn(`Failed to release RPC for ${context.delegateSessionKey}: ${err}`);
    }

    // Clean up context tracking
    this.contexts.delete(context.id);
  }

  private handleExecutionError(
    error: unknown,
    agentId: string,
    startTime: number,
  ): DelegateResult {
    const durationMs = Date.now() - startTime;

    if (error instanceof DelegateError) {
      return {
        status: error.type === "TIMEOUT" ? "timeout" : "error",
        error: error.message,
        agentId,
        durationMs,
      };
    }

    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      agentId,
      durationMs,
    };
  }
}
