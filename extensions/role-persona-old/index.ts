/**
 * Role Persona Extension - OpenClaw-style persona system for pi
 *
 * Features:
 * - Role selection on startup (not switchable within session)
 * - TUI status display of current role
 * - Full OpenClaw prompt file structure (AGENTS, BOOTSTRAP, IDENTITY, USER, SOUL, etc.)
 * - Automatic memory loading (daily + long-term)
 * - First-run bootstrap guidance
 *
 * Directory structure:
 * ~/.pi/agent/roles/
 *   ├── <role>/
 *   │   ├── core/
 *   │   │   ├── agents.md
 *   │   │   ├── identity.md
 *   │   │   ├── soul.md
 *   │   │   ├── user.md
 *   │   │   ├── tools.md
 *   │   │   ├── heartbeat.md
 *   │   │   └── constraints.md
 *   │   ├── memory/
 *   │   │   ├── consolidated.md
 *   │   │   └── daily/YYYY-MM-DD.md
 *   │   ├── context/
 *   │   ├── skills/
 *   │   └── BOOTSTRAP.md
 *   └── ...
 *
 * This file is the composition root only. The implementation lives in runtime/:
 *   context.ts          shared Runtime state
 *   lifecycle.ts        session_start / resources_discover / agent_end / shutdown / turn_end
 *   injection.ts        before_agent_start system prompt injection
 *   compaction.ts       compaction-time memory extraction + custom-compaction handoff
 *   auto-memory.ts      auto-memory checkpoint scheduling and flush
 *   role-activation.ts  role activation flow
 *   external-readonly.ts optional external readonly memory service
 *   tool-search.ts      role_search tool (unified memory + knowledge retrieval)
 *   tool-exec.ts        role_exec tool (op dispatch + on-demand help catalog)
 *   tool-*.ts           op executors (memory / knowledge / role_info)
 *   commands-*.ts       memory / kb / role slash commands
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createRuntime } from "./runtime/context.ts";
import { registerCompaction } from "./runtime/compaction.ts";
import { registerInjection } from "./runtime/injection.ts";
import { registerLifecycle } from "./runtime/lifecycle.ts";
import { registerKbCommand } from "./runtime/commands-kb.ts";
import { registerMemoryCommands } from "./runtime/commands-memory.ts";
import { registerRoleCommand } from "./runtime/commands-role.ts";
import { registerRoleExecTool } from "./runtime/tool-exec.ts";
import { registerRoleSearchTool } from "./runtime/tool-search.ts";
import { registerRoleMessageRenderers } from "./tui-renderers.ts";

export default function rolePersonaExtension(pi: ExtensionAPI) {
  // ── CLI flag: --nr = no role-persona (completely disable this extension) ──
  // MUST register first so applyExtensionFlagValues recognises it.
  pi.registerFlag("nr", {
    description: "Disable role-persona-old extension entirely",
    type: "boolean",
    default: false,
  });

  // Fast exit: check process.argv directly.
  // getFlag() values are populated AFTER all extensions load (applyExtensionFlagValues
  // runs post-load), so pi.getFlag("nr") at this point always returns the default.
  // We check argv synchronously so the extension body never executes.
  if (process.argv.some(a => a === "--nr" || a.startsWith("--nr="))) return;
  // Belt-and-suspenders for SDK / programmatic usage where getFlag may already be set
  if (pi.getFlag("nr") !== false) return;

  registerRoleMessageRenderers(pi);

  const rt = createRuntime(pi, import.meta.url);

  // Events
  const compaction = registerCompaction(rt);
  registerLifecycle(rt, compaction);
  registerInjection(rt);

  // Tools: progressive disclosure — one search, one exec (details via op "help")
  registerRoleSearchTool(rt);
  registerRoleExecTool(rt);

  // Commands
  registerMemoryCommands(rt);
  registerKbCommand(rt);
  registerRoleCommand(rt);
}
