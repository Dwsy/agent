import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { buildCapabilityProfile } from "./capability-profile.ts";
import { DEFAULT_CONFIG, type Config } from "./config.ts";

function mkConfig(): Config {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config;
}

function getFlagValues(args: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) {
      out.push(args[i + 1]);
      i++;
    }
  }
  return out;
}

describe("capability profile", () => {
  test("skills are merged by priority: role > gateway > base, with first-win dedupe", () => {
    const config = mkConfig();
    config.agent.skillsBase = ["./skills/base", "./skills/shared"];
    config.agent.skillsGateway = ["./skills/gateway", "./skills/shared"];
    config.roles.capabilities = {
      mentor: {
        skills: ["./skills/role", "./skills/shared"],
      },
    };

    const profile = buildCapabilityProfile({
      config,
      role: "mentor",
      cwd: process.cwd(),
      sessionKey: "agent:main:main:main",
    });

    expect(getFlagValues(profile.args, "--skill")).toEqual([
      resolve("./skills/role"),
      resolve("./skills/shared"),
      resolve("./skills/gateway"),
      resolve("./skills/base"),
    ]);
  });

  test("legacy skills fallback is preserved when layered skills are absent", () => {
    const config = mkConfig();
    config.agent.skills = ["./legacy/skills"];
    config.agent.skillsBase = [];
    config.agent.skillsGateway = [];
    config.roles.capabilities = {};

    const profile = buildCapabilityProfile({
      config,
      role: "default",
      cwd: process.cwd(),
      sessionKey: "agent:main:main:main",
    });

    expect(getFlagValues(profile.args, "--skill")).toEqual([resolve("./legacy/skills")]);
  });

  test("role extensions and prompt templates are prepended before global", () => {
    const config = mkConfig();
    config.agent.extensions = ["./ext/global", "./ext/shared"];
    config.agent.promptTemplates = ["./prompt/global", "./prompt/shared"];
    config.roles.capabilities = {
      mentor: {
        extensions: ["./ext/role", "./ext/shared"],
        promptTemplates: ["./prompt/role", "./prompt/shared"],
      },
    };

    const profile = buildCapabilityProfile({
      config,
      role: "mentor",
      cwd: process.cwd(),
      sessionKey: "agent:main:main:main",
    });

    const exts = getFlagValues(profile.args, "--extension");
    // Role extensions first, then global, then optional gateway-tools at tail
    expect(exts.slice(0, 3)).toEqual([
      resolve("./ext/role"),
      resolve("./ext/shared"),
      resolve("./ext/global"),
    ]);
    if (exts.length > 3) {
      expect(exts[exts.length - 1]).toContain("gateway-tools");
    }
    expect(getFlagValues(profile.args, "--prompt-template")).toEqual([
      resolve("./prompt/role"),
      resolve("./prompt/shared"),
      resolve("./prompt/global"),
    ]);
  });

  test("signature is stable for same input and changes when capabilities change", () => {
    const config = mkConfig();
    config.agent.skillsBase = ["./skills/base"];
    config.roles.capabilities = { mentor: { skills: ["./skills/role"] } };

    const p1 = buildCapabilityProfile({
      config,
      role: "mentor",
      cwd: process.cwd(),
      sessionKey: "agent:main:main:main",
    });
    const p2 = buildCapabilityProfile({
      config,
      role: "mentor",
      cwd: process.cwd(),
      sessionKey: "agent:main:main:main",
    });
    expect(p1.signature).toBe(p2.signature);

    config.roles.capabilities.mentor!.skills = ["./skills/role-v2"];
    const p3 = buildCapabilityProfile({
      config,
      role: "mentor",
      cwd: process.cwd(),
      sessionKey: "agent:main:main:main",
    });
    expect(p3.signature).not.toBe(p1.signature);
  });

  test("runtime env is injected from config.agent.runtime", () => {
    const config = mkConfig();
    config.agent.runtime = {
      agentDir: "./runtime-agent",
      packageDir: "./runtime-package",
    };

    const profile = buildCapabilityProfile({
      config,
      role: "default",
      cwd: process.cwd(),
      sessionKey: "agent:main:main:main",
    });

    expect(profile.env.PI_CODING_AGENT_DIR).toBe(resolve("./runtime-agent"));
    expect(profile.env.PI_PACKAGE_DIR).toBe(resolve("./runtime-package"));
  });
});
