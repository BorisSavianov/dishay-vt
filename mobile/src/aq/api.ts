// Fetches the forecast from the web app. Falls back to the demo forecast when the API is missing or down,
// and says so (source 'demo'), so the app never shows invented numbers as real.
import { API_BASE } from '../lib/api';
import { demoForecast } from './mock';
import type { AqForecast, AqSource, AqStation } from './types';

const TIMEOUT_MS = 10_000;

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeForecast(x: unknown): x is AqForecast {
  const f = x as AqForecast;
  return !!f && typeof f.generated_at === 'string' && Array.isArray(f.stations) && !!f.model;
}

// The list may leave out `hourly`; fill it for the stations that need it (the home station).
export async function fetchForecast(needHourly: string[] = []): Promise<{ data: AqForecast; source: AqSource; error?: string }> {
  try {
    const data = await getJson<unknown>('/api/aq');
    if (!looksLikeForecast(data)) throw new Error('/api/aq: unexpected shape');
    await Promise.all(
      data.stations
        .filter((s) => needHourly.includes(s.id) && !s.hourly?.length)
        .map(async (s) => {
          try {
            const full = await getJson<AqStation>(`/api/aq/${encodeURIComponent(s.id)}`);
            if (Array.isArray(full.hourly)) s.hourly = full.hourly;
          } catch {
            // Keep the station without hourly data; the screen shows the day cards only.
          }
        }),
    );
    return { data, source: 'live' };
  } catch (e) {
    return { data: demoForecast(), source: 'demo', error: e instanceof Error ? e.message : String(e) };
  }
}
