import { describe, expect, test } from "bun:test";
import { hasQqbotCredentials, resolveQqbotConfig } from "../../config.ts";

describe("qqbot config", () => {
  test("fills defaults", () => {
    const cfg = resolveQqbotConfig({ enabled: true, appId: "123", clientSecret: "secret" } as any);
    expect(cfg.dmPolicy).toBe("pairing");
    expect(cfg.groupPolicy).toBe("disabled");
    expect(cfg.textChunkLimit).toBe(1500);
    expect(cfg.streaming?.enabled).toBeFalse(); // 默认禁用流式，避免 delete+resend 问题
  });

  test("detects credentials", () => {
    expect(hasQqbotCredentials(resolveQqbotConfig({ enabled: true, appId: "123", clientSecret: "secret" } as any))).toBeTrue();
    expect(hasQqbotCredentials(resolveQqbotConfig({ enabled: true } as any))).toBeFalse();
  });
});
