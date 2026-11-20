// „Кой замърсява?“: wording for the estimated PM2.5 shares (docs/superpowers/specs/2026-11-20-sources-design.md).
// Always labelled an estimate; „друго“ appears only in the web bar, never in the text.
import type { Lang } from '../types';
import { fmtPm } from './format';
import type { AqDay, AqSources, AqWhatIf } from './types';

const WORDS: Record<Lang, { title: string; heating: string; traffic: string; regional: string }> = {
  bg: { title: 'Източници (оценка)', heating: 'отопление', traffic: 'трафик', regional: 'пренос' },
  en: { title: 'Sources (estimate)', heating: 'heating', traffic: 'traffic', regional: 'carried in' },
};

const pct = (share: number) => `${Math.round(share * 100)}%`;

export function sourcesLine(s: AqSources, lang: Lang): string {
  const w = WORDS[lang];
  return `${w.title}: ${w.heating} ${pct(s.heating)} · ${w.traffic} ${pct(s.traffic)} · ${w.regional} ${pct(s.regional)}`;
}

// On a clean day the shares of a few µg/m³ mean little, so they stay hidden.
export function showSources(day: AqDay): day is AqDay & { sources: AqSources } {
  return day.sources !== undefined && day.pm25_mean >= 5;
}

// What changing the heating would do. Below 0.5 µg/m³ the evening effect is shown as nothing, never as „−0“: on a
// clean week only the last-winter clause is left. Null when there is nothing honest to say.
export function whatIfLine(w: AqWhatIf, lang: Lang): string | null {
  const lw = w.last_winter;
  const pct = Math.round(w.switch_share * 100);
  const head = lang === 'bg' ? `Ако ${pct}% от домовете на дърва сменят отоплението` : `If ${pct}% of the wood-heated homes switch their heating`;
  const parts: string[] = [];
  if (w.evening_drop_pm25 >= 0.5) {
    const date = `${w.date.slice(8, 10)}.${w.date.slice(5, 7)}`;
    parts.push(lang === 'bg' ? `−${fmtPm(lang, w.evening_drop_pm25)} µg/m³ вечерта на ${date}` : `−${fmtPm(lang, w.evening_drop_pm25)} µg/m³ on the evening of ${date}`);
  }
  if (lw) {
    parts.push(
      lang === 'bg'
        ? `${lw.bad_days_after} вместо ${lw.bad_days} лоши дни миналата зима (оценка)`
        : `${lw.bad_days_after} instead of ${lw.bad_days} bad days last winter (estimate)`,
    );
  } else if (parts.length > 0) {
    parts[parts.length - 1] += lang === 'bg' ? ' (оценка)' : ' (estimate)';
  }
  return parts.length > 0 ? `${head}: ${parts.join('; ')}.` : null;
}

// The four shares for the bar, in a fixed order with the label of each.
export function sourceSegments(s: AqSources, lang: Lang): { key: keyof AqSources; share: number; label: string }[] {
  const other = lang === 'bg' ? 'друго' : 'other';
  const w = WORDS[lang];
  return [
    { key: 'heating', share: s.heating, label: w.heating },
    { key: 'traffic', share: s.traffic, label: w.traffic },
    { key: 'regional', share: s.regional, label: w.regional },
    { key: 'other', share: s.other, label: other },
  ];
}

// 2025-10-01 → 01.10.2025
export function dmy(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}
