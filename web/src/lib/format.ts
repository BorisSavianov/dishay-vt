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

export function fmtPct(lang: Lang, n: number): string {
  const body = new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'always',
  }).format(n);
  return `${body}%`;
}

export function changePct(first: number, last: number): number {
  if (first === 0) throw new Error('changePct: first value is zero');
  return ((last - first) / first) * 100;
}
