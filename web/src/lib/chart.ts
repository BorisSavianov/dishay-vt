// Pure helpers for the SVG charts.

// Round, evenly spaced tick values that cover [min, max]. Steps are 1, 2, 2.5 or 5 times a power of ten.
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    return niceTicks(min - pad, max + pad, target);
  }
  const rough = (max - min) / Math.max(target - 1, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * pow;
  const start = Math.floor(min / step + 1e-9) * step;
  const end = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) {
    ticks.push(Math.round(v / step) * step);
  }
  return ticks;
}

// Index of the point whose x position is closest to px. Positions must be sorted ascending.
export function nearestIndex(xs: number[], px: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const distance = Math.abs(xs[i]! - px);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

// How many labels to skip between shown labels so they do not overlap.
export function labelStride(count: number, innerWidth: number, labelWidth: number): number {
  if (count <= 1 || innerWidth <= 0) return 1;
  const slot = innerWidth / (count - 1);
  return Math.max(1, Math.ceil(labelWidth / slot));
}

// SVG path for a polyline through the points.
export function linePath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

// Arc segments of a donut: dash length and offset on a circle of the given circumference.
export function donutSegments(
  values: number[],
  circumference: number,
  gap = 0,
): { length: number; offset: number }[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => ({ length: 0, offset: 0 }));
  let used = 0;
  return values.map((v) => {
    const raw = (v / total) * circumference;
    const length = Math.max(raw - (values.filter((x) => x > 0).length > 1 ? gap : 0), 0);
    const seg = { length, offset: used === 0 ? 0 : -used };
    used += raw;
    return seg;
  });
}
