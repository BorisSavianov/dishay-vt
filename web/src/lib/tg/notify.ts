// The hourly alert run: the forecast loop calls /api/telegram/notify, and every alert that is due goes out once.
import { planAlerts } from '@/lib/aq/levels';
import type { AqForecast } from '@/lib/aq/types';
import { stationFor, type BotDeps } from './bot';
import { formatAlert } from './format';
import type { Sub } from './store';
import { TgError } from './telegram';

// The loop runs about hourly. Alerts are planned from one period back, so a 19:00 slot is still caught by the
// run at 19:07 (planAlerts at 19:07 alone would already move it to 07:30 the next morning).
const LOOP_MS = 3600_000;
// planAlerts' "send now" case fires at now + 5 s.
const GRACE_MS = 60_000;

export function dueAlerts(
  subs: Sub[],
  forecast: AqForecast,
  now: Date,
  sent: ReadonlySet<string>,
): { key: string; chatId: number; text: string }[] {
  const from = new Date(now.getTime() - LOOP_MS);
  const out: { key: string; chatId: number; text: string }[] = [];
  for (const sub of subs) {
    const prefix = `${sub.chatId}|`;
    const mine = new Set([...sent].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
    const station = stationFor(forecast, sub.stationId);
    for (const p of planAlerts(station, sub.profile, from, mine)) {
      if (p.fireAt.getTime() > now.getTime() + GRACE_MS) continue;
      out.push({ key: prefix + p.key, chatId: sub.chatId, text: formatAlert(station, sub.profile, p.day, now) });
    }
  }
  return out;
}

export async function notifyAll(deps: Pick<BotDeps, 'store' | 'send' | 'load' | 'now'>): Promise<{ sent: number; skipped?: 'demo' }> {
  const { forecast, source } = await deps.load();
  // Invented numbers never warn anyone.
  if (source === 'demo') return { sent: 0, skipped: 'demo' };
  const due = dueAlerts(await deps.store.active(), forecast, deps.now(), await deps.store.sentKeys());
  let sent = 0;
  for (const a of due) {
    try {
      await deps.send('sendMessage', { chat_id: a.chatId, text: a.text });
      await deps.store.markSent([a.key]);
      sent++;
    } catch (e) {
      if (e instanceof TgError && e.code === 403) await deps.store.deactivate(a.chatId);
      else console.error('tg alert failed', a.chatId, e);
    }
  }
  return { sent };
}
