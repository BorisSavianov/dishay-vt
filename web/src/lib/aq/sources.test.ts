import { describe, expect, it } from 'vitest';
import { day } from '@/lib/tg/fixtures';
import { showSources, sourcesLine } from './sources';

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
