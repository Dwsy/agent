#!/usr/bin/env node
/**
 * Generate CodeMap Tauri Icons
 *
 * This script converts the SVG icon to multiple PNG sizes required by Tauri.
 * Uses sharp (already in Tauri dependencies) for image processing.
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
    const sharp = require('sharp');

    // Paths
    const svgSource = path.join(__dirname, 'codemap-tauri-icon.svg');
    const iconsDir = path.join(__dirname, 'client', 'src-tauri', 'icons');

    // Sizes required by Tauri
    const sizes = [32, 64, 128, 256, 512, 1024];

    console.log('🎨 Generating CodeMap Tauri icons...');
    console.log(`   Source: ${svgSource}`);
    console.log(`   Output: ${iconsDir}`);
    console.log();

    // Check if SVG exists
    if (!fs.existsSync(svgSource)) {
        console.error('❌ Error: SVG source not found!');
        console.error('   Please run codemap-icon.py first to generate the SVG.');
        process.exit(1);
    }

    // Create icons directory if it doesn't exist
    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
    }

    // Generate icons for each size
    let successCount = 0;

    for (const size of sizes) {
        const outputFile = path.join(iconsDir, `${size}x${size}.png`);

        process.stdout.write(`   Generating ${size}x${size}... `);

        try {
            await sharp(svgSource)
                .resize(size, size)
                .png()
                .toFile(outputFile);

            console.log(`✅ ${path.basename(outputFile)}`);
            successCount++;
        } catch (error) {
            console.log(`❌ Failed: ${error.message}`);
        }
    }

    // Copy the original SVG
    const svgDest = path.join(iconsDir, 'icon.svg');
    fs.copyFileSync(svgSource, svgDest);
    console.log(`✅ Copied SVG to: icon.svg`);

    console.log();
    console.log(`📊 Summary: ${successCount}/${sizes.length} icons generated`);

    // Create default icon.png (512x512)
    const defaultIcon = path.join(iconsDir, 'icon.png');
    const size512 = path.join(iconsDir, '512x512.png');

    if (!fs.existsSync(defaultIcon) && fs.existsSync(size512)) {
        fs.copyFileSync(size512, defaultIcon);
        console.log('✅ Created default icon.png (from 512x512)');
    }

    console.log();
    console.log('📋 Next Steps:');
    console.log();
    console.log('1. Icons have been generated in: client/src-tauri/icons/');
    console.log();
    console.log('2. Update tauri.conf.json to reference the icons:');
    console.log();
    console.log('   "bundle": {');
    console.log('     "icon": [');
    console.log('       "icons/32x32.png",');
    console.log('       "icons/64x64.png",');
    console.log('       "icons/128x128.png",');
    console.log('       "icons/256x256.png",');
    console.log('       "icons/512x512.png",');
    console.log('       "icons/1024x1024.png"');
    console.log('     ]');
    console.log('   }');
    console.log();
    console.log('3. Test the icon:');
    console.log('   cd client && pnpm run tauri dev');
    console.log();
}

// Run
generateIcons().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});