// Renders the app icons (tools/icon.html) to PNG with headless Microsoft Edge.
// Usage: node tools/make-icons.mjs   (no dev server needed)
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withEdge } from './edge.mjs';

const icons = fileURLToPath(new URL('../icons/', import.meta.url));
const res = fileURLToPath(new URL('../resources/', import.meta.url));
const page = pathToFileURL(fileURLToPath(new URL('./icon.html', import.meta.url))).href;

const outputs = [
  // web app (PWA)
  [icons, 'icon-180.png', 180, ''],
  [icons, 'icon-192.png', 192, ''],
  [icons, 'icon-512.png', 512, ''],
  [icons, 'icon-maskable-512.png', 512, 'scale=0.8'],
  // Android app (Capacitor's icon generator reads these). The adaptive-icon
  // foreground must keep its content inside the middle ~60%.
  [res, 'icon-only.png', 1024, ''],
  [res, 'icon-foreground.png', 1024, 'scale=0.62&bg=0'],
  [res, 'icon-background.png', 1024, 'art=0'],
];

mkdirSync(icons, { recursive: true });
mkdirSync(res, { recursive: true });
await withEdge(async (p) => {
  for (const [dir, name, size, query] of outputs) {
    await p.open(`${page}?${query}`, { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    writeFileSync(dir + name, await p.shot({ transparent: query.includes('bg=0') }));
    console.log(name);
  }
});
