import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoForecast } from './mock';

const demo = demoForecast(new Date(2026, 10, 20, 10, 15));
const rows = [
  { id: '_model', payload: { generated_at: demo.generated_at, model: { ...demo.model, name: 'xgb-v2', kind: 'trained' } } },
  ...demo.stations.map((s) => ({ id: s.id, payload: s })),
];
let reads = 0;

// A database that counts how often the forecast is read.
vi.mock('../db', () => ({
  getSql: () => (() => {
    reads += 1;
    return Promise.resolve(rows);
  }) as unknown,
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('loadForecast cache', () => {
  it('reads the database once for requests within two minutes, again after', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 20, 12, 0) });
    const { loadForecast, clearForecastCache, CACHE_MS } = await import('./load');
    clearForecastCache();
    reads = 0;
    const [a, b] = await Promise.all([loadForecast(), loadForecast()]);
    expect(a.source).toBe('database');
    expect(b.forecast).toBe(a.forecast);
    expect(reads).toBe(1);
    vi.setSystemTime(Date.now() + CACHE_MS + 1);
    await loadForecast();
    expect(reads).toBe(2);
  });
});
