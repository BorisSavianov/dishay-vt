// The smog episode replayed by /demo (web/src/data/aq_episode.json, written by ml/aq_episode.py).
// Only the fields the bot reads are checked.

export type Episode = {
  date: string;
  place: string;
  observed_daily: { pm10_mean: number; level: number; exceeds_eu_limit: boolean };
  cams_daily: { pm10_mean: number };
  forecasts: { issued: string; days_before: number; daily: { pm10_mean: number; level: number; alert_level?: number } }[];
  score: { bad_days: number; model_alert: { hits: number } };
};

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

export function episodeOf(raw: unknown): Episode | null {
  const e = obj(raw);
  if (!e || typeof e.date !== 'string' || typeof e.place !== 'string') return null;
  const observed = obj(e.observed_daily);
  const cams = obj(e.cams_daily);
  const score = obj(e.score);
  const alert = obj(score?.model_alert);
  if (!observed || !num(observed.pm10_mean) || !num(observed.level) || typeof observed.exceeds_eu_limit !== 'boolean') return null;
  if (!cams || !num(cams.pm10_mean)) return null;
  if (!score || !num(score.bad_days) || !alert || !num(alert.hits)) return null;
  if (!Array.isArray(e.forecasts)) return null;
  const dayBefore = e.forecasts.find((f) => obj(f)?.days_before === 1);
  const daily = obj(obj(dayBefore)?.daily);
  if (!dayBefore || typeof (dayBefore as { issued?: unknown }).issued !== 'string' || !daily || !num(daily.pm10_mean) || !num(daily.level)) return null;
  return raw as Episode;
}
