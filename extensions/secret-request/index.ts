import { execFile, spawn } from "node:child_process";
import { access, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Input, Key, matchesKey, Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "pi-secret-request";
const GLOBAL_ENV_DIR = join(homedir(), ".pi", "agent", "secret-env");
const PROJECT_ENV_DIR = join(".pi", "secret-env");
const DEFAULT_PROFILE = "default";
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_OUTPUT = 2 * 1024 * 1024;

type SecretRef = {
  source: "macos-keychain";
  service: string;
  account: string;
};

type EnvProfile = {
  version: 1;
  env: Record<string, string>;
  secrets: Record<string, SecretRef>;
};

type ProfileScope = "auto" | "global" | "project";

const emptyProfile = (): EnvProfile => ({ version: 1, env: {}, secrets: {} });

function assertEnvName(name: string): void {
  if (!ENV_NAME.test(name)) throw new Error(`Invalid environment variable name: ${name}`);
}

function normalizeProfileName(name?: string): string {
  const value = (name || DEFAULT_PROFILE).trim() || DEFAULT_PROFILE;
  if (!PROFILE_NAME.test(value) || value === "." || value === "..") {
    throw new Error("Profile name may contain only letters, numbers, dot, underscore and dash");
  }
  return value;
}

function profilePath(name: string, scope: Exclude<ProfileScope, "auto">, cwd: string): string {
  const dir = scope === "global" ? GLOBAL_ENV_DIR : join(cwd, PROJECT_ENV_DIR);
  return join(dir, `${normalizeProfileName(name)}.json`);
}

async function loadProfileAt(path: string, name: string): Promise<EnvProfile> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    const profile = emptyProfile();
    for (const [key, value] of Object.entries(raw?.env || {})) {
      if (ENV_NAME.test(key) && typeof value === "string") profile.env[key] = value;
    }
    for (const [key, ref] of Object.entries(raw?.secrets || {})) {
      if (!ENV_NAME.test(key) || !ref || typeof ref !== "object") continue;
      const item = ref as Partial<SecretRef>;
      if (item.source === "macos-keychain" && item.service === KEYCHAIN_SERVICE && item.account === key) {
        profile.secrets[key] = { source: "macos-keychain", service: KEYCHAIN_SERVICE, account: key };
      }
    }
    return profile;
  } catch (error: any) {
    if (error?.code === "ENOENT") return emptyProfile();
    throw new Error(`Failed to load env profile ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadProfile(
  name = DEFAULT_PROFILE,
  scope: Exclude<ProfileScope, "auto"> = "global",
  cwd = process.cwd(),
): Promise<EnvProfile> {
  const normalized = normalizeProfileName(name);
  return loadProfileAt(profilePath(normalized, scope, cwd), normalized);
}

async function loadEffectiveProfile(name: string, cwd: string): Promise<EnvProfile> {
  const global = await loadProfile(name, "global", cwd);
  const project = await loadProfile(name, "project", cwd);
  const effective: EnvProfile = {
    version: 1,
    env: { ...global.env },
    secrets: { ...global.secrets },
  };
  for (const [key, value] of Object.entries(project.env)) {
    effective.env[key] = value;
    delete effective.secrets[key];
  }
  for (const [key, ref] of Object.entries(project.secrets)) {
    effective.secrets[key] = ref;
    delete effective.env[key];
  }
  return effective;
}

async function saveProfile(
  name: string,
  profile: EnvProfile,
  scope: Exclude<ProfileScope, "auto"> = "global",
  cwd = process.cwd(),
): Promise<void> {
  const normalized = normalizeProfileName(name);
  const dir = scope === "global" ? GLOBAL_ENV_DIR : join(cwd, PROJECT_ENV_DIR);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => {});
  const path = profilePath(normalized, scope, cwd);
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(profile, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(temp, 0o600).catch(() => {});
  await rename(temp, path);
}

async function projectProfileExists(name: string, cwd: string): Promise<boolean> {
  try {
    await access(profilePath(name, "project", cwd));
    return true;
  } catch {
    return false;
  }
}

async function resolveWriteScope(
  name: string,
  scope: ProfileScope,
  cwd: string,
): Promise<Exclude<ProfileScope, "auto">> {
  if (scope !== "auto") return scope;
  return (await projectProfileExists(name, cwd)) ? "project" : "global";
}

function keychainRef(name: string): SecretRef {
  return { source: "macos-keychain", service: KEYCHAIN_SERVICE, account: name };
}

async function keychainGet(name: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/security", [
      "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", name, "-w",
    ]);
    return stdout.replace(/\r?\n$/, "");
  } catch {
    return undefined;
  }
}

async function keychainSet(name: string, value: string): Promise<void> {
  // macOS `security` has no non-interactive stdin-only update mode. Passing -w
  // is confined to this short-lived helper process; the value is never logged.
  await execFileAsync("/usr/bin/security", [
    "add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", name, "-w", value,
  ]);
}

async function keychainDelete(name: string): Promise<void> {
  try {
    await execFileAsync("/usr/bin/security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", name]);
  } catch {
    // Already absent is fine.
  }
}

function redactAll(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join("[REDACTED]");
  }
  return result;
}

async function promptSecret(ctx: any, title: string): Promise<string | undefined> {
  if (ctx.mode !== "tui") return undefined;
  return ctx.ui.custom<string | undefined>((tui: any, theme: any, _kb: any, done: (value?: string) => void) => {
    const input = new Input();
    let cached: string[] | undefined;
    input.onSubmit = (value: string) => done(value);
    input.onEscape = () => done(undefined);

    const refresh = () => {
      cached = undefined;
      tui.requestRender();
    };

    return {
      render(width: number) {
        if (cached) return cached;
        const size = input.getValue().length;
        const mask = size > 0
          ? "•".repeat(Math.min(size, Math.max(1, width - 4)))
          : theme.fg("dim", "Paste or type secret…");
        cached = [
          theme.fg("accent", "─".repeat(Math.max(1, width))),
          theme.fg("text", title),
          "",
          `  ${theme.fg("accent", mask)}`,
          "",
          theme.fg("dim", "Enter save securely • Esc cancel • value is never returned to the model"),
          theme.fg("accent", "─".repeat(Math.max(1, width))),
        ];
        return cached;
      },
      invalidate() { cached = undefined; },
      handleInput(data: string) {
        if (matchesKey(data, Key.escape)) {
          done(undefined);
          return;
        }
        input.handleInput(data);
        refresh();
      },
    };
  });
}

async function registerSecret(
  profileName: string,
  name: string,
  value: string | undefined,
  scope: ProfileScope,
  cwd: string,
): Promise<{ provided: boolean; scope: Exclude<ProfileScope, "auto"> }> {
  assertEnvName(name);
  const writeScope = await resolveWriteScope(profileName, scope, cwd);
  if (value !== undefined) await keychainSet(name, value);
  if ((await keychainGet(name)) === undefined) return { provided: false, scope: writeScope };
  const profile = await loadProfile(profileName, writeScope, cwd);
  profile.secrets[name] = keychainRef(name);
  delete profile.env[name];
  await saveProfile(profileName, profile, writeScope, cwd);
  return { provided: true, scope: writeScope };
}

async function resolveProfileEnv(
  profileName: string,
  scope: ProfileScope,
  cwd: string,
): Promise<{
  env: Record<string, string>;
  secrets: string[];
  names: string[];
  missing: string[];
}> {
  const profile = scope === "auto"
    ? await loadEffectiveProfile(profileName, cwd)
    : await loadProfile(profileName, scope, cwd);
  const names = new Set(Object.keys(profile.secrets));

  const env: Record<string, string> = { ...profile.env };
  const secrets: string[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const value = await keychainGet(name);
    if (value === undefined) {
      missing.push(name);
      continue;
    }
    env[name] = value;
    secrets.push(value);
  }
  return { env, secrets, names: [...names], missing };
}

async function runWithProfile(
  params: { profile?: string; scope?: ProfileScope; command: string; cwd?: string },
  signal: AbortSignal | undefined,
  ctx: any,
) {
  const profileName = normalizeProfileName(params.profile);
  const cwd = params.cwd || ctx.cwd;
  const scope = params.scope || "auto";
  const resolved = await resolveProfileEnv(profileName, scope, cwd);
  if (resolved.missing.length) {
    return {
      content: [{ type: "text" as const, text: `not-provided: ${resolved.missing.join(", ")}` }],
      details: { action: "exec", profile: profileName, scope, provided: false, missing: resolved.missing },
    };
  }

  return new Promise<any>((resolve, reject) => {
    const child = spawn("/bin/zsh", ["-lc", params.command], {
      cwd,
      env: { ...process.env, ...resolved.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    const append = (current: string, chunk: string) => {
      if (current.length >= MAX_OUTPUT) {
        truncated = true;
        return current;
      }
      const next = current + chunk;
      if (next.length <= MAX_OUTPUT) return next;
      truncated = true;
      return next.slice(0, MAX_OUTPUT);
    };

    const onAbort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = append(stdout, String(chunk)); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, String(chunk)); });
    child.on("error", reject);
    child.on("close", (code, childSignal) => {
      signal?.removeEventListener("abort", onAbort);
      const cleanOut = redactAll(stdout, resolved.secrets).trimEnd();
      const cleanErr = redactAll(stderr, resolved.secrets).trimEnd();
      let body = [cleanOut, cleanErr].filter(Boolean).join("\n");
      if (truncated) body += `${body ? "\n" : ""}[output truncated]`;
      resolve({
        content: [{ type: "text", text: body || `(exit ${code ?? "?"})` }],
        details: {
          action: "exec",
          profile: profileName,
          scope,
          secretNames: resolved.names,
          exitCode: code,
          signal: childSignal ?? undefined,
          truncated,
        },
      });
    });
  });
}

async function secretManagerTui(
  ctx: any,
  initialProfile: string,
  scope: Exclude<ProfileScope, "auto">,
): Promise<void> {
  let profileName = normalizeProfileName(initialProfile);

  for (;;) {
    const profile = await loadProfile(profileName, scope, ctx.cwd);
    const secretNames = Object.keys(profile.secrets).sort();
    const envNames = Object.keys(profile.env).sort();
    let ready = 0;
    for (const name of secretNames) if ((await keychainGet(name)) !== undefined) ready++;

    const action = await ctx.ui.select(
      `Secrets · ${scope} · ${profileName} · ${ready}/${secretNames.length} secrets ready · ${envNames.length} plain env`,
      [
        "Add / update secret",
        "Add / update plain env",
        "Remove entry",
        "Inspect profile",
        "Switch profile",
        "Exit",
      ],
    );
    if (!action || action === "Exit") return;

    if (action === "Add / update secret") {
      const rawName = await ctx.ui.input("Secret environment variable", "ANTHROPIC_API_KEY");
      if (!rawName) continue;
      const name = rawName.trim();
      try { assertEnvName(name); } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        continue;
      }
      const value = await promptSecret(ctx, `Store ${name} in macOS Keychain`);
      if (!value) continue;
      await registerSecret(profileName, name, value, scope, ctx.cwd);
      ctx.ui.notify(`${name} linked to ${scope}/${profileName}`, "info");
      continue;
    }

    if (action === "Add / update plain env") {
      const rawName = await ctx.ui.input("Plain environment variable", "NODE_ENV");
      if (!rawName) continue;
      const name = rawName.trim();
      try { assertEnvName(name); } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        continue;
      }
      const value = await ctx.ui.input(`Value for ${name}`, "non-secret value");
      if (value === undefined) continue;
      const next = await loadProfile(profileName, scope, ctx.cwd);
      next.env[name] = value;
      delete next.secrets[name];
      await saveProfile(profileName, next, scope, ctx.cwd);
      ctx.ui.notify(`${name} saved in ${scope}/${profileName}.json`, "info");
      continue;
    }

    if (action === "Remove entry") {
      const entries = [
        ...secretNames.map((name) => `secret  ${name}`),
        ...envNames.map((name) => `env     ${name}`),
      ];
      if (!entries.length) {
        ctx.ui.notify("Profile is empty", "info");
        continue;
      }
      const selected = await ctx.ui.select(`Remove from ${scope}/${profileName}`, entries);
      if (!selected) continue;
      const name = selected.slice(8).trim();
      const next = await loadProfile(profileName, scope, ctx.cwd);
      if (selected.startsWith("secret")) {
        delete next.secrets[name];
        const removeKeychain = await ctx.ui.confirm(
          `Remove ${name}`,
          "Also delete the secret value from macOS Keychain?",
        );
        if (removeKeychain) await keychainDelete(name);
      } else {
        delete next.env[name];
      }
      await saveProfile(profileName, next, scope, ctx.cwd);
      ctx.ui.notify(`${name} removed`, "info");
      continue;
    }

    if (action === "Inspect profile") {
      const lines: string[] = [profilePath(profileName, scope, ctx.cwd), ""];
      for (const name of secretNames) {
        const ok = (await keychainGet(name)) !== undefined;
        lines.push(`${ok ? "✓" : "○"} secret  ${name} → macOS Keychain`);
      }
      for (const name of envNames) lines.push(`• env     ${name}=${profile.env[name]}`);
      if (lines.length === 2) lines.push("(empty)");
      await ctx.ui.select(`Profile ${scope}/${profileName}`, [...lines, "Close"]);
      continue;
    }

    if (action === "Switch profile") {
      const nextName = await ctx.ui.input("Profile name", profileName);
      if (!nextName) continue;
      try {
        profileName = normalizeProfileName(nextName);
        await saveProfile(
          profileName,
          await loadProfile(profileName, scope, ctx.cwd),
          scope,
          ctx.cwd,
        );
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
  }
}

export default function secretRequestExtension(pi: ExtensionAPI) {
  if (process.platform !== "darwin") return;

  pi.registerCommand("secrets", {
    description: "Manage global/project secret env profiles backed by macOS Keychain",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/secrets requires interactive TUI mode", "error");
        return;
      }
      const [profileArg, scopeArg] = args.trim().split(/\s+/).filter(Boolean);
      const scope = scopeArg || "global";
      if (scope !== "global" && scope !== "project") {
        ctx.ui.notify("Usage: /secrets [profile] [global|project]", "error");
        return;
      }
      await secretManagerTui(ctx, profileArg || DEFAULT_PROFILE, scope);
    },
  });

  pi.registerTool({
    name: "secret_env",
    label: "Secret Env",
    description:
      "Secure secret environment access. Choose action=request only when a required secret is missing; choose action=exec instead of bash when a command needs configured secrets. Secrets never belong in chat or normal shell output.",
    parameters: Type.Union([
      Type.Object({
        action: Type.Literal("request", { description: "Securely request one missing secret from the user" }),
        name: Type.String({ description: "Environment variable name, e.g. ANTHROPIC_API_KEY" }),
        reason: Type.Optional(Type.String({ description: "Short user-facing reason this secret is needed" })),
        profile: Type.Optional(Type.String({ description: "Profile name; defaults to default" })),
        scope: Type.Optional(Type.Union([
          Type.Literal("auto"),
          Type.Literal("global"),
          Type.Literal("project"),
        ], { description: "Where to record the reference; auto prefers an existing project profile, otherwise global" })),
      }),
      Type.Object({
        action: Type.Literal("exec", { description: "Run a command with configured secret env injected into that child process" }),
        command: Type.String({ description: "Shell command to run with the selected secret env" }),
        profile: Type.Optional(Type.String({ description: "Profile name; defaults to default" })),
        scope: Type.Optional(Type.Union([
          Type.Literal("auto"),
          Type.Literal("global"),
          Type.Literal("project"),
        ], { description: "Profile scope; auto merges global then project override and is the default" })),
        cwd: Type.Optional(Type.String({ description: "Command/project directory; project profile resolves from this directory" })),
      }),
    ]),
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (params.action === "exec") return runWithProfile(params, signal, ctx);

      assertEnvName(params.name);
      const profileName = normalizeProfileName(params.profile);
      const scope = params.scope || "auto";
      const reused = await registerSecret(profileName, params.name, undefined, scope, ctx.cwd);
      if (reused.provided) {
        return {
          content: [{ type: "text", text: "provided" }],
          details: { action: "request", name: params.name, profile: profileName, scope: reused.scope, provided: true, reused: true },
        };
      }
      if (ctx.mode !== "tui") {
        return {
          content: [{ type: "text", text: "not-provided: secure input requires interactive TUI mode" }],
          details: { action: "request", name: params.name, profile: profileName, scope: reused.scope, provided: false },
        };
      }
      const reason = params.reason ? ` — ${params.reason}` : "";
      const value = await promptSecret(ctx, `Provide ${params.name}${reason}`);
      if (!value) {
        return {
          content: [{ type: "text", text: "cancelled" }],
          details: { action: "request", name: params.name, profile: profileName, scope: reused.scope, provided: false },
        };
      }
      const stored = await registerSecret(profileName, params.name, value, scope, ctx.cwd);
      return {
        content: [{ type: "text", text: "provided" }],
        details: { action: "request", name: params.name, profile: profileName, scope: stored.scope, provided: true, reused: false },
      };
    },
    renderCall(args, theme) {
      const profile = args.profile || DEFAULT_PROFILE;
      const scope = args.scope || "auto";
      if (args.action === "request") {
        return new Text(
          theme.fg("toolTitle", theme.bold("secret_env request ")) +
            theme.fg("accent", args.name) + theme.fg("dim", ` @${scope}/${profile}`),
          0, 0,
        );
      }
      return new Text(
        theme.fg("toolTitle", theme.bold("secret_env exec ")) +
          theme.fg("accent", `@${scope}/${profile}`) +
          theme.fg("dim", ` ${String(args.command).slice(0, 100)}`),
        0, 0,
      );
    },
  });
}
