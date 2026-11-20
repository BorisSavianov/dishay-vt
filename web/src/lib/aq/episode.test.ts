import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dayBefore, isEpisode, readEpisode, type AqEpisode } from './episode';

const hour = (h: number, pm25: number) => ({ t: `2025-12-18T${String(h).padStart(2, '0')}:00:00+02:00`, pm25, pm10: pm25 * 2 });
const day = { pm10_mean: 50, pm25_mean: 25, level: 3, exceeds_eu_limit: false };
const episode: AqEpisode = {
  date: '2025-12-18',
  place: 'Велико Търново',
  sensors: 7,
  model: 'lgbm-v1',
  observed: [hour(0, 30)],
  cams: [hour(0, 19)],
  observed_daily: { ...day, exceeds_eu_limit: true },
  cams_daily: day,
  forecasts: [
    { issued: '2025-12-16T12:00:00+02:00', days_before: 2, hourly: [hour(0, 20)], daily: day },
    { issued: '2025-12-17T12:00:00+02:00', days_before: 1, hourly: [hour(0, 22)], daily: day },
  ],
};

describe('episode', () => {
  it('accepts the contract shape and rejects others', () => {
    expect(isEpisode(episode)).toBe(true);
    expect(isEpisode({ ...episode, forecasts: [] })).toBe(false);
    expect(isEpisode(null)).toBe(false);
  });

  it('reads the file, or gives null when it is missing or broken', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ep-'));
    const good = join(dir, 'good.json');
    writeFileSync(good, JSON.stringify(episode));
    expect(readEpisode(good)?.date).toBe('2025-12-18');
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{');
    expect(readEpisode(bad)).toBeNull();
    expect(readEpisode(join(dir, 'none.json'))).toBeNull();
  });

  it('picks the forecast issued the day before', () => {
    expect(dayBefore(episode).days_before).toBe(1);
  });
});
