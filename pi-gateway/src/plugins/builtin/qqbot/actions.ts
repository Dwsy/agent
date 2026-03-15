import type { MessageActionResult, ReadHistoryResult } from "../../types.ts";
import type { QqbotPluginRuntime } from "./types.ts";
import { deleteQqbotMessage } from "./api.ts";
import { parseQqbotTarget } from "./outbound.ts";

export async function deleteQqbotOutbound(
  runtime: QqbotPluginRuntime,
  rawTarget: string,
  messageId: string,
): Promise<MessageActionResult> {
  try {
    await deleteQqbotMessage(runtime, parseQqbotTarget(rawTarget), messageId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function editQqbotOutbound(): Promise<MessageActionResult> {
  return { ok: false, error: "QQBot does not support message edit; use delete + resend fallback" };
}

export async function readQqbotHistory(): Promise<ReadHistoryResult> {
  return { ok: false, error: "QQBot history read is not implemented" };
}
