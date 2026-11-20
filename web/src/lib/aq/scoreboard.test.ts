import { describe, expect, it } from 'vitest';
import { scoreboardView } from './scoreboard';
import { air } from './strings';
import type { AqScoreboard } from './types';

// The contract's example block (contract/CONTRACT.md, `model.scoreboard`).
const example: AqScoreboard = {
  updated_at: '2026-11-20T13:07:00+02:00',
  replay: {
    from: '2026-11-01',
    to: '2026-11-19',
    issued_local: '12:00',
    models: 'trained before winter 2025/26',
    weather: 'forecast',
    blh: 'none',
    days: 19,
    mae_pm25_next_day: { vt: { model: 3.4, cams: 6.0, persistence: 4.9 }, bg: { model: 3.0, cams: 7.7, persistence: 4.2 } },
    vt_days: [{ date: '2026-11-02', model_pm10: 41.0, cams_pm10: 22.0, observed_pm10: 45.3, model_level: 2, observed_level: 2 }],
  },
  live: { since: '2026-11-20T10:00:00+02:00', checked_hours: 37, horizons: '1–6 h', mae_pm25: { model: 2.1, cams: 4.0, persistence: 2.6 } },
};

describe('scoreboardView', () => {
  it('is null without a scoreboard or a replay', () => {
    expect(scoreboardView(undefined, 'bg')).toBeNull();
    expect(scoreboardView({ ...example, replay: undefined }, 'bg')).toBeNull();
  });

  it('says how much more accurate than CAMS for Veliko Tarnovo', () => {
    const view = scoreboardView(example, 'bg')!;
    expect(view.headline).toContain('43%');
    expect(view.bars.map((b) => b.area)).toEqual(['vt', 'bg']);
    expect(view.days).toHaveLength(1);
  });

  it('says so when the mixing layer is observed, not forecast', () => {
    const view = scoreboardView({ ...example, replay: { ...example.replay!, blh: 'era5' } }, 'bg')!;
    expect(view.note).toBe(air('bg', 'sb.note.era5'));
    expect(scoreboardView(example, 'bg')!.note).toBe(air('bg', 'sb.note.none'));
  });

  it('has no live strip before the first scored hour', () => {
    expect(scoreboardView({ ...example, live: undefined }, 'bg')!.live).toBeNull();
  });

  it('counts the checked hours in the live strip', () => {
    expect(scoreboardView(example, 'bg')!.live).toContain('37 проверени часа');
    expect(scoreboardView(example, 'en')!.live).toContain('37 checked hours');
  });
});
