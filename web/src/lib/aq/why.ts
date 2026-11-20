import type { AqMae } from './types';

// How much smaller our error is than another forecast's, in whole percent. Null when it cannot be said.
export function pctBetter(model: number, other: number): number | null {
  if (!(other > 0) || !(model >= 0)) return null;
  return Math.round((1 - model / other) * 100);
}

// The three forecasts, best first, for a bar chart scaled to the largest error.
export function maeBars(mae: AqMae): { key: keyof AqMae; value: number; share: number }[] {
  const max = Math.max(mae.model, mae.cams, mae.persistence, 1e-9);
  return (['model', 'persistence', 'cams'] as const)
    .map((key) => ({ key, value: mae[key], share: mae[key] / max }))
    .sort((a, b) => a.value - b.value);
}

// Band coverage as a whole percent, whether the writer sends a share (0.77) or a percent (77).
export function coveragePct(v: number | undefined): number | null {
  if (v === undefined || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v <= 1 ? v * 100 : v);
}
