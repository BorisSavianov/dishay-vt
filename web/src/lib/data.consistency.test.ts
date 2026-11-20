import { describe, expect, it } from 'vitest';
import { bundled } from './data';

describe('bundled data', () => {
  it('has per-type counts that add up to the point list', () => {
    const { counts, points } = bundled.facilities;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(points.length);
    for (const [type, n] of Object.entries(counts)) {
      expect(points.filter((p) => p.type === type)).toHaveLength(n);
    }
  });

  it('has the 11 population years and a physicians series that ends at 2022', () => {
    expect(bundled.population.series).toHaveLength(11);
    expect(bundled.physicians.series.at(-1)?.year).toBe(2022);
  });
});
