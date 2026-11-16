/** `/role unmap` 语义：无参数=当前目录，带路径=整棵目录树（前缀匹配）。 */
import { afterAll, mock, test } from "bun:test";
import { installPiCodingAgentMock, installPiTuiMock, installRoleControlCenterMock } from "../test-support.ts";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

// 隔离：role-store 在首次 import 时固定角色目录，同进程内其他测试文件可能已经设过
// PI_ROLES_DIR。此处只写它解析出的那个文件，并在结束时原样还原；万一它指向真实
// ~/.pi/roles（无隔离时），整组用例跳过而不是污染用户配置。
const ROLES = mkdtempSync(join(tmpdir(), "rp-roles-"));
process.env.PI_ROLES_DIR ||= ROLES;
mkdirSync(ROLES, { recursive: true });

mock.module("@earendil-works/pi-ai/compat", () => ({
  complete: async () => ({ stopReason: "end", content: [] }),
  completeSimple: async () => ({ stopReason: "end", content: [] }),
  StringEnum: (x: unknown) => x,
}));
installPiCodingAgentMock();
installPiTuiMock();
installRoleControlCenterMock();
mock.module(new URL("./ui.ts", import.meta.url).pathname, () => ({
  isTuiAvailable: () => false,
  notify: () => {},
  selectRoleUI: async () => null,
  selectCreateRoleNameUI: async () => null,
}));

const { registerRoleCommand } = await import("./commands-role.ts");
const { loadRoleConfig, resolveRoleForCwd, ROLE_CONFIG_FILE } = await import("../role-store.ts");

const CONFIG = ROLE_CONFIG_FILE;
const REAL_CONFIG = join(homedir(), ".pi", "roles", "config.json");
const isRealConfig = CONFIG === REAL_CONFIG;
const originalConfig = existsSync(CONFIG) ? readFileSync(CONFIG, "utf8") : null;
if (isRealConfig) {
  console.warn(`[skip] commands-role.test.ts: 角色目录指向真实配置 (${CONFIG})，跳过以避免污染`);
}
const it = isRealConfig ? test.skip : test;

afterAll(() => {
  if (isRealConfig) return;
  if (originalConfig === null) return;
  mkdirSync(dirname(CONFIG), { recursive: true });
  writeFileSync(CONFIG, originalConfig, "utf8");
});

function seed(mappings: Record<string, string>, disabled: string[] = []) {
  // 同进程内其他测试文件可能已经清掉自己的临时角色目录
  mkdirSync(dirname(CONFIG), { recursive: true });
  writeFileSync(CONFIG, JSON.stringify({ mappings, defaultRole: "default", disabledPaths: disabled }, null, 2));
}

function harness(cwd = "/tmp/tree/a") {
  let handler: any = null;
  const rt = {
    state: { currentRole: "zero", currentRolePath: "/tmp/role" },
    skillsDir: "/tmp",
    extensionDir: "/tmp",
    pi: {
      registerCommand: (_n: string, spec: any) => { handler = spec.handler; },
      sendMessage: () => {},
    },
  } as any;
  registerRoleCommand(rt);
  const ctx = {
    cwd,
    hasUI: false,
    ui: { setStatus: () => {}, theme: { fg: (_c: string, s: string) => s } },
  } as any;
  return { rt, run: (args: string) => handler(args, ctx) };
}

it("unmap <path> 禁用整棵树并清掉树内映射", async () => {
  seed({ "/tmp/tree/a": "zero", "/tmp/tree/b/deep": "psm", "/tmp/other": "zero" });
  const h = harness();
  await h.run("unmap /tmp/tree");

  const cfg = loadRoleConfig();
  assert.deepEqual(cfg.disabledPaths, ["/tmp/tree"]);
  assert.deepEqual(Object.keys(cfg.mappings), ["/tmp/other"], "树内映射被清，树外映射保留");
  assert.equal(resolveRoleForCwd("/tmp/tree/a").role, null);
  assert.equal(resolveRoleForCwd("/tmp/tree/any/new/dir").role, null, "下级任意深度都禁用");
  assert.equal(resolveRoleForCwd("/tmp/other").role, "zero");
  assert.equal(resolveRoleForCwd("/tmp/treehouse").role, "default", "同前缀非子目录不误伤");
  assert.equal(h.rt.state.currentRole, null, "cwd 在禁用树内 → 会话角色清空");
});

it("unmap 无参数 = 只禁用当前目录", async () => {
  seed({ "/tmp/tree/a": "zero", "/tmp/tree/b/deep": "psm" });
  const h = harness();
  await h.run("unmap");

  const cfg = loadRoleConfig();
  assert.deepEqual(cfg.disabledPaths, ["/tmp/tree/a"]);
  assert.deepEqual(Object.keys(cfg.mappings), ["/tmp/tree/b/deep"], "兄弟/父级映射不动");
  assert.equal(resolveRoleForCwd("/tmp/tree/b/deep").role, "psm");
});

it("unmap ~ 展开到 home，相对路径按 cwd 解析", async () => {
  seed({});
  const h = harness("/tmp/tree/a");
  await h.run("unmap ~/scratch");
  assert.deepEqual(loadRoleConfig().disabledPaths, [join(homedir(), "scratch")]);

  await h.run("unmap ../sibling");
  assert.deepEqual(loadRoleConfig().disabledPaths, [join(homedir(), "scratch"), "/tmp/tree/sibling"], "相对路径以 cwd 为基准");
});

it("cwd 不在禁用树内时不清空会话角色", async () => {
  seed({});
  const h = harness("/tmp/tree/a");
  await h.run("unmap /var/elsewhere");
  assert.equal(h.rt.state.currentRole, "zero");
});
