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

export const MODEL_ROW = '_model';

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

// One table: the '_model' row plus one row per station, all from the same run (the writer replaces them together).
async function fromDatabase(sql: Sql): Promise<AqForecast | null> {
  const rows = (await sql`select id, payload from aq_forecast order by id`) as { id: string; payload: unknown }[];
  const head = rows.find((r) => r.id === MODEL_ROW)?.payload as { generated_at?: unknown; model?: unknown } | undefined;
  if (!head || typeof head.generated_at !== 'string') return null;
  const stations = rows.filter((r) => r.id !== MODEL_ROW).map((r) => r.payload);
  const forecast = { generated_at: head.generated_at, model: head.model, stations };
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
  // A forecast whose model is a mock is labelled demo wherever it came from.
  const label = (source: AqSource, forecast: AqForecast): AqLoad => ({
    source: forecast.model.kind === 'mock' ? 'demo' : source,
    forecast,
  });
  if (sql) {
    try {
      const forecast = await fromDatabase(sql);
      if (forecast) return label('database', forecast);
    } catch {
      // Fall through to the bundled file.
    }
  }
  const bundled = (opts.bundled ?? readBundled)();
  if (bundled) return label('bundled', bundled);
  return { source: 'demo', forecast: demoForecast(opts.now ?? new Date()) };
}

// The list endpoint leaves out `hourly`; the station endpoint has it.
export function withoutHourly(forecast: AqForecast): AqForecast {
  return { ...forecast, stations: forecast.stations.map(({ hourly: _hourly, ...s }) => s) };
}

// The centre of Veliko Tarnovo. Many stations around the city are featured; the page opens on the one closest
// to the centre.
export const VT_CENTRE = { lat: 43.0786, lon: 25.6211 };

export function featuredStation(forecast: AqForecast): AqStation {
  const featured = forecast.stations.filter((s) => s.featured);
  const list = featured.length > 0 ? featured : forecast.stations;
  const dist = (s: AqStation) => (s.lat - VT_CENTRE.lat) ** 2 + ((s.lon - VT_CENTRE.lon) * Math.cos((VT_CENTRE.lat * Math.PI) / 180)) ** 2;
  return list.reduce((best, s) => (dist(s) < dist(best) ? s : best), list[0]!);
}
