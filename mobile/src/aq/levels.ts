// Air-quality levels, profiles and the rules that turn a forecast into advice and alerts.
// Pure module (no React Native), so node:test covers it.
import type { AqDay, AqHour, AqStation } from './types';

export type Level = 1 | 2 | 3 | 4 | 5 | 6;

// EEA European Air Quality Index bands (µg/m³), upper bounds of levels 1..5; above the last is level 6.
// Check against eea.europa.eu before the demo (docs/hackathon-plan.md); change only here.
export const PM25_BANDS = [5, 15, 50, 90, 140] as const;
export const PM10_BANDS = [15, 45, 120, 195, 270] as const;
export const EU_PM10_DAILY_LIMIT = 50;

function bandOf(value: number, bands: readonly number[]): Level {
  for (let i = 0; i < bands.length; i++) if (value <= bands[i]!) return (i + 1) as Level;
  return 6;
}

// The worse of the PM2.5 and PM10 levels, as the EAQI does.
export function levelOf(pm25: number, pm10: number): Level {
  return Math.max(bandOf(pm25, PM25_BANDS), bandOf(pm10, PM10_BANDS)) as Level;
}

export function clampLevel(n: number): Level {
  return Math.min(6, Math.max(1, Math.round(n))) as Level;
}

// EAQI colours, readable on both light and dark cards (text sits on top in white or near-black).
export const LEVEL_COLORS: Record<Level, string> = {
  1: '#50c4a8',
  2: '#4fa3d6',
  3: '#e9c43b',
  4: '#ef7e3a',
  5: '#d6334a',
  6: '#8e2b8c',
};

export function levelTextColor(level: Level): string {
  return level === 3 || level === 1 ? '#12163a' : '#ffffff';
}

export type Profile = 'asthma' | 'child' | 'elderly' | 'runner' | 'general';
export const PROFILES: Profile[] = ['asthma', 'child', 'elderly', 'runner', 'general'];

// Sensitive groups are warned from "moderate" (3); everyone else from "poor" (4).
export function alertThreshold(profile: Profile): Level {
  return profile === 'general' ? 4 : 3;
}

export function isBadFor(profile: Profile, level: number): boolean {
  return level >= alertThreshold(profile);
}

// The cleanest window of `hours` consecutive hours between 07:00 and 22:00 local, in the next 24 h.
export function bestWindow(hourly: AqHour[], now: Date, hours = 2): { start: string; end: string; pm25: number } | null {
  const limit = now.getTime() + 24 * 3600_000;
  const usable = hourly.filter((h) => {
    const d = new Date(h.t);
    const hr = d.getHours();
    return d.getTime() >= now.getTime() - 3600_000 && d.getTime() <= limit && hr >= 7 && hr <= 22 - hours;
  });
  let best: { start: string; end: string; pm25: number } | null = null;
  for (let i = 0; i + hours <= usable.length; i++) {
    const run = usable.slice(i, i + hours);
    // Only consecutive hours count.
    const span = new Date(run[run.length - 1]!.t).getTime() - new Date(run[0]!.t).getTime();
    if (span !== (hours - 1) * 3600_000) continue;
    const mean = run.reduce((s, h) => s + h.pm25, 0) / hours;
    if (!best || mean < best.pm25) {
      const end = new Date(new Date(run[run.length - 1]!.t).getTime() + 3600_000).toISOString();
      best = { start: run[0]!.t, end, pm25: mean };
    }
  }
  return best;
}

// The hour closest to `now`, or null when the forecast has none within 90 minutes.
export function currentHour(hourly: AqHour[] | undefined, now: Date): AqHour | null {
  if (!hourly?.length) return null;
  let best: AqHour | null = null;
  let gap = Infinity;
  for (const h of hourly) {
    const g = Math.abs(new Date(h.t).getTime() - now.getTime());
    if (g < gap) {
      gap = g;
      best = h;
    }
  }
  return gap <= 90 * 60_000 ? best : null;
}

// Level now: the latest measurement if it is under 2 h old, else the forecast for this hour.
export function levelNow(station: AqStation, now: Date): { level: Level; pm25: number; pm10: number; measured: boolean } | null {
  const l = station.latest;
  if (l && now.getTime() - new Date(l.t).getTime() < 2 * 3600_000) {
    return { level: levelOf(l.pm25, l.pm10), pm25: l.pm25, pm10: l.pm10, measured: true };
  }
  const h = currentHour(station.hourly, now);
  return h ? { level: levelOf(h.pm25, h.pm10), pm25: h.pm25, pm10: h.pm10, measured: false } : null;
}

// Local calendar date (YYYY-MM-DD) of a Date.
export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The level alerts go by: the forecast's alert_level (upper-middle of the band) when sent, else the level.
export function alertLevelOf(day: AqDay): Level {
  return clampLevel(day.alert_level ?? day.level);
}

export type PlannedAlert = { key: string; fireAt: Date; day: AqDay; when: 'today' | 'tomorrow' | 'later' };

// When to warn about each bad day: 19:00 the evening before, or 07:30 the same morning.
// A day whose warning time has passed is warned now (fireAt = now + 5 s) once, if the day is still ahead.
// `sent` holds keys already delivered, so reopening the app does not repeat a warning.
export function planAlerts(
  station: AqStation,
  profile: Profile,
  now: Date,
  sent: ReadonlySet<string>,
): PlannedAlert[] {
  const today = localDate(now);
  const tomorrow = localDate(new Date(now.getTime() + 24 * 3600_000));
  const out: PlannedAlert[] = [];
  for (const day of station.daily) {
    if (!isBadFor(profile, alertLevelOf(day)) || day.date < today) continue;
    const key = `${station.id}|${day.date}|${profile}`;
    if (sent.has(key)) continue;
    const [y, m, d] = day.date.split('-').map(Number) as [number, number, number];
    const eveningBefore = new Date(y, m - 1, d - 1, 19, 0, 0);
    const morning = new Date(y, m - 1, d, 7, 30, 0);
    const endOfDay = new Date(y, m - 1, d, 21, 0, 0);
    let fireAt: Date;
    if (eveningBefore > now) fireAt = eveningBefore;
    else if (morning > now) fireAt = morning;
    else if (endOfDay > now) fireAt = new Date(now.getTime() + 5000);
    else continue;
    const when = day.date === today ? 'today' : day.date === tomorrow ? 'tomorrow' : 'later';
    out.push({ key, fireAt, day, when });
  }
  return out;
}
