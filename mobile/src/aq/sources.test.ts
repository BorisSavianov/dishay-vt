import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freshness, isCleanDay, showSources, sourcesLine } from './sources';
import type { AqDay } from './types';

const sources = { heating: 0.64, traffic: 0.08, regional: 0.15, other: 0.13 };
const day = (pm25_mean: number, impacts: number[] = [], withSources = true): AqDay => ({
  date: '2026-11-21',
  pm10_mean: pm25_mean * 1.6,
  pm25_mean,
  level: 1,
  exceeds_eu_limit: false,
  reasons: impacts.map((impact, i) => ({ feature: `f${i}`, label_bg: `п${i}`, impact })),
  ...(withSources ? { sources } : {}),
});

describe('sourcesLine', () => {
  it('matches the web and the bot, in the fixed order and without „друго“', () => {
    assert.equal(sourcesLine(sources, 'bg'), 'Източници (оценка): отопление 64% · трафик 8% · пренос 15%');
    assert.equal(sourcesLine(sources, 'en'), 'Sources (estimate): heating 64% · traffic 8% · carried in 15%');
  });
});

describe('showSources', () => {
  it('needs the shares and PM2.5 of at least 5', () => {
    assert.equal(showSources(day(4.9)), false);
    assert.equal(showSources(day(5)), true);
    assert.equal(showSources(day(30, [], false)), false);
  });
});

describe('isCleanDay', () => {
  it('is clean on a „Добър“ day, even with a small factor pushing up', () => {
    assert.equal(isCleanDay(day(2, [-0.4, 0.3])), true);
    assert.equal(isCleanDay({ ...day(12, [-0.4]), level: 2 }), false);
  });
});

describe('freshness', () => {
  const now = new Date(2026, 10, 20, 13, 7);
  it('says today and the time, and flags a forecast older than 2 hours', () => {
    assert.deepEqual(freshness(new Date(2026, 10, 20, 12, 51).toISOString(), now), { time: '12:51', today: true, stale: false });
    assert.deepEqual(freshness(new Date(2026, 10, 20, 11, 0).toISOString(), now), { time: '11:00', today: true, stale: true });
    assert.equal(freshness(new Date(2026, 10, 19, 23, 0).toISOString(), now).today, false);
  });
});
