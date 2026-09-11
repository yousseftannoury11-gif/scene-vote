#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');

// Icon sizes to generate
const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 }
];

let playwright;

// Try to import Playwright
try {
  playwright = await import('playwright');
} catch (e) {
  console.log('Playwright not found, installing to /tmp/pw-tmp...');
  try {
    const env = { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' };
    execSync('npm i --no-save playwright@1.47.0 --prefix /tmp/pw-tmp', {
      env,
      stdio: 'inherit'
    });
    playwright = await import('/tmp/pw-tmp/node_modules/playwright');
  } catch (installErr) {
    console.error('Failed to install Playwright, will use fallback PNG encoder');
    playwright = null;
  }
}

// Read SVG content
const svgContent = fs.readFileSync(svgPath, 'utf-8');

async function generateIconsWithPlaywright() {
  try {
    const chromium = playwright.chromium;

    // Determine browser executable path
    let executablePath;
    if (fs.existsSync('/opt/pw-browsers/chromium')) {
      executablePath = '/opt/pw-browsers/chromium';
    }

    const browser = await chromium.launch({
      executablePath,
      headless: true
    });

    for (const { name, size } of sizes) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1
      });

      // Create data URL with SVG scaled to size
      const dataUrl = `data:text/html,<html><body style="margin:0;overflow:hidden;background:#0b0d10"><svg viewBox="0 0 512 512" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${svgContent.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)[1]}</svg></body></html>`;

      await page.goto(dataUrl);
      await page.screenshot({ path: path.join(iconsDir, name) });
      await page.close();

      console.log(`✓ Generated ${name} (${size}x${size})`);
    }

    await browser.close();
    return true;
  } catch (err) {
    console.error('Playwright icon generation failed:', err.message);
    return false;
  }
}

function generateIconsWithFallback() {
  // Simple PNG encoder using zlib
  // Creates a flat dark square with a cyan circle

  function createPNG(width, height) {
    const pixels = Buffer.alloc(width * height * 4);

    // Fill with dark background (#0b0d10)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 11;      // R
      pixels[i + 1] = 13;  // G
      pixels[i + 2] = 16;  // B
      pixels[i + 3] = 255; // A
    }

    // Draw cyan circle
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width * 0.25;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > radius * 0.9 && dist < radius * 1.1) {
          const idx = (y * width + x) * 4;
          pixels[idx] = 56;      // R (#38bdf8)
          pixels[idx + 1] = 189;  // G
          pixels[idx + 2] = 248;  // B
          pixels[idx + 3] = 255;  // A
        }
      }
    }

    // Encode PNG
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type (RGBA)
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    // IDAT chunk (simplified - no filtering)
    const scanlines = Buffer.alloc(height * (1 + width * 4));
    let offset = 0;
    for (let y = 0; y < height; y++) {
      scanlines[offset++] = 0; // filter type
      pixels.copy(scanlines, offset, y * width * 4, (y + 1) * width * 4);
      offset += width * 4;
    }

    const compressed = zlib.deflateSync(scanlines);

    const pngChunks = [signature];

    // Add IHDR
    const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdr]));
    pngChunks.push(Buffer.alloc(4));
    pngChunks[pngChunks.length - 1].writeUInt32BE(13);
    pngChunks.push(Buffer.from('IHDR'));
    pngChunks.push(ihdr);
    pngChunks.push(Buffer.alloc(4));
    pngChunks[pngChunks.length - 1].writeUInt32BE(ihdrCrc);

    // Add IDAT
    const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
    pngChunks.push(Buffer.alloc(4));
    pngChunks[pngChunks.length - 1].writeUInt32BE(compressed.length);
    pngChunks.push(Buffer.from('IDAT'));
    pngChunks.push(compressed);
    pngChunks.push(Buffer.alloc(4));
    pngChunks[pngChunks.length - 1].writeUInt32BE(idatCrc);

    // Add IEND
    const iendCrc = crc32(Buffer.from('IEND'));
    pngChunks.push(Buffer.alloc(4)); // length = 0
    pngChunks.push(Buffer.from('IEND'));
    pngChunks.push(Buffer.alloc(4));
    pngChunks[pngChunks.length - 1].writeUInt32BE(iendCrc);

    return Buffer.concat(pngChunks);
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crc ^ buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  for (const { name, size } of sizes) {
    const png = createPNG(size, size);
    fs.writeFileSync(path.join(iconsDir, name), png);
    console.log(`✓ Generated ${name} (${size}x${size}) [fallback]`);
  }
}

async function main() {
  console.log('Generating icons from SVG...\n');

  let success = false;
  if (playwright) {
    success = await generateIconsWithPlaywright();
  }

  if (!success && !playwright) {
    console.log('Using fallback PNG encoder...\n');
    generateIconsWithFallback();
  }

  console.log('\nIcon generation complete!');
}

main().catch(console.error);
