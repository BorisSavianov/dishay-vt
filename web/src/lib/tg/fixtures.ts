// Test fixtures for the Telegram bot and the alert rule.
import type { AqDay, AqForecast, AqStation } from '@/lib/aq/types';

export const NOW = new Date(2026, 10, 20, 12, 0);

export function day(date: string, level: number, alert_level?: number): AqDay {
  return {
    date,
    pm10_mean: 58,
    pm25_mean: 34,
    level,
    exceeds_eu_limit: true,
    ...(alert_level === undefined ? {} : { alert_level }),
    reasons: [
      { feature: 'pbl_height', label_bg: 'нисък слой на смесване (инверсия)', impact: 11.2 },
      { feature: 'wind_speed', label_bg: 'слаб вятър', impact: 7.4 },
      { feature: 'temp', label_bg: 'студена нощ – отопление', impact: 5.1 },
    ],
  };
}

export function vt(daily: AqDay[]): AqStation {
  return { id: 'sc-35767', name: 'ВТ – център', city: 'Велико Търново', featured: true, lat: 43.0786, lon: 25.6211, latest: null, hourly: [], daily };
}

export function sofia(daily: AqDay[]): AqStation {
  return { id: 'sc-sofia', name: 'София – център', city: 'София', lat: 42.6977, lon: 23.3219, latest: null, hourly: [], daily };
}

export function forecastOf(...stations: AqStation[]): AqForecast {
  return {
    generated_at: '2026-11-20T11:00:00+02:00',
    model: { name: 'lgbm-v1', kind: 'trained', trained_rows: 1, sensors: stations.length, holdout: '2025/26', mae: { model: 6, cams: 16, persistence: 8 } },
    stations,
  };
}
