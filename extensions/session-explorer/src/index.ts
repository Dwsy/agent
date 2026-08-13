/**
 * Pi extension entry point.
 *
 * `/explorer` starts the local server on first use and opens the browser. The
 * server is shared across invocations for the lifetime of the Pi process and
 * shuts down with it.
 */

import { exec } from "node:child_process";
import { platform } from "node:process";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { startServer, type ExplorerServer } from "./server.ts";

let server: ExplorerServer | null = null;
let starting: Promise<ExplorerServer> | null = null;

/** Start once; concurrent calls share the same in-flight start. */
async function ensureServer(port?: number): Promise<ExplorerServer> {
  if (server) return server;
  if (!starting) {
    starting = startServer({ port }).then((started) => {
      server = started;
      starting = null;
      return started;
    });
  }
  return starting;
}

function openInBrowser(url: string): void {
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "start ''" : "xdg-open";
  exec(`${command} "${url}"`, () => {
    // A failure to launch is not fatal: the URL is printed either way.
  });
}

/** `/explorer [port] [--no-open]` */
function parseArgs(args: string): { port?: number; open: boolean } {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const open = !tokens.includes("--no-open");
  const portToken = tokens.find((token) => /^\d+$/.test(token));

  return { port: portToken ? Number(portToken) : undefined, open };
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("explorer", {
    description: "Browse, search and read past sessions in a local web UI",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const { port, open } = parseArgs(args);

      try {
        ctx.ui.setStatus("session-explorer", "Starting session explorer…");
        const started = await ensureServer(port);
        ctx.ui.setStatus("session-explorer", undefined);

        if (open) openInBrowser(started.url);
        ctx.ui.notify(`Session Explorer: ${started.url}`, "info");
      } catch (error) {
        ctx.ui.setStatus("session-explorer", undefined);
        ctx.ui.notify(
          `Session Explorer failed to start: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
    },
  });

  pi.on("session_shutdown", async () => {
    await server?.close();
    server = null;
  });
}
