import type { ApiErrorBody, ErrorCode, Issue } from './types';

// The ML routes are public and carry no cookies or keys, so any origin may call them
// (the web app, Expo web, and native apps, which do not enforce CORS anyway).
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } });
}

export function apiError(status: number, code: ErrorCode, message: string, details?: Issue[]): Response {
  const body: ApiErrorBody = { ok: false, error: { code, message, ...(details?.length ? { details } : {}) } };
  return json(body, status);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
