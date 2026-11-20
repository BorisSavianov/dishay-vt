import '@/lib/tg/tz';
import { getSql } from '@/lib/db';
import { botDeps } from '@/lib/tg/deps';
import { notifyAll } from '@/lib/tg/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Called by ml/aq_forecast.py after each hourly forecast (Vercel Hobby cron runs only daily).
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_NOTIFY_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const sql = getSql();
  if (!sql) return Response.json({ ok: false, error: 'no_database' }, { status: 503 });
  const result = await notifyAll(botDeps(sql));
  return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
}
