import { describe, expect, it } from 'vitest';
import { maeBars, pctBetter } from './why';

describe('why helpers', () => {
  it('says how much smaller our error is', () => {
    expect(pctBetter(2.8, 8.1)).toBe(65);
    expect(pctBetter(3.2, 6.1)).toBe(48);
    expect(pctBetter(5, 4)).toBe(-25);
    expect(pctBetter(2, 0)).toBeNull();
  });

  it('orders the bars best first and scales them to the largest error', () => {
    const bars = maeBars({ model: 2.8, cams: 8.1, persistence: 4 });
    expect(bars.map((b) => b.key)).toEqual(['model', 'persistence', 'cams']);
    expect(bars[2]!.share).toBe(1);
  });
});
