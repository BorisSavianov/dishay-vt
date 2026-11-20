import { describe, expect, it } from 'vitest';
import { donutSegments, labelStride, linePath, nearestIndex, niceTicks } from './chart';

describe('chart helpers', () => {
  it('makes round ticks that cover the range', () => {
    const ticks = niceTicks(200413, 238456, 5);
    expect(ticks[0]!).toBeLessThanOrEqual(200413);
    expect(ticks[ticks.length - 1]!).toBeGreaterThanOrEqual(238456);
    const steps = ticks.slice(1).map((t, i) => t - ticks[i]!);
    expect(new Set(steps).size).toBe(1);
    expect(ticks.every((t) => t % 5000 === 0)).toBe(true);
  });

  it('handles a flat range and non-finite input', () => {
    expect(niceTicks(5, 5).length).toBeGreaterThan(1);
    expect(niceTicks(NaN, 5)).toEqual([]);
  });

  it('works with small decimals', () => {
    const ticks = niceTicks(3.44, 4.33, 5);
    expect(ticks[0]!).toBeLessThanOrEqual(3.44);
    expect(ticks[ticks.length - 1]!).toBeGreaterThanOrEqual(4.33);
  });

  it('finds the nearest point', () => {
    expect(nearestIndex([0, 10, 20, 30], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20, 30], 26)).toBe(3);
    expect(nearestIndex([], 5)).toBe(0);
  });

  it('skips labels when they would overlap', () => {
    expect(labelStride(11, 600, 40)).toBe(1);
    expect(labelStride(23, 300, 40)).toBe(3);
    expect(labelStride(1, 300, 40)).toBe(1);
  });

  it('builds a path', () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 2, y: 3 }])).toBe('M0.00 1.00 L2.00 3.00');
    expect(linePath([])).toBe('');
  });

  it('splits a donut in proportion', () => {
    const segs = donutSegments([1, 1, 2], 100);
    expect(segs.map((s) => Math.round(s.length))).toEqual([25, 25, 50]);
    expect(segs.map((s) => Math.round(s.offset))).toEqual([0, -25, -50]);
    expect(donutSegments([0, 0], 100)).toEqual([{ length: 0, offset: 0 }, { length: 0, offset: 0 }]);
  });
});
