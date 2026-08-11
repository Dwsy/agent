/** `role_info` tool: list the active role's directory structure. */
import { Type } from "@sinclair/typebox";
import { existsSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { roleInfoToolRenderers } from "../tui-renderers.ts";
import type { Runtime } from "./context.ts";
import { resolveRoleScopedPath, walkFiles } from "./fs-utils.ts";

export function registerRoleInfoTool(rt: Runtime): void {
  rt.pi.registerTool({
    name: "role_info",
    label: "Role Info",
    description: "List the active role's directory structure; this tool does not read file contents. Use memory/knowledge for those stores, and standard file tools only when an explicitly needed core file must be inspected.",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Relative directory path. Default: ." })),
      recursive: Type.Optional(Type.Boolean({ description: "Whether to list recursively" })),
      maxEntries: Type.Optional(Type.Number({ description: "Max files to return", minimum: 1, maximum: 500 })),
    }),
    async execute(_toolCallId: string, params: Record<string, any>) {
      const currentRolePath = rt.state.currentRolePath;
      if (!currentRolePath) {
        return { content: [{ type: "text", text: "No active role mapped in current directory." }], details: { error: true } };
      }

      const target = resolveRoleScopedPath(currentRolePath, params.path || ".");
      if (!target.ok) {
        const error = "error" in target ? target.error : "invalid path";
        return { content: [{ type: "text", text: `Invalid path: ${error}` }], details: { error: true } };
      }
      if (!existsSync(target.absolutePath)) {
        return { content: [{ type: "text", text: `Path not found: ${target.normalizedRelative}` }], details: { error: true } };
      }

      const recursive = params.recursive ?? false;
      const maxEntries = Math.max(1, Math.min(500, Math.floor(params.maxEntries || 200)));

      let files: string[] = [];
      try {
        const st = statSync(target.absolutePath);
        if (st.isFile()) {
          files = [target.absolutePath];
        } else {
          files = walkFiles(target.absolutePath, recursive, maxEntries);
        }
      } catch (err) {
        return { content: [{ type: "text", text: `List failed: ${String(err)}` }], details: { error: true } };
      }

      const roleRoot = resolve(currentRolePath);
      const relFiles = files.slice(0, maxEntries).map((p) => relative(roleRoot, p) || ".");

      const header = `Role directory: ${currentRolePath}\nBase: ${target.normalizedRelative}\nHint: 如需编辑/读取请直接阅读原文，使用 read_file + edit 工具\n---\n`;
      return {
        content: [{ type: "text", text: header + (relFiles.length > 0 ? relFiles.join("\n") : "(no files)") }],
        details: { count: relFiles.length, recursive, base: target.normalizedRelative },
      };
    },
    ...roleInfoToolRenderers,
  });
}
