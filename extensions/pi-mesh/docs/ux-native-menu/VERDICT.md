# Menu anchoring — 2026-11-01

Follow-up to the user's screenshot of a row overflow menu crossing into the detail pane.

## Cause and correction

Button popups used the button's left edge as a cursor position. A 200px menu opened at x=440 and ended at x=640, while its trigger ended at x=468. Re-clamping from the already adjusted coordinates could also preserve an incorrect upward placement after measuring a shorter menu.

`menuPopupPos` now distinguishes button rectangles from cursor points. Row and detail overflow menus align their right edge with the trigger's right edge; source dropdowns explicitly align left. The vertical gap is 4px. Real-size placement recomputes from the original rectangle or pointer coordinates, with an 8px viewport margin. A stale next-tick callback cannot reposition a newer menu.

## Verification

- Desktop 1440×900: trigger right=468, menu right=468, menu top=251, trigger bottom=247.
- Bottom edge 1440×340: menu top=103, bottom=215, trigger top=219; upward gap=4.
- Mobile 390×844: trigger right=378, menu right=378, menu top=331, trigger bottom=327.
- Native right-click at (150,550): context menu left=150, top=550, width=200, height=55.
- Mobile detail overflow: trigger and menu both end at x=378; trigger bottom=96, menu top=100.
- Source dropdown at 900px: trigger left=239.45, menu left=239; trigger bottom=35.5, menu top=40 (rounded CSS pixels).
- Browser errors: none.
- Pure regression cases cover right/left alignment, changed dimensions after estimation, bottom flipping, both horizontal boundaries and cursor-based flipping.
- `bun test`: 238 passed, 0 failed, 15 files. `node --check src/hub/public/app.js`: passed.

## Screenshots

| File | Scenario |
| --- | --- |
| `01-row-right-aligned.png` | Desktop overflow stays within the list |
| `02-bottom-flip.png` | Overflow above its trigger near the bottom |
| `03-mobile-right-aligned.png` | Mobile overflow uses the same edge alignment |
| `04-detail-menu.png` | Detail overflow aligns to its own trigger |
