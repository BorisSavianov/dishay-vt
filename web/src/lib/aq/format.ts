import type { Lang } from '../types';

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
export function dayLabel(lang: Lang, date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale(lang), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

// µg/m³ values: whole numbers below 100 read better with one decimal only when small.
export function fmtPm(lang: Lang, n: number): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
}
