#!/usr/bin/env python3
"""
Generate CodeMap Tauri Icons in Multiple Sizes

This script generates the CodeMap icon in multiple sizes required by Tauri:
- 32x32 (Windows taskbar)
- 64x64 (macOS Dock)
- 128x128 (macOS Finder)
- 256x256 (macOS Retina)
- 512x512 (Source SVG)
- 1024x1024 (App Store)
"""

import subprocess
import os
from pathlib import Path

def svg_to_png(svg_path, size, output_path):
    """
    Convert SVG to PNG using ImageMagick's convert command.
    This is a fallback method that requires ImageMagick to be installed.
    """
    try:
        # Try using convert (ImageMagick)
        subprocess.run([
            'convert',
            '-background', 'none',
            '-resize', f'{size}x{size}',
            svg_path,
            output_path
        ], check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Try using rsvg-convert (librsvg)
        try:
            subprocess.run([
                'rsvg-convert',
                '-w', str(size),
                '-h', str(size),
                '-o', output_path,
                svg_path
            ], check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False

def generate_icons():
    """
    Generate CodeMap icons in multiple sizes.
    """
    # Paths
    svg_source = Path("codemap-tauri-icon.svg")
    icons_dir = Path("client/src-tauri/icons")

    # Sizes required by Tauri
    sizes = [32, 64, 128, 256, 512, 1024]

    print("🎨 Generating CodeMap Tauri icons...")
    print(f"   Source: {svg_source}")
    print(f"   Output: {icons_dir}")
    print()

    # Check if SVG exists
    if not svg_source.exists():
        print(f"❌ Error: {svg_source} not found!")
        print("   Please run codemap-icon.py first to generate the SVG.")
        return False

    # Create icons directory if it doesn't exist
    icons_dir.mkdir(parents=True, exist_ok=True)

    # Check for conversion tools
    has_imagemagick = os.system('which convert > /dev/null 2>&1') == 0
    has_rsvg = os.system('which rsvg-convert > /dev/null 2>&1') == 0

    if not has_imagemagick and not has_rsvg:
        print("⚠️  Warning: Neither ImageMagick nor librsvg found!")
        print("   Install one of:")
        print("   - macOS: brew install imagemagick")
        print("   - macOS: brew install librsvg")
        print()
        print("   Falling back to copying SVG only...")
        print()

        # Copy SVG as fallback
        import shutil
        shutil.copy2(svg_source, icons_dir / "icon.svg")
        print(f"✅ Copied SVG to: {icons_dir / 'icon.svg'}")
        return True

    # Generate icons for each size
    success_count = 0
    for size in sizes:
        output_file = icons_dir / f"{size}x{size}.png"

        print(f"   Generating {size}x{size}...", end=" ")

        if svg_to_png(str(svg_source), size, str(output_file)):
            print(f"✅ {output_file}")
            success_count += 1
        else:
            print(f"❌ Failed")

    # Copy the original SVG
    import shutil
    shutil.copy2(svg_source, icons_dir / "icon.svg")
    print(f"✅ Copied SVG to: {icons_dir / 'icon.svg'}")

    print()
    print(f"📊 Summary: {success_count}/{len(sizes)} icons generated")

    # Check if we need to create icon.png (default icon)
    default_icon = icons_dir / "icon.png"
    if not default_icon.exists() and success_count > 0:
        # Use 512x512 as default
        size_512 = icons_dir / "512x512.png"
        if size_512.exists():
            shutil.copy2(size_512, default_icon)
            print(f"✅ Created default icon.png (from 512x512)")

    return success_count > 0

def print_usage_instructions():
    """
    Print instructions for using the generated icons.
    """
    print()
    print("📋 Usage Instructions:")
    print()
    print("1. Icons have been generated in: client/src-tauri/icons/")
    print()
    print("2. Update tauri.conf.json to reference the icons:")
    print()
    print('   "bundle": {')
    print('     "icon": [')
    print('       "icons/32x32.png",')
    print('       "icons/64x64.png",')
    print('       "icons/128x128.png",')
    print('       "icons/256x256.png",')
    print('       "icons/512x512.png",')
    print('       "icons/1024x1024.png"')
    print('     ]')
    print('   }')
    print()
    print("3. Test the icon:")
    print("   cd client && pnpm run tauri dev")
    print()
    print("4. Build the app:")
    print("   cd client && pnpm run tauri build")
    print()

if __name__ == "__main__":
    success = generate_icons()

    if success:
        print_usage_instructions()
        print("✅ Icon generation completed successfully!")
    else:
        print()
        print("❌ Icon generation failed. Please install conversion tools:")
        print("   brew install imagemagick")
        print("   # or")
        print("   brew install librsvg")