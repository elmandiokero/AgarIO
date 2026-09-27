#!/usr/bin/env node
// Renders public/favicon.svg into the PNG app icons in public/icons/.
// Dev-only helper: needs Playwright + Chromium available (not a project dependency).
//
//   node scripts/dev/render-icons.mjs
//
// Outputs:
//   icon-192.png, icon-512.png   transparent background, full-bleed cell
//   apple-touch-icon.png (180)   opaque #0038a8 background (iOS ignores transparency)
//   icon-maskable-512.png        opaque background, motif inside the central 80% safe zone
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright').catch(() =>
  import('/opt/node22/lib/node_modules/playwright/index.mjs')
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const svg = await readFile(path.join(root, 'public', 'favicon.svg'), 'utf8');
const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const outDir = path.join(root, 'public', 'icons');
await mkdir(outDir, { recursive: true });

const BLUE = '#0038a8';
// scale = diameter of the cell relative to the canvas; ring = white halo so the
// blue stripe does not melt into the blue background on the opaque variants.
const targets = [
  { file: 'icon-192.png', size: 192, scale: 1, background: null },
  { file: 'icon-512.png', size: 512, scale: 1, background: null },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.8, background: BLUE },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.7, background: BLUE },
];

function html({ size, scale, background }) {
  const d = Math.round(size * scale);
  const ring = background ? Math.round(d * 0.94) : 0; // favicon cell radius is 30/32 of its box
  return `<!doctype html><html><head><style>
html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:${background || 'transparent'}}
.wrap{position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center}
.ring{position:absolute;width:${ring + Math.max(4, Math.round(size / 40))}px;height:${ring + Math.max(4, Math.round(size / 40))}px;border-radius:50%;background:#fff}
img{position:relative;width:${d}px;height:${d}px;display:block}
</style></head><body><div class="wrap">${background ? '<div class="ring"></div>' : ''}<img src="${dataUrl}"></div></body></html>`;
}

const browser = await chromium.launch();
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    await page.setContent(html(t));
    await page.waitForFunction(() => {
      const img = document.querySelector('img');
      return img && img.complete && img.naturalWidth > 0;
    });
    const out = path.join(outDir, t.file);
    await page.screenshot({
      path: out,
      omitBackground: !t.background,
      clip: { x: 0, y: 0, width: t.size, height: t.size },
    });
    await page.close();
    console.log(`wrote ${path.relative(root, out)} (${t.size}x${t.size})`);
  }
} finally {
  await browser.close();
}
