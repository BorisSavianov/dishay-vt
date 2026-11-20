import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// One real smog day replayed with models trained before that winter (contract/CONTRACT.md "Episode replay").
// Written by `python -m ml.aq_episode` and bundled; the „Защо?“ page hides the block when the file is missing.

export type EpisodeDay = { pm10_mean: number; pm25_mean: number; level: number; alert_level?: number; exceeds_eu_limit: boolean };
export type EpisodeHour = { t: string; pm25: number; pm10: number; pm25_lo?: number; pm25_hi?: number };
export type EpisodeScore = { hits: number; misses: number; false_alarms: number; pod: number; far: number };

export type AqEpisode = {
  date: string;
  place: string;
  place_en?: string;
  sensors: number;
  model: string;
  observed: EpisodeHour[];
  cams: EpisodeHour[];
  observed_daily: EpisodeDay;
  cams_daily: EpisodeDay;
  forecasts: { issued: string; days_before: number; hourly: EpisodeHour[]; daily: EpisodeDay }[];
  score?: {
    days: number;
    bad_days: number;
    model_alert: EpisodeScore;
    model_level?: EpisodeScore;
    cams: EpisodeScore;
    worst10?: { model_warned: number; cams_warned: number };
  };
};

export const EPISODE_PATH = join(process.cwd(), 'src', 'data', 'aq_episode.json');

function hours(v: unknown): v is EpisodeHour[] {
  return Array.isArray(v) && v.length > 0 && v.every((h) => typeof h?.t === 'string' && typeof h?.pm25 === 'number');
}

export function isEpisode(v: unknown): v is AqEpisode {
  const e = v as AqEpisode;
  return (
    !!e &&
    typeof e.date === 'string' &&
    hours(e.observed) &&
    hours(e.cams) &&
    !!e.observed_daily &&
    !!e.cams_daily &&
    Array.isArray(e.forecasts) &&
    e.forecasts.length > 0 &&
    e.forecasts.every((f) => typeof f.days_before === 'number' && hours(f.hourly) && !!f.daily)
  );
}

export function readEpisode(path = EPISODE_PATH): AqEpisode | null {
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isEpisode(data) ? data : null;
  } catch {
    return null;
  }
}

// The forecast issued the day before, else the closest one.
export function dayBefore(e: AqEpisode): AqEpisode['forecasts'][number] {
  return [...e.forecasts].sort((a, b) => Math.abs(a.days_before - 1) - Math.abs(b.days_before - 1))[0]!;
}
