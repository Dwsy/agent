/**
 * Telegram webhook verification and update parsing.
 */

import type { TelegramUpdate } from "./types.ts";

/**
 * Verify a Telegram webhook request using the secret token.
 * Telegram sends the secret in the X-Telegram-Bot-Api-Secret-Token header.
 */
export function verifyWebhookSecret(request: Request, secretToken?: string): boolean {
  if (!secretToken) return true; // No secret configured, allow all
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  return header === secretToken;
}

/**
 * Parse a Telegram webhook request body into an Update object.
 */
export async function parseWebhookUpdate(request: Request): Promise<TelegramUpdate | null> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && "update_id" in body) {
      return body as TelegramUpdate;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a webhook response (Telegram expects 200 OK).
 */
export function webhookOk(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Create a webhook error response.
 */
export function webhookError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
