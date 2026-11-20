import '@/lib/tg/tz';
import { getSql } from '@/lib/db';
import { handleUpdate, type TgUpdate } from '@/lib/tg/bot';
import { botDeps } from '@/lib/tg/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Telegram's webhook. Only Telegram knows the secret; every authenticated update gets 200, so a failing update
// is logged instead of being retried forever.
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }
  const sql = getSql();
  if (!sql) {
    console.error('tg webhook: DATABASE_URL is not set');
    return new Response('ok');
  }
  try {
    const update = (await req.json()) as TgUpdate;
    await handleUpdate(update, botDeps(sql));
  } catch (e) {
    console.error('tg webhook failed', e);
  }
  return new Response('ok');
}
