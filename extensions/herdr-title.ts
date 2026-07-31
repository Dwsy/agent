// Sync Pi session renames to the containing Herdr tab.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const tabId = process.env.HERDR_TAB_ID;
  if (!tabId) return;

  pi.on("session_info_changed", async () => {
    const name = pi.getSessionName();
    if (!name) return;

    await pi.exec("herdr", ["tab", "rename", tabId, name]);
  });
}
