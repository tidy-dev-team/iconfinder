#!/usr/bin/env node
// Rebuilds dist/ui.html from src/ui.html, reusing the existing DB already
// embedded in dist/ui.html. Much faster than build:db for UI-only changes.

const fs = require('fs');
const path = require('path');

const distUiPath = path.resolve(__dirname, '../dist/ui.html');
const srcUiPath  = path.resolve(__dirname, '../src/ui.html');

if (!fs.existsSync(distUiPath)) {
  console.error('dist/ui.html not found — run npm run build:db first.');
  process.exit(1);
}

const existing = fs.readFileSync(distUiPath, 'utf8');
const dbMatch  = existing.match(/<script>window\.ICON_DB=[\s\S]*?;<\/script>/);
if (!dbMatch) {
  console.error('No ICON_DB found in dist/ui.html — run npm run build:db first.');
  process.exit(1);
}

const template = fs.readFileSync(srcUiPath, 'utf8');
if (!template.includes('<!-- ICON_DB_PLACEHOLDER -->')) {
  console.error('src/ui.html is missing <!-- ICON_DB_PLACEHOLDER -->');
  process.exit(1);
}

const output = template.replace('<!-- ICON_DB_PLACEHOLDER -->', dbMatch[0]);
fs.writeFileSync(distUiPath, output);

const mb = (Buffer.byteLength(output) / 1024 / 1024).toFixed(2);
console.log(`✓  dist/ui.html updated (${mb} MB)`);
