const SENT_CACHE_TTL_MS = 3 * 60 * 1000;
const sentMessages = new Map<string, number>();

function key(chatId: string, messageId: number): string {
  return `${chatId}:${messageId}`;
}

export function recordSentMessage(chatId: string, messageId: number): void {
  const k = key(chatId, messageId);
  sentMessages.set(k, Date.now() + SENT_CACHE_TTL_MS);
}

export function wasRecentlySent(chatId: string, messageId: number): boolean {
  const k = key(chatId, messageId);
  const expires = sentMessages.get(k);
  if (!expires) return false;
  if (expires < Date.now()) {
    sentMessages.delete(k);
    return false;
  }
  return true;
}

export function cleanupSentMessageCache(): void {
  const now = Date.now();
  for (const [k, expires] of sentMessages.entries()) {
    if (expires < now) sentMessages.delete(k);
  }
}
