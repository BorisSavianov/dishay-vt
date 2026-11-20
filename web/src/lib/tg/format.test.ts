import { describe, expect, it } from 'vitest';
import episodeJson from '@/data/aq_episode.json';
import { advice, air } from '@/lib/aq/strings';
import { episodeOf } from './episode';
import { day, NOW, vt } from './fixtures';
import { formatAlert, formatForecast, formatReplay } from './format';

const s = vt([day('2026-11-21', 3, 4), day('2026-11-22', 2), day('2026-11-23', 1)]);

describe('bot messages', () => {
  it('formats the 3-day reply', () => {
    const t = formatForecast(s, 'asthma', NOW, false);
    expect(t).toContain('ВТ – център · Велико Търново');
    expect(t).toContain('🟡 Сб 21.11 · Умерен · PM10 ~58 µg/m³');
    expect(t).toContain('нисък слой на смесване (инверсия), слаб вятър');
    expect(t).not.toContain('студена нощ');
    expect(t).toContain(`⚠ Утре: ${advice('bg', 'asthma', 4)}`);
    expect(t.endsWith('/stop – спиране.')).toBe(true);
    expect(formatForecast(s, 'asthma', NOW, true).startsWith(air('bg', 'air.demo'))).toBe(true);
  });
  it('says clean air when no day is bad for the profile', () => {
    expect(formatForecast(vt([day('2026-11-21', 3)]), 'general', NOW, false)).toContain(`✅ ${advice('bg', 'general', 1)}`);
  });
  it('adds the sources estimate for the first day', () => {
    const sources = { heating: 0.64, traffic: 0.08, regional: 0.15, other: 0.13 };
    const dirty = vt([{ ...day('2026-11-21', 3), sources }, day('2026-11-22', 2)]);
    expect(formatForecast(dirty, 'asthma', NOW, false)).toContain('Източници (оценка): отопление 64% · трафик 8% · пренос 15%');
    const clean = vt([{ ...day('2026-11-21', 1), pm25_mean: 4, sources }]);
    expect(formatForecast(clean, 'asthma', NOW, false)).not.toContain('Източници');
  });
  it('formats an alert at the alert level', () => {
    const t = formatAlert(s, 'child', day('2026-11-21', 2, 3), NOW);
    expect(t.split('\n')[0]).toBe('🟡 Утре: умерен въздух в Велико Търново');
    expect(t).toContain(advice('bg', 'child', 3));
  });
  it('formats the replay from the real episode file', () => {
    const t = formatReplay(episodeOf(episodeJson)!, 'asthma');
    expect(t.split('\n')[0]).toBe('🔁 Повторение от 18.12.2025: реален смог във Велико Търново, предупреден ден по-рано');
    expect(t).toContain('Прогноза от 17.12, 12:00: 🟡 Умерен · PM10 ~36');
    expect(t).toContain('Измерено: 🟡 Умерен · PM10 ~69 · над нормата на ЕС');
    expect(t).toContain('CAMS: PM10 ~22');
    expect(t).toContain(advice('bg', 'asthma', 3));
    expect(t).toContain('18 от 23');
  });
  it('rejects a malformed episode', () => {
    expect(episodeOf({ date: '2025-12-18' })).toBeNull();
  });
});
