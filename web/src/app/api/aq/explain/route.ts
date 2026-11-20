import { NextResponse } from 'next/server';
import { buildAqFacts, EXPLAIN_SYSTEM } from '@/lib/aq/explain';
import { PROFILES } from '@/lib/aq/levels';
import { featuredStation, loadForecast } from '@/lib/aq/load';
import { groundedText } from '@/lib/summary';
import type { Lang } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LANGS: Lang[] = ['bg', 'en'];

// POST { station?, profile, lang } -> { text, provider, cached, reason? }. The AI may only restate the facts
// built from the forecast; without a key, or when its answer has a number not in the facts, the facts are returned.
export async function POST(req: Request) {
  const raw: unknown = await req.json().catch(() => null);
  const body: Record<string, unknown> = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const profile = PROFILES.find((p) => p === body.profile);
  const lang = LANGS.find((l) => l === body.lang);
  if (!profile || !lang) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const { forecast } = await loadForecast();
  const station =
    typeof body.station === 'string' ? forecast.stations.find((s) => s.id === body.station) : featuredStation(forecast);
  if (!station) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const facts = buildAqFacts(station, profile, lang, forecast.generated_at, new Date());
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const result = await groundedText({
    facts,
    lang,
    cacheParts: ['aq', station.id, profile, lang, forecast.generated_at],
    ip,
    system: EXPLAIN_SYSTEM,
  });
  return NextResponse.json({ ...result, station: station.id, profile }, { headers: { 'Cache-Control': 'no-store' } });
}
