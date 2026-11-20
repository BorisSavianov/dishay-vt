import { CORS_HEADERS } from '../ml/http';
import type { AqSource } from './load';

// The forecast changes once an hour, so the edge may serve it for 5 minutes and a stale copy while it refreshes.
const CACHE = 'public, s-maxage=300, stale-while-revalidate=600';

export function aqJson(body: unknown, source: AqSource, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, 'Cache-Control': status === 200 ? CACHE : 'no-store', 'X-Data-Source': source },
  });
}
