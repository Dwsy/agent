import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Config, RoleCapabilityConfig } from "./config.ts";
import { buildGatewaySystemPrompt } from "./system-prompts.ts";
import { getGatewayInternalToken } from "../api/media-send.ts";
import type { SessionKey } from "./types.ts";

export interface CapabilityProfileInput {
  config: Config;
  role: string;
  cwd: string;
  sessionKey?: SessionKey;
}

export interface CapabilityProfile {
  role: string;
  cwd: string;
  args: string[];
  env: Record<string, string>;
  /** Full signature (hard + soft). Used for exact match. */
  signature: string;
  /** Hard signature (role, cwd, model, tools, env). Must match exactly for reuse. */
  hardSignature: string;
  /** Soft resources. A process with superset of these can be reused. */
  softResources: {
    skills: string[];
    extensions: string[];
    promptTemplates: string[];
  };
  resourceCounts: {
    skills: number;
    extensions: number;
    promptTemplates: number;
  };
}

export function buildCapabilityProfile(input: CapabilityProfileInput): CapabilityProfile {
  const { config, role } = input;
  const cwd = normalizePath(input.cwd);
  const roleCaps = config.roles.capabilities?.[role] ?? {};

  // Hard args: tools, runtime prompts, discovery flags (model excluded — can change at runtime via /model, /think)
  const hardArgs: string[] = [];
  appendToolArgs(hardArgs, config);
  appendRuntimePromptArgs(hardArgs, config);
  appendDiscoveryFlags(hardArgs, config);

  // Soft args: model (switchable at runtime), extensions, skills, promptTemplates
  const softArgs: string[] = [];
  appendModelArgs(softArgs, config);

  // Auto-inject gateway-tools extension for send_media tool (only if file exists)
  const gatewayToolsExt = resolve(import.meta.dir, "../../extensions/gateway-tools/index.ts");
  const gatewayExts = existsSync(gatewayToolsExt) ? [gatewayToolsExt] : [];
  const extensions = dedupePaths([
    ...(roleCaps.extensions ?? []),
    ...(config.agent.extensions ?? []),
    ...gatewayExts,
  ]);
  const skills = resolveSkills(config, roleCaps);
  const promptTemplates = dedupePaths([
    ...(roleCaps.promptTemplates ?? []),
    ...(config.agent.promptTemplates ?? []),
  ]);

  // Full args = hard args + soft args + soft resource args
  const args: string[] = [...hardArgs, ...softArgs];
  appendRepeatedArg(args, "--extension", extensions);
  appendRepeatedArg(args, "--skill", skills);
  appendRepeatedArg(args, "--prompt-template", promptTemplates);

  const env: Record<string, string> = {};
  const runtimeAgentDir = config.agent.runtime?.agentDir?.trim();
  const runtimePackageDir = config.agent.runtime?.packageDir?.trim();
  if (runtimeAgentDir) {
    env.PI_CODING_AGENT_DIR = normalizePath(runtimeAgentDir);
  }
  if (runtimePackageDir) {
    env.PI_PACKAGE_DIR = normalizePath(runtimePackageDir);
  }

  // Gateway tools: inject URL + internal token so extensions can call back
  const port = config.gateway.port ?? 18789;
  const bind = config.gateway.bind ?? "loopback";
  const host = bind === "loopback" ? "127.0.0.1" : "0.0.0.0";
  env.PI_GATEWAY_URL = `http://${host}:${port}`;
  env.PI_GATEWAY_INTERNAL_TOKEN = getGatewayInternalToken(config);

  const piCliPath = config.agent.piCliPath ?? "pi";
  const mergeMode = config.roles.mergeMode ?? "append";

  // Full signature (backward compat — exact match)
  const signature = createProfileSignature({
    role, cwd, args, env, piCliPath, mergeMode,
  });

  // Hard signature: role + cwd + tools + prompts + discovery flags + env (immutable at runtime)
  const hardSignature = createProfileSignature({
    role, cwd, args: hardArgs, env, piCliPath, mergeMode,
  });

  return {
    role,
    cwd,
    args,
    env,
    signature,
    hardSignature,
    softResources: { skills, extensions, promptTemplates },
    resourceCounts: {
      skills: skills.length,
      extensions: extensions.length,
      promptTemplates: promptTemplates.length,
    },
  };
}

function appendModelArgs(args: string[], config: Config): void {
  const modelStr = config.agent.model;
  if (modelStr && modelStr.includes("/")) {
    const slashIdx = modelStr.indexOf("/");
    args.push("--provider", modelStr.slice(0, slashIdx));
    args.push("--model", modelStr.slice(slashIdx + 1));
  }
  if (config.agent.thinkingLevel && config.agent.thinkingLevel !== "off") {
    args.push("--thinking", config.agent.thinkingLevel);
  }
}

function appendToolArgs(args: string[], config: Config): void {
  const tools = config.agent.tools;
  if (!tools) return;

  // If allow list is specified, only enable those tools
  if (tools.allow && tools.allow.length > 0) {
    args.push("--tools", tools.allow.join(","));
  }
  // If deny list is specified without allow, enable all except denied
  else if (tools.deny && tools.deny.length > 0) {
    const allTools = ["read", "bash", "edit", "write", "grep", "find", "ls"];
    const allowed = allTools.filter(t => !tools.deny!.includes(t));
    args.push("--tools", allowed.join(","));
  }
}

function appendRuntimePromptArgs(args: string[], config: Config): void {
  if (config.agent.systemPrompt?.trim()) {
    args.push("--system-prompt", expandHome(config.agent.systemPrompt.trim()));
  }

  const userAppend = config.agent.appendSystemPrompt?.trim() ?? "";
  const gatewayAppend = buildGatewaySystemPrompt(config);
  const combined = [userAppend, gatewayAppend].filter(Boolean).join("\n\n");
  if (combined) {
    args.push("--append-system-prompt", combined);
  }
}

function appendDiscoveryFlags(args: string[], config: Config): void {
  if (config.agent.noExtensions) {
    args.push("--no-extensions");
  }
  if (config.agent.noSkills) {
    args.push("--no-skills");
  }
  if (config.agent.noPromptTemplates) {
    args.push("--no-prompt-templates");
  }
}

function appendRepeatedArg(args: string[], flag: string, values: string[]): void {
  for (const value of values) {
    args.push(flag, value);
  }
}

function resolveSkills(config: Config, roleCaps: RoleCapabilityConfig): string[] {
  const roleSkills = roleCaps.skills ?? [];
  const gatewaySkills = config.agent.skillsGateway ?? [];
  const baseSkills = config.agent.skillsBase ?? [];
  const hasLayeredSkills = roleSkills.length > 0 || gatewaySkills.length > 0 || baseSkills.length > 0;

  if (hasLayeredSkills) {
    return dedupePaths([
      ...roleSkills,
      ...gatewaySkills,
      ...baseSkills,
    ]);
  }

  // Legacy compatibility: keep previous behavior when layered fields are not provided.
  return dedupePaths(config.agent.skills ?? []);
}

function dedupePaths(entries: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of entries) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const normalized = normalizePath(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

function normalizePath(input: string): string {
  const expanded = expandHome(input);
  // Keep URI-like specifiers (e.g. npm:pkg, https://...) untouched.
  if (isUriLike(expanded)) {
    return expanded;
  }
  return resolve(expanded);
}

function expandHome(input: string): string {
  return input.replace(/^~(?=\/|$)/, homedir());
}

function isUriLike(value: string): boolean {
  // Preserve Windows absolute paths like C:\foo from being treated as URI.
  if (/^[a-zA-Z]:[\\/]/.test(value)) return false;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

function createProfileSignature(input: {
  role: string;
  cwd: string;
  args: string[];
  env: Record<string, string>;
  piCliPath: string;
  mergeMode: "append";
}): string {
  const stableEnv = Object.keys(input.env)
    .sort()
    .map((k) => [k, input.env[k]]);
  const payload = JSON.stringify({
    role: input.role,
    cwd: input.cwd,
    args: input.args,
    env: stableEnv,
    piCliPath: input.piCliPath,
    mergeMode: input.mergeMode,
  });
  return createHash("sha256").update(payload).digest("hex");
}
