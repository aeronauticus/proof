/**
 * Generate PNG icons for PWA manifest.
 * Run: npx tsx scripts/generate-icons.ts
 *
 * Creates simple "P" logo icons in blue circle.
 * For a production app, replace with actual designed icons.
 */

import { writeFileSync } from "fs";
import { join } from "path";

function createSVG(size: number): string {
  const fontSize = Math.round(size * 0.55);
  const cy = Math.round(size * 0.52);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="#2563eb"/>
  <text x="50%" y="${cy}" dominant-baseline="central" text-anchor="middle"
    font-family="system-ui, -apple-system, sans-serif" font-weight="800"
    font-size="${fontSize}" fill="white">P</text>
</svg>`;
}

// Write SVG versions (browsers accept SVG for PWA icons via purpose)
const iconsDir = join(__dirname, "..", "public", "icons");

for (const size of [192, 512]) {
  const svg = createSVG(size);
  writeFileSync(join(iconsDir, `icon-${size}.svg`), svg);
  console.log(`Created icon-${size}.svg`);
}

console.log("\nNote: For best PWA support, convert these SVGs to PNGs:");
console.log("  - Use any SVG-to-PNG converter");
console.log("  - Or replace with designed icons");
console.log("\nFor now, updating manifest to use SVG...");
