/**
 * Concise Mode Core Module
 * 
 * Exports core functionality for concise-mode plugin.
 * Follows Single Responsibility Principle with clear separation:
 * - StateManager: Session state and suppress route management
 * - PromptInjector: Prompt injection strategies
 * - Plugin: Main plugin orchestration
 */

export {
  ConciseStateManager,
  type ConciseSessionState,
  type ConciseMetrics,
} from "./state-manager.ts";

export {
  SuffixInjectionStrategy,
  SystemPromptInjectionStrategy,
  InjectionStrategyFactory,
  isConciseMode,
  SILENT_TOKEN,
  type InjectionStrategy,
  type InjectionContext,
} from "./prompt-injector.ts";
