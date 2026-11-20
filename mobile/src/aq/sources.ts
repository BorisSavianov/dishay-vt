// Day-card helpers shared with the web (web/src/lib/aq/sources.ts) and the bot: the sources estimate,
// the clean-day line and how fresh the forecast is.
import type { Lang } from '../shared/types';
import { clampLevel } from './levels';
import type { AqDay, AqSources } from './types';

const WORDS: Record<Lang, { title: string; heating: string; traffic: string; regional: string }> = {
  bg: { title: 'Източници (оценка)', heating: 'отопление', traffic: 'трафик', regional: 'пренос' },
  en: { title: 'Sources (estimate)', heating: 'heating', traffic: 'traffic', regional: 'carried in' },
};

const pct = (share: number) => `${Math.round(share * 100)}%`;

// Always labelled an estimate; „друго“ is left out of the text, as on the web.
export function sourcesLine(s: AqSources, lang: Lang): string {
  const w = WORDS[lang];
  return `${w.title}: ${w.heating} ${pct(s.heating)} · ${w.traffic} ${pct(s.traffic)} · ${w.regional} ${pct(s.regional)}`;
}

// On a clean day the shares of a few µg/m³ mean little, so they stay hidden.
export function showSources(day: AqDay): day is AqDay & { sources: AqSources } {
  return day.sources !== undefined && day.pm25_mean >= 5;
}

// A „Добър“ day: the card says so, so all clean cards read the same even when one has a tiny factor pushing up.
export function isCleanDay(day: AqDay): boolean {
  return clampLevel(day.level) === 1;
}

const STALE_MS = 2 * 3600_000;
const pad = (n: number) => String(n).padStart(2, '0');

// The forecast runs every hour; one older than 2 hours means the loop has stopped.
export function freshness(generatedAt: string, now: Date): { time: string; today: boolean; stale: boolean } {
  const g = new Date(generatedAt);
  return {
    time: `${pad(g.getHours())}:${pad(g.getMinutes())}`,
    today: g.toDateString() === now.toDateString(),
    stale: now.getTime() - g.getTime() > STALE_MS,
  };
}
