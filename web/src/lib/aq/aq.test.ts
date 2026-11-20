import { describe, expect, it } from 'vitest';
import { GET as getStation } from '@/app/api/aq/[id]/route';
import { GET as getList } from '@/app/api/aq/route';
import { isBadFor, levelOf } from './levels';
import { featuredStation, isForecast, loadForecast, withoutHourly } from './load';
import { demoForecast } from './mock';

const NOW = new Date(2026, 10, 20, 10, 15);

type SqlOpt = NonNullable<Parameters<typeof loadForecast>[0]>['sql'];

// A fake Neon tagged template that answers the loader's one query with fixed rows.
function fakeSql(rows: { id: string; payload: unknown }[]): SqlOpt {
  return (() => Promise.resolve(rows)) as unknown as SqlOpt;
}

function rowsOf(f: ReturnType<typeof demoForecast>, withModel = true) {
  return [
    ...(withModel ? [{ id: '_model', payload: { generated_at: f.generated_at, model: { ...f.model, name: 'lgbm-v1', kind: 'trained' } } }] : []),
    ...f.stations.map((s) => ({ id: s.id, payload: s })),
  ];
}

describe('levels (same numbers as mobile)', () => {
  it('takes the worse of PM2.5 and PM10', () => {
    expect(levelOf(4, 10)).toBe(1);
    expect(levelOf(20, 10)).toBe(3);
    expect(levelOf(4, 130)).toBe(4);
    expect(levelOf(200, 10)).toBe(6);
  });

  it('warns sensitive groups from level 3 and everyone from level 4', () => {
    expect(isBadFor('asthma', 3)).toBe(true);
    expect(isBadFor('runner', 3)).toBe(true);
    expect(isBadFor('general', 3)).toBe(false);
    expect(isBadFor('general', 4)).toBe(true);
  });
});

describe('loadForecast', () => {
  const demo = demoForecast(NOW);

  it('reads Neon: the _model row plus one row per station', async () => {
    const res = await loadForecast({ sql: fakeSql(rowsOf(demo)), bundled: () => null, now: NOW });
    expect(res.source).toBe('database');
    expect(res.forecast.model.name).toBe('lgbm-v1');
    expect(res.forecast.stations).toHaveLength(demo.stations.length);
  });

  it('labels a mock model as demo wherever it came from', async () => {
    const mock = { ...demo, model: { ...demo.model, kind: 'mock' } };
    const res = await loadForecast({ sql: null, bundled: () => mock, now: NOW });
    expect(res.source).toBe('demo');
  });

  it('falls back to the bundled file when Neon has no _model row, then to the demo', async () => {
    const trained = { ...demo, model: { ...demo.model, kind: 'trained' } };
    const bundled = await loadForecast({ sql: fakeSql(rowsOf(demo, false)), bundled: () => trained, now: NOW });
    expect(bundled.source).toBe('bundled');
    const failing = (() => Promise.reject(new Error('down'))) as unknown as SqlOpt;
    const fallback = await loadForecast({ sql: failing, bundled: () => null, now: NOW });
    expect(fallback.source).toBe('demo');
    expect(isForecast(fallback.forecast)).toBe(true);
  });

  it('features Veliko Tarnovo and strips hourly for the list', () => {
    expect(featuredStation(demo).city).toBe('Велико Търново');
    expect(withoutHourly(demo).stations.every((s) => s.hourly === undefined)).toBe(true);
  });
});

describe('/api/aq', () => {
  it('lists stations without hourly, with CORS and a 5-minute edge cache', async () => {
    const res = await getList();
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toContain('s-maxage=300');
    const body = (await res.json()) as Record<string, unknown> & { stations: Record<string, unknown>[] };
    expect(isForecast(body)).toBe(true);
    expect(body.stations[0]).not.toHaveProperty('hourly');
  });

  it('returns one station with 72 hours, and 404 for an unknown id', async () => {
    const list = (await (await getList()).json()) as { stations: { id: string }[] };
    const id = list.stations[0]!.id;
    const res = await getStation(new Request(`http://test/api/aq/${id}`), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const station = (await res.json()) as { id: string; hourly: unknown[] };
    expect(station.id).toBe(id);
    expect(station.hourly).toHaveLength(72);
    const missing = await getStation(new Request('http://test/api/aq/nope'), { params: Promise.resolve({ id: 'nope' }) });
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
  });
});
