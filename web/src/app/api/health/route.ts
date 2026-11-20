import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { bundled, loadDatasets } from '@/lib/data';
import { loadModel, modelRef } from '@/lib/ml/model';
import { loadForecast } from '@/lib/aq/load';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reports which pieces are configured. Never returns a key or a connection string.
export async function GET() {
  const sql = getSql();
  let database: 'ok' | 'unreachable' | 'not_configured' = 'not_configured';
  if (sql) {
    try {
      await sql`select 1`;
      database = 'ok';
    } catch {
      database = 'unreachable';
    }
  }
  const { source } = await loadDatasets();
  const model = loadModel();
  const aq = await loadForecast();
  const body = {
    ok: true,
    database,
    dataSource: source,
    bundledRows: bundled.population.series.length,
    ai: {
      groq: Boolean(process.env.GROQ_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      mockOnly: process.env.MOCK_LLM === '1',
    },
    model: model ? modelRef(model) : null,
    aq: { source: aq.source, generated_at: aq.forecast.generated_at, model: aq.forecast.model.name, stations: aq.forecast.stations.length },
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
