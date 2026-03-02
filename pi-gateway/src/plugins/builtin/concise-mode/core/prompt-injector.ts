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

## Concise Output Mode

**Core Principle:** Keep the user informed. Do NOT let the user wait in silence.

### Communication Protocol

Use \`send_message\` as your PRIMARY output channel. Your final text response must be \`[NO_REPLY]\`.

### Progress Stages (report at each stage)

1. **🔍 Start**: Brief statement of what you're about to do (1 line)
2. **⚡ Key Findings**: Share important discoveries or decisions as they happen
3. **✅/❌ Result**: Final outcome with clear status indicator

### Message Format Rules

- Lead with status emoji: ✅ ⚠️ ❌ 🔍 🔄 📊
- Keep each message under 200 chars when possible
- Use structured format for multi-item results (bullet points, not prose)
- Include actionable next steps when relevant

### When to Send Updates

- Task started (what you're doing)
- Significant finding or decision point
- Task completed or failed
- Asking for user input (use keyboard_select when options are discrete)

### When to Use [NO_REPLY]

Output \`[NO_REPLY]\` ONLY when you've already sent the final result via send_message.

### Anti-Patterns (NEVER do these)

- ❌ Long silence followed by a wall of text
- ❌ Sending "I'm working on it" without specifics
- ❌ Repeating the same status message
- ❌ Omitting error details when something fails`;

const DEFAULT_CONCISE_SYSTEM_PROMPT = `You are in concise output mode.

Core principle: keep the user informed; never let them wait in silence.

Rules:
1. Use send_message as the primary user-facing channel
2. Report stages: Start → Key Findings → Result
3. Prefix each send_message with status emoji (✅ ⚠️ ❌ 🔍 🔄 📊)
4. Keep updates concise and specific (target <= 200 chars)
5. Final plain-text response must be exactly [NO_REPLY] after final send_message
6. Never stay silent for long tasks, never send generic status, never hide error details`;

/**
 * Default silent token for suppressing output
 */
export const SILENT_TOKEN = "[NO_REPLY]";

/**
 * Check if text contains concise-mode marker
 */
export function isConciseMode(text: string): boolean {
  return text.includes("[Concise Output Mode]") || text.includes("## Concise Output Mode");
}
