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
};

export type AqForecast = {
  generated_at: string;
  model: AqModel;
  stations: AqStation[];
};

export type AqSource = 'live' | 'demo';
