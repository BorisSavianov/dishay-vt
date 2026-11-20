import { describe, expect, it } from 'vitest';
import { day } from '@/lib/tg/fixtures';
import { dmy, lastWinterFallback, showSources, sourceSegments, sourcesLine, whatIfLine } from './sources';
import type { AqWhatIf } from './types';

const sources = { heating: 0.64, traffic: 0.08, regional: 0.15, other: 0.13 };

describe('sources estimate', () => {
  it('words the shares in the fixed order, without „друго“', () => {
    expect(sourcesLine(sources, 'bg')).toBe('Източници (оценка): отопление 64% · трафик 8% · пренос 15%');
  });
  it('shows the shares only on a day with PM2.5 of at least 5', () => {
    expect(showSources({ ...day('2026-11-21', 1), pm25_mean: 4.9, sources })).toBe(false);
    expect(showSources({ ...day('2026-11-21', 1), pm25_mean: 5, sources })).toBe(true);
    expect(showSources({ ...day('2026-11-21', 1), pm25_mean: 30 })).toBe(false);
  });
});

const lastWinter = { from: '2025-10-01', to: '2026-03-31', bad_days: 23, bad_days_after: 15, days: 182 };
const whatIf: AqWhatIf = { method: 'estimate', switch_share: 0.2, date: '2026-11-21', evening_drop_pm25: 3.1, last_winter: lastWinter };

describe('what-if line', () => {
  it('gives the evening drop and the last-winter days', () => {
    expect(whatIfLine(whatIf, 'bg')).toBe(
      'Ако 20% от домовете на дърва сменят отоплението: −3,1 µg/m³ вечерта на 21.11; 15 вместо 23 лоши дни миналата зима (оценка).',
    );
  });
  it('drops the evening clause on a clean evening, so there is never a „−0“', () => {
    expect(whatIfLine({ ...whatIf, evening_drop_pm25: 0 }, 'bg')).toBe(
      'Ако 20% от домовете на дърва сменят отоплението: 15 вместо 23 лоши дни миналата зима (оценка).',
    );
    expect(whatIfLine({ ...whatIf, evening_drop_pm25: 0.4 }, 'en')).not.toMatch(/−0/);
  });
  it('is null when a clean evening has no last-winter figures either', () => {
    expect(whatIfLine({ ...whatIf, evening_drop_pm25: 0, last_winter: undefined }, 'bg')).toBeNull();
  });
});

describe('source segments', () => {
  it('lists the four shares in order and formats dates', () => {
    expect(sourceSegments(sources, 'bg').map((x) => x.key)).toEqual(['heating', 'traffic', 'regional', 'other']);
    expect(sourceSegments(sources, 'bg')[3]!.label).toBe('друго');
    expect(dmy('2025-10-01')).toBe('01.10.2025');
  });
});

describe('last-winter fallback', () => {
  const shares = { heating: 0.45, traffic: 0.03, regional: 0.25, other: 0.27 };
  const withShares: AqWhatIf = { ...whatIf, last_winter: { ...lastWinter, shares } };
  const clean = { ...day('2026-11-21', 1), pm25_mean: 2.2, sources };
  const dirty = { ...day('2026-11-22', 3), pm25_mean: 18, sources };

  it('gives last winter when no coming day shows its own shares', () => {
    expect(lastWinterFallback([clean, { ...clean, date: '2026-11-22' }], withShares)?.shares).toEqual(shares);
  });
  it('stays out when a coming day already shows its shares', () => {
    expect(lastWinterFallback([clean, dirty], withShares)).toBeNull();
  });
  it('is null without last-winter shares', () => {
    expect(lastWinterFallback([clean], whatIf)).toBeNull();
    expect(lastWinterFallback([clean], undefined)).toBeNull();
  });
});
