// The app's look in the story's style, mirroring web/src/lib/look.ts. Pure module, so node:test covers it.
import type { Level } from '../aq/levels';
import type { Mode } from './palette';

export type TabId = 'air' | 'map' | 'health' | 'profile';
export type Poster = 'ch1' | 'ch7';

// How thick the haze over the valley is for each air level: clean air is a clear dusk, level 6 the story's full
// smog. Same numbers as the web's /now valley.
const SMOG: Record<Level, number> = { 1: 0, 2: 0.15, 3: 0.35, 4: 0.6, 5: 0.8, 6: 1 };

export function smogForLevel(level: Level | null): number {
  return level === null ? 0 : SMOG[level];
}

// The story still behind each tab. On a phone the web's /now gets the still, not the 3D valley, so the app does
// the same everywhere. The map has its own surface (gradient only, as the web's /geographic). Day uses chapter 7.
const HAS_POSTER: Record<TabId, boolean> = { air: true, map: false, health: true, profile: true };

export function backdropPoster(tab: TabId, mode: Mode): Poster | null {
  if (!HAS_POSTER[tab]) return null;
  return mode === 'light' ? 'ch7' : 'ch1';
}

// Count-ups: ease-out cubic from 0 to the value over COUNT_MS, as the web's data-count.
export const COUNT_MS = 900;

export function countAt(value: number, elapsedMs: number, decimals = 0): number {
  const t = Math.min(1, Math.max(0, elapsedMs / COUNT_MS));
  const eased = 1 - (1 - t) ** 3;
  const f = 10 ** decimals;
  return Math.round(value * eased * f) / f;
}
