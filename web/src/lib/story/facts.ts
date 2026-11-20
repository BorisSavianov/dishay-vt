// The numbers and live data the landing story shows. Historical figures are fixed here and
// tested against docs/slides/numbers.md and the bundled payload, so the page never disagrees with the slides.
import type { AqLoad, AqSource } from '@/lib/aq/load';
import type { AqEpisode } from '@/lib/aq/episode';
import { dayBefore } from '@/lib/aq/episode';
import { clampLevel, currentHour, levelOf, type Level } from '@/lib/aq/levels';
import type { AqStation } from '@/lib/aq/types';
import type { Lang } from '@/lib/types';

export type StoryLang = Lang;

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

export type StoryToday = {
  level: Level | null;
  pm25: number | null;
  pm10: number | null;
  updatedIso: string;
  stale: boolean;
  source: AqSource;
};

export type StoryHour = { t: string; pm10: number; pm25: number };
export type StorySensor = { lat: number; lon: number; level: Level; vt: boolean };

export type StoryData = {
  lang: Lang;
  facts: typeof STORY_FACTS;
  today: StoryToday;
  episodeHourly: StoryHour[];
  episodeForecast: { t: string; pm10: number }[];
  camsHourly: { t: string; pm10: number }[];
  sensors: StorySensor[];
};

const STALE_MS = 2 * 3600_000;

// The station's reading for now: the latest measurement, else the forecast for this hour.
function nowValues(s: AqStation, now: Date): { pm25: number; pm10: number } | null {
  if (s.latest) return { pm25: s.latest.pm25, pm10: s.latest.pm10 };
  const h = currentHour(s.hourly, now);
  return h ? { pm25: h.pm25, pm10: h.pm10 } : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function todayOf(load: AqLoad, now: Date): StoryToday {
  const values = load.forecast.stations
    .filter((s) => s.featured)
    .map((s) => nowValues(s, now))
    .filter((v): v is { pm25: number; pm10: number } => v !== null && Number.isFinite(v.pm25) && Number.isFinite(v.pm10));
  const stale = now.getTime() - new Date(load.forecast.generated_at).getTime() > STALE_MS;
  const base = { updatedIso: load.forecast.generated_at, stale, source: load.source };
  if (values.length === 0) return { ...base, level: null, pm25: null, pm10: null };
  const pm25 = round1(values.reduce((a, v) => a + v.pm25, 0) / values.length);
  const pm10 = round1(values.reduce((a, v) => a + v.pm10, 0) / values.length);
  return { ...base, level: levelOf(pm25, pm10), pm25, pm10 };
}

function sensorLevel(s: AqStation, now: Date): Level {
  const v = nowValues(s, now);
  if (v && Number.isFinite(v.pm25) && Number.isFinite(v.pm10)) return levelOf(v.pm25, v.pm10);
  return clampLevel(s.daily[0]?.level ?? 1);
}

export function buildStoryData(load: AqLoad, episode: AqEpisode | null, lang: Lang, now: Date): StoryData {
  return {
    lang,
    facts: STORY_FACTS,
    today: todayOf(load, now),
    episodeHourly: (episode?.observed ?? []).map((h) => ({ t: h.t, pm10: h.pm10, pm25: h.pm25 })),
    episodeForecast: episode ? dayBefore(episode).hourly.map((h) => ({ t: h.t, pm10: h.pm10 })) : [],
    camsHourly: (episode?.cams ?? []).map((h) => ({ t: h.t, pm10: h.pm10 })),
    sensors: load.forecast.stations.map((s) => ({ lat: s.lat, lon: s.lon, level: sensorLevel(s, now), vt: s.featured === true })),
  };
}
