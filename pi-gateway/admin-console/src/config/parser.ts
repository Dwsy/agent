/**
 * 配置解析器
 * 处理 JSON 配置解析、验证和错误处理
 */
import { AdminConfigSchema, type AdminConfig } from './schema';

/**
 * 解析结果类型
 */
export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: ParseError;
}

/**
 * 解析错误类型
 */
export interface ParseError {
  message: string;
  code: ParseErrorCode;
  details?: Array<{ path: string; message: string }>;
}

/**
 * 解析错误码
 */
export enum ParseErrorCode {
  INVALID_JSON = 'INVALID_JSON',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN = 'UNKNOWN',
}

/**
 * 解析错误类
 */
export class ConfigParseError extends Error {
  constructor(
    message: string,
    public code: ParseErrorCode,
    public details?: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.name = 'ConfigParseError';
  }
}

/**
 * 解析 JSON 字符串
 * @param jsonString - JSON 字符串
 * @returns 解析结果
 */
export function parseJSON(jsonString: string): ParseResult<unknown> {
  try {
    const data = JSON.parse(jsonString);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Invalid JSON',
        code: ParseErrorCode.INVALID_JSON,
      },
    };
  }
}

/**
 * 验证配置对象
 * @param config - 待验证的配置对象
 * @returns 验证结果
 */
export function validateConfig(config: unknown): ParseResult<AdminConfig> {
  try {
    const result = AdminConfigSchema.safeParse(config);
    
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return {
        success: false,
        error: {
          message: 'Configuration validation failed',
          code: ParseErrorCode.VALIDATION_FAILED,
          details: result.error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown validation error',
        code: ParseErrorCode.UNKNOWN,
      },
    };
  }
}

/**
 * 解析并验证配置
 * @param jsonString - JSON 配置字符串
 * @returns 解析验证结果
 */
export function parseAndValidateConfig(jsonString: string): ParseResult<AdminConfig> {
  // 第一步：解析 JSON
  const parseResult = parseJSON(jsonString);
  if (!parseResult.success) {
    return parseResult as ParseResult<AdminConfig>;
  }

  // 第二步：验证 Schema
  return validateConfig(parseResult.data);
}

/**
 * 解析并验证配置对象（已解析的）
 * @param config - 配置对象
 * @returns 验证结果，失败时返回默认配置
 */
export function validateConfigWithFallback(
  config: unknown,
  fallback: AdminConfig
): AdminConfig {
  const result = validateConfig(config);
  
  if (result.success && result.data) {
    return result.data;
  }
  
  // 记录错误日志
  if (result.error) {
    console.warn('[Config] Validation failed, using fallback:', result.error.message);
    if (result.error.details) {
      console.warn('[Config] Validation details:', result.error.details);
    }
  }
  
  return fallback;
}

/**
 * 清理配置值（处理字符串数字等）
 * @param config - 原始配置
 * @returns 清理后的配置
 */
export function sanitizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      // 尝试转换字符串数字
      if (/^\d+$/.test(value)) {
        sanitized[key] = Number(value);
      } else if (value === 'true') {
        sanitized[key] = true;
      } else if (value === 'false') {
        sanitized[key] = false;
      } else {
        sanitized[key] = value;
      }
    } else if (isObject(value)) {
      sanitized[key] = sanitizeConfig(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
