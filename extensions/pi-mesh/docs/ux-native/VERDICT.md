# Toolbar / Sidebar — 2026-11-01

## Result

Native chrome pass. The desktop toolbar's left section follows the session-list divider. The toolbar, list header and sticky repo headers share one sidebar surface. Four status filters form one neutral segmented control; semantic colour remains in session and connection dots. Source identity is a plain popup button without a permanent sessionId. Command search is labelled; session search has one outline, an embedded shortcut, and a clear button that retains input focus.

Implementation: `src/hub/public/index.html`, `src/hub/public/app.css`. Canonical decisions: `docs/style.md`, `docs/design.md`. Regression contracts: `test/webui.test.ts`. No app.js or hub changes.

## Browser verification

Independent local Chrome, agent-browser session `mesh-native`, actual hub at `http://127.0.0.1:5210`. Yab could not open the page; browser-harness could not read Chrome's DevToolsActivePort, so verification used an isolated Chrome launched directly by agent-browser.

- Light and dark themes render correctly; no unhydrated icons or browser errors.
- Widths 320, 390, 600, 900, 1180 and 1440: document and toolbar fit the viewport. Measurements are in `metrics.json`.
- Mobile search and filter targets are 44px high.
- Desktop toolbar/list edges match at minimum and default list widths. Actual mouse drag from 480px to 600px also kept both edges at 600px. Double-click restored both to 480px.
- 600px command label stays on one line (16.5px high); it previously collapsed to a vertical stack during this round and was fixed before acceptance.
- Search for a nonexistent session shows the empty state. Clearing restores the rows and keeps focus in the search input.
- Offline filter shows 12 actual rows and exactly one pressed filter; switching back restores the online list.
- Command button opens the command panel; Escape closes it.
- Source popup opens, supports ArrowDown, and closes with Escape. Its width matches the 288px positioning contract so long session titles cannot widen it past the viewport.
- Hovering the active segment preserves its selected surface.

## Automated verification

`bun test`: 237 passed, 0 failed, 15 files. `node --check src/hub/public/app.js`: passed.

## Screenshots

| File | View |
| --- | --- |
| `01-desktop-dark.png` | 1440px dark |
| `02-desktop-light.png` | 1440px light |
| `03-mobile-light.png` | 390px light |
| `04-mobile-dark.png` | 390px dark |
| `05-compact-dark.png` | 900px dark |
| `06-resized-dark.png` | 1440px with a 600px sidebar |
| `07-600-fixed.png` | 600px with the command label corrected |
