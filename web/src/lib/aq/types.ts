// Copied from mobile/src/aq/types.ts (Boris), plus the optional model fields the web's „Защо?“ page reads.
// The air-quality forecast contract (docs/hackathon-plan.md, contract/CONTRACT.md "Air quality").
// Pure module: node:test reads it.

export type AqReason = { feature: string; label_bg: string; label_en?: string; impact: number };

export type AqHour = {
  t: string; // ISO time with offset
  pm25: number;
  pm10: number;
  pm25_lo?: number;
  pm25_hi?: number;
  cams_pm25?: number;
};

export type AqDay = {
  date: string; // YYYY-MM-DD, local
  pm10_mean: number;
  pm25_mean: number;
  level: number; // EEA EAQI 1..6
  exceeds_eu_limit: boolean; // PM10 daily mean > 50 µg/m³
  alert_level?: number; // sent by the live forecast; not in the contract yet
  reasons: AqReason[];
  sources?: AqSources; // featured VT stations only: estimated PM2.5 shares, summing to 1
};

// „Кой замърсява?“: an estimate from citizen sensors and weather, not a measurement.
export type AqSources = { heating: number; traffic: number; regional: number; other: number };

// „Ако 20% от домовете на дърва сменят отоплението“: also an estimate (contract/CONTRACT.md `model.sources_what_if`).
export type AqWhatIf = {
  method: 'estimate';
  switch_share: number;
  date: string; // the evening the drop is computed for
  evening_drop_pm25: number; // µg/m³, mean over that date's 18:00–23:59
  last_winter?: {
    from?: string;
    to?: string;
    bad_days: number;
    bad_days_after: number;
    days: number;
    shares?: AqSources;
  };
};

export type AqStation = {
  id: string;
  name: string;
  city: string;
  featured?: boolean;
  lat: number;
  lon: number;
  latest: { t: string; pm25: number; pm10: number } | null;
  hourly?: AqHour[]; // 72 items; the list endpoint may leave it out
  daily: AqDay[]; // 3 items
};

export type AqMae = { model: number; cams: number; persistence: number };

// The forecast scored with the real weather forecast (replay, 1–19 Nov 2026) and live since the loop started.
export type AqScoreboard = {
  updated_at: string;
  replay?: {
    from: string;
    to: string;
    issued_local: string;
    models: string;
    weather: string;
    blh: 'none' | 'era5' | string; // "era5" = observed boundary-layer height: the page must say so
    days: number;
    mae_pm25_next_day: { vt: AqMae; bg: AqMae };
    vt_days: { date: string; model_pm10: number; cams_pm10: number; observed_pm10: number; model_level: number; observed_level: number }[];
  };
  live?: { since: string; checked_hours: number; horizons: string; mae_pm25: AqMae };
};

export type AqModel = {
  name: string;
  kind?: 'mock' | 'trained' | string; // "mock" = invented numbers, label them as demo
  trained_rows: number;
  sensors: number;
  holdout: string;
  mae: AqMae;
  exceedance_f1?: { model: number; cams: number };
  // Optional extras for the „Защо?“ page (contract/CONTRACT.md), all on the winter 2025/26 holdout, PM2.5.
  mae_vt?: AqMae; // Veliko Tarnovo stations only, 24 h
  mae_by_horizon?: ({ h: number } & AqMae)[];
  importance?: { group: string; label_bg: string; label_en?: string; share: number }[];
  algorithm?: string; // e.g. "XGBoost" from v2
  band_coverage?: number; // share of measured values inside pm25_lo..pm25_hi on the holdout (target 0.8)
  sources_what_if?: AqWhatIf;
  scoreboard?: AqScoreboard; // „Проверка на живо“ (contract/CONTRACT.md `model.scoreboard`)
};

export type AqForecast = {
  generated_at: string;
  model: AqModel;
  stations: AqStation[];
};

export type AqSource = 'live' | 'demo';
