/**
 * Prompt Injector for Concise Mode
 * 
 * Strategy Pattern: Encapsulates prompt injection logic.
 * Allows different injection strategies per channel.
 */

/**
 * Prompt injection strategy interface
 */
export interface InjectionStrategy {
  /**
   * Inject concise-mode instructions into message text
   */
  inject(text: string, context?: InjectionContext): string;
  
  /**
   * Get the injection marker for detection
   */
  getMarker(): string;
}

export interface InjectionContext {
  channel: string;
  sessionKey: string;
  chatType: "dm" | "group";
}

/**
 * Default injection strategy - appends prompt suffix
 */
export class SuffixInjectionStrategy implements InjectionStrategy {
  private readonly suffix: string;
  private readonly marker: string;

  constructor(suffix?: string) {
    this.suffix = suffix ?? DEFAULT_CONCISE_PROMPT;
    this.marker = "[Concise Output Mode]";
  }

  inject(text: string, _context?: InjectionContext): string {
    return `${text}${this.suffix}`;
  }

  getMarker(): string {
    return this.marker;
  }
}

/**
 * System prompt injection strategy (for channels that support it)
 */
export class SystemPromptInjectionStrategy implements InjectionStrategy {
  private readonly systemPrompt: string;
  private readonly marker: string;

  constructor(systemPrompt?: string) {
    this.systemPrompt = systemPrompt ?? DEFAULT_CONCISE_SYSTEM_PROMPT;
    this.marker = "[Concise System Mode]";
  }

  inject(text: string, _context?: InjectionContext): string {
    // For channels that support system messages, prepend as system context
    return `${this.systemPrompt}\n\n${text}`;
  }

  getMarker(): string {
    return this.marker;
  }
}

/**
 * Factory for creating injection strategies
 */
export class InjectionStrategyFactory {
  /**
   * Create strategy based on channel type
   */
  static create(channel: string, chatType?: "dm" | "group"): InjectionStrategy {
    // Telegram groups might benefit from system-style injection
    if (channel === "telegram" && chatType === "group") {
      return new SystemPromptInjectionStrategy();
    }
    
    // Default to suffix injection for all channels
    return new SuffixInjectionStrategy();
  }

  /**
   * Create custom strategy with specific prompt
   */
  static custom(prompt: string): InjectionStrategy {
    return new SuffixInjectionStrategy(prompt);
  }
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONCISE_PROMPT = `

[Concise Output Mode]
- Communicate to user only via send_message tool.
- Keep messages short and actionable.
- If no user-facing message is needed, output exactly [NO_REPLY].`;

const DEFAULT_CONCISE_SYSTEM_PROMPT = `You are in concise output mode.
Rules:
1. Use send_message tool for all user communication
2. Keep messages short and actionable
3. Output [NO_REPLY] when no user-facing message is needed`;

/**
 * Default silent token for suppressing output
 */
export const SILENT_TOKEN = "[NO_REPLY]";

/**
 * Check if text contains concise-mode marker
 */
export function isConciseMode(text: string): boolean {
  return text.includes("[Concise Output Mode]");
}
