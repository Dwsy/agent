/** Shared result helpers for gateway tool responses. */

export function toolOk(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { ok: true },
  };
}

export function toolError(error: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${error}` }],
    details: { error: true },
  };
}

export function cronOk(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: { ok: true },
  };
}

export function cronError(error: string) {
  return {
    content: [{ type: "text" as const, text: `Cron error: ${error}` }],
    details: { error: true },
  };
}
