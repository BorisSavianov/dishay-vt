import { describe, expect, it } from 'vitest';
import { bundled } from './data';
import { cagr, direction, newestStamp, span, splitFacilities } from './metrics';

describe('metrics', () => {
  it('computes the compound annual rate of the Veliko Tarnovo population', () => {
    const s = span(bundled.population.series)!;
    expect(s.years).toBe(10);
    expect(cagr(s.first.value, s.last.value, s.years)).toBeCloseTo(-1.723, 3);
  });

  it('is zero for a flat series and rejects bad input', () => {
    expect(cagr(100, 100, 5)).toBe(0);
    expect(() => cagr(0, 10, 5)).toThrow();
    expect(() => cagr(10, 10, 0)).toThrow();
  });

  it('finds that the population fell in every year, and that physicians did not rise in every year', () => {
    expect(direction(bundled.population.series)).toBe('down');
    expect(direction(bundled.physicians.series)).toBe('mixed');
    expect(direction([{ year: 1, value: 1 }, { year: 2, value: 2 }])).toBe('up');
    expect(direction([{ year: 1, value: 1 }, { year: 2, value: 2 }, { year: 3, value: 1 }])).toBe('mixed');
    expect(direction([])).toBe('mixed');
  });

  it('returns no span for fewer than two years', () => {
    expect(span([])).toBeNull();
    expect(span([{ year: 2020, value: 1 }])).toBeNull();
  });

  it('splits the facilities into 56 health facilities and 247 bus stops', () => {
    const split = splitFacilities(bundled.facilities.counts);
    expect(split.healthTotal).toBe(56);
    expect(split.busStops).toBe(247);
    expect(split.total).toBe(303);
    expect(split.health.map((h) => h.type)).toEqual(['pharmacy', 'hospital', 'clinic', 'doctors']);
    expect(split.health.reduce((a, h) => a + h.share, 0)).toBeCloseTo(100, 6);
  });

  it('handles missing types and an empty count', () => {
    expect(splitFacilities({}).healthTotal).toBe(0);
    expect(splitFacilities({}).health.every((h) => h.share === 0)).toBe(true);
    expect(splitFacilities({ pharmacy: 2, kiosk: 3 }).total).toBe(5);
  });

  it('picks the newest valid timestamp', () => {
    expect(newestStamp(['2026-11-15T18:40:27+00:00', '2026-11-16T09:00:00+00:00', 'nope'])).toBe(
      '2026-11-16T09:00:00+00:00',
    );
    expect(newestStamp(['bad'])).toBeNull();
  });
});
