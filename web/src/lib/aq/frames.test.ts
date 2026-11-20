import { describe, expect, it } from 'vitest';
import { levelCounts, mapFrames } from './frames';
import { levelOf } from './levels';
import { demoForecast } from './mock';

const NOW = new Date(2026, 10, 20, 10, 15);

describe('mapFrames', () => {
  it('builds one time grid from the current hour, at most 72 hours', () => {
    const f = demoForecast(NOW);
    const frames = mapFrames(f, NOW);
    expect(frames.times).toHaveLength(72);
    expect(new Date(frames.times[0]!).getTime()).toBeGreaterThan(NOW.getTime() - 3600_000);
    expect(frames.stations).toHaveLength(f.stations.length);
    const s = f.stations[0]!;
    const h = s.hourly![0]!;
    expect(frames.stations[0]!.levels[0]).toBe(levelOf(h.pm25, h.pm10));
    expect(frames.stations[0]!.pm25[0]).toBe(Math.round(h.pm25));
  });

  it('drops past hours and marks hours a station lacks as 0 / -1', () => {
    const f = demoForecast(NOW);
    const later = new Date(NOW.getTime() + 5 * 3600_000);
    f.stations[1]!.hourly = f.stations[1]!.hourly!.filter((_, i) => i !== 10);
    const frames = mapFrames(f, later);
    expect(frames.times).toHaveLength(67);
    const gap = frames.times.indexOf(f.stations[0]!.hourly![10]!.t);
    expect(frames.stations[1]!.levels[gap]).toBe(0);
    expect(frames.stations[1]!.pm25[gap]).toBe(-1);
  });

  it('counts stations per level for one hour', () => {
    const frames = mapFrames(demoForecast(NOW), NOW);
    const counts = levelCounts(frames, 0);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(frames.stations.length);
  });
});
