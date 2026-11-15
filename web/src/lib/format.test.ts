import { describe, expect, it } from 'vitest';
import { changePct, fmtInt, fmtNum, fmtPct } from './format';

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
});
