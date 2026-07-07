#!/usr/bin/env node
// Copies only the web-app files needed by Capacitor into www/.
// Run via: npm run build:cap

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'www');

// Exactly these entries are copied — nothing else reaches the native app.
const INCLUDE = [
  'index.html',
  'favicon.svg',
  'favicon-32.png',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'css',
  'js',
  'images',
  'datenschutz',
  'impressum',
  'nutzungsbedingungen',
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}

// Clean output directory
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

// Copy each included entry
for (const item of INCLUDE) {
  const src  = path.join(ROOT, item);
  const dest = path.join(OUT, item);
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠ skipped (not found): ${item}`);
    continue;
  }
  fs.statSync(src).isDirectory() ? copyDir(src, dest) : fs.copyFileSync(src, dest);
}

console.log(`✓  www/ built — ${countFiles(OUT)} files`);
