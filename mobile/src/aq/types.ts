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
  reasons: AqReason[];
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

export type AqModel = {
  name: string;
  trained_rows: number;
  sensors: number;
  holdout: string;
  mae: { model: number; cams: number; persistence: number };
  exceedance_f1?: { model: number; cams: number };
};

export type AqForecast = {
  generated_at: string;
  model: AqModel;
  stations: AqStation[];
};

export type AqSource = 'live' | 'demo';
