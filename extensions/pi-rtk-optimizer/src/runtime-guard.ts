import type { RtkIntegrationConfig, RuntimeStatus } from "./types.js";

export function shouldRequireRtkAvailabilityForCommandHandling(
	config: Pick<RtkIntegrationConfig, "mode" | "guardWhenRtkMissing">,
): boolean {
	return config.mode === "rewrite" && config.guardWhenRtkMissing;
}

export function shouldSkipCommandHandlingWhenRtkMissing(
	config: Pick<RtkIntegrationConfig, "mode" | "guardWhenRtkMissing">,
	runtimeStatus: Pick<RuntimeStatus, "rtkAvailable">,
): boolean {
	return shouldRequireRtkAvailabilityForCommandHandling(config) && !runtimeStatus.rtkAvailable;
}
