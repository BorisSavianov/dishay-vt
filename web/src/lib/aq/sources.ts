// „Кой замърсява?“: wording for the estimated PM2.5 shares (docs/superpowers/specs/2026-11-20-sources-design.md).
// Always labelled an estimate; „друго“ appears only in the web bar, never in the text.
import type { Lang } from '../types';
import type { AqDay, AqSources } from './types';

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
