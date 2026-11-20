import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STORY_FACTS } from './facts';
import { BAR_LAYOUT, barTargets, smogDensity, streamTargets, SMOG_PM10_MAX } from './smog';

const episode = JSON.parse(readFileSync(new URL('../../data/aq_episode.json', import.meta.url), 'utf8')) as {
  observed: { pm10: number }[];
};

describe('smogDensity', () => {
  it('is 1 at the hour of the highest PM10 (180.4)', () => {
    const peak = episode.observed.findIndex((h) => h.pm10 === 180.4);
    expect(peak).toBeGreaterThanOrEqual(0);
    expect(smogDensity(episode.observed, peak)).toBe(1);
    expect(SMOG_PM10_MAX).toBe(180);
  });

  it('follows the real hourly PM10 at whole hours', () => {
    expect(smogDensity(episode.observed, 0)).toBeCloseTo(episode.observed[0]!.pm10 / 180, 6);
  });

  it('interpolates between hours', () => {
    const h = [{ pm10: 18 }, { pm10: 36 }];
    expect(smogDensity(h, 0.5)).toBeCloseTo(27 / 180, 6);
  });

  it('clamps to [0, 1] and handles an empty series', () => {
    expect(smogDensity([{ pm10: 900 }], 0)).toBe(1);
    expect(smogDensity([{ pm10: -5 }], 0)).toBe(0);
    expect(smogDensity([], 3)).toBe(0);
    expect(smogDensity([{ pm10: 90 }], 30)).toBeCloseTo(0.5, 6);
  });
});

describe('barTargets', () => {
  it('builds two bars whose heights follow the MAE ratio', () => {
    const { positions, group } = barTargets(10000, STORY_FACTS.maeVt);
    let maxModel = 0;
    let maxCams = 0;
    for (let i = 0; i < 10000; i++) {
      const y = positions[i * 3 + 1]! - BAR_LAYOUT.base;
      if (group[i] === 0) maxModel = Math.max(maxModel, y);
      else maxCams = Math.max(maxCams, y);
    }
    expect(maxCams / maxModel).toBeCloseTo(6.1 / 3.2, 1);
  });

  it('splits particles in proportion to the bar heights', () => {
    const { group } = barTargets(9300, { model: 3.2, cams: 6.1 });
    const model = group.filter((g) => g === 0).length;
    expect(model).toBeGreaterThan(3150);
    expect(model).toBeLessThan(3250);
  });
});

describe('streamTargets', () => {
  it('gives each source a share of particles', () => {
    const { group } = streamTargets(10000, STORY_FACTS.sources);
    const count = (g: number) => group.filter((x) => x === g).length;
    expect(Math.abs(count(0) - 4500)).toBeLessThanOrEqual(1);
    expect(Math.abs(count(1) - 2500)).toBeLessThanOrEqual(1);
    expect(Math.abs(count(2) - 2700)).toBeLessThanOrEqual(1);
    expect(Math.abs(count(3) - 300)).toBeLessThanOrEqual(1);
  });

  it('is deterministic for a seed', () => {
    expect(streamTargets(100, STORY_FACTS.sources, 7).positions).toEqual(streamTargets(100, STORY_FACTS.sources, 7).positions);
  });
});
