/**
 * Audio transcription via OpenAI-compatible STT API (Groq Whisper default).
 */

export interface AudioTranscriptionConfig {
  provider: "groq" | "openai";
  model: string;
  apiKey: string;
  baseUrl?: string;
  language?: string;
  timeoutMs?: number;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "whisper-1" },
};

export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string,
  config: AudioTranscriptionConfig,
): Promise<string> {
  const defaults = PROVIDER_DEFAULTS[config.provider] ?? PROVIDER_DEFAULTS.groq!;
  const baseUrl = config.baseUrl ?? defaults.baseUrl;
  const model = config.model ?? defaults.model;
  const timeoutMs = config.timeoutMs ?? 30000;

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp3") ? "mp3" : "wav";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), `audio.${ext}`);
  form.append("model", model);
  if (config.language) {
    form.append("language", config.language);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`STT ${config.provider} ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as { text?: string };
    return (data.text ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}
