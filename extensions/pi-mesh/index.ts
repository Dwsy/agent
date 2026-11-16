/**
 * pi-mesh — multi-pi session awareness mesh (extension side).
 *
 * Zero tools are registered (hard requirement): the capability surface is the
 * pi-mesh skill, injected progressively via resources_discover. Everything
 * else is silent hub telemetry plus hub-routed control — see src/hooks.ts.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerMeshHooks } from "./src/hooks.ts";
import { registerMeshCommand, registerMeshStatusCommand } from "./src/command.ts";

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(EXT_DIR, "skills", "pi-mesh");

export default function (pi: ExtensionAPI) {
	// The skill stays the only capability surface for the model; /mesh and
	// /mesh-status are human-facing and never enter the model context.
	registerMeshCommand(pi);
	registerMeshStatusCommand(pi);
	pi.on("resources_discover", () => ({ skillPaths: [SKILL_DIR] }));
	registerMeshHooks(pi);
}
