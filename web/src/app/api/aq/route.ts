import { aqJson } from '@/lib/aq/http';
import { loadForecast, withoutHourly } from '@/lib/aq/load';
import { preflight } from '@/lib/ml/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Every station with `latest` and 3 `daily` items, without `hourly`. `source` says where the numbers came from;
// 'demo' means invented numbers that the clients must label.
export async function GET() {
  const { source, forecast } = await loadForecast();
  return aqJson({ ...withoutHourly(forecast), source }, source);
}

export function OPTIONS() {
  return preflight();
}
