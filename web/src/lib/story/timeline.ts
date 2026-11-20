// The story as a function of scroll progress p ∈ [0, 1]. Chapter n spans [(n-1)/8, n/8): its scene state is
// held in the middle of the span (so text sits over a still scene) and blends to the next one around the boundary.

export const CHAPTERS = 8;
const SPAN = 1 / CHAPTERS;
const BLEND = 0.4 * SPAN; // half-width of the transition window around each boundary

export type Vec3 = [number, number, number];

export type SceneState = {
  cam: Vec3;
  target: Vec3;
  fov: number;
  smog: number; // 0..1 smog volume
  dusk: number; // 0..1 night grade
  sensorsBg: number; // 0 = sensors on the VT terrain, 1 = lifted into the Bulgaria frame
  bars: number; // 0..1 particles gathered into the MAE bars
  streams: number; // 0..1 particles split into the four source streams
  clear: number; // 0..1 daylight
  episodeHour: number; // 0..23, the 18.12.2025 clock
};

type Key = Omit<SceneState, 'episodeHour'>;

const K: Key[] = [
  // 1 Dusk over the Yantra valley
  { cam: [6, 3.4, 9], target: [0.8, 0.3, -0.5], fov: 38, smog: 0, dusk: 1, sensorsBg: 0, bars: 0, streams: 0, clear: 0 },
  // 2 The smog rolls in
  { cam: [3.5, 1.9, 5.5], target: [0, 0.4, -0.5], fov: 42, smog: 1, dusk: 0.8, sensorsBg: 0, bars: 0, streams: 0, clear: 0 },
  // 3 555 sensors over Bulgaria
  { cam: [0, 30, 18], target: [0, 3, 0], fov: 45, smog: 0.3, dusk: 1, sensorsBg: 1, bars: 0, streams: 0, clear: 0 },
  // 4 We warned the evening before
  { cam: [-5, 4, 8], target: [0.5, 0.5, -0.5], fov: 40, smog: 0.8, dusk: 0.7, sensorsBg: 0, bars: 0, streams: 0, clear: 0 },
  // 5 More accurate than CAMS
  { cam: [-6, 5, 6], target: [0, 1.5, 0], fov: 40, smog: 0.6, dusk: 0.6, sensorsBg: 0, bars: 1, streams: 0, clear: 0 },
  // 6 Who pollutes
  { cam: [0, 7, 9], target: [0, 1, 0], fov: 42, smog: 0.6, dusk: 0.6, sensorsBg: 0, bars: 0, streams: 1, clear: 0 },
  // 7 Today: the fog clears
  { cam: [7, 6, 11], target: [0, 0, -1], fov: 40, smog: 0, dusk: 0, sensorsBg: 0, bars: 0, streams: 0, clear: 1 },
  // 8 Breathe easy
  { cam: [9, 9, 14], target: [0, 0, -1], fov: 40, smog: 0, dusk: 0, sensorsBg: 0, bars: 0, streams: 0, clear: 1 },
];

const withHour = (k: Key, episodeHour: number): SceneState => ({ ...k, episodeHour });

export const KEYFRAMES: { p: number; s: SceneState }[] = [
  ...K.map((k, i) => ({ p: i * SPAN, s: withHour(k, i === 0 ? 0 : 23) })),
  { p: 1, s: withHour(K[CHAPTERS - 1]!, 23) },
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixV = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function blend(a: Key, b: Key, t: number): Key {
  return {
    cam: mixV(a.cam, b.cam, t),
    target: mixV(a.target, b.target, t),
    fov: mix(a.fov, b.fov, t),
    smog: mix(a.smog, b.smog, t),
    dusk: mix(a.dusk, b.dusk, t),
    sensorsBg: mix(a.sensorsBg, b.sensorsBg, t),
    bars: mix(a.bars, b.bars, t),
    streams: mix(a.streams, b.streams, t),
    clear: mix(a.clear, b.clear, t),
  };
}

// The 18.12 clock runs while chapter 2 is on screen, from 0:00 to 23:00.
function hourAt(p: number): number {
  const t = clamp01((p - 1.1 * SPAN) / (0.8 * SPAN));
  return p < SPAN ? 0 : Math.round(t * 23 * 100) / 100;
}

export function sceneAt(pIn: number): SceneState {
  const p = clamp01(pIn);
  // Nearest boundary between chapter b and b+1 (b = 1..7).
  const b = Math.round(p / SPAN);
  let key: Key;
  if (b >= 1 && b < CHAPTERS && Math.abs(p - b * SPAN) < BLEND) {
    const t = smooth((p - (b * SPAN - BLEND)) / (2 * BLEND));
    key = blend(K[b - 1]!, K[b]!, t);
  } else {
    key = K[Math.min(CHAPTERS - 1, Math.floor(p / SPAN))]!;
  }
  return withHour(key, hourAt(p));
}

export function chapterOf(p: number): number {
  return Math.min(CHAPTERS, Math.max(1, Math.floor(clamp01(p) / SPAN) + 1));
}

// Progress from the viewport centre against the sections' document tops (tops[i] = top of chapter i+1, end = bottom of the last).
export function progressFromSections(centerY: number, tops: number[], end: number): number {
  for (let i = tops.length - 1; i >= 0; i--) {
    if (centerY >= tops[i]!) {
      const next = i + 1 < tops.length ? tops[i + 1]! : end;
      return clamp01((i + clamp01((centerY - tops[i]!) / (next - tops[i]!))) / tops.length);
    }
  }
  return 0;
}

// Equal viewport-high sections: chapter n is centred when scrollY = (n-1)·H.
export function progressOf(scrollY: number, viewportH: number): number {
  const tops = Array.from({ length: CHAPTERS }, (_, i) => i * viewportH);
  return progressFromSections(scrollY + viewportH / 2, tops, CHAPTERS * viewportH);
}

const NEXT = new Set([' ', 'PageDown', 'ArrowDown']);
const PREV = new Set(['PageUp', 'ArrowUp']);

// Presenter keys: next / previous chapter, Home / End. null = no move.
export function chapterTarget(current: number, key: string, shift: boolean): number | null {
  let to: number | null = null;
  if (key === ' ' && shift) to = current - 1;
  else if (NEXT.has(key)) to = current + 1;
  else if (PREV.has(key)) to = current - 1;
  else if (key === 'Home') to = 1;
  else if (key === 'End') to = CHAPTERS;
  if (to === null || to < 1 || to > CHAPTERS || to === current) return null;
  return to;
}
