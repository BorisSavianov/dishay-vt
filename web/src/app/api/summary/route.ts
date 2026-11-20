import { NextResponse } from 'next/server';
import { loadDatasets } from '@/lib/data';
import { summarize } from '@/lib/summary';
import type { DatasetName, Lang } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATASETS: DatasetName[] = ['population', 'physicians', 'facilities'];
const LANGS: Lang[] = ['bg', 'en'];

export async function POST(req: Request) {
  const raw: unknown = await req.json().catch(() => null);
  const body: Record<string, unknown> = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const dataset = DATASETS.find((d) => d === body.dataset);
  const lang = LANGS.find((l) => l === body.lang);
  if (!dataset || !lang) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { datasets } = await loadDatasets();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const result = await summarize({ dataset, lang, ip, datasets });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
