#!/usr/bin/env node
// Generates src/icon-db.js from icon library SVGs using perceptual hashing.
// Run: npm run build:db

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { globSync } = require('glob');

// ─── Perceptual Hash ─────────────────────────────────────────────────────────
//
// Computes a 64-bit DCT-based perceptual hash from a 32×32 grayscale pixel
// array. Returns a 16-char hex string. Two visually similar images will have
// a small Hamming distance between their hashes.

function computePHash(pixels) {
  const S = 32; // source grid size
  const D = 8;  // DCT subgrid size (top-left 8×8 = low-frequency only, robust across renderers)

  // Precompute cosine table  [u][x]
  const cos = Array.from({ length: D }, (_, u) =>
    Float64Array.from({ length: S }, (_, x) =>
      Math.cos(((2 * x + 1) * u * Math.PI) / (2 * S))
    )
  );

  // Compute only the D×D top-left DCT coefficients
  const dct = new Float64Array(D * D);
  for (let u = 0; u < D; u++) {
    for (let v = 0; v < D; v++) {
      let sum = 0;
      for (let x = 0; x < S; x++) {
        const cu = cos[u][x];
        for (let y = 0; y < S; y++) sum += pixels[x * S + y] * cu * cos[v][y];
      }
      dct[u * D + v] = sum;
    }
  }

  // Skip DC component (index 0), use remaining 63 AC components
  const ac = dct.subarray(1);
  const median = Float64Array.from(ac).sort()[(ac.length - 1) >> 1];

  // Encode 63 bits into 8 bytes (last bit = 0 padding)
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 63; i++) {
    if (ac[i] > median) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  return Buffer.from(bytes).toString('hex');
}

async function svgToHash(filePath) {
  const { data } = await sharp(filePath, { density: 144 })
    .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return computePHash(Array.from(data));
}

// Extracts minified inner SVG content plus rendering metadata.
// Returns { inner, isStroke, sw, vb } or null on failure.
function extractIconSVG(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');

    const svgOpenMatch = raw.match(/<svg([^>]*)>/i);
    if (!svgOpenMatch) return null;
    const svgAttrs = svgOpenMatch[1];

    // fill="none" on the root signals a stroke-rendered icon
    const isStroke = /fill="none"/i.test(svgAttrs) ? 1 : 0;

    // Stroke-width: prefer root attribute, fall back to first occurrence in file
    const swMatch = svgAttrs.match(/stroke-width="([\d.]+)"/) ||
                    raw.match(/stroke-width="([\d.]+)"/);
    const sw = swMatch ? parseFloat(swMatch[1]) : 2;

    // ViewBox for correct aspect-ratio scaling
    const vbMatch = svgAttrs.match(/viewBox="([^"]+)"/);
    const vb = vbMatch ? vbMatch[1] : '0 0 24 24';

    // Extract everything between <svg…> and </svg>
    let inner = raw
      .replace(/^[\s\S]*?<svg[^>]*>/i, '')
      .replace(/<\/svg>[\s\S]*$/i, '');

    // Remove invisible background paths (has BOTH fill="none" AND stroke="none")
    inner = inner.replace(/<path\b(?=[^>]*fill="none")(?=[^>]*stroke="none")[^>]*\/>/gi, '');

    // Strip attributes that can conflict or leak outside the chip
    inner = inner.replace(/\s+class="[^"]*"/g, '');
    inner = inner.replace(/\s+id="[^"]*"/g, '');
    inner = inner.replace(/\s+xmlns(?::[^=]*)?\s*=\s*"[^"]*"/g, '');

    // Remove XML comments, then collapse whitespace
    inner = inner.replace(/<!--[\s\S]*?-->/g, '');
    inner = inner.replace(/\s*\n\s*/g, '').replace(/\s{2,}/g, ' ').trim();

    if (!inner) return null;
    return { inner, isStroke, sw, vb };
  } catch {
    return null;
  }
}

// ─── Concurrency pool ────────────────────────────────────────────────────────

async function runConcurrently(tasks, limit = 24) {
  const results = new Array(tasks.length);
  let idx = 0;
  const worker = async () => {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ─── Library definitions ─────────────────────────────────────────────────────

function pkgDir(name) {
  // 1. Try the standard package.json resolve
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch { /* package may restrict exports */ }

  // 2. Resolve the main entry and walk up to find the package root
  try {
    let dir = path.dirname(require.resolve(name));
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
      dir = path.dirname(dir);
    }
  } catch { /* package may not have a resolvable main */ }

  // 3. Check node_modules directly
  const candidates = [
    path.resolve('node_modules', name),
    path.resolve(__dirname, '..', 'node_modules', name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const LIBRARIES = [
  {
    name: 'Tabler Icons',
    pkg: '@tabler/icons',
    glob: '**/*.svg',
    keep: (f) => f.startsWith('icons/') && f.endsWith('.svg'),
    variant: (f) => (/filled/i.test(f) ? 'filled' : 'outline'),
  },
  {
    name: 'Lucide',
    pkg: 'lucide-static',
    glob: 'icons/*.svg',
    keep: () => true,
    variant: () => null,
  },
  {
    name: 'Feather Icons',
    pkg: 'feather-icons',
    glob: 'dist/icons/*.svg',
    keep: () => true,
    variant: () => null,
  },
  {
    name: 'Bootstrap Icons',
    pkg: 'bootstrap-icons',
    glob: 'icons/*.svg',
    keep: () => true,
    variant: () => null,
  },
  {
    name: 'Material Design Icons',
    pkg: '@mdi/svg',
    glob: 'svg/*.svg',
    keep: () => true,
    variant: () => null,
  },
  {
    name: 'Phosphor Icons',
    pkg: '@phosphor-icons/core',
    glob: 'assets/**/*.svg',
    // Only index the "regular" weight to keep DB size manageable
    keep: (f) => /\/regular\//.test(f),
    variant: () => 'regular',
  },
  {
    name: 'Remix Icons',
    pkg: 'remixicon',
    glob: 'icons/**/*.svg',
    keep: () => true,
    variant: (f) => (/fill\.svg$/.test(f) ? 'fill' : 'line'),
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Building icon database…\n');

  const LIBS = [];
  const VARS = [null]; // index 0 = no variant
  const entries = [];

  for (const lib of LIBRARIES) {
    const dir = pkgDir(lib.pkg);
    if (!dir) {
      console.log(`  ⚠  Skipping ${lib.name} — ${lib.pkg} not installed`);
      continue;
    }

    const relFiles = globSync(lib.glob, { cwd: dir }).filter(lib.keep);
    if (!relFiles.length) {
      console.log(`  ⚠  No SVGs found for ${lib.name} in ${lib.pkg}`);
      continue;
    }

    console.log(`  ◆  ${lib.name}: ${relFiles.length} icons`);
    const libIdx = LIBS.length;
    LIBS.push(lib.name);
    let ok = 0;

    const tasks = relFiles.map((rel) => async () => {
      try {
        const filePath = path.join(dir, rel);
        const hash = await svgToHash(filePath);
        const svg = extractIconSVG(filePath);
        const name = path.basename(rel, '.svg');
        const vName = lib.variant(rel);
        let vIdx = VARS.indexOf(vName);
        if (vIdx < 0) { vIdx = VARS.length; VARS.push(vName); }
        // entry: [hash, libIdx, name, varIdx, svgInner, isStroke, sw, viewBox]
        entries.push([
          hash, libIdx, name, vIdx,
          svg ? svg.inner : '',
          svg ? svg.isStroke : 0,
          svg ? svg.sw : 2,
          svg ? svg.vb : '0 0 24 24',
        ]);
        ok++;
      } catch {
        // Skip icons that fail to render
      }
    });

    await runConcurrently(tasks, 24);
    console.log(`     ✓  ${ok} hashed`);
  }

  if (!entries.length) {
    console.error('\nNo icons processed. Run npm install first.');
    process.exit(1);
  }

  // Inline the database into dist/ui.html so Figma's sandboxed iframe can
  // access it — external <script src> references don't resolve in Figma's UI.
  const dbScript = `<script>window.ICON_DB=${JSON.stringify({ l: LIBS, v: VARS, d: entries })};</script>`;

  const uiTemplate = fs.readFileSync(path.resolve(__dirname, '../src/ui.html'), 'utf8');
  if (!uiTemplate.includes('<!-- ICON_DB_PLACEHOLDER -->')) {
    console.error('src/ui.html is missing <!-- ICON_DB_PLACEHOLDER -->');
    process.exit(1);
  }
  const uiOut = uiTemplate.replace('<!-- ICON_DB_PLACEHOLDER -->', dbScript);

  const distDir = path.resolve(__dirname, '../dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.resolve(distDir, 'ui.html'), uiOut);

  const mb = (Buffer.byteLength(uiOut) / 1024 / 1024).toFixed(2);
  console.log(`\n✓  ${entries.length} icons → dist/ui.html (${mb} MB)`);
  console.log('   Now run: npm run build\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
