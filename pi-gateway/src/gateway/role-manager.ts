/**
 * Role Manager — role listing + session role switching.
 *
 * Extracted from server.ts:
 *   - listAvailableRoles():2483-2488
 *   - setSessionRole():2494-2527
 *
 * These are also exposed on GatewayContext as bound methods
 * so other modules (WS methods, plugin API) can call them.
 */

import type { GatewayContext } from "./types.ts";
import type { SessionKey } from "../core/types.ts";

/**
 * Get all available roles from config (workspaceDirs + capabilities keys).
 * Always includes "default".
 */
export function listAvailableRoles(ctx: GatewayContext): string[] {
  const workspaceRoles = Object.keys(ctx.config.roles.workspaceDirs ?? {});
  const capabilityRoles = Object.keys(ctx.config.roles.capabilities ?? {});
  const allRoles = new Set([...workspaceRoles, ...capabilityRoles, "default"]);
  return Array.from(allRoles).sort();
}

/**
 * Set role for a session and respawn RPC process with new capability profile.
 * Returns true if role changed, false if already on that role.
 * Throws if session not found.
 */
export async function setSessionRole(
  ctx: GatewayContext,
  sessionKey: SessionKey,
  newRole: string,
): Promise<boolean> {
  const session = ctx.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Session not found: ${sessionKey}`);
  }

  const currentRole = session.role ?? "default";
  if (currentRole === newRole) {
    return false;
  }

  // Release current RPC process
  ctx.pool.release(sessionKey);

  // Update session role
  session.role = newRole;
  session.lastActivity = Date.now();
  ctx.sessions.touch(sessionKey);

  // Pre-warm new RPC process with new capability profile
  try {
    const profile = ctx.buildSessionProfile(sessionKey, newRole);
    await ctx.pool.acquire(sessionKey, profile);
  } catch (err) {
    ctx.log.warn(`Failed to pre-warm RPC for role ${newRole}: ${err}`);
    // Non-fatal: process will be acquired on next message
  }

  ctx.log.info(`Role changed for ${sessionKey}: ${currentRole} -> ${newRole}`);
  return true;
}
