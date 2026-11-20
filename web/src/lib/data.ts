import facilities from '@/data/facilities_veliko_tarnovo.json';
import physicians from '@/data/health_physicians_bg.json';
import population from '@/data/population_veliko_tarnovo.json';
import region from '@/data/region_veliko_tarnovo.json';
import { getSql } from './db';
import type { Datasets, Points, Region, Series } from './types';

export const bundled: Datasets = {
  population: population as unknown as Series,
  physicians: physicians as unknown as Series,
  facilities: facilities as unknown as Points,
};

// The province boundary is bundled only. It does not change between seeds, so it is never read from the database.
export const bundledRegion = region as unknown as Region;

export type LoadResult = { source: 'database' | 'bundled'; datasets: Datasets };

function isSeries(v: unknown): v is Series {
  return typeof v === 'object' && v !== null && Array.isArray((v as Series).series);
}

function isPoints(v: unknown): v is Points {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as Points).points) &&
    typeof (v as Points).counts === 'object'
  );
}

// Database first; bundled JSON when there is no DATABASE_URL, the query fails, or rows are missing.
export async function loadDatasets(): Promise<LoadResult> {
  const sql = getSql();
  if (!sql) return { source: 'bundled', datasets: bundled };
  try {
    const rows = (await sql`select name, payload from datasets`) as {
      name: string;
      payload: unknown;
    }[];
    const byName = new Map(rows.map((r) => [r.name, r.payload]));
    const population = byName.get('population');
    const physicians = byName.get('physicians');
    const facilities = byName.get('facilities');
    if (isSeries(population) && isSeries(physicians) && isPoints(facilities)) {
      return { source: 'database', datasets: { population, physicians, facilities } };
    }
    return { source: 'bundled', datasets: bundled };
  } catch {
    return { source: 'bundled', datasets: bundled };
  }
}
