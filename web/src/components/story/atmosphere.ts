// Sky and fog colours for a scene state: dusk navy → smog ochre-grey → clear daylight.
import { Color } from 'three';
import type { SceneState } from '@/lib/story/timeline';

const NIGHT = new Color('#120f30');
const DUSK = new Color('#2a2152');
const SMOG = new Color('#3d3a36');
const DAY = new Color('#dfe5ff');

const tmp = new Color();

export type Atmosphere = { sky: Color; fogDensity: number };

export function atmosphere(s: SceneState, out: Color): Atmosphere {
  out.copy(DUSK).lerp(NIGHT, s.dusk * 0.6);
  out.lerp(tmp.copy(SMOG), s.smog * 0.75);
  out.lerp(DAY, s.clear);
  const fogDensity = 0.028 + s.smog * 0.07 - s.clear * 0.012 - s.sensorsBg * 0.02;
  return { sky: out, fogDensity: Math.max(0.006, fogDensity) };
}
