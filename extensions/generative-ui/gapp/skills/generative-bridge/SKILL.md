---
name: gapp-generative-bridge
description: Operate Glimpse-APPs with progressive context — app list in system, domain detail via tools on demand.
---

# GAPP agent skill (progressive)

## What is injected vs fetched

| In system | Via tools when needed |
|-----------|------------------------|
| Online app **list** (id / name / scope) | `gapp_list` full list |
| Live window **ids** only | **`gapp_list_tools({ id })`** catalog + schema |
| Inbound event/generate rules (short) | `gapp_get_state` / `gapp_call` payloads |

**Never invent domain tool names.** System does not embed full tool catalogs.

## Tool priority

1. See app in online list (or `gapp_list`)
2. **`gapp_list_tools({ id })`** when you will call/mutate
3. **`gapp_call`** preferred mutate/read
4. `gapp_get_state` / `gapp_set_state` fallback only
5. `gapp_upsert` / `gapp_open` for create / window

## Inbound

### `[GAPP event]`
- Re-read with tools, then short status + next steps

### `[GAPP generate]`
- Main session; content only; no chit-chat

## SSOT
- Disk `state.json`; UI via `GappStore`

## Native-feel GAPP UI

GAPP owns the shared HTML surface, not the native shell. Apply native-feel **T1 — place the seam at the rendering surface** and **T3 — adopt the platform; don't compete with it**:

- Let Glimpse/macOS own the title bar, traffic lights, window shadow, notifications, and native confirmations. Do not imitate them with HTML.
- Use the Host theme tokens and system fonts; include `color-scheme: light dark`. Never hardcode a brand accent or a window-shaped container.
- Use semantic controls, keyboard navigation, visible `:focus-visible`, and a meaningful Escape action. Keep text selection for user content and editable fields only.
- Native rows may have a subtle visual hover, but rows and buttons must not use `cursor: pointer`. Give controls a distinct pressed state.
- Preserve platform scrolling. Avoid JS smooth scrolling, route fades, skeletons for fast work, and decorative motion; honor `prefers-reduced-motion`.

The shell-specific portions of native-feel (WKWebView configuration, prewarming, title bar/window lifecycle, native menus) are Host responsibilities and must not be reimplemented in a GAPP. The only exception is a GAPP explicitly built as a desktop/window simulator: simulated chrome is then product content, not actual window chrome.
