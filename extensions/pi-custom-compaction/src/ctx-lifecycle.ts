import type { CompactionResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  beginCtxFire, CTX_BOUNDARY_TYPE, ctxFireInstructions, isCtxFireCurrent,
  peekCtxFireRequest, resetCtxState, settleCtxFire, type CtxPending,
} from "./ctx.js";

type Notify = (ctx: ExtensionContext, message: string, level: "info" | "warning" | "error") => void;

function matchesStage(stage: CtxPending, result: CompactionResult): boolean {
  const details = result.details as Record<string, unknown> | undefined;
  // The committed summary is the staged summary plus appended file tags, so it
  // is compared against what was actually built rather than the raw stage.
  const expected = stage.committedSummary ?? stage.summary;
  return details?.ctx === true && details.stageId === stage.stageId &&
    result.summary === expected && result.firstKeptEntryId === stage.firstKeptEntryId;
}

/** Same stop-then-transition lifecycle as pi-context; never compact inside a tool. */
export function registerCtxLifecycle(pi: ExtensionAPI, notify: Notify): void {
  pi.on("session_start", () => { resetCtxState(); });
  pi.on("session_shutdown", () => { resetCtxState(); });
  pi.on("session_tree", () => { resetCtxState(); });

  pi.on("turn_end", (_event, ctx) => {
    if (peekCtxFireRequest()) ctx.abort();
  });

  pi.on("agent_end", (_event, ctx) => {
    const stage = beginCtxFire(ctx.sessionManager.getLeafId() ?? "");
    if (!stage) return;

    const fail = (error: unknown): void => {
      const reason = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim().slice(0, 200);
      if (!settleCtxFire(stage, `failed: ${reason}`)) return;
      notify(ctx, `ctx compaction failed (${reason}); re-stage with compact_stage to retry.`, "warning");
    };

    try {
      if (stage.retention === "summary-only") {
        // A metadata-only entry after the final tool result forms a legal native
        // keep-point without retaining any dialogue from the summarised turn.
        pi.appendEntry(CTX_BOUNDARY_TYPE, { stageId: stage.stageId });
        const boundaryId = ctx.sessionManager.getLeafId();
        if (!boundaryId) throw new Error("Could not create ctx compaction boundary.");
        stage.firstKeptEntryId = boundaryId;
      }
      notify(ctx, `ctx: compacting (${stage.retention})…`, "info");
      ctx.compact({
        customInstructions: ctxFireInstructions(stage),
        onComplete: (result) => {
          if (!isCtxFireCurrent(stage)) return;
          if (!matchesStage(stage, result)) {
            fail("The staged ctx summary was not committed; another compaction handler supplied the result.");
            return;
          }
          if (stage.resume !== undefined) {
            try {
              pi.sendUserMessage(stage.resume);
            } catch (error) {
              settleCtxFire(stage, "committed; resume failed");
              notify(ctx, `ctx compaction committed, but resume failed: ${String(error).slice(0, 200)}`, "warning");
              return;
            }
          }
          const resultText = stage.resume === undefined ? "committed" : "committed; resume sent";
          settleCtxFire(stage, resultText);
          notify(ctx, `ctx compaction ${resultText}.`, "info");
        },
        onError: fail,
      });
    } catch (error) {
      fail(error);
    }
  });
}
