/**
 * pi-desktop-sdk-compat-extension/v1
 *
 * Compatibility shim for extensions that still call
 *   ctx.modelRegistry.getApiKey(model)
 * against runtimes that now expose getApiKeyAndHeaders(model).
 *
 * Safe behavior:
 * - no-op if getApiKey already exists
 * - no-op if getApiKeyAndHeaders is unavailable
 * - returns undefined on resolution failure
 */
export default function (pi) {
	const ensureModelRegistryGetApiKeyCompat = (_event, ctx) => {
		const registry = ctx?.modelRegistry;
		if (!registry || typeof registry !== "object") return;
		if (typeof registry.getApiKey === "function") return;
		const resolver = registry.getApiKeyAndHeaders;
		if (typeof resolver !== "function") return;

		registry.getApiKey = async (model) => {
			try {
				const resolved = await resolver.call(registry, model);
				if (resolved && typeof resolved === "object" && resolved.ok === true) {
					const apiKey = resolved.apiKey;
					if (typeof apiKey === "string" && apiKey.trim().length > 0) {
						return apiKey;
					}
				}
			} catch {
				// no-op: keep compatibility shim non-fatal
			}
			return undefined;
		};
	};

	pi.on("session_start", ensureModelRegistryGetApiKeyCompat);
	pi.on("before_agent_start", ensureModelRegistryGetApiKeyCompat);
	pi.on("agent_start", ensureModelRegistryGetApiKeyCompat);
}
