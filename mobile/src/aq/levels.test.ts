import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bestWindow, isBadFor, levelOf, localDate, planAlerts } from './levels';
import { demoForecast } from './mock';
import type { AqStation } from './types';

describe('levelOf', () => {
  it('takes the worse of PM2.5 and PM10', () => {
    assert.equal(levelOf(4, 10), 1);
    assert.equal(levelOf(20, 10), 3);
    assert.equal(levelOf(4, 130), 4);
    assert.equal(levelOf(200, 10), 6);
  });
});

describe('profiles', () => {
  it('warns sensitive groups from level 3 and everyone from level 4', () => {
    assert.equal(isBadFor('asthma', 3), true);
    assert.equal(isBadFor('general', 3), false);
    assert.equal(isBadFor('general', 4), true);
  });
});

describe('demoForecast', () => {
  it('has the contract shape: 72 hours and 3 days per station, a featured VT station', () => {
    const f = demoForecast(new Date(2026, 10, 20, 10, 15));
    assert.ok(f.stations.length > 5);
    assert.ok(f.stations.some((s) => s.featured && s.city === 'Велико Търново'));
    for (const s of f.stations) {
      assert.equal(s.hourly?.length, 72);
      assert.equal(s.daily.length, 3);
      assert.deepEqual(
        s.daily.map((d) => d.date),
        ['2026-11-21', '2026-11-22', '2026-11-23'],
      );
    }
    assert.equal(f.model.kind, 'mock');
  });
});

describe('planAlerts', () => {
  const now = new Date(2026, 10, 20, 10, 0);
  const vt = demoForecast(now).stations[0] as AqStation;

  it('warns the evening before a bad day, once', () => {
    const plan = planAlerts(vt, 'asthma', now, new Set());
    const tomorrow = plan.find((p) => p.day.date === '2026-11-21');
    assert.ok(tomorrow, 'tomorrow is the demo episode');
    assert.equal(tomorrow!.fireAt.getHours(), 19);
    assert.equal(localDate(tomorrow!.fireAt), '2026-11-20');
    const again = planAlerts(vt, 'asthma', now, new Set([tomorrow!.key]));
    assert.equal(again.find((p) => p.day.date === '2026-11-21'), undefined);
  });

  it('warns at once about a bad day already under way', () => {
    const late = new Date(2026, 10, 21, 12, 0);
    const plan = planAlerts(vt, 'asthma', late, new Set());
    const today = plan.find((p) => p.day.date === '2026-11-21');
    assert.ok(today);
    assert.ok(today!.fireAt.getTime() - late.getTime() <= 5000);
  });
});

describe('bestWindow', () => {
  it('finds a daytime window, not the evening peak', () => {
    const now = new Date(2026, 10, 20, 6, 0);
    const vt = demoForecast(now).stations[0]!;
    const w = bestWindow(vt.hourly!, now);
    assert.ok(w);
    const h = new Date(w!.start).getHours();
    assert.ok(h >= 11 && h <= 17, `window starts at ${h}`);
  });
});
