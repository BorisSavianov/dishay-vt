import { describe, expect, it } from 'vitest';
import { changePct, fmtCompact, fmtDate, fmtInt, fmtNum, fmtPct, fmtPctAbs } from './format';

describe('format', () => {
  it('computes the Veliko Tarnovo population change', () => {
    expect(fmtPct('en', changePct(238456, 200413))).toBe('-16.0%');
  });

  it('formats integers and decimals per locale', () => {
    expect(fmtInt('en', 200413)).toBe('200,413');
    expect(fmtNum('en', 4.328, 2)).toBe('4.33');
  });

  it('refuses a zero base for the change', () => {
    expect(() => changePct(0, 10)).toThrow();
  });

  it('formats percentages with a chosen number of digits', () => {
    expect(fmtPct('en', -1.722, 2)).toBe('-1.72%');
    expect(fmtPct('en', 3.4)).toBe('+3.4%');
    expect(fmtPctAbs('en', -16.0)).toBe('16.0%');
  });

  it('formats a date from the day in the ISO string, whatever the local zone', () => {
    expect(fmtDate('en', '2026-11-15T18:40:27+00:00')).toBe('15 Nov 2026');
    expect(fmtDate('en', 'not a date')).toBe('not a date');
    expect(fmtDate('bg', '2026-11-15T23:59:00+00:00')).toContain('2026');
  });

  it('formats compact axis numbers', () => {
    expect(fmtCompact('en', 250000)).toBe('250k');
  });
});
