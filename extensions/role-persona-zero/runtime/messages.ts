/** Pure helpers for reading text out of pi message arrays. */

export function messageText(messages: unknown[]): string {
  const parts: string[] = [];
  for (const msg of messages as Array<any>) {
    const content = Array.isArray(msg?.content) ? msg.content : [];
    for (const item of content) {
      if (item?.type === "text" && typeof item.text === "string") {
        parts.push(item.text);
      }
    }
  }
  return parts.join("\n");
}

export function getLastUserText(messages: unknown[]): string {
  const list = (messages as Array<any>) || [];
  const lastUser = [...list].reverse().find((m: any) => m?.role === "user");
  const content = Array.isArray(lastUser?.content) ? lastUser.content : [];
  const textParts = content
    .filter((item: any) => item?.type === "text" && typeof item.text === "string")
    .map((item: any) => item.text as string);
  return textParts.join("\n").trim();
}
