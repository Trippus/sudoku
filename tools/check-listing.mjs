// Checks the store texts in store/listing.md against Google Play's length limits.
import { readFileSync } from 'node:fs';

const LIMITS = { titel: 30, title: 30, 'kort beskrivelse': 80, 'short description': 80, 'fuld beskrivelse': 4000, 'full description': 4000 };
const md = readFileSync(new URL('../store/listing.md', import.meta.url), 'utf8');
let ok = true;
for (const part of md.split(/^### /m).slice(1)) {
  const [head, ...body] = part.split('\n');
  const limit = LIMITS[head.trim().toLowerCase()];
  if (!limit) continue;
  const text = body.join('\n').split(/^## /m)[0].trim();
  const len = [...text].length;
  const flag = len > limit ? 'TOO LONG' : 'ok';
  if (len > limit) ok = false;
  console.log(`${flag.padEnd(8)} ${String(len).padStart(4)}/${limit}  ${head.trim()}`);
}
process.exit(ok ? 0 : 1);
