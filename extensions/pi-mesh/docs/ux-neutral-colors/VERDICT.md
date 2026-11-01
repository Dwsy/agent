# Neutral chrome palette — 2026-11-01

Follow-up to the user's colour feedback. Layout and menu positioning are unchanged.

## Changes

- Replaced violet-tinted gray surfaces and cyan selection fills with equal-channel neutral grays in both themes.
- Light: white content and menu, light-gray sidebar; dark: graphite content, sidebar and a slightly lifted menu surface.
- Session selection now uses a gray fill and a neutral edge indicator. Segmented selection and repository chips use the same neutral vocabulary.
- Blue remains for actions, focus and active tabs. Current-viewer, resume, herdr, user, assistant and tool labels use neutral metadata colours. Semantic status dots, destructive actions and diff meaning remain distinct.
- Added dedicated menu surface/selection tokens and documented the palette in `docs/style.md`.

## Actual browser verification

Isolated local Chrome via agent-browser, actual hub `http://127.0.0.1:5210`. Rendered colours were sampled, not only read from token declarations. See `metrics.json`.

| Surface | Light RGB | Dark RGB |
| --- | --- | --- |
| Toolbar | 246,246,246 | 37,37,37 |
| Sidebar/list header | 240,240,240 | 37,37,37 |
| Search | 250,250,250 | 48,48,48 |
| Selected session | 222,222,222 | 59,59,59 |
| Selected edge | 119,119,119 | 170,170,170 |
| Menu | 255,255,255 | 43,43,43 |
| Identity/role text | 89,89,89 | 179,179,179 |

- Body/secondary/tertiary text checked against content, sidebar, selected session and menu surfaces: minimum contrast 4.67:1 light, 4.60:1 dark.
- Actual row menu still ends at x=468, matching its trigger after palette changes.
- Desktop and 390px mobile screenshots captured in both themes. Browser errors: none.
- `bun test`: 238 passed, 0 failed, 15 files. `node --check src/hub/public/app.js`: passed.

Screenshots: `02-light.png`, `02-dark.png`, `03-menu-light.png`, `03-menu-dark.png`, `04-mobile-dark.png`, `05-mobile-light.png`.
