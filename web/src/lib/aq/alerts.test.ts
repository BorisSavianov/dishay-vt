import { describe, expect, it } from 'vitest';
import { day, NOW, vt } from '@/lib/tg/fixtures';
import { alertLevelOf, planAlerts } from './levels';

describe('alerts use alert_level', () => {
  it('warns on alert_level even when level is lower', () => {
    const plan = planAlerts(vt([day('2026-11-21', 2, 3)]), 'asthma', NOW, new Set());
    expect(plan).toHaveLength(1);
    expect(plan[0]!.fireAt).toEqual(new Date(2026, 10, 20, 19, 0, 0));
  });
  it('falls back to level, and general needs 4', () => {
    expect(planAlerts(vt([day('2026-11-21', 3)]), 'child', NOW, new Set())).toHaveLength(1);
    expect(planAlerts(vt([day('2026-11-21', 3)]), 'general', NOW, new Set())).toHaveLength(0);
  });
  it('alertLevelOf prefers alert_level', () => {
    expect(alertLevelOf(day('2026-11-21', 2, 4))).toBe(4);
    expect(alertLevelOf(day('2026-11-21', 2))).toBe(2);
  });
});
