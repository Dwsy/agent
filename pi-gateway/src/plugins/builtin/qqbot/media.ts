import type { MediaSendOptions, MediaSendResult } from "../../types.ts";
import type { QqbotPluginRuntime } from "./types.ts";
import { uploadQqbotFile, sendQqbotMessage } from "./api.ts";
import {
  ensurePassiveSendAllowed,
  guessFileType,
  rememberQqbotReplyState,
  resolveQqbotSendTarget,
} from "./outbound.ts";

export async function sendQqbotMedia(
  runtime: QqbotPluginRuntime,
  rawTarget: string,
  filePath: string,
  opts?: MediaSendOptions,
): Promise<MediaSendResult> {
  try {
    const { baseTarget, target } = resolveQqbotSendTarget(runtime, rawTarget, opts);
    const passiveError = ensurePassiveSendAllowed(runtime, target);
    if (passiveError) return { ok: false, error: passiveError };

    const fileType = guessFileType(opts, filePath);

    if (target.peerType !== "c2c" && target.peerType !== "group") {
      const caption = opts?.caption?.trim() || filePath;
      const result = await sendQqbotMessage(runtime, target, {
        content: `[media] ${caption}`,
        ...(target.msgId ? { msg_id: target.msgId } : {}),
        ...(target.eventId ? { event_id: target.eventId } : {}),
        ...(typeof target.msgSeq === "number" ? { msg_seq: target.msgSeq } : {}),
      });
      rememberQqbotReplyState(runtime, baseTarget, target);
      return { ok: true, messageId: result?.id || result?.message?.id };
    }

    const upload = await uploadQqbotFile(runtime, target, filePath, fileType, false);
    const payload: Record<string, unknown> = {
      msg_type: 7,
      media: upload,
    };
    if (opts?.caption) payload.content = opts.caption;
    if (target.msgId) payload.msg_id = target.msgId;
    else if (target.eventId) payload.event_id = target.eventId;
    if (typeof target.msgSeq === "number") payload.msg_seq = target.msgSeq;

    const result = await sendQqbotMessage(runtime, target, payload);
    rememberQqbotReplyState(runtime, baseTarget, target);
    return { ok: true, messageId: result?.id || result?.message?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
