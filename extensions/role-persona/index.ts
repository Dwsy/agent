/**
 * role-persona extension — thin proxy to role-persona project.
 *
 * Architecture:
 *   core/           — pure logic, zero Pi dep
 *   service/        — unified facade
 *   extensions/pi/  — Pi adapter (direct service via Pi SDK)
 *   transport/      — CLI, MCP, daemon
 *
 * v2: Direct service calls via Pi SDK, zero CLI dependency.
 */
export { default } from "../../role-persona/src/extensions/pi/adapter.ts";
