/**
 * WeChat plugin logger with redaction support.
 *
 * Ported from @tencent-weixin/openclaw-weixin src/util/logger.ts and src/util/redact.ts
 */

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  withAccount(accountId: string): Logger;
  getLogFilePath(): string;
}

class WechatLogger implements Logger {
  private prefix: string;
  private accountId?: string;

  constructor(prefix: string = "[wechat]", accountId?: string) {
    this.prefix = prefix;
    this.accountId = accountId;
  }

  private format(message: string): string {
    const timestamp = new Date().toISOString();
    const account = this.accountId ? `:${this.accountId}` : "";
    return `${timestamp} ${this.prefix}${account} ${message}`;
  }

  private shouldSuppressDebug(message: string): boolean {
    return message.includes("[wechat:api]");
  }

  debug(message: string): void {
    if (this.shouldSuppressDebug(message)) {
      return;
    }
    console.debug(this.format(message));
  }

  info(message: string): void {
    console.info(this.format(message));
  }

  warn(message: string): void {
    console.warn(this.format(message));
  }

  error(message: string): void {
    console.error(this.format(message));
  }

  withAccount(accountId: string): Logger {
    return new WechatLogger(this.prefix, accountId);
  }

  getLogFilePath(): string {
    // Placeholder - pi-gateway has its own logging infrastructure
    return "";
  }
}

export const logger: Logger = new WechatLogger("[wechat]");

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /bot_token[=:]\s*\S+/gi,
  /token[=:]\s*\S+/gi,
  /Authorization[=:]\s*Bearer\s+\S+/gi,
  /aes_key[=:]\s*\S+/gi,
  /encrypt_query_param[=:]\s*\S+/gi,
  /qrcode[=:]\s*\S+/gi,
];

/**
 * Redact sensitive values in a string.
 */
export function redactToken(value: string): string {
  if (!value || value.length < 16) return "***";
  return `${value.slice(0, 8)}***`;
}

/**
 * Redact sensitive values in a URL string.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Redact query parameters that might contain tokens
    const paramsToRedact = ["token", "bot_token", "qrcode", "aes_key"];
    for (const param of paramsToRedact) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "***");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Redact sensitive values in a JSON body string.
 */
export function redactBody(body: string): string {
  let result = body;

  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      const parts = match.split(/[=:]/);
      if (parts.length === 2) {
        return `${parts[0]}: ***`;
      }
      return match;
    });
  }

  // Truncate long strings
  if (result.length > 500) {
    return result.slice(0, 500) + "...";
  }

  return result;
}

// ---------------------------------------------------------------------------
// Random ID Generation
// ---------------------------------------------------------------------------

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a random ID with a prefix.
 */
export function generateId(prefix: string): string {
  let result = `${prefix}-`;
  for (let i = 0; i < 16; i++) {
    result += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  }
  return result;
}
