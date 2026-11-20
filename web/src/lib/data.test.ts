import { beforeAll, describe, expect, it } from 'vitest';
import { loadDatasets } from './data';

describe('loadDatasets', () => {
  beforeAll(() => {
    delete process.env.DATABASE_URL;
  });

  it('uses the bundled data when no DATABASE_URL is set', async () => {
    const result = await loadDatasets();
    expect(result.source).toBe('bundled');
    expect(result.datasets.population.series.length).toBeGreaterThan(0);
    expect(result.datasets.facilities.points.length).toBeGreaterThan(0);
  });
});
