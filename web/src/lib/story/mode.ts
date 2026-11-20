// How the story renders on this device: the full 3D scene, a lighter one, or still posters.

export type StoryMode = 'webgl-high' | 'webgl-low' | 'poster';

export type StoryEnv = {
  webgl2: boolean;
  reducedMotion: boolean;
  width: number;
  cores: number;
  /** navigator.deviceMemory; Safari does not expose it. */
  memoryGb?: number;
};

export function detectMode(env: StoryEnv): StoryMode {
  if (!env.webgl2 || env.reducedMotion) return 'poster';
  const weak = env.width < 768 || env.cores <= 4 || (env.memoryGb !== undefined && env.memoryGb < 4);
  return weak ? 'webgl-low' : 'webgl-high';
}

// Measured on the dev machine: the haze is fill-rate bound, so the budgets stay well under the plan's first guess.
const BUDGET: Record<StoryMode, number> = { 'webgl-high': 32000, 'webgl-low': 10000, poster: 0 };

export function particleBudget(mode: StoryMode, _width: number): number {
  return BUDGET[mode];
}

/** Reads the environment in the browser. */
export function probeEnv(): StoryEnv {
  let webgl2 = false;
  try {
    webgl2 = !!document.createElement('canvas').getContext('webgl2');
  } catch {
    webgl2 = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    webgl2,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    width: window.innerWidth,
    cores: nav.hardwareConcurrency || 4,
    memoryGb: nav.deviceMemory,
  };
}
