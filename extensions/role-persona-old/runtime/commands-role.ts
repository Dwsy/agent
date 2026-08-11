/** `/role` command: TUI control center plus info/create/map/unmap/list subcommands. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openRoleControlCenter } from "../role-control-center.ts";
import {
  createRole,
  DEFAULT_ROLE,
  getRoleIdentity,
  getRoles,
  isFirstRun,
  isRoleDisabledForCwd,
  loadRoleConfig,
  resolveRoleForCwd,
  ROLES_DIR,
  saveRoleConfig,
} from "../role-store.ts";
import type { Runtime } from "./context.ts";
import { normalizePath } from "./fs-utils.ts";
import { activateRole } from "./role-activation.ts";
import { isTuiAvailable, notify, selectCreateRoleNameUI, selectRoleUI } from "./ui.ts";

export function registerRoleCommand(rt: Runtime): void {
  const { pi } = rt;

  pi.registerCommand("role", {
    description: "角色控制中心（无参数打开 TUI）: /role [tui|info|create|map|unmap|list]",
    handler: async (args, ctx) => {
      const config = loadRoleConfig();
      const cwd = ctx.cwd;
      const rawArgs = args?.trim() || "";
      const argv = rawArgs ? rawArgs.split(/\s+/) : [];
      const cmd = argv[0] || (isTuiAvailable(ctx) ? "tui" : "info");

      switch (cmd) {
        case "tui": {
          if (!isTuiAvailable(ctx)) {
            notify(rt, ctx, "当前运行模式不支持 TUI，使用 /role info 查看状态", "warning");
            return;
          }
          await openRoleControlCenter({
            ctx,
            cwd,
            extensionDir: rt.extensionDir,
            getCurrentRole: () => rt.state.currentRole,
            getCurrentRolePath: () => rt.state.currentRolePath,
            activateRole: async (roleName, rolePath) => activateRole(rt, roleName, rolePath, ctx),
            clearRole: () => {
              rt.state.currentRole = null;
              rt.state.currentRolePath = null;
              ctx.ui.setStatus("role", "off");
              ctx.ui.setStatus("memory-checkpoint", undefined);
            },
            notify: (message, type = "info") => notify(rt, ctx, message, type),
          });
          break;
        }

        case "info": {
          const resolution = resolveRoleForCwd(cwd, config);
          const mappedRole = resolution.role;

          let info = `## 角色状态\n\n`;
          info += `**当前目录**: ${cwd}\n`;
          info += `**生效角色**: ${mappedRole || "无"}\n`;
          info += `**来源**: ${resolution.source}${resolution.matchedPath ? ` (${resolution.matchedPath})` : ""}\n`;
          info += `**默认角色**: ${config.defaultRole || DEFAULT_ROLE}\n`;
          info += `**本目录禁用角色**: ${isRoleDisabledForCwd(cwd, config) ? "是" : "否"}\n\n`;

          if (mappedRole && rt.state.currentRole) {
            const isFirst = isFirstRun(rt.state.currentRolePath!);
            const identity = getRoleIdentity(rt.state.currentRolePath!);
            info += `**角色名称**: ${rt.state.currentRole}\n`;
            info += `**显示名称**: ${identity?.name || "未设置"}\n`;
            info += `**状态**: ${isFirst ? "[FIRST RUN] 首次运行" : "[OK] 已配置"}\n`;
          }

          info += `\n### 可用命令\n\n`;
          info += `- \`/role create [name]\` - 创建新角色（不填则上下选择）\n`;
          info += `- \`/role map [role]\` - 映射目录到角色（不填则上下选择）\n`;
          info += `- \`/role unmap\` - 取消映射并禁用本目录角色（含默认角色）\n`;
          info += `- \`/role list\` - 列出所有角色和映射\n`;
          info += `- \`/memories\` - 查看 memory/consolidated.md 与最近 daily memory\n`;
          info += `- \`/memory-fix\` - 强制修复 memory/consolidated.md 结构\n`;
          info += `- \`/memory-tidy\` - 手动整理记忆（修复+去重+汇总）\n`;
          info += `- \`/memory-tidy-llm [provider/model]\` - LLM整理记忆（可指定模型）\n`;
          info += `- \`/memory-distill [provider/model]\` - 启用基于 LLM 的交互式蒸馏模式\n`;
          info += `- \`/memory-distill-stop\` - 关闭交互式蒸馏模式\n`;

          pi.sendMessage({
            customType: "role-info",
            content: info,
            display: true
          }, { triggerTurn: false });
          break;
        }

        case "create": {
          let roleName = argv[1];
          if (!roleName) {
            if (!isTuiAvailable(ctx)) {
              notify(rt, ctx, "Usage: /role create <name>", "warning");
              return;
            }
            roleName = await selectCreateRoleNameUI(rt, ctx) || "";
            if (!roleName) {
              notify(rt, ctx, "已取消创建角色", "info");
              return;
            }
          }

          if (!roleName) {
            notify(rt, ctx, "未提供角色名", "warning");
            return;
          }

          const rolePath = join(ROLES_DIR, roleName);
          if (existsSync(rolePath)) {
            notify(rt, ctx, `角色 "${roleName}" 已存在`, "warning");
            return;
          }

          createRole(roleName);
          notify(rt, ctx, `[OK] 创建角色: ${roleName}`, "success");

          // In headless/RPC mode, auto-map to current cwd
          const shouldMap = isTuiAvailable(ctx)
            ? await ctx.ui.confirm("映射", `将当前目录映射到 "${roleName}"?`)
            : true;
          if (shouldMap) {
            const cwdKey = normalizePath(cwd);
            config.mappings[cwdKey] = roleName;
            config.disabledPaths = (config.disabledPaths || []).filter((path) => normalizePath(path) !== cwdKey);

            saveRoleConfig(config);
            await activateRole(rt, roleName, rolePath, ctx);
            notify(rt, ctx, `已映射: ${cwdKey} → ${roleName}`, "success");
          }
          break;
        }

        case "map": {
          let roleName = argv[1];

          if (!roleName) {
            if (!isTuiAvailable(ctx)) {
              const roles = getRoles();
              notify(rt, ctx, `Usage: /role map <name>\nAvailable: ${roles.join(", ")}`, "warning");
              return;
            }
            const selected = await selectRoleUI(rt, ctx);
            if (!selected) {
              notify(rt, ctx, "已取消映射", "info");
              return;
            }

            if (selected === "__create__") {
              const created = await selectCreateRoleNameUI(rt, ctx);
              if (!created) {
                notify(rt, ctx, "已取消创建角色", "info");
                return;
              }

              const rolePath = join(ROLES_DIR, created);
              if (!existsSync(rolePath)) {
                createRole(created);
                notify(rt, ctx, `[OK] 创建角色: ${created}`, "success");
              }
              roleName = created;
            } else {
              roleName = selected;
            }
          }

          if (!roleName) {
            notify(rt, ctx, "未选择角色", "warning");
            return;
          }

          const rolePath = join(ROLES_DIR, roleName);
          if (!existsSync(rolePath)) {
            notify(rt, ctx, `角色 "${roleName}" 不存在`, "error");
            return;
          }

          const cwdKey = normalizePath(cwd);
          config.mappings[cwdKey] = roleName;
          config.disabledPaths = (config.disabledPaths || []).filter((path) => normalizePath(path) !== cwdKey);

          saveRoleConfig(config);
          await activateRole(rt, roleName, rolePath, ctx);
          notify(rt, ctx, `已映射: ${cwdKey} → ${roleName}`, "success");
          break;
        }

        case "unmap": {
          const cwdKey = normalizePath(cwd);

          // 仅移除当前目录的显式映射，不误伤父目录映射
          let removedMapping = false;
          for (const [path] of Object.entries(config.mappings)) {
            if (normalizePath(path) === cwdKey) {
              delete config.mappings[path];
              removedMapping = true;
            }
          }

          // 标记当前目录禁用角色（包含默认角色）
          const disabled = new Set((config.disabledPaths || []).map((path) => normalizePath(path)));
          disabled.add(cwdKey);
          config.disabledPaths = Array.from(disabled);

          saveRoleConfig(config);

          rt.state.currentRole = null;
          rt.state.currentRolePath = null;
          if (isTuiAvailable(ctx)) {
            ctx.ui.setStatus("role", "off");
            ctx.ui.setStatus("memory-checkpoint", undefined);
          }

          notify(rt, ctx,
            removedMapping
              ? "已取消当前目录映射，并标记为不使用角色（默认角色也禁用）"
              : "当前目录已标记为不使用角色（默认角色禁用）",
            "info"
          );
          break;
        }

        case "list": {
          const roles = getRoles();

          let info = `## 角色列表\n\n`;

          info += `### 所有角色 (${roles.length})\n\n`;
          for (const role of roles) {
            const identity = getRoleIdentity(join(ROLES_DIR, role));
            info += `- **${role}** ${identity?.name || ""}\n`;
          }

          info += `\n### 默认角色\n\n`;
          info += `- **${config.defaultRole || DEFAULT_ROLE}**\n`;

          info += `\n### 目录映射\n\n`;
          const mappings = Object.entries(config.mappings);
          if (mappings.length === 0) {
            info += "无映射\n";
          } else {
            for (const [path, role] of mappings) {
              info += `- \`${normalizePath(path)}\` → **${role}**\n`;
            }
          }

          info += `\n### 禁用角色目录（unmap 结果）\n\n`;
          const disabledPaths = (config.disabledPaths || []).map((path) => normalizePath(path));
          if (disabledPaths.length === 0) {
            info += "无\n";
          } else {
            for (const path of disabledPaths) {
              info += `- \`${path}\`\n`;
            }
          }

          pi.sendMessage({
            customType: "role-list",
            content: info,
            display: true
          }, { triggerTurn: false });
          break;
        }

        default: {
          notify(rt, ctx, `未知命令: ${cmd}。可用: info, create, map, unmap, list`, "error");
        }
      }
    }
  });
}
