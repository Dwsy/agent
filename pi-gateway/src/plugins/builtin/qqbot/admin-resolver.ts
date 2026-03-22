/**
 * 管理员解析器
 * 从 allowFrom 白名单中解析管理员 openid
 */
import type { QqbotPluginRuntime } from "./types.ts";

/**
 * 解析管理员 openid 列表
 * 优先级：
 * 1. adminIds 配置（pi-gateway 扩展字段）
 * 2. allowFrom 中的所有用户
 */
export function resolveAdminOpenIds(runtime: QqbotPluginRuntime): string[] {
  const admins = new Set<string>();

  // 1. adminIds 扩展配置
  const extra = (runtime.channelCfg as unknown as Record<string, unknown>)["adminIds"];
  if (Array.isArray(extra)) {
    for (const id of extra) {
      if (typeof id === "string" || typeof id === "number") {
        admins.add(String(id));
      }
    }
  }

  // 2. allowFrom 白名单中的所有用户
  const allowFrom = runtime.channelCfg.allowFrom;
  if (allowFrom?.length) {
    for (const id of allowFrom) {
      admins.add(String(id));
    }
  }

  return Array.from(admins);
}

/**
 * 判断某 openid 是否为管理员
 */
export function isAdmin(runtime: QqbotPluginRuntime, openid: string): boolean {
  const admins = resolveAdminOpenIds(runtime);
  return admins.includes(openid);
}

/**
 * 获取第一个管理员 openid（用于发送通知）
 */
export function getFirstAdmin(runtime: QqbotPluginRuntime): string | undefined {
  const admins = resolveAdminOpenIds(runtime);
  return admins[0];
}
