/**
 * TypeBox 类型声明（简化版）
 * 运行时由 @sinclair/typebox 提供
 */

declare module "@sinclair/typebox" {
  export const Type: {
    Object(properties: Record<string, unknown>, options?: unknown): unknown;
    String(options?: unknown): unknown;
    Number(options?: unknown): unknown;
    Boolean(options?: unknown): unknown;
    Optional(type: unknown): unknown;
    Union(types: unknown[], options?: unknown): unknown;
    Literal(value: string, options?: unknown): unknown;
  };
}
