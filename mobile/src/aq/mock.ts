// A demo forecast with the contract's shape, built around the current hour. The app shows it, labelled
// "демо данни", until /api/aq answers. Stations are real sensor.community sensors (checked 20.11.2026);
// the numbers are invented: a quiet today and a smoggy evening tomorrow, so the alert path can be shown.
// Pure module: node:test reads it.
import { EU_PM10_DAILY_LIMIT, levelOf, localDate } from './levels';
import type { AqDay, AqForecast, AqHour, AqStation } from './types';

type Seed = { id: string; name: string; city: string; lat: number; lon: number; base: number; featured?: boolean };

const SEEDS: Seed[] = [
  { id: 'sc-35767', name: 'ВТ – Център', city: 'Велико Търново', lat: 43.0786, lon: 25.6211, base: 1, featured: true },
  { id: 'sc-66083', name: 'ВТ – Бузлуджа', city: 'Велико Търново', lat: 43.0738, lon: 25.6249, base: 1.1 },
  { id: 'sc-41885', name: 'ВТ – Картала', city: 'Велико Търново', lat: 43.084, lon: 25.616, base: 0.9 },
  { id: 'sc-63801', name: 'ВТ – Акация', city: 'Велико Търново', lat: 43.06, lon: 25.624, base: 1.2 },
  { id: 'sc-98556', name: 'ВТ – Колю Фичето', city: 'Велико Търново', lat: 43.074, lon: 25.628, base: 1.05 },
  { id: 'sc-37065', name: 'ВТ – Запад', city: 'Велико Търново', lat: 43.08, lon: 25.55, base: 0.8 },
  { id: 'sc-14776', name: 'Самоводене', city: 'Самоводене', lat: 43.124, lon: 25.686, base: 0.85 },
  { id: 'sc-9522', name: 'Горна Оряховица', city: 'Горна Оряховица', lat: 43.016, lon: 25.784, base: 1.3 },
  { id: 'sc-76712', name: 'Арбанаси', city: 'Арбанаси', lat: 43.154, lon: 25.658, base: 0.6 },
  { id: 'demo-sofia', name: 'София – Надежда', city: 'София', lat: 42.733, lon: 23.31, base: 1.4 },
  { id: 'demo-plovdiv', name: 'Пловдив – Каменица', city: 'Пловдив', lat: 42.14, lon: 24.75, base: 1.35 },
  { id: 'demo-ruse', name: 'Русе – Възраждане', city: 'Русе', lat: 43.85, lon: 25.96, base: 1.25 },
  { id: 'demo-varna', name: 'Варна – Чайка', city: 'Варна', lat: 43.21, lon: 27.92, base: 0.7 },
  { id: 'demo-gabrovo', name: 'Габрово – Център', city: 'Габрово', lat: 42.874, lon: 25.318, base: 1.2 },
];

// Heating-season shape: a morning bump, an evening peak, quiet afternoons.
function diurnal(hour: number): number {
  const evening = Math.exp(-((hour - 21) ** 2) / 8);
  const morning = 0.45 * Math.exp(-((hour - 8) ** 2) / 4);
  return 0.55 + evening + morning;
}

// Tomorrow is the bad day: a calm, cold night with an inversion.
function episode(dayOffset: number): number {
  return [1, 3.8, 1.6, 1][dayOffset] ?? 1;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function demoForecast(now = new Date()): AqForecast {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const stations: AqStation[] = SEEDS.map((s, si) => {
    const hourly: AqHour[] = [];
    for (let i = 0; i < 72; i++) {
      const t = new Date(start.getTime() + i * 3600_000);
      const dayOffset = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - today.getTime()) / 86400_000);
      const wobble = 1 + 0.08 * Math.sin(i * 0.9 + si);
      const pm25 = 11 * s.base * diurnal(t.getHours()) * episode(dayOffset) * wobble;
      const spread = 0.18 + 0.006 * i;
      hourly.push({
        t: t.toISOString(),
        pm25: r1(pm25),
        pm10: r1(pm25 * 1.55),
        pm25_lo: r1(pm25 * (1 - spread)),
        pm25_hi: r1(pm25 * (1 + spread * 1.3)),
        cams_pm25: r1(pm25 * (0.72 + 0.1 * Math.sin(i / 7))),
      });
    }

    // Contract: daily covers tomorrow, +2 and +3; the last day reaches past the 72 hours, so it is built per hour here.
    const daily: AqDay[] = [];
    for (let d = 1; d <= 3; d++) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d);
      const date = localDate(day);
      let sum25 = 0;
      for (let h = 0; h < 24; h++) sum25 += 11 * s.base * diurnal(h) * episode(d) * (1 + 0.08 * Math.sin(h * 0.9 + si));
      const pm25 = sum25 / 24;
      const pm10 = pm25 * 1.55;
      daily.push({
        date,
        pm25_mean: r1(pm25),
        pm10_mean: r1(pm10),
        level: levelOf(pm25, pm10),
        exceeds_eu_limit: pm10 > EU_PM10_DAILY_LIMIT,
        reasons:
          d === 1
            ? [
                { feature: 'pbl_height', label_bg: 'нисък слой на смесване (инверсия)', label_en: 'low mixing layer (inversion)', impact: 11.2 },
                { feature: 'wind_speed', label_bg: 'слаб вятър', label_en: 'weak wind', impact: 7.4 },
                { feature: 'temp', label_bg: 'студена нощ – отопление', label_en: 'cold night – heating', impact: 5.1 },
              ]
            : [
                { feature: 'wind_speed', label_bg: 'умерен вятър разсейва', label_en: 'moderate wind disperses', impact: -4.2 },
                { feature: 'hour', label_bg: 'вечерно отопление', label_en: 'evening heating', impact: 3.1 },
                { feature: 'precip', label_bg: 'без валежи', label_en: 'no rain', impact: 1.4 },
              ],
      });
    }

    const first = hourly[0]!;
    return {
      id: s.id,
      name: s.name,
      city: s.city,
      featured: s.featured,
      lat: s.lat,
      lon: s.lon,
      latest: { t: new Date(now.getTime() - 4 * 60_000).toISOString(), pm25: first.pm25, pm10: first.pm10 },
      hourly,
      daily,
    };
  });

  return {
    generated_at: start.toISOString(),
    model: {
      name: 'demo',
      kind: 'mock',
      trained_rows: 0,
      sensors: stations.length,
      holdout: '—',
      mae: { model: 0, cams: 0, persistence: 0 },
    },
    stations,
  };
}
