import { existsSync } from "node:fs";
import { basename } from "node:path";
import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("fork-herdr-side", {
    description: "Fork the current node into a Herdr pane: /fork-herdr-side [left|right]",
    handler: async (args, ctx) => {
      let forkPath: string | undefined;
      let newPane: string | undefined;
      try {
        const side = args.trim() || "right";
        if (side !== "left" && side !== "right") throw new Error("Usage: /fork-herdr-side [left|right]");
        const pane = process.env.HERDR_PANE_ID;
        if (process.env.HERDR_ENV !== "1" || !pane) throw new Error("This command requires a Herdr pane.");
        const source = ctx.sessionManager.getSessionFile();
        const leaf = ctx.sessionManager.getLeafId();
        if (!source || !leaf || !existsSync(source)) throw new Error("The current session has no saved conversation to fork.");

        const herdr = async (args: string[]) => {
          const result = await pi.exec("herdr", args, { timeout: 10000 });
          if (result.code !== 0) throw new Error(`herdr ${args[1]} failed: ${result.stderr.trim() || result.stdout.trim()}`);
          return result.stdout;
        };
        const info = JSON.parse(await herdr(["pane", "process-info", "--pane", pane]));
        const processes: { name?: string; argv0?: string }[] = info.result.process_info.foreground_processes;
        const isGrok = processes.some((p) => p.name === "grok-pi" || basename(p.argv0 || "") === "grok-pi");
        const isPi = processes.some((p) => basename(p.argv0 || "") === "pi");
        if (!isGrok && !isPi) throw new Error("Cannot identify the top-level Pi or grok-pi process.");
        const cli = isGrok ? "grok-pi" : "pi";
        const executable = await pi.exec("which", [cli], { timeout: 5000 });
        if (executable.code !== 0 || !executable.stdout.trim()) throw new Error(`Cannot locate ${cli} in PATH.`);

        forkPath = SessionManager.open(source).createBranchedSession(leaf);
        if (!forkPath || !existsSync(forkPath)) throw new Error("The forked session could not be saved.");
        const split = JSON.parse(await herdr(["pane", "split", pane, "--direction", "right", "--cwd", ctx.cwd, "--no-focus"]));
        newPane = split.result.pane.pane_id;
        if (side === "left") await herdr(["pane", "swap", "--source-pane", pane, "--target-pane", newPane!]);
        await herdr(["pane", "run", newPane!, `${quote(executable.stdout.trim())} --session ${quote(forkPath)}`]);
        ctx.ui.notify(`Fork created in ${newPane} (${side}); ${cli} launch submitted.`, "info");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`${detail}${forkPath ? `\nFork: ${forkPath}` : ""}${newPane ? `\nPane: ${newPane}` : ""}`, "error");
      }
    },
  });
}
