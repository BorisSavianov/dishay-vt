// The platform's look in the story's style: small decisions kept out of the components so they can be tested.
import type { Level } from '@/lib/aq/levels';
import { detectMode, type StoryEnv, type StoryMode } from '@/lib/story/mode';

export type NavId = 'story' | 'dashboard' | 'geo' | 'why' | 'health' | 'ai' | 'predict' | 'sources' | 'about';

// How thick the /now valley's haze is for each air level: clean air is a clear dusk, level 6 the story's full smog.
const SMOG: Record<Level, number> = { 1: 0, 2: 0.15, 3: 0.35, 4: 0.6, 5: 0.8, 6: 1 };

export function smogForLevel(level: Level | null): number {
  return level === null ? 0 : SMOG[level];
}

// The story chapter behind each page, chosen by subject. The map has its own WebGL and the dashboard its live valley.
const CHAPTER: Partial<Record<NavId, number>> = { why: 6, ai: 5, sources: 3, about: 1, health: 1, predict: 4 };

export function backdropPoster(active: NavId, theme: 'light' | 'dark'): string | null {
  const ch = CHAPTER[active];
  if (ch === undefined) return null;
  return `/story/ch${theme === 'light' ? 7 : ch}.webp`;
}

// The /now valley: the story's tiers, but a phone always gets the still frame (the numbers are the hero there).
export function nowSkyMode(env: StoryEnv): StoryMode {
  return env.width < 768 ? 'poster' : detectMode(env);
}

export type CountSpec = { value: number; decimals: number; decimalSep: '.' | ','; prefix: string; suffix: string };

// A count-up needs text with exactly one number in it; the text around it is kept as it is.
export function parseCount(text: string): CountSpec | null {
  const found = text.match(/\d+(?:[.,]\d+)?/g);
  if (!found || found.length !== 1) return null;
  const num = found[0]!;
  const at = text.indexOf(num);
  const sep = num.includes(',') ? ',' : '.';
  const frac = num.split(/[.,]/)[1] ?? '';
  return {
    value: Number(num.replace(',', '.')),
    decimals: frac.length,
    decimalSep: sep,
    prefix: text.slice(0, at),
    suffix: text.slice(at + num.length),
  };
}

export function formatCount(spec: CountSpec, v: number): string {
  const n = v.toFixed(spec.decimals).replace('.', spec.decimalSep);
  return `${spec.prefix}${n}${spec.suffix}`;
}
