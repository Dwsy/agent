// Sync Pi session names to the containing Herdr tab.
//
// Two entry points matter:
//   - session_info_changed: an explicit rename in this Pi process.
//   - session_start: resume/new/fork open a session that is already named, and
//     the Herdr tab still carries its default label, so it needs a re-sync.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const herdrTabId = process.env.HERDR_ENV === "1" ? process.env.HERDR_TAB_ID : undefined;

/** Session names are normalized upstream; strip the residue before it reaches a tab label. */
function normalizeSessionName(name: string | undefined): string | undefined {
  const trimmed = name?.replace(/[\r\n]+/g, " ").trim();
  return trimmed ? trimmed : undefined;
}

export default function (pi: ExtensionAPI) {
  if (!herdrTabId) return;

  const tabId = herdrTabId;
  let lastSyncedName: string | undefined;

  async function syncTabLabel(rawName: string | undefined): Promise<void> {
    const name = normalizeSessionName(rawName);
    if (!name || name === lastSyncedName) return;

    // Remember the attempt first: a failed Herdr call must not spin on every event.
    lastSyncedName = name;
    const result = await pi.exec("herdr", ["tab", "rename", tabId, name], { timeout: 3000 });
    if (result.code !== 0) {
      lastSyncedName = undefined;
    }
  }

  pi.on("session_start", async () => {
    await syncTabLabel(pi.getSessionName());
  });

  pi.on("session_info_changed", async (event) => {
    await syncTabLabel(event.name);
  });
}
