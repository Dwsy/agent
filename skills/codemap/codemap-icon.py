#!/usr/bin/env python3
"""
Generate CodeMap Tauri Icon

Design Concept:
- Visual metaphor: Flow nodes with connections (code visualization)
- Color scheme: Tauri dark theme with modern tech accent
- Geometric elements: Circular nodes, connection paths, subtle grid
"""

def generate_codemap_icon():
    # Configuration
    width, height = 512, 512

    # Color Palette (Tauri-inspired)
    bg_color = "#1C1C1E"           # Dark background
    primary_color = "#FFC107"      # Amber/Orange (Tauri accent)
    secondary_color = "#0A84FF"    # Blue (tech feel)
    tertiary_color = "#30D158"     # Green (success/flow)
    node_color = "#2C2C2E"         # Dark node background
    line_color = "#48484A"         # Subtle line color

    # SVG Header with ViewBox
    svg_header = f'''<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .node {{ fill: {node_color}; stroke-width: 3; }}
      .node-primary {{ stroke: {primary_color}; }}
      .node-secondary {{ stroke: {secondary_color}; }}
      .node-tertiary {{ stroke: {tertiary_color}; }}
      .connection {{ stroke: {line_color}; stroke-width: 2; fill: none; stroke-linecap: round; }}
      .connection-active {{ stroke: {primary_color}; stroke-width: 2; fill: none; stroke-linecap: round; }}
      .grid {{ stroke: {line_color}; stroke-width: 1; opacity: 0.1; }}
      .icon-text {{ font-family: system-ui, -apple-system, sans-serif; font-weight: 700; font-size: 32; fill: white; text-anchor: middle; dominant-baseline: middle; }}
    </style>
  </defs>'''

    # Background
    background = f'  <rect width="{width}" height="{height}" fill="{bg_color}" rx="64" />'

    # Subtle grid pattern
    grid_lines = ''
    for i in range(0, height + 1, 64):
        if i % 128 == 0:
            grid_lines += f'\n    <line x1="0" y1="{i}" x2="{width}" y2="{i}" class="grid" />'
            grid_lines += f'\n    <line x1="{i}" y1="0" x2="{i}" y2="{height}" class="grid" />'

    # Flow nodes (circular)
    # Main node (center)
    main_node = f'\n  <circle cx="{width/2}" cy="{height/2}" r="48" class="node node-primary" />'
    main_icon = f'\n  <text x="{width/2}" y="{height/2}" class="icon-text">C</text>'

    # Secondary nodes (top-left, top-right, bottom)
    node_tl = f'\n  <circle cx="{width/2 - 96}" cy="{height/2 - 80}" r="36" class="node node-secondary" />'
    node_tr = f'\n  <circle cx="{width/2 + 96}" cy="{height/2 - 80}" r="36" class="node node-secondary" />'
    node_bottom = f'\n  <circle cx="{width/2}" cy="{height/2 + 100}" r="36" class="node node-tertiary" />'

    # Connection lines (flow)
    # From top-left to center
    conn_tl = f'\n  <path d="M {width/2 - 96} {height/2 - 80} Q {width/2 - 64} {height/2 - 48} {width/2 - 48} {height/2 - 24}" class="connection-active" />'

    # From top-right to center
    conn_tr = f'\n  <path d="M {width/2 + 96} {height/2 - 80} Q {width/2 + 64} {height/2 - 48} {width/2 + 48} {height/2 - 24}" class="connection" />'

    # From center to bottom
    conn_bottom = f'\n  <path d="M {width/2} {height/2 + 48} L {width/2} {height/2 + 64}" class="connection-active" />'

    # Decorative dots (data points)
    dots = ''
    for i, (x, y) in enumerate([
        (width/2 - 48, height/2 - 48),
        (width/2 + 48, height/2 - 48),
        (width/2 - 24, height/2 + 72),
        (width/2 + 24, height/2 + 72),
    ]):
        color = primary_color if i % 2 == 0 else secondary_color
        dots += f'\n  <circle cx="{x}" cy="{y}" r="4" fill="{color}" opacity="0.8" />'

    # Assembly
    svg_content = f'''{svg_header}
{background}
  <g transform="translate(0, 0)">{grid_lines}
  </g>
{node_tl}{node_tr}{main_node}{node_bottom}
{conn_tl}{conn_tr}{conn_bottom}
{main_icon}{dots}
</svg>'''

    # Output
    output_file = "codemap-tauri-icon.svg"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(svg_content)

    print(f"✅ CodeMap Tauri icon generated: {output_file}")
    print(f"   Size: {width}x{height}")
    print(f"   Palette: Dark theme with Amber/Blue/Green accents")

if __name__ == "__main__":
    generate_codemap_icon()