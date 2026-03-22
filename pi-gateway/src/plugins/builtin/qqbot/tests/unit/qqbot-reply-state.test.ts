import { describe, expect, test } from "bun:test";
import { ensurePassiveSendAllowed, rememberQqbotReplyState, encodeBaseQqbotTarget } from "../../outbound.ts";

function createRuntime(overrides?: Record<string, unknown>): any {
  return {
    channelCfg: {
      passiveReplyOnly: false,
      ...(overrides?.channelCfg ?? {}),
    },
    replyState: new Map(),
    ...overrides,
  };
}

describe("ensurePassiveSendAllowed", () => {
  test("allows all when passiveReplyOnly is disabled", () => {
    const runtime = createRuntime({ channelCfg: { passiveReplyOnly: false } });
    expect(ensurePassiveSendAllowed(runtime, { peerType: "c2c", id: "u-1" })).toBeNull();
    expect(ensurePassiveSendAllowed(runtime, { peerType: "c2c", id: "u-1", msgId: "m-1" })).toBeNull();
  });

  test("allows passive target when passiveReplyOnly enabled", () => {
    const runtime = createRuntime({ channelCfg: { passiveReplyOnly: true } });
    expect(ensurePassiveSendAllowed(runtime, { peerType: "c2c", id: "u-1", msgId: "m-1" })).toBeNull();
    expect(ensurePassiveSendAllowed(runtime, { peerType: "c2c", id: "u-1", eventId: "e-1" })).toBeNull();
  });

  test("blocks active target when passiveReplyOnly enabled", () => {
    const runtime = createRuntime({ channelCfg: { passiveReplyOnly: true } });
    const result = ensurePassiveSendAllowed(runtime, { peerType: "c2c", id: "u-1" });
    expect(result).not.toBeNull();
    expect(result).toContain("passiveReplyOnly");
  });
});

describe("rememberQqbotReplyState", () => {
  test("stores reply state with incremented msgSeq", () => {
    const runtime = createRuntime();
    const baseTarget = { peerType: "group" as const, id: "g-1" };
    const target = { peerType: "group" as const, id: "g-1", msgId: "source-1", msgSeq: 3 };

    rememberQqbotReplyState(runtime, baseTarget, target);

    const state = runtime.replyState.get(encodeBaseQqbotTarget(baseTarget));
    expect(state?.msgId).toBe("source-1");
    expect(state?.msgSeq).toBe(4); // 3 + 1
    expect(state?.passive).toBeTrue();
  });

  test("clears msgSeq for active (non-passive) target", () => {
    const runtime = createRuntime();
    const baseTarget = { peerType: "c2c" as const, id: "u-1" };
    const target = { peerType: "c2c" as const, id: "u-1" };

    rememberQqbotReplyState(runtime, baseTarget, target);

    const state = runtime.replyState.get(encodeBaseQqbotTarget(baseTarget));
    expect(state?.passive).toBeFalse();
    expect(state?.msgSeq).toBeUndefined();
  });

  test("defaults msgSeq to 1 when not set on passive target", () => {
    const runtime = createRuntime();
    const baseTarget = { peerType: "group" as const, id: "g-1" };
    const target = { peerType: "group" as const, id: "g-1", msgId: "source-1" }; // no msgSeq

    rememberQqbotReplyState(runtime, baseTarget, target);

    const state = runtime.replyState.get(encodeBaseQqbotTarget(baseTarget));
    expect(state?.msgSeq).toBe(2); // (undefined ?? 1) + 1 = 2
  });
});
