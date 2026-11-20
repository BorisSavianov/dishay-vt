import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSql } from '../db';
import { demoForecast } from './mock';
import type { AqForecast, AqModel, AqStation } from './types';

// Where the forecast came from. Only 'demo' is invented; the pages and the API say so.
export type AqSource = 'database' | 'bundled' | 'demo';
export type AqLoad = { source: AqSource; forecast: AqForecast };

// Teodor's fallback file, written by ml/aq_forecast.py and committed at the freeze.
export const BUNDLED_PATH = join(process.cwd(), 'src', 'data', 'aq_forecast.json');

// Rows older than this, measured from the newest row, belong to an earlier run and are dropped.
const STALE_MS = 6 * 3600_000;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function isStation(v: unknown): v is AqStation {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.lat === 'number' &&
    typeof v.lon === 'number' &&
    Array.isArray(v.daily) &&
    (v.hourly === undefined || Array.isArray(v.hourly))
  );
}

export function isModel(v: unknown): v is AqModel {
  return isObject(v) && typeof v.name === 'string' && isObject(v.mae);
}

export function isForecast(v: unknown): v is AqForecast {
  return (
    isObject(v) &&
    typeof v.generated_at === 'string' &&
    isModel(v.model) &&
    Array.isArray(v.stations) &&
    v.stations.length > 0 &&
    v.stations.every(isStation)
  );
}

type Sql = NonNullable<ReturnType<typeof getSql>>;

async function fromDatabase(sql: Sql): Promise<AqForecast | null> {
  const [stationRows, modelRows] = (await Promise.all([
    sql`select payload, generated_at from aq_forecast order by station_id`,
    sql`select payload, generated_at from aq_model where id = 1`,
  ])) as [{ payload: unknown; generated_at: string | Date }[], { payload: unknown; generated_at: string | Date }[]];
  const model = modelRows[0]?.payload;
  if (!isModel(model) || stationRows.length === 0) return null;
  const time = (t: string | Date) => new Date(t).getTime();
  const newest = Math.max(...stationRows.map((r) => time(r.generated_at)));
  const stations = stationRows
    .filter((r) => newest - time(r.generated_at) <= STALE_MS)
    .map((r) => r.payload)
    .filter(isStation);
  const forecast = { generated_at: new Date(newest).toISOString(), model, stations };
  return isForecast(forecast) ? forecast : null;
}

export function readBundled(path = BUNDLED_PATH): AqForecast | null {
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isForecast(data) ? data : null;
  } catch {
    return null;
  }
}

// Neon first, then the committed JSON, then the labelled demo forecast. Never throws.
export async function loadForecast(
  opts: { sql?: Sql | null; bundled?: () => AqForecast | null; now?: Date } = {},
): Promise<AqLoad> {
  const sql = opts.sql === undefined ? getSql() : opts.sql;
  if (sql) {
    try {
      const forecast = await fromDatabase(sql);
      if (forecast) return { source: 'database', forecast };
    } catch {
      // Fall through to the bundled file.
    }
  }
  const bundled = (opts.bundled ?? readBundled)();
  if (bundled) return { source: 'bundled', forecast: bundled };
  return { source: 'demo', forecast: demoForecast(opts.now ?? new Date()) };
}

// The list endpoint leaves out `hourly`; the station endpoint has it.
export function withoutHourly(forecast: AqForecast): AqForecast {
  return { ...forecast, stations: forecast.stations.map(({ hourly: _hourly, ...s }) => s) };
}

// The featured station (Veliko Tarnovo), or the first one.
export function featuredStation(forecast: AqForecast): AqStation {
  return forecast.stations.find((s) => s.featured) ?? forecast.stations[0]!;
}
