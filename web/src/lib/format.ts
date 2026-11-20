import type { Lang } from './types';

const LOCALE: Record<Lang, string> = { bg: 'bg-BG', en: 'en-GB' };

export function fmtInt(lang: Lang, n: number): string {
  return new Intl.NumberFormat(LOCALE[lang]).format(n);
}

export function fmtNum(lang: Lang, n: number, digits = 0): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function fmtPct(lang: Lang, n: number, digits = 1): string {
  const body = new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'always',
  }).format(n);
  return `${body}%`;
}

// A percentage without a sign, for sentences like "decreased by 16.0%".
export function fmtPctAbs(lang: Lang, n: number, digits = 1): string {
  return `${fmtNum(lang, Math.abs(n), digits)}%`;
}

// Short axis numbers: 250K in English, 250 хил. in Bulgarian.
export function fmtCompact(lang: Lang, n: number): string {
  return new Intl.NumberFormat(LOCALE[lang], { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

// A calendar date from an ISO string, read in UTC so the day does not depend on the visitor's zone.
export function fmtDate(lang: Lang, iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(time);
}

export function changePct(first: number, last: number): number {
  if (first === 0) throw new Error('changePct: first value is zero');
  return ((last - first) / first) * 100;
}
