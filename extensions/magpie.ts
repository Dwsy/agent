// magpie: written by magpie, and written again as its models change.
// magpie's decision models (System One) and image models (Settings ›
// Images), for codemode's models.classify() and models.generateImages().
// Pi's models.json holds chat models only, so they are registered here,
// as providers magpie-systemone and magpie-images. Take Pi off magpie in
// magpie to have this file gone; with this first line changed, magpie
// leaves the file to you.
const MAGPIE = {"apiKey":"magpie","baseUrl":"http://127.0.0.1:3425/v1","classifiers":[{"id":"typesafe/jev-latest","name":"jev-latest · TypeSafe Jev"},{"id":"typesafe/jev-preview","name":"jev-preview · TypeSafe Jev"}],"images":[{"id":"codex/gpt-image-2","name":"GPT Image · Codex","input":["text"]},{"id":"nvidia/black-forest-labs/flux_2-klein-4b","name":"FLUX.2 Klein 4B · NVIDIA NIM","input":["text","image"]},{"id":"nvidia/qwen/qwen-image-edit","name":"Qwen Image Edit · NVIDIA NIM","input":["text","image"]},{"id":"nvidia/qwen/qwen-image","name":"Qwen Image · NVIDIA NIM","input":["text"]},{"id":"nvidia/black-forest-labs/flux_1-kontext-dev","name":"FLUX.1-Kontext-dev · NVIDIA NIM","input":["text","image"]},{"id":"nvidia/black-forest-labs/flux.1-dev","name":"FLUX.1-dev · NVIDIA NIM","input":["text"]},{"id":"nvidia/black-forest-labs/flux_1-schnell","name":"FLUX.1-schnell · NVIDIA NIM","input":["text"]},{"id":"openrouter/google/gemini-nano-banana-2.1","name":"Nano Banana 2.1 · OpenRouter","input":["text","image"]},{"id":"openrouter/google/gemini-3.1-flash-lite-image","name":"Nano Banana 2 Lite · OpenRouter","input":["text","image"]},{"id":"openrouter/google/gemini-3-pro-image","name":"Nano Banana Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/google/gemini-3.1-flash-image","name":"Nano Banana 2 · OpenRouter","input":["text","image"]},{"id":"openrouter/openai/gpt-5.4-image-2","name":"GPT-5.4 Image 2 · OpenRouter","input":["text","image"]},{"id":"openrouter/google/gemini-3.1-flash-image-preview","name":"Nano Banana 2 Preview · OpenRouter","input":["text","image"]},{"id":"openrouter/google/gemini-3-pro-image-preview","name":"Nano Banana Pro Preview · OpenRouter","input":["text","image"]},{"id":"openrouter/openai/gpt-5-image-mini","name":"GPT-5 Image Mini · OpenRouter","input":["text","image"]},{"id":"openrouter/openai/gpt-5-image","name":"GPT-5 Image · OpenRouter","input":["text","image"]},{"id":"openrouter/google/gemini-2.5-flash-image","name":"Nano Banana · OpenRouter","input":["text","image"]},{"id":"openrouter/openai/gpt-image-2.6-sunburst","name":"GPT Image 2.6 Sunburst · OpenRouter","input":["text","image"]},{"id":"openrouter/openai/gpt-image-2.6-flare","name":"GPT Image 2.6 Flare · OpenRouter","input":["text","image"]},{"id":"openrouter/sourceful/riverflow-v2.6-pro","name":"Riverflow V2.6 Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/qwen/qwen-image-2.1-turbo","name":"Qwen Image 2.1 Turbo · OpenRouter","input":["text","image"]},{"id":"openrouter/qwen/qwen-image-2.1-pro","name":"Qwen Image 2.1 Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/krea/k3-edit","name":"K3 Edit · OpenRouter","input":["text","image"]},{"id":"openrouter/black-forest-labs/flux-3-image-klein","name":"FLUX 3 Image Klein · OpenRouter","input":["text","image"]},{"id":"openrouter/tencent/hy-image-v3.5-preview","name":"Hy Image 3.5 Preview · OpenRouter","input":["text","image"]},{"id":"openrouter/bytedance-seed/seedream-5-0-flash","name":"Seedream 5.0 Flash · OpenRouter","input":["text","image"]},{"id":"openrouter/black-forest-labs/flux-3-image","name":"FLUX 3 Image · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4.1-flash","name":"Recraft V4.1 Flash · OpenRouter","input":["text"]},{"id":"openrouter/openai/gpt-image-2.5-sunburst","name":"GPT Image 2.5 Sunburst · OpenRouter","input":["text","image"]},{"id":"openrouter/openai/gpt-image-2.5-flare","name":"GPT Image 2.5 Flare · OpenRouter","input":["text","image"]},{"id":"openrouter/microsoft/mai-image-2.6","name":"MAI-Image-2.6 · OpenRouter","input":["text","image"]},{"id":"openrouter/microsoft/mai-image-2.6-flash","name":"MAI-Image-2.6 Flash · OpenRouter","input":["text","image"]},{"id":"openrouter/meta/muse-image","name":"Muse Image · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4-styles-pro","name":"Recraft V4 Styles Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4-styles-vector","name":"Recraft V4 Styles Vector · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4-styles-pro-vector","name":"Recraft V4 Styles Pro Vector · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4-styles","name":"Recraft V4 Styles · OpenRouter","input":["text","image"]},{"id":"openrouter/bytedance-seed/seedream-5-0-lite","name":"Seedream 5.0 Lite · OpenRouter","input":["text","image"]},{"id":"openrouter/bytedance-seed/seedream-5-0-pro","name":"Seedream 5.0 Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/x-ai/grok-imagine-image-2.0","name":"Grok Imagine Image 2.0 · OpenRouter","input":["text","image"]},{"id":"openrouter/qwen/qwen-image-3-pro","name":"Qwen Image 3 Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/qwen/qwen-image-3","name":"Qwen Image 3 · OpenRouter","input":["text","image"]},{"id":"openrouter/microsoft/mai-image-2.5-pro","name":"MAI-Image-2.5 Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/krea/krea-2-large","name":"Krea 2 Large · OpenRouter","input":["text","image"]},{"id":"openrouter/krea/krea-2-medium","name":"Krea 2 Medium · OpenRouter","input":["text","image"]},{"id":"openrouter/krea/krea-2-medium-turbo","name":"Krea 2 Medium Turbo · OpenRouter","input":["text","image"]},{"id":"openrouter/openai/gpt-image-2","name":"GPT Image 2 · OpenRouter","input":["text","image"]},{"id":"openrouter/openai/gpt-image-1-mini","name":"GPT Image 1 Mini · OpenRouter","input":["text","image"]},{"id":"openrouter/openai/gpt-image-1","name":"GPT Image 1 · OpenRouter","input":["text","image"]},{"id":"openrouter/sourceful/riverflow-v2.5-pro","name":"Riverflow V2.5 Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/sourceful/riverflow-v2.5-fast","name":"Riverflow V2.5 Fast · OpenRouter","input":["text","image"]},{"id":"openrouter/microsoft/mai-image-2.5","name":"MAI-Image-2.5 · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4.1-pro-vector","name":"Recraft V4.1 Pro Vector · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4.1-vector","name":"Recraft V4.1 Vector · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4.1-utility-pro","name":"Recraft V4.1 Utility Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4.1-utility","name":"Recraft V4.1 Utility · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4.1-pro","name":"Recraft V4.1 Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4.1","name":"Recraft V4.1 · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4-pro-vector","name":"Recraft V4 Pro Vector · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4-vector","name":"Recraft V4 Vector · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4-pro","name":"Recraft V4 Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v4","name":"Recraft V4 · OpenRouter","input":["text","image"]},{"id":"openrouter/recraft/recraft-v3","name":"Recraft V3 · OpenRouter","input":["text","image"]},{"id":"openrouter/sourceful/riverflow-v2-pro","name":"Riverflow V2 Pro · OpenRouter","input":["text","image"]},{"id":"openrouter/sourceful/riverflow-v2-fast","name":"Riverflow V2 Fast · OpenRouter","input":["text","image"]},{"id":"openrouter/black-forest-labs/flux.2-klein-4b","name":"FLUX.2 Klein 4B · OpenRouter","input":["text","image"]},{"id":"openrouter/bytedance-seed/seedream-4.5","name":"Seedream 4.5 · OpenRouter","input":["text","image"]},{"id":"openrouter/black-forest-labs/flux.2-max","name":"FLUX.2 Max · OpenRouter","input":["text","image"]},{"id":"openrouter/black-forest-labs/flux.2-flex","name":"FLUX.2 Flex · OpenRouter","input":["text","image"]},{"id":"openrouter/black-forest-labs/flux.2-pro","name":"FLUX.2 Pro · OpenRouter","input":["text","image"]},{"id":"oldapi/gemini-3.1-flash-image","name":"gemini-3.1-flash-image · oldapi","input":["text"]},{"id":"oldapi/gpt-image-1.5","name":"gpt-image-1.5 · oldapi","input":["text"]},{"id":"oldapi/gpt-image-2","name":"gpt-image-2 · oldapi","input":["text"]},{"id":"pite-oai/gpt-image-2.5-sunburst","name":"gpt-image-2.5-sunburst · pite-oai","input":["text"]},{"id":"gpi/gpt-image-2","name":"gpt-image-2 · gpi","input":["text"]},{"id":"grok/grok-imagine-image","name":"Grok Imagine · Grok","input":["text"]},{"id":"grok/grok-imagine-image-quality","name":"Grok Imagine Quality · Grok","input":["text"]},{"id":"workbuddy/hunyuan-image-alpha","name":"Hunyuan Image Alpha · WorkBuddy","input":["text","image"]},{"id":"workbuddy-ai/hy-image-3.5","name":"HY-Image-3.5 · WorkBuddy AI","input":["text","image"]},{"id":"antigravity/gemini-3.1-flash-image","name":"Gemini 3.1 Flash Image · Antigravity","input":["text","image"]},{"id":"minimax-code-global/MiniMax-Image","name":"MiniMax Image · MiniMax Code (Global)","input":["text","image"]}]};

export default async function (pi) {
	// a Pi older than its classifier models (1.x) has no such module, or a
	// System One provider without classify: it gets nothing from here
	let typesafe;
	try {
		const { builtinProviders } = await import("@earendil-works/pi-ai/providers/all");
		typesafe = builtinProviders().find((p) => p.id === "typesafe");
	} catch {
		return;
	}
	if (typeof typesafe?.classify !== "function") return;
	const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
	if (MAGPIE.classifiers.length)
		pi.registerProvider("magpie-systemone", {
			name: "magpie System One",
			baseUrl: MAGPIE.baseUrl,
			apiKey: MAGPIE.apiKey,
			// magpie's /v1/systemone takes TypeSafe's System One protocol for
			// every decision model, Cloudflare's and OpenRouter's too
			models: MAGPIE.classifiers.map((m) => ({ type: "classifier", api: "typesafe-system-one", id: m.id, name: m.name, input: ["text"], cost, contextWindow: 64000 })),
			classifiers: {
				"typesafe-system-one": { classify: (model, context, options) => typesafe.classify(model, context, options) },
			},
		});
	if (MAGPIE.images.length)
		pi.registerProvider("magpie-images", {
			name: "magpie Images",
			baseUrl: MAGPIE.baseUrl,
			apiKey: MAGPIE.apiKey,
			models: MAGPIE.images.map((m) => ({ type: "image", api: "magpie-images", id: m.id, name: m.name, input: m.input, output: ["image"], cost })),
			images: { "magpie-images": { generateImages: draw } },
		});
}

// draw asks magpie's images API (POST …/v1/images/generations) for the
// input's text, with its images as references.
async function draw(model, context, options) {
	const out = { api: model.api, provider: model.provider, model: model.id, output: [], stopReason: "stop", timestamp: Date.now() };
	try {
		const prompt = context.input.filter((b) => b.type === "text").map((b) => b.text).join("\n");
		const images = context.input.filter((b) => b.type === "image").map((b) => `data:${b.mimeType};base64,${b.data}`);
		const body = { model: model.id, prompt, response_format: "b64_json" };
		if (images.length) body.images = images;
		const res = await (options?.fetch ?? fetch)(new URL("images/generations", `${model.baseUrl.replace(/\/+$/u, "")}/`), {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${options?.apiKey ?? ""}`, ...options?.headers },
			body: JSON.stringify(body),
			signal: options?.signal,
		});
		const text = await res.text();
		let got;
		try {
			got = JSON.parse(text);
		} catch {
			got = undefined;
		}
		if (!res.ok) throw new Error(`magpie answered ${res.status}: ${got?.error?.message ?? text.slice(0, 500)}`);
		if (got?.text) out.output.push({ type: "text", text: got.text });
		for (const d of got?.data ?? []) {
			if (d.b64_json) out.output.push({ type: "image", data: d.b64_json, mimeType: d.mime_type ?? "image/png" });
			else if (d.url) out.output.push({ type: "text", text: d.url });
		}
		const u = got?.usage;
		if (u) {
			const input = u.input_tokens ?? 0;
			const output = u.output_tokens ?? 0;
			out.usage = { input, output, cacheRead: 0, cacheWrite: 0, totalTokens: u.total_tokens ?? input + output, cost: { ...cost0, total: 0 } };
		}
	} catch (error) {
		out.stopReason = options?.signal?.aborted ? "aborted" : "error";
		out.errorMessage = error instanceof Error ? error.message : String(error);
	}
	return out;
}

const cost0 = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
