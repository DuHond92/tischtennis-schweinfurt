#!/usr/bin/env node
// Copies only the web-app files needed by Capacitor into www/.
// JS files in js/ are minified via esbuild (transform mode, no bundling —
// global names are preserved so cross-file references keep working).
// Run via: npm run build:cap

const fs      = require('fs');
const path    = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'www');

// Exactly these entries are copied — nothing else reaches the native app.
const INCLUDE = [
  'index.html',
  'favicon.svg',
  'favicon-32.png',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'THIRD_PARTY_LICENSES',
  'css',
  'js',
  'images',
  'vendor',
  'datenschutz',
  'impressum',
  'nutzungsbedingungen',
  'community-richtlinien',
  'account-loeschen',
  'auth',
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

async function minifyJsDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await minifyJsDir(s, d);
    } else if (entry.name.endsWith('.js')) {
      const code = fs.readFileSync(s, 'utf8');
      const result = await esbuild.transform(code, {
        minify: true,
        target: 'es2020',
      });
      fs.writeFileSync(d, result.code);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
  }
  return n;
}

(async () => {
  // Clean output directory
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT);

  // Copy each included entry (minify JS, copy everything else)
  for (const item of INCLUDE) {
    const src  = path.join(ROOT, item);
    const dest = path.join(OUT, item);
    if (!fs.existsSync(src)) {
      console.warn(`  ⚠ skipped (not found): ${item}`);
      continue;
    }
    if (item === 'js') {
      await minifyJsDir(src, dest);
    } else if (fs.statSync(src).isDirectory()) {
      copyDir(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  console.log(`✓  www/ built — ${countFiles(OUT)} files`);
})();
