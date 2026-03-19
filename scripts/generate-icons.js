#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const apps = [
  { dir: 'concrete-calc', abbrev: 'CC', color: '#6B7280' },
  { dir: 'pomodoro-adhd', abbrev: 'PT', color: '#EF4444' },
  { dir: 'group-maker', abbrev: 'GM', color: '#8B5CF6' },
  { dir: 'tile-calc', abbrev: 'TC', color: '#3B82F6' },
  { dir: 'word-counter', abbrev: 'WC', color: '#10B981' },
];

function generateSVG(size, abbrev, color, maskable = false) {
  const padding = maskable ? size * 0.1 : 0;
  const bgSize = size - padding * 2;
  const radius = maskable ? bgSize * 0.2 : size * 0.15;
  const fontSize = maskable ? bgSize * 0.35 : size * 0.38;
  const cx = size / 2;
  const cy = size / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${padding}" y="${padding}" width="${bgSize}" height="${bgSize}" rx="${radius}" fill="${color}"/>
  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-weight="700" font-size="${fontSize}" fill="white">${abbrev}</text>
</svg>`;
}

for (const app of apps) {
  const publicDir = path.join(__dirname, '..', 'apps', app.dir, 'public');

  for (const size of [192, 512]) {
    // Regular icon
    const svg = generateSVG(size, app.abbrev, app.color, false);
    fs.writeFileSync(path.join(publicDir, `icon-${size}.svg`), svg);

    // Maskable icon (extra padding for safe zone)
    const maskSvg = generateSVG(size, app.abbrev, app.color, true);
    fs.writeFileSync(path.join(publicDir, `icon-${size}-maskable.svg`), maskSvg);
  }

  console.log(`Generated icons for ${app.dir}`);
}

console.log('Done!');
