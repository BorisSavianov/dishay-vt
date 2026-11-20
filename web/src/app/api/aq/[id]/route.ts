import { aqJson } from '@/lib/aq/http';
import { loadForecast } from '@/lib/aq/load';
import { preflight } from '@/lib/ml/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One station in full, with 72 `hourly` items.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { source, forecast } = await loadForecast();
  const station = forecast.stations.find((s) => s.id === id);
  if (!station) {
    return aqJson({ ok: false, error: { code: 'not_found', message: `No station with id ${id}.` } }, source, 404);
  }
  return aqJson({ ...station, source }, source);
}

export function OPTIONS() {
  return preflight();
}
