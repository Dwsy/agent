import {
  SettingsManager,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { RetryCallbacks } from "@earendil-works/pi-ai/compat";
import { CONFIG_PATH } from "./src/constants.js";
import { compactWithConfiguredAlgorithm } from "./src/algorithms.js";
import { ctxTool, markCtxFireTriggered, peekCtxPending, setCtxLastResult, takeCtxCompaction, takeCtxFireRequest, takeCtxFireTriggered } from "./src/ctx.js";
import { loadConfig, saveConfig } from "./src/config.js";
import { clearStatusWidget, describeConfig, refreshStatusWidget } from "./src/status.js";
import type { AvailableModel, CustomCompactionConfig } from "./src/types.js";
import { openSettingsPanel } from "./src/ui.js";

function availableModels(ctx: ExtensionContext): AvailableModel[] {
  return ctx.modelRegistry.getAvailable()
    .filter((model) => model.input.includes("text"))
    .map((model) => ({
      provider: model.provider,
      id: model.id,
      name: model.name,
      outputCost: model.cost.output,
    }))
    .sort((left, right) => `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`));
}

function configuredModel(ctx: ExtensionContext, config: CustomCompactionConfig) {
  if (!config.model) {
    return { error: "No compaction model selected. Run /compaction to select an authenticated Pi model." };
  }

  const model = ctx.modelRegistry.find(config.model.provider, config.model.id);
  if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) {
    return { error: `Configured compaction model is unavailable: ${config.model.provider}/${config.model.id}` };
  }

  return { model };
}

const ERROR_TEXT_LIMIT = 200;

/** Provider failures can embed whole HTML error pages; keep notices one readable line. */
function condenseError(message: string): string {
  const singleLine = message.replace(/\s+/g, " ").trim();
  return singleLine.length > ERROR_TEXT_LIMIT ? `${singleLine.slice(0, ERROR_TEXT_LIMIT)}…` : singleLine;
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
  }
}

function commandCompletions(prefix: string): AutocompleteItem[] | null {
  const options: AutocompleteItem[] = [
    { value: "show", label: "show", description: "Show active compaction profile" },
    { value: "path", label: "path", description: "Show config path" },
    { value: "on", label: "on", description: "Enable custom compaction" },
    { value: "off", label: "off", description: "Disable custom compaction" },
  ];
  const matches = options.filter((option) => option.value.startsWith(prefix));
  return matches.length > 0 ? matches : null;
}

const COMPACTION_OWNER_SYMBOL = Symbol.for("pi-custom-compaction.owner");
const ROLE_COMPACTION_MEMORY_HANDOFF_SYMBOL = Symbol.for("role-persona-old.compaction-memory-handoff");

interface RoleCompactionMemoryHandoff {
  createInstructions(ctx: ExtensionContext): string | undefined;
  consumeSummary(summary: string, ctx: ExtensionContext): Promise<string>;
}

function roleCompactionMemoryHandoff(): RoleCompactionMemoryHandoff | undefined {
  const candidate = (globalThis as Record<symbol, unknown>)[ROLE_COMPACTION_MEMORY_HANDOFF_SYMBOL] as Partial<RoleCompactionMemoryHandoff> | undefined;
  return typeof candidate?.createInstructions === "function" && typeof candidate.consumeSummary === "function"
    ? candidate as RoleCompactionMemoryHandoff
    : undefined;
}

export default function customCompactionExtension(pi: ExtensionAPI): void {
  const loaded = loadConfig();
  let config = loaded.config;
  let pendingWarning = loaded.warning;
  // Armed resume text for the deferred compaction. Lives outside ctx stage because
  // session_before_compact consumes the whole stage before the commit happens.
  let ctxFireResume: string | undefined;

  const ownerRegistration = {
    shouldOwn(candidate: unknown): boolean {
      try {
        const resolved = configuredModel(candidate as ExtensionContext, config);
        return config.enabled && "model" in resolved;
      } catch {
        return false;
      }
    },
  };
  (globalThis as Record<symbol, unknown>)[COMPACTION_OWNER_SYMBOL] = ownerRegistration;

  const publishOwner = (): void => {
    (globalThis as Record<symbol, unknown>)[COMPACTION_OWNER_SYMBOL] = ownerRegistration;
  };

  const save = (next: CustomCompactionConfig, ctx: ExtensionContext): boolean => {
    const result = saveConfig(next);
    if (!result.success) {
      notify(ctx, result.error ?? "Could not save compaction configuration.", "error");
      return false;
    }
    config = next;
    refreshStatusWidget(ctx, config);
    return true;
  };

  const handleCompaction = async (event: SessionBeforeCompactEvent, ctx: ExtensionContext) => {
    const staged = takeCtxCompaction(event);
    if (staged) {
      if ("invalidPoint" in staged) {
        notify(ctx, `ctx: staged point ${staged.invalidPoint} is not on the current branch; using normal compaction.`, "warning");
      } else {
        return staged;
      }
    }

    if (!config.enabled) {
      return;
    }

    const resolved = configuredModel(ctx, config);
    if (!resolved.model) {
      if (!event.signal.aborted) {
        notify(ctx, `${resolved.error}; using Pi default compaction.`, "warning");
      }
      return;
    }
    const model = resolved.model;

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      if (!event.signal.aborted) {
        notify(ctx, `Compaction authentication failed: ${auth.error}; using Pi default compaction.`, "warning");
      }
      return;
    }

    try {
      notify(ctx, `Compacting with ${model.provider}/${model.id} (${config.algorithm})…`, "info");
      const memoryHandoff = roleCompactionMemoryHandoff();
      const memoryInstructions = memoryHandoff?.createInstructions(ctx);
      const headers = auth.headers
        ? Object.fromEntries(Object.entries(auth.headers).filter((entry): entry is [string, string] => entry[1] !== null))
        : undefined;
      const retryCallbacks: RetryCallbacks = {
        onRetryScheduled: (attempt, maxAttempts, delayMs, errorMessage) => {
          notify(ctx, `Compaction retry ${attempt}/${maxAttempts} in ${Math.round(delayMs / 1000)}s: ${condenseError(errorMessage)}`, "warning");
        },
      };
      const result = await compactWithConfiguredAlgorithm(
        event,
        model,
        { apiKey: auth.apiKey, headers, env: auth.env },
        config,
        memoryInstructions,
        SettingsManager.create(ctx.cwd).getRetrySettings(),
        retryCallbacks,
      );
      const summary = memoryInstructions && memoryHandoff
        ? await memoryHandoff.consumeSummary(result.summary, ctx)
        : result.summary;
      return { compaction: { ...result, summary } };
    } catch (error) {
      if (!event.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        notify(ctx, `Custom compaction failed: ${condenseError(message)}; using Pi default compaction.`, "warning");
      }
      return;
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    publishOwner();
    if (pendingWarning) {
      notify(ctx, pendingWarning, "warning");
      pendingWarning = undefined;
    }
    refreshStatusWidget(ctx, config);
  });

  pi.on("session_shutdown", async (event, ctx) => {
    clearStatusWidget(ctx);
    if (event.reason !== "reload" && event.reason !== "quit") {
      return;
    }
    const globals = globalThis as Record<symbol, unknown>;
    if (globals[COMPACTION_OWNER_SYMBOL] === ownerRegistration) {
      delete globals[COMPACTION_OWNER_SYMBOL];
    }
  });

  pi.on("session_before_compact", handleCompaction);
  // Deferred ctx fire: compact_fire (tool) only arms; the real trigger runs
  // here at idle, where manual compact's abort()+waitForIdle is safe.
  pi.on("agent_end", async (_event, ctx) => {
    if (!takeCtxFireRequest()) return;
    const staged = peekCtxPending();
    if (!staged) return;
    // Capture before compact(): session_before_compact consumes the stage.
    ctxFireResume = staged.resume;
    markCtxFireTriggered();
    notify(ctx, "ctx: firing deferred compaction…", "info");
    // onComplete/onError report directly: the session_compact* events below
    // never fire when compact() throws before session_before_compact
    // (e.g. "session too small"), which used to fail silently.
    // takeCtxFireTriggered is single-consume, so only one path reports.
    ctx.compact({
      // Resume is intentionally NOT gated on takeCtxFireTriggered: session_compact
      // is emitted inside compact() and always consumes the report flag first.
      onComplete: () => {
        // Consume the report flag unconditionally: leaving it set would let a later
        // fire inherit a stale report, and session_compact may already have used it.
        const reported = takeCtxFireTriggered();
        const resume = ctxFireResume;
        ctxFireResume = undefined;
        if (resume !== undefined) {
          pi.sendUserMessage(resume);
          setCtxLastResult("committed; resume sent");
          notify(ctx, "ctx compaction committed; resume sent.", "info");
          return;
        }
        if (!reported) return;
        setCtxLastResult("committed");
        notify(ctx, "ctx compaction committed.", "info");
      },
      onError: (error) => {
        ctxFireResume = undefined;
        if (!takeCtxFireTriggered()) return;
        const reason = error instanceof Error ? error.message : String(error);
        setCtxLastResult(`failed: ${condenseError(reason)}`);
        notify(ctx, `ctx compaction failed (${condenseError(reason)}); re-stage with compact_stage to retry.`, "warning");
      },
    });
  });
  // Surface silent outcomes: without this, a failed/aborted ctx compaction
  // leaves no trace (stage already consumed, no entry appended).
  pi.on("session_compact", async (_event, ctx) => {
    if (!takeCtxFireTriggered()) return;
    setCtxLastResult("committed");
    notify(ctx, "ctx compaction committed.", "info");
  });
  pi.on("session_compact_failed", async (event, ctx) => {
    if (!takeCtxFireTriggered()) return;
    const reason = event.aborted ? "aborted" : (event.errorMessage ?? "unknown error");
    setCtxLastResult(`failed: ${condenseError(reason)}`);
    notify(ctx, `ctx compaction failed (${condenseError(reason)}); re-stage with compact_stage to retry.`, "warning");
  });
  pi.registerTool(ctxTool);

  pi.registerCommand("compaction", {
    description: "Configure custom context compaction model and algorithm",
    getArgumentCompletions: commandCompletions,
    handler: async (args, ctx: ExtensionCommandContext) => {
      const action = args.trim();
      if (!action) {
        await openSettingsPanel(ctx, {
          getConfig: () => config,
          getModels: () => availableModels(ctx),
          save,
          getConfigPath: () => CONFIG_PATH,
        });
        return;
      }

      if (action === "show") {
        notify(ctx, `Custom compaction: ${describeConfig(config)}`, "info");
        return;
      }
      if (action === "path") {
        notify(ctx, CONFIG_PATH, "info");
        return;
      }
      if (action === "on" || action === "off") {
        const enabled = action === "on";
        if (save({ ...config, enabled }, ctx)) {
          notify(ctx, `Custom compaction ${enabled ? "enabled" : "disabled"}.`, "info");
        }
        return;
      }

      notify(ctx, "Usage: /compaction [show|path|on|off] (or no arguments to open settings)", "info");
    },
  });
}
