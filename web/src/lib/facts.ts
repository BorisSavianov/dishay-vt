import { changePct, fmtInt, fmtNum, fmtPct } from './format';
import { messages, t, type MessageKey } from './i18n';
import type { DatasetName, Datasets, Lang } from './types';

export function typeLabel(lang: Lang, type: string): string {
  const key = `type.${type}`;
  return key in messages.bg ? t(lang, key as MessageKey) : type;
}

// Short, fixed sentences built from the data. The AI may only restate these.
export function buildFacts(datasets: Datasets, dataset: DatasetName, lang: Lang): string[] {
  if (dataset === 'population') {
    const s = datasets.population.series;
    const first = s[0];
    const last = s[s.length - 1];
    if (!first || !last) return [];
    const pct = changePct(first.value, last.value);
    return [
      `${t(lang, 'facts.population')}: ${fmtInt(lang, first.value)} (${first.year}), ${fmtInt(lang, last.value)} (${last.year}), ${fmtPct(lang, pct)}.`,
    ];
  }
  if (dataset === 'physicians') {
    const s = datasets.physicians.series;
    const last = s[s.length - 1];
    if (!last) return [];
    return [`${t(lang, 'facts.physicians')}: ${fmtNum(lang, last.value, 2)} (${last.year}).`];
  }
  const counts = datasets.facilities.counts;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const parts = Object.entries(counts).map(([k, v]) => `${fmtInt(lang, v)} ${typeLabel(lang, k)}`);
  return [`${t(lang, 'facts.facilities')}: ${fmtInt(lang, total)}. ${parts.join(', ')}.`];
}

function normalizeNumber(raw: string): number {
  const s = raw.replace(/[   ]/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  return Number(s.replace(',', '.'));
}

// Every number that appears in the text, as a plain value. Handles "238 456", "238,456", "4,33", "16.0".
export function numbersOf(text: string): number[] {
  const matches = text.match(/\d+(?:[   .,]\d{3})*(?:[.,]\d+)?/g) ?? [];
  return matches.map(normalizeNumber);
}

// A provider answer is accepted only if every number in it appears in the facts.
export function isGrounded(text: string, facts: string[]): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 600) return false;
  const allowed = new Set(facts.flatMap(numbersOf));
  return numbersOf(trimmed).every((n) => allowed.has(n));
}
