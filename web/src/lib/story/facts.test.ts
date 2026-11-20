import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AqLoad } from '@/lib/aq/load';
import type { AqForecast, AqStation } from '@/lib/aq/types';
import { STORY_FACTS, buildStoryData } from './facts';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('STORY_FACTS', () => {
  it('matches docs/slides/numbers.md', () => {
    const md = read('../../../../docs/slides/numbers.md');
    expect(md).toContain('VT: model 3.2, persistence 4.8, CAMS 6.1 → 48% better than CAMS');
    expect(md).toContain('model caught 18, 11 false alarms; CAMS caught 20, 23 false alarms');
    expect(md).toContain(`${STORY_FACTS.sensors} BG sensors`);
    expect(md).toContain(STORY_FACTS.readings.toLocaleString('en-US'));
    expect(md).toContain('VT model 2.6 vs CAMS 5.2 → 50% better');
    expect(STORY_FACTS.maeVt).toEqual({ model: 3.2, cams: 6.1, persistence: 4.8, betterPct: 48 });
    expect(STORY_FACTS.season).toEqual({ model: 2.6, cams: 5.2, betterPct: 50 });
    expect(STORY_FACTS.warned).toEqual({ hits: 18, bad: 23, falseAlarms: 11, camsHits: 20, camsFalse: 23 });
  });

  it('agrees with the bundled payload and episode', () => {
    const f = JSON.parse(read('../../data/aq_forecast.json'));
    const e = JSON.parse(read('../../data/aq_episode.json'));
    expect(f.model.mae_vt).toEqual({ model: 3.2, cams: 6.1, persistence: 4.8 });
    expect(e.observed_daily.pm10_mean).toBe(STORY_FACTS.episode.pm10Daily);
    expect(e.score.model_alert.hits).toBe(STORY_FACTS.warned.hits);
    expect(e.score.bad_days).toBe(STORY_FACTS.warned.bad);
    const shares = (f.model as { sources_what_if?: { last_winter?: { shares?: Record<string, number> } } }).sources_what_if?.last_winter?.shares;
    expect(shares?.heating).toBeCloseTo(STORY_FACTS.sources.heating, 2);
  });
});

const NOW = new Date('2026-11-20T12:30:00+02:00');

function station(over: Partial<AqStation>): AqStation {
  return { id: 'x', name: 'x', city: 'Велико Търново', lat: 43.07, lon: 25.62, latest: null, daily: [], ...over };
}

function load(stations: AqStation[], source: AqLoad['source'] = 'database', generated = '2026-11-20T12:07:00+02:00'): AqLoad {
  const forecast = { generated_at: generated, model: { name: 'm', trained_rows: 0, sensors: 0, holdout: '', mae: { model: 1, cams: 1, persistence: 1 } }, stations } as AqForecast;
  return { source, forecast };
}

describe('buildStoryData', () => {
  it('uses the featured VT stations for today', () => {
    const d = buildStoryData(
      load([
        station({ id: 'a', featured: true, latest: { t: '2026-11-20T12:20:00+02:00', pm25: 3, pm10: 6 } }),
        station({ id: 'b', featured: true, latest: { t: '2026-11-20T12:20:00+02:00', pm25: 5, pm10: 10 } }),
        station({ id: 'c', latest: { t: '2026-11-20T12:20:00+02:00', pm25: 90, pm10: 90 } }),
      ]),
      null,
      'bg',
      NOW,
    );
    expect(d.today.pm25).toBe(4);
    expect(d.today.pm10).toBe(8);
    expect(d.today.level).toBe(1);
    expect(d.today.source).toBe('database');
    expect(d.today.stale).toBe(false);
  });

  it('falls back to the current forecast hour when latest is null', () => {
    const d = buildStoryData(
      load([station({ featured: true, hourly: [{ t: '2026-11-20T12:00:00+02:00', pm25: 20, pm10: 25 }] })]),
      null,
      'bg',
      NOW,
    );
    expect(d.today.pm25).toBe(20);
    expect(d.today.level).toBe(3);
  });

  it('returns nulls, not NaN, with no data', () => {
    const d = buildStoryData(load([station({ featured: true })]), null, 'bg', NOW);
    expect(d.today.level).toBeNull();
    expect(d.today.pm25).toBeNull();
    expect(d.today.pm10).toBeNull();
  });

  it('marks a stale bundled forecast', () => {
    const d = buildStoryData(load([station({ featured: true })], 'bundled', '2026-11-20T09:30:00+02:00'), null, 'bg', NOW);
    expect(d.today.stale).toBe(true);
    expect(d.today.source).toBe('bundled');
  });

  it('maps every station to a sensor with a level and flags VT', () => {
    const f = JSON.parse(read('../../data/aq_forecast.json')) as AqForecast;
    const d = buildStoryData({ source: 'bundled', forecast: f }, null, 'en', NOW);
    expect(d.sensors).toHaveLength(f.stations.length);
    expect(d.sensors.filter((s) => s.vt)).toHaveLength(f.stations.filter((s) => s.featured).length);
    for (const s of d.sensors) expect(s.level).toBeGreaterThanOrEqual(1);
  });

  it('carries the episode hours', () => {
    const e = JSON.parse(read('../../data/aq_episode.json'));
    const d = buildStoryData(load([]), e, 'bg', NOW);
    expect(d.episodeHourly).toHaveLength(24);
    expect(Math.max(...d.episodeHourly.map((h) => h.pm10))).toBe(180.4);
    expect(d.episodeForecast).toHaveLength(e.forecasts[e.forecasts.length - 1].hourly.length);
    expect(d.camsHourly).toHaveLength(24);
  });
});
