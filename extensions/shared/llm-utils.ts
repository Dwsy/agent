/**
 * Shared LLM utilities for extensions
 *
 * Common patterns for model selection, API key management, and completion handling.
 *
 * @module extensions/shared/llm-utils
 */

import { complete, type Model, type Api, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

const HAIKU_MODEL_ID = "claude-haiku-4-5";

/**
 * Select an efficient model for extraction tasks.
 * For Anthropic Opus/Sonnet models, prefer Haiku for cost efficiency.
 */
export async function selectExtractionModel(
	currentModel: Model<Api>,
	modelRegistry: ExtensionContext["modelRegistry"],
): Promise<Model<Api>> {
	// Only consider switching if the provider is anthropic and the model is opus or sonnet
	if (currentModel.provider !== "anthropic") {
		return currentModel;
	}

	const modelId = currentModel.id.toLowerCase();
	const isOpusOrSonnet = modelId.includes("opus") || modelId.includes("sonnet");
	if (!isOpusOrSonnet) {
		return currentModel;
	}

	// Try to find and use claude-haiku-4-5
	const haikuModel = modelRegistry.find("anthropic", HAIKU_MODEL_ID);
	if (!haikuModel) {
		return currentModel;
	}

	// Check if we have an API key for the haiku model
	const auth = await (modelRegistry as any).getApiKeyAndHeaders(haikuModel);
	if (!auth.ok || !auth.apiKey) {
		return currentModel;
	}

	return haikuModel;
}

/**
 * Get last assistant message text from the current branch.
 * Returns undefined if no valid assistant message is found.
 */
export function getLastAssistantMessage(ctx: ExtensionContext): string | undefined {
	const branch = ctx.sessionManager.getBranch();

	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type === "message") {
			const msg = entry.message;
			if ("role" in msg && msg.role === "assistant") {
				// Skip incomplete messages
				if (msg.stopReason !== "stop") {
					continue;
				}
				const textParts = msg.content
					.filter((c): c is { type: "text"; text: string } => c.type === "text")
					.map((c) => c.text);
				if (textParts.length > 0) {
					return textParts.join("\n");
				}
			}
		}
	}

	return undefined;
}

/**
 * Create a user message for completion.
 */
export function createUserMessage(text: string): UserMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	};
}

/**
 * Extract text content from completion response.
 */
export function extractResponseText(response: { content: Array<{ type: string; text?: string }> }): string {
	return response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
}

/**
 * Check if response was aborted or had an error.
 */
export function isResponseFailed(response: { stopReason?: string }): boolean {
	return response.stopReason === "aborted" || response.stopReason === "error";
}
