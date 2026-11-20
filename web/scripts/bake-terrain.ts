// Bakes the Veliko Tarnovo heightmap for the landing story: pnpm story:terrain
// Source: AWS Terrain Tiles (terrarium, Mapzen; SRTM, EU-DEM and others). Run once; the output is committed,
// so the page never fetches terrain at runtime.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { decodeTerrarium, type TerrainMeta } from '../src/lib/story/geo';

const CENTER = { lat: 43.078, lon: 25.635 }; // between the old town and Tsarevets
const HALF_KM = 7.5; // a 15 km square
const Z = 13;
const OUT = 1024;
const TILE = 256;
const URL_T = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const dLat = HALF_KM / 111.32;
const dLon = HALF_KM / (111.32 * Math.cos((CENTER.lat * Math.PI) / 180));
const bounds = { west: CENTER.lon - dLon, east: CENTER.lon + dLon, south: CENTER.lat - dLat, north: CENTER.lat + dLat };

// Global Web Mercator pixel at zoom Z.
function px(lat: number, lon: number): [number, number] {
  const n = 2 ** Z * TILE;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [x, y];
}

async function main() {
  const [x0, y0] = px(bounds.north, bounds.west);
  const [x1, y1] = px(bounds.south, bounds.east);
  const tx0 = Math.floor(x0 / TILE) - 1;
  const ty0 = Math.floor(y0 / TILE) - 1;
  const tx1 = Math.floor(x1 / TILE) + 1;
  const ty1 = Math.floor(y1 / TILE) + 1;
  const cols = tx1 - tx0 + 1;
  const rows = ty1 - ty0 + 1;
  const W = cols * TILE;
  const heights = new Float32Array(W * rows * TILE);

  console.log(`fetching ${cols}×${rows} tiles at z${Z}`);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const res = await fetch(URL_T(Z, tx, ty));
      if (!res.ok) throw new Error(`tile ${tx}/${ty}: HTTP ${res.status}`);
      const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
      for (let j = 0; j < TILE; j++) {
        for (let i = 0; i < TILE; i++) {
          const k = (j * TILE + i) * 4;
          const gx = (tx - tx0) * TILE + i;
          const gy = (ty - ty0) * TILE + j;
          heights[gy * W + gx] = decodeTerrarium(png.data[k]!, png.data[k + 1]!, png.data[k + 2]!);
        }
      }
    }
  }

  // Bilinear sample on a regular lat/lon grid (the scene maps lat/lon linearly).
  const sample = (lat: number, lon: number) => {
    const [gx, gy] = px(lat, lon);
    const fx = gx - tx0 * TILE;
    const fy = gy - ty0 * TILE;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ax = fx - ix;
    const ay = fy - iy;
    const h = (x: number, y: number) => heights[y * W + x]!;
    return (h(ix, iy) * (1 - ax) + h(ix + 1, iy) * ax) * (1 - ay) + (h(ix, iy + 1) * (1 - ax) + h(ix + 1, iy + 1) * ax) * ay;
  };

  const out = new Float32Array(OUT * OUT);
  let minM = Infinity;
  let maxM = -Infinity;
  for (let j = 0; j < OUT; j++) {
    const lat = bounds.north - ((j + 0.5) / OUT) * (bounds.north - bounds.south);
    for (let i = 0; i < OUT; i++) {
      const lon = bounds.west + ((i + 0.5) / OUT) * (bounds.east - bounds.west);
      const m = sample(lat, lon);
      out[j * OUT + i] = m;
      if (m < minM) minM = m;
      if (m > maxM) maxM = m;
    }
  }

  const png = new PNG({ width: OUT, height: OUT, colorType: 0, inputColorType: 0, bitDepth: 8, inputHasAlpha: false });
  png.data = Buffer.alloc(OUT * OUT);
  for (let k = 0; k < out.length; k++) png.data[k] = Math.round(((out[k]! - minM) / (maxM - minM)) * 255);

  const dir = join(process.cwd(), 'public', 'story');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'terrain.png'), PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8, inputHasAlpha: false }));
  const meta: TerrainMeta = { ...bounds, minM: Math.round(minM), maxM: Math.round(maxM), size: OUT };
  writeFileSync(join(dir, 'terrain.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log('wrote public/story/terrain.png and terrain.json', meta);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
