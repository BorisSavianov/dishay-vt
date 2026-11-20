// Renders the app icons from assets/brand/mark.svg. Run: node scripts/make-icons.mjs
// Needs sharp; the web app has it: NODE_PATH=../web/node_modules/.pnpm/sharp@0.35.5/node_modules
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const mark = readFileSync(new URL('../assets/brand/mark.svg', import.meta.url), 'utf8');
const gusts = mark.match(/<g [\s\S]*?<\/g>/)[0];
const defs = mark.match(/<defs>[\s\S]*?<\/defs>/)[0];
const svg = (body, view = '0 0 32 32') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${defs}${body}</svg>`;
const out = (s, size, file) => sharp(Buffer.from(s), { density: 2400 }).resize(size, size).png().toFile(fileURLToPath(new URL(`../assets/${file}`, import.meta.url)));

// iOS masks the corners itself, so the icon is a full square.
await out(svg(`<rect width="32" height="32" fill="url(#tile)"/>${gusts}`), 1024, 'icon.png');
await out(mark, 512, 'splash-icon.png');
await out(mark, 48, 'favicon.png');
// Android adaptive icon: gusts inside the 66% safe zone, on the indigo background.
const inner = `<g transform="translate(16 16) scale(0.62) translate(-16 -16)">${gusts}</g>`;
await out(svg(inner), 1024, 'android-icon-foreground.png');
await out(svg(`<rect width="32" height="32" fill="url(#tile)"/>`), 1024, 'android-icon-background.png');
await out(svg(inner.replace(/stroke="#[0-9a-f]+"/g, 'stroke="#000000"')), 1024, 'android-icon-monochrome.png');
console.log('icons written');
