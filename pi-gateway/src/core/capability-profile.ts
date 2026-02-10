import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Config, RoleCapabilityConfig } from "./config.ts";
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
  signature: string;
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

  const args: string[] = [];
  const env: Record<string, string> = {};

  appendModelArgs(args, config);
  appendRuntimePromptArgs(args, config);
  appendDiscoveryFlags(args, config);

  const extensions = dedupePaths([
    ...(roleCaps.extensions ?? []),
    ...(config.agent.extensions ?? []),
  ]);
  const skills = resolveSkills(config, roleCaps);
  const promptTemplates = dedupePaths([
    ...(roleCaps.promptTemplates ?? []),
    ...(config.agent.promptTemplates ?? []),
  ]);

  appendRepeatedArg(args, "--extension", extensions);
  appendRepeatedArg(args, "--skill", skills);
  appendRepeatedArg(args, "--prompt-template", promptTemplates);

  const runtimeAgentDir = config.agent.runtime?.agentDir?.trim();
  const runtimePackageDir = config.agent.runtime?.packageDir?.trim();
  if (runtimeAgentDir) {
    env.PI_CODING_AGENT_DIR = normalizePath(runtimeAgentDir);
  }
  if (runtimePackageDir) {
    env.PI_PACKAGE_DIR = normalizePath(runtimePackageDir);
  }

  // Session key is intentionally not included in signature so compatible sessions can reuse pool processes.
  const signature = createProfileSignature({
    role,
    cwd,
    args,
    env,
    piCliPath: config.agent.piCliPath ?? "pi",
    mergeMode: config.roles.mergeMode ?? "append",
  });

  return {
    role,
    cwd,
    args,
    env,
    signature,
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

function appendRuntimePromptArgs(args: string[], config: Config): void {
  if (config.agent.systemPrompt?.trim()) {
    args.push("--system-prompt", expandHome(config.agent.systemPrompt.trim()));
  }
  if (config.agent.appendSystemPrompt?.trim()) {
    args.push("--append-system-prompt", expandHome(config.agent.appendSystemPrompt.trim()));
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
