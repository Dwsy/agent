export function isRecoverableTelegramNetworkError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("socket") ||
    msg.includes("temporarily")
  );
}

export function isGetUpdatesConflict(err: unknown): boolean {
  const anyErr = err as any;
  const code = anyErr?.error_code ?? anyErr?.errorCode;
  if (code === 409) return true;
  const msg = String(anyErr?.description ?? anyErr?.message ?? err ?? "").toLowerCase();
  return msg.includes("409") && msg.includes("getupdates");
}
