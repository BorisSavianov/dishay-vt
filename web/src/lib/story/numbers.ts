// The story's fixed figures (docs/slides/numbers.md). Client-safe: no server imports.
export const STORY_FACTS = {
  sensors: 555,
  readings: 5_277_731,
  sourcesCount: 6,
  stationsLive: 560,
  episode: { date: '2025-12-18', pm10Daily: 68.9, euLimit: 50 },
  warned: { hits: 18, bad: 23, falseAlarms: 11, camsHits: 20, camsFalse: 23 },
  maeVt: { model: 3.2, cams: 6.1, persistence: 4.8, betterPct: 48 },
  season: { model: 2.6, cams: 5.2, betterPct: 50 },
  sources: { heating: 0.45, regional: 0.25, other: 0.27, traffic: 0.03 },
  whatIf: { switchPct: 20, badDays: 15, badDaysBase: 23 },
} as const;
