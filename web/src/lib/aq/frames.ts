import { levelOf } from './levels';
import type { AqForecast } from './types';

// What the map needs per station, hour by hour: small enough to send to the browser for ~300 stations.
export type MapStation = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  featured: boolean;
  levels: number[]; // EAQI 1..6 per hour of `times`; 0 = no forecast for that hour
  pm25: number[]; // rounded µg/m³ per hour; -1 = no forecast
};

export type MapFrames = { times: string[]; stations: MapStation[] };

// One time grid for all stations: the hours from the current hour on, taken from the station with the most hours.
// Stations are matched to the grid by instant, so a station with a gap shows grey for that hour, not a shifted value.
export function mapFrames(forecast: AqForecast, now: Date, maxHours = 72): MapFrames {
  const from = now.getTime() - 3600_000;
  const longest = forecast.stations.reduce<string[]>((best, s) => {
    const ts = (s.hourly ?? []).map((h) => h.t).filter((t) => new Date(t).getTime() > from);
    return ts.length > best.length ? ts : best;
  }, []);
  const times = longest.slice(0, maxHours);
  const grid = times.map((t) => new Date(t).getTime());

  const stations = forecast.stations.map((s) => {
    const byTime = new Map((s.hourly ?? []).map((h) => [new Date(h.t).getTime(), h]));
    const levels: number[] = [];
    const pm25: number[] = [];
    for (const ms of grid) {
      const h = byTime.get(ms);
      levels.push(h ? levelOf(h.pm25, h.pm10) : 0);
      pm25.push(h ? Math.round(h.pm25) : -1);
    }
    return { id: s.id, name: s.name, city: s.city, lat: s.lat, lon: s.lon, featured: !!s.featured, levels, pm25 };
  });
  return { times, stations };
}

// How many stations are at each level in one hour: the map's legend counts.
export function levelCounts(frames: MapFrames, hour: number): Record<number, number> {
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const s of frames.stations) counts[s.levels[hour] ?? 0]! += 1;
  return counts;
}
