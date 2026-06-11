# Icon Finder

A Figma plugin that reverse-identifies icons on your canvas. Select any icon node and Icon Finder tells you which open-source icon library it came from, what it's called, and links you directly to it.

## How it works

1. **Export** — when you select a node the plugin exports it as a 64 px PNG via the Figma Plugin API.
2. **Hash** — the PNG is scaled to 32 × 32 greyscale and run through a DCT-based perceptual hash (pHash), producing a 64-bit fingerprint that is stable across colours, sizes, and minor style variations.
3. **Lookup** — the fingerprint is compared against a pre-built database of hashes for every icon in seven popular libraries using Hamming distance. The closest matches (distance ≤ 15) are returned, ranked by confidence.
4. **Display** — results show the best guess (library, icon name, variant) plus up to five runner-ups, each with an external link to the icon's page in its library's docs.

The database is built at dev-time and bundled directly into `dist/ui.html` as an inline `<script>` block so Figma's sandboxed iframe can reach it without any network requests.

### Supported icon libraries

| Library | Package |
|---|---|
| Tabler Icons | `@tabler/icons` |
| Lucide | `lucide-static` |
| Feather Icons | `feather-icons` |
| Bootstrap Icons | `bootstrap-icons` |
| Material Design Icons | `@mdi/svg` |
| Phosphor Icons | `@phosphor-icons/core` |
| Remix Icons | `remixicon` |

---

## Development setup

### Prerequisites

- Node.js 18+
- npm

### 1. Install dependencies

```bash
npm install
```

This installs TypeScript, the Figma plugin typings, and all seven icon libraries.

### 2. Build the icon database

```bash
npm run build:db
```

Scans every SVG in the installed icon packages, computes a pHash for each one, and writes the result into `dist/ui.html`. This takes ~30–60 seconds the first time (tens of thousands of icons). The output file will be several MB — that is expected.

> Run this once after `npm install`. You only need to re-run it if you add or upgrade an icon library package.

### 3. Compile the plugin

```bash
npm run build
```

Compiles `src/code.ts` → `dist/code.js` (TypeScript) and rebuilds `dist/ui.html` from `src/ui.html` while reusing the already-embedded database. Use this for all subsequent UI or logic changes — it's much faster than `build:db`.

### Watching for changes

```bash
npm run watch
```

Recompiles `src/code.ts` automatically on save. Does not rebuild the UI — run `npm run build` manually after changing `src/ui.html`.

---

## Installing in Figma

Icon Finder is a local development plugin — it runs from your machine, not from the Figma Community.

1. Open Figma (desktop app).
2. Go to **Plugins → Development → Import plugin from manifest…**
3. Select `manifest.json` from the root of this repository.
4. The plugin now appears under **Plugins → Development → Icon Finder**.

> You must keep the `dist/` folder on disk. Figma loads `dist/code.js` and `dist/ui.html` directly each time you run the plugin.

---

## Using the plugin

1. Select one or more icon nodes on the canvas.
2. Open the plugin via **Plugins → Development → Icon Finder** (or your shortcut).
3. Results appear automatically. Each selected node gets:
   - **Selection** — a preview thumbnail and the layer name.
   - **Best Guess** — the closest library match, icon name, variant (e.g. `outline` / `filled`), and a confidence percentage.
   - **Second Bests** — up to five alternative matches in a grid.
4. Click the **↗** link next to any result to open that icon's page in your browser.
5. Change your selection — the panel updates instantly.

### Confidence scores

Confidence is derived from Hamming distance: `max(0, 100 − distance × 6)`. A score of **100 %** means an exact perceptual match; anything above **~70 %** is a reliable identification. Low scores (below 50 %) indicate the icon may not be in the database or was heavily customised after import.

---

## Project structure

```
├── src/
│   ├── code.ts        # Plugin main thread (runs in Figma's sandbox)
│   └── ui.html        # Plugin UI template (pHash logic + rendering)
├── scripts/
│   ├── build-db.js    # Generates the icon hash database
│   └── build-ui.js    # Rebuilds ui.html reusing an existing database
├── dist/
│   ├── code.js        # Compiled plugin code (git-ignored)
│   └── ui.html        # Final UI with embedded database (git-ignored)
├── manifest.json      # Figma plugin manifest
└── package.json
```

---

## Adding more icon libraries

1. Install the npm package: `npm install <package-name>`
2. Add an entry to the `LIBRARIES` array in `scripts/build-db.js`, specifying the package name, a glob pattern for its SVG files, and optional variant detection.
3. Re-run `npm run build:db` to regenerate the database.
