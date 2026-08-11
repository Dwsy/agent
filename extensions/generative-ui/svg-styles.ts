// Pre-built CSS variables + SVG classes for widgets.
// Dual theme via prefers-color-scheme so light/dark both work without a JS snapshot.

/** Always emits light defaults + dark overrides. darkMode kept for API compat (unused). */
export function cssVariables(): string {
  return `:root {
  color-scheme: light dark;
  --p: #1a1a1a;
  --s: #5f5e5a;
  --t: #888780;
  --bg2: #f1efe8;
  --b: #d3d1c7;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #5f5e5a;
  --color-text-tertiary: #888780;
  --color-text-info: #185FA5;
  --color-text-danger: #A32D2D;
  --color-text-success: #3B6D11;
  --color-text-warning: #854F0B;
  --color-background-primary: #ffffff;
  --color-background-secondary: #f1efe8;
  --color-background-tertiary: #e8e6de;
  --color-background-info: #E6F1FB;
  --color-background-danger: #FCEBEB;
  --color-background-success: #EAF3DE;
  --color-background-warning: #FAEEDA;
  --color-border-primary: rgba(0,0,0,0.4);
  --color-border-secondary: rgba(0,0,0,0.3);
  --color-border-tertiary: rgba(0,0,0,0.15);
  --color-border-info: #378ADD;
  --color-border-danger: #E24B4A;
  --color-border-success: #639922;
  --color-border-warning: #BA7517;
  --font-sans: system-ui, -apple-system, sans-serif;
  --font-serif: Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  --border-radius-xl: 16px;
  --focus-ring: rgba(24, 95, 165, 0.2);
  --chart-tick: #636366;
  --chart-grid: rgba(0,0,0,0.06);
}
@media (prefers-color-scheme: dark) {
  :root {
    --p: #e0e0e0;
    --s: #a0a0a0;
    --t: #707070;
    --bg2: #2a2a2a;
    --b: #404040;
    --color-text-primary: #e0e0e0;
    --color-text-secondary: #a0a0a0;
    --color-text-tertiary: #707070;
    --color-text-info: #85B7EB;
    --color-text-danger: #F09595;
    --color-text-success: #97C459;
    --color-text-warning: #EF9F27;
    --color-background-primary: #1a1a1a;
    --color-background-secondary: #2a2a2a;
    --color-background-tertiary: #111111;
    --color-background-info: #0C447C;
    --color-background-danger: #791F1F;
    --color-background-success: #27500A;
    --color-background-warning: #633806;
    --color-border-primary: rgba(255,255,255,0.4);
    --color-border-secondary: rgba(255,255,255,0.3);
    --color-border-tertiary: rgba(255,255,255,0.15);
    --color-border-info: #85B7EB;
    --color-border-danger: #F09595;
    --color-border-success: #97C459;
    --color-border-warning: #EF9F27;
    --focus-ring: rgba(133, 183, 235, 0.25);
    --chart-tick: #8E8E93;
    --chart-grid: rgba(255,255,255,0.06);
  }
}`;
}

export const SVG_STYLES = `
/* Text classes */
svg .t  { font-family: var(--font-sans); font-size: 14px; fill: var(--p); }
svg .ts { font-family: var(--font-sans); font-size: 12px; fill: var(--s); }
svg .th { font-family: var(--font-sans); font-size: 14px; font-weight: 500; fill: var(--p); }

/* Neutral box */
svg .box { fill: var(--bg2); stroke: var(--b); }

/* Clickable node */
svg .node { cursor: pointer; }
svg .node:hover { opacity: 0.8; }

/* Arrow connector */
svg .arr { stroke: var(--t); stroke-width: 1.5; fill: none; }

/* Leader line */
svg .leader { stroke: var(--t); stroke-width: 0.5; stroke-dasharray: 4 3; fill: none; }

/* ── Color ramp classes (light default / dark media) ──────────────────────
   Light: 50 fill, 600 stroke, 800 title, 600 subtitle
   Dark:  800 fill, 200 stroke, 100 title, 200 subtitle
   Direct-child selectors (>) as documented in guidelines. */

/* Purple */
svg .c-purple > rect, svg .c-purple > circle, svg .c-purple > ellipse { fill: #EEEDFE; stroke: #534AB7; }
svg .c-purple > .th, svg .c-purple > .t { fill: #3C3489; }
svg .c-purple > .ts { fill: #534AB7; }
svg rect.c-purple, svg circle.c-purple, svg ellipse.c-purple { fill: #EEEDFE; stroke: #534AB7; }

/* Teal */
svg .c-teal > rect, svg .c-teal > circle, svg .c-teal > ellipse { fill: #E1F5EE; stroke: #0F6E56; }
svg .c-teal > .th, svg .c-teal > .t { fill: #085041; }
svg .c-teal > .ts { fill: #0F6E56; }
svg rect.c-teal, svg circle.c-teal, svg ellipse.c-teal { fill: #E1F5EE; stroke: #0F6E56; }

/* Coral */
svg .c-coral > rect, svg .c-coral > circle, svg .c-coral > ellipse { fill: #FAECE7; stroke: #993C1D; }
svg .c-coral > .th, svg .c-coral > .t { fill: #712B13; }
svg .c-coral > .ts { fill: #993C1D; }
svg rect.c-coral, svg circle.c-coral, svg ellipse.c-coral { fill: #FAECE7; stroke: #993C1D; }

/* Pink */
svg .c-pink > rect, svg .c-pink > circle, svg .c-pink > ellipse { fill: #FBEAF0; stroke: #993556; }
svg .c-pink > .th, svg .c-pink > .t { fill: #72243E; }
svg .c-pink > .ts { fill: #993556; }
svg rect.c-pink, svg circle.c-pink, svg ellipse.c-pink { fill: #FBEAF0; stroke: #993556; }

/* Gray */
svg .c-gray > rect, svg .c-gray > circle, svg .c-gray > ellipse { fill: #F1EFE8; stroke: #5F5E5A; }
svg .c-gray > .th, svg .c-gray > .t { fill: #444441; }
svg .c-gray > .ts { fill: #5F5E5A; }
svg rect.c-gray, svg circle.c-gray, svg ellipse.c-gray { fill: #F1EFE8; stroke: #5F5E5A; }

/* Blue */
svg .c-blue > rect, svg .c-blue > circle, svg .c-blue > ellipse { fill: #E6F1FB; stroke: #185FA5; }
svg .c-blue > .th, svg .c-blue > .t { fill: #0C447C; }
svg .c-blue > .ts { fill: #185FA5; }
svg rect.c-blue, svg circle.c-blue, svg ellipse.c-blue { fill: #E6F1FB; stroke: #185FA5; }

/* Green */
svg .c-green > rect, svg .c-green > circle, svg .c-green > ellipse { fill: #EAF3DE; stroke: #3B6D11; }
svg .c-green > .th, svg .c-green > .t { fill: #27500A; }
svg .c-green > .ts { fill: #3B6D11; }
svg rect.c-green, svg circle.c-green, svg ellipse.c-green { fill: #EAF3DE; stroke: #3B6D11; }

/* Amber */
svg .c-amber > rect, svg .c-amber > circle, svg .c-amber > ellipse { fill: #FAEEDA; stroke: #854F0B; }
svg .c-amber > .th, svg .c-amber > .t { fill: #633806; }
svg .c-amber > .ts { fill: #854F0B; }
svg rect.c-amber, svg circle.c-amber, svg ellipse.c-amber { fill: #FAEEDA; stroke: #854F0B; }

/* Red */
svg .c-red > rect, svg .c-red > circle, svg .c-red > ellipse { fill: #FCEBEB; stroke: #A32D2D; }
svg .c-red > .th, svg .c-red > .t { fill: #791F1F; }
svg .c-red > .ts { fill: #A32D2D; }
svg rect.c-red, svg circle.c-red, svg ellipse.c-red { fill: #FCEBEB; stroke: #A32D2D; }

@media (prefers-color-scheme: dark) {
  svg .c-purple > rect, svg .c-purple > circle, svg .c-purple > ellipse { fill: #3C3489; stroke: #AFA9EC; }
  svg .c-purple > .th, svg .c-purple > .t { fill: #CECBF6; }
  svg .c-purple > .ts { fill: #AFA9EC; }
  svg rect.c-purple, svg circle.c-purple, svg ellipse.c-purple { fill: #3C3489; stroke: #AFA9EC; }

  svg .c-teal > rect, svg .c-teal > circle, svg .c-teal > ellipse { fill: #085041; stroke: #5DCAA5; }
  svg .c-teal > .th, svg .c-teal > .t { fill: #9FE1CB; }
  svg .c-teal > .ts { fill: #5DCAA5; }
  svg rect.c-teal, svg circle.c-teal, svg ellipse.c-teal { fill: #085041; stroke: #5DCAA5; }

  svg .c-coral > rect, svg .c-coral > circle, svg .c-coral > ellipse { fill: #712B13; stroke: #F0997B; }
  svg .c-coral > .th, svg .c-coral > .t { fill: #F5C4B3; }
  svg .c-coral > .ts { fill: #F0997B; }
  svg rect.c-coral, svg circle.c-coral, svg ellipse.c-coral { fill: #712B13; stroke: #F0997B; }

  svg .c-pink > rect, svg .c-pink > circle, svg .c-pink > ellipse { fill: #72243E; stroke: #ED93B1; }
  svg .c-pink > .th, svg .c-pink > .t { fill: #F4C0D1; }
  svg .c-pink > .ts { fill: #ED93B1; }
  svg rect.c-pink, svg circle.c-pink, svg ellipse.c-pink { fill: #72243E; stroke: #ED93B1; }

  svg .c-gray > rect, svg .c-gray > circle, svg .c-gray > ellipse { fill: #444441; stroke: #B4B2A9; }
  svg .c-gray > .th, svg .c-gray > .t { fill: #D3D1C7; }
  svg .c-gray > .ts { fill: #B4B2A9; }
  svg rect.c-gray, svg circle.c-gray, svg ellipse.c-gray { fill: #444441; stroke: #B4B2A9; }

  svg .c-blue > rect, svg .c-blue > circle, svg .c-blue > ellipse { fill: #0C447C; stroke: #85B7EB; }
  svg .c-blue > .th, svg .c-blue > .t { fill: #B5D4F4; }
  svg .c-blue > .ts { fill: #85B7EB; }
  svg rect.c-blue, svg circle.c-blue, svg ellipse.c-blue { fill: #0C447C; stroke: #85B7EB; }

  svg .c-green > rect, svg .c-green > circle, svg .c-green > ellipse { fill: #27500A; stroke: #97C459; }
  svg .c-green > .th, svg .c-green > .t { fill: #C0DD97; }
  svg .c-green > .ts { fill: #97C459; }
  svg rect.c-green, svg circle.c-green, svg ellipse.c-green { fill: #27500A; stroke: #97C459; }

  svg .c-amber > rect, svg .c-amber > circle, svg .c-amber > ellipse { fill: #633806; stroke: #EF9F27; }
  svg .c-amber > .th, svg .c-amber > .t { fill: #FAC775; }
  svg .c-amber > .ts { fill: #EF9F27; }
  svg rect.c-amber, svg circle.c-amber, svg ellipse.c-amber { fill: #633806; stroke: #EF9F27; }

  svg .c-red > rect, svg .c-red > circle, svg .c-red > ellipse { fill: #791F1F; stroke: #F09595; }
  svg .c-red > .th, svg .c-red > .t { fill: #F7C1C1; }
  svg .c-red > .ts { fill: #F09595; }
  svg rect.c-red, svg circle.c-red, svg ellipse.c-red { fill: #791F1F; stroke: #F09595; }
}

/* Pre-styled form elements */
button {
  background: transparent;
  border: 0.5px solid var(--color-border-secondary);
  border-radius: var(--border-radius-md);
  color: var(--color-text-primary);
  padding: 6px 14px;
  font-size: 14px;
  cursor: pointer;
  font-family: var(--font-sans);
}
button:hover { background: var(--color-background-secondary); }
button:active { transform: scale(0.98); }

input[type="range"] {
  -webkit-appearance: none;
  height: 4px;
  background: var(--color-border-secondary);
  border-radius: 2px;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-text-primary);
  cursor: pointer;
}

input[type="text"], input[type="number"], textarea, select {
  height: 36px;
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-tertiary);
  border-radius: var(--border-radius-md);
  color: var(--color-text-primary);
  padding: 0 10px;
  font-size: 14px;
  font-family: var(--font-sans);
  outline: none;
}
input[type="text"]:hover, input[type="number"]:hover, textarea:hover, select:hover {
  border-color: var(--color-border-secondary);
}
input[type="text"]:focus, input[type="number"]:focus, textarea:focus, select:focus {
  border-color: var(--color-border-primary);
  box-shadow: 0 0 0 2px var(--focus-ring);
}
`;
