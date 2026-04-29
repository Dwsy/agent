/**
 * role-persona extension — thin proxy to role-persona project.
 *
 * All logic lives in role-persona/src/:
 *   core/     (10,071L) — pure logic, zero Pi dep
 *   service/  (877L)    — unified facade
 *   transport/ (1,965L) — Pi adapter, CLI, MCP, daemon
 */
export { default } from "../../role-persona/src/transport/pi-adapter.ts";
