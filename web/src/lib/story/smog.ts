// Particle data for the story's smog: density from the real 18.12.2025 hours, and the shapes the
// particles gather into (the MAE bars in chapter 5, the four source streams in chapter 6).

export const SMOG_PM10_MAX = 180; // the episode's hourly peak is 180.4 µg/m³: full smog

// 0..1 smog density at a fractional hour, linear between whole hours, clamped past the ends.
export function smogDensity(hourly: { pm10: number }[], hour: number): number {
  if (hourly.length === 0) return 0;
  const h = Math.min(hourly.length - 1, Math.max(0, hour));
  const i = Math.floor(h);
  const j = Math.min(hourly.length - 1, i + 1);
  const v = hourly[i]!.pm10 + (hourly[j]!.pm10 - hourly[i]!.pm10) * (h - i);
  return Math.min(1, Math.max(0, v / SMOG_PM10_MAX));
}

// Deterministic PRNG, so the shapes are the same on every load.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Split count by weights with largest-remainder rounding (each group within ±1 of its exact share).
export function splitCounts(count: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (w / total) * count);
  const out = exact.map(Math.floor);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < count - out.reduce((a, b) => a + b, 0); k++) out[order[k % order.length]![1]]! += 1;
  return out;
}

export type Targets = { positions: Float32Array; group: Uint8Array };

export const BAR_LAYOUT = { base: 0.6, maxHeight: 4.2, width: 1.1, depth: 0.7, gap: 2.4, z: 0.5 };

// Two vertical bars over the valley: group 0 = our model (left), group 1 = CAMS (right). Height ∝ MAE.
// Seeded Fisher–Yates over the targets, so any leading slice (a reduced draw range) holds every group in proportion.
function shuffleTargets(t: Targets, rand: () => number): Targets {
  const { positions, group } = t;
  for (let i = group.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const g = group[i]!;
    group[i] = group[j]!;
    group[j] = g;
    for (let c = 0; c < 3; c++) {
      const p = positions[i * 3 + c]!;
      positions[i * 3 + c] = positions[j * 3 + c]!;
      positions[j * 3 + c] = p;
    }
  }
  return t;
}

export function barTargets(count: number, mae: { model: number; cams: number }, seed = 11): Targets {
  const rand = mulberry32(seed);
  const top = Math.max(mae.model, mae.cams);
  const heights = [(mae.model / top) * BAR_LAYOUT.maxHeight, (mae.cams / top) * BAR_LAYOUT.maxHeight];
  const counts = splitCounts(count, heights);
  const positions = new Float32Array(count * 3);
  const group = new Uint8Array(count);
  let k = 0;
  for (let g = 0; g < 2; g++) {
    const cx = (g === 0 ? -1 : 1) * (BAR_LAYOUT.gap / 2);
    for (let n = 0; n < counts[g]!; n++, k++) {
      positions[k * 3] = cx + (rand() - 0.5) * BAR_LAYOUT.width;
      positions[k * 3 + 1] = BAR_LAYOUT.base + rand() * heights[g]!;
      positions[k * 3 + 2] = BAR_LAYOUT.z + (rand() - 0.5) * BAR_LAYOUT.depth;
      group[k] = g;
    }
  }
  return shuffleTargets({ positions, group }, rand);
}

export type SourceShares = { heating: number; regional: number; other: number; traffic: number };
export const STREAM_ORDER = ['heating', 'regional', 'other', 'traffic'] as const;

// Four rising columns in a row, one per source (0 heating, 1 regional, 2 other, 3 traffic), particles ∝ share.
export function streamTargets(count: number, shares: SourceShares, seed = 23): Targets {
  const rand = mulberry32(seed);
  const counts = splitCounts(
    count,
    STREAM_ORDER.map((k) => shares[k]),
  );
  const positions = new Float32Array(count * 3);
  const group = new Uint8Array(count);
  let k = 0;
  STREAM_ORDER.forEach((key, g) => {
    const cx = -3.15 + g * 2.1;
    const radius = 0.3 + Math.sqrt(shares[key]) * 0.85;
    for (let n = 0; n < counts[g]!; n++, k++) {
      const y = rand();
      const a = rand() * Math.PI * 2 + y * 9; // a gentle twist up the column
      const r = radius * Math.sqrt(rand()) * (0.75 + 0.25 * Math.sin(y * 6 + g));
      positions[k * 3] = cx + Math.cos(a) * r;
      positions[k * 3 + 1] = 1.4 + y * 3.6;
      positions[k * 3 + 2] = 0.5 + Math.sin(a) * r * 0.6;
      group[k] = g;
    }
  });
  return shuffleTargets({ positions, group }, rand);
}
