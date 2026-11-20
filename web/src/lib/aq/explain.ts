import type { Lang } from '../types';
import { clockLabel, dayLabel, fmtPm, hourLabel, sofiaDate, sofiaHour } from './format';
import { alertThreshold, clampLevel, EU_PM10_DAILY_LIMIT, isBadFor, levelNow, type Profile } from './levels';
import { advice, air, levelName, profileName } from './strings';
import type { AqHour, AqStation } from './types';

// The instructions for the forecast explanation. The facts are the only source of numbers and advice.
export const EXPLAIN_SYSTEM =
  'You explain an air-quality forecast to one person from the group named in the facts. ' +
  'Write at most three short sentences in the language requested, in plain words, without lists. ' +
  'Say which day is the worst for them and what to do, using only the advice given in the facts. ' +
  'Use only the numbers in the facts. Do not add numbers, causes, medical claims or forecasts.';

// The cleanest run of `hours` consecutive hours in the next 24 h, between 07:00 and 22:00 in Bulgaria.
export function cleanestWindow(hourly: AqHour[], now: Date, hours = 2): { start: string; end: string; pm25: number } | null {
  const from = now.getTime() - 3600_000;
  const to = now.getTime() + 24 * 3600_000;
  const usable = hourly.filter((h) => {
    const ms = new Date(h.t).getTime();
    const hr = sofiaHour(new Date(h.t));
    return ms >= from && ms <= to && hr >= 7 && hr <= 22 - hours;
  });
  let best: { start: string; end: string; pm25: number } | null = null;
  for (let i = 0; i + hours <= usable.length; i++) {
    const run = usable.slice(i, i + hours);
    const span = new Date(run[run.length - 1]!.t).getTime() - new Date(run[0]!.t).getTime();
    if (span !== (hours - 1) * 3600_000) continue;
    const mean = run.reduce((sum, h) => sum + h.pm25, 0) / hours;
    if (!best || mean < best.pm25) {
      best = { start: run[0]!.t, end: new Date(new Date(run[run.length - 1]!.t).getTime() + 3600_000).toISOString(), pm25: mean };
    }
  }
  return best;
}

// Short, fixed sentences about one station's forecast for one group. The AI may only restate these, and the
// page shows them as they are when no AI answers.
export function buildAqFacts(station: AqStation, profile: Profile, lang: Lang, generatedAt: string, now: Date): string[] {
  const tr = (key: Parameters<typeof air>[1], vars?: Record<string, string | number>) => air(lang, key, vars);
  const name = (n: number) => levelName(lang, clampLevel(n)).toLocaleLowerCase(lang === 'bg' ? 'bg-BG' : 'en-GB');
  const pm = (n: number) => fmtPm(lang, n);
  const today = sofiaDate(now);
  const day = (date: string) => { const d = dayLabel(lang, date); return d.charAt(0).toLocaleUpperCase() + d.slice(1); };
  const facts = [tr('ex.f.station', { station: station.name, city: station.city, time: hourLabel(lang, generatedAt) })];

  const current = levelNow(station, now);
  if (current) {
    facts.push(tr('ex.f.now', { level: name(current.level), n: current.level, pm25: pm(current.pm25), pm10: pm(current.pm10) }));
  }

  const days = station.daily.filter((d) => d.date >= today).slice(0, 3);
  for (const d of days) {
    const parts = [tr('ex.f.day', { day: day(d.date), level: name(d.level), n: d.level, pm10: pm(d.pm10_mean), pm25: pm(d.pm25_mean) })];
    if (d.exceeds_eu_limit) parts.push(tr('ex.f.eu', { limit: EU_PM10_DAILY_LIMIT }));
    const reasons = d.reasons.filter((r) => r.impact > 0).slice(0, 3);
    if (reasons.length > 0) {
      parts.push(tr('ex.f.reasons', { reasons: reasons.map((r) => (lang === 'en' && r.label_en ? r.label_en : r.label_bg)).join(', ') }));
    }
    facts.push(parts.join(' '));
  }

  facts.push(tr('ex.f.profile', { profile: profileName(lang, profile), n: alertThreshold(profile) }));
  const worst = [...days].sort((a, b) => b.level - a.level)[0];
  if (worst && isBadFor(profile, worst.level)) {
    facts.push(tr('ex.f.bad', { day: dayLabel(lang, worst.date), advice: advice(lang, profile, clampLevel(worst.level)) }));
  } else {
    const level = clampLevel(Math.max(current?.level ?? 1, worst?.level ?? 1));
    facts.push(tr('ex.f.ok', { advice: advice(lang, profile, level) }));
  }

  const window = cleanestWindow(station.hourly ?? [], now);
  if (window) {
    facts.push(tr('ex.f.window', { start: clockLabel(lang, window.start), end: clockLabel(lang, window.end), pm: pm(window.pm25) }));
  }
  return facts;
}
