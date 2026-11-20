import type { Lang } from '../types';
import { air } from './strings';

// The servers run in UTC; every time on screen is Bulgarian local time.
export const TZ = 'Europe/Sofia';

const locale = (lang: Lang) => (lang === 'bg' ? 'bg-BG' : 'en-GB');

// YYYY-MM-DD of an instant in Bulgaria.
export function sofiaDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Hour of the day (0..23) of an instant in Bulgaria.
export function sofiaHour(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
}

// "пт 21:00"
export function hourLabel(lang: Lang, iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, weekday: 'short' }).format(d);
  return `${day} ${String(sofiaHour(d)).padStart(2, '0')}:00`;
}

// "21:00"
export function clockLabel(lang: Lang, iso: string): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  );
}

// "събота, 21 ноември" for a YYYY-MM-DD date.
export function dayLabel(lang: Lang, date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

// µg/m³ values: whole numbers below 100 read better with one decimal only when small.
export function fmtPm(lang: Lang, n: number): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
}

export const STALE_MS = 2 * 3600_000;

// „Последна актуализация: днес, 13:07“ for the header, and a note when the forecast is more than 2 hours old.
export function freshness(lang: Lang, iso: string, now: Date = new Date()): { label: string; stale: boolean; note: string | null } | null {
  const made = new Date(iso);
  if (Number.isNaN(made.getTime())) return null;
  const time = clockLabel(lang, iso);
  const day = sofiaDate(made);
  const when =
    day === sofiaDate(now)
      ? air(lang, 'fresh.today', { time })
      : day === sofiaDate(new Date(now.getTime() - 24 * 3600_000))
        ? air(lang, 'fresh.yesterday', { time })
        : air(lang, 'fresh.other', { date: `${day.slice(8, 10)}.${day.slice(5, 7)}`, time });
  const stale = now.getTime() - made.getTime() > STALE_MS;
  return { label: air(lang, 'fresh.label', { when }), stale, note: stale ? air(lang, 'fresh.stale', { time }) : null };
}
