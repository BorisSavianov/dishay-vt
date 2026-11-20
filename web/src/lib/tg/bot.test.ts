import { describe, expect, it } from 'vitest';
import episodeJson from '@/data/aq_episode.json';
import type { AqLoad } from '@/lib/aq/load';
import { handleUpdate, type BotDeps, type TgUpdate } from './bot';
import { episodeOf } from './episode';
import { day, forecastOf, NOW, sofia, vt } from './fixtures';
import { memoryStore } from './store';

type Call = { method: string; body: Record<string, unknown> };

function harness(presenters: number[] = []) {
  const calls: Call[] = [];
  const store = memoryStore();
  const days = [day('2026-11-21', 3, 4), day('2026-11-22', 2), day('2026-11-23', 1)];
  const load: AqLoad = { source: 'database', forecast: forecastOf(vt(days), sofia(days)) };
  const deps: BotDeps = {
    store,
    send: async (method, body) => {
      calls.push({ method, body });
    },
    load: async () => load,
    episode: () => episodeOf(episodeJson),
    presenters: new Set(presenters),
    now: () => NOW,
  };
  const texts = (chat: number) => calls.filter((c) => c.method === 'sendMessage' && c.body.chat_id === chat).map((c) => String(c.body.text));
  return { calls, store, deps, texts };
}
const msg = (chat: number, text: string): TgUpdate => ({ message: { chat: { id: chat }, text } });
const tap = (chat: number, data: string): TgUpdate => ({ callback_query: { id: 'q1', data, message: { chat: { id: chat } } } });

describe('bot webhook', () => {
  it('/start shows 5 profile buttons', async () => {
    const h = harness();
    await handleUpdate(msg(7, '/start jury'), h.deps);
    const kb = (h.calls[0]!.body.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard.flat();
    expect(kb).toHaveLength(5);
    expect(kb[0]!.callback_data).toBe('p:asthma');
  });

  it('a profile tap subscribes to VT and replies', async () => {
    const h = harness();
    await handleUpdate(tap(7, 'p:child'), h.deps);
    expect(await h.store.get(7)).toEqual({ chatId: 7, profile: 'child', stationId: 'sc-35767' });
    expect(h.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    const reply = h.calls.find((c) => c.method === 'sendMessage')!;
    expect(String(reply.body.text)).toContain('ВТ – център');
    const kb = (reply.body.reply_markup as { keyboard: { request_location?: boolean }[][] }).keyboard;
    expect(kb[0]![0]!.request_location).toBe(true);
  });

  it('a location moves the sub to the nearest station', async () => {
    const h = harness();
    await handleUpdate(tap(7, 'p:child'), h.deps);
    await handleUpdate({ message: { chat: { id: 7 }, location: { latitude: 42.7, longitude: 23.33 } } }, h.deps);
    expect((await h.store.get(7))!.stationId).toBe('sc-sofia');
    expect(h.texts(7).at(-1)).toContain('София – център');
  });

  it('a location before a profile asks for the profile', async () => {
    const h = harness();
    await handleUpdate({ message: { chat: { id: 7 }, location: { latitude: 42.7, longitude: 23.33 } } }, h.deps);
    expect(await h.store.get(7)).toBeNull();
    expect((h.calls[0]!.body.reply_markup as { inline_keyboard: unknown[][] }).inline_keyboard.flat()).toHaveLength(5);
  });

  it('/stop deactivates', async () => {
    const h = harness();
    await handleUpdate(tap(7, 'p:child'), h.deps);
    await handleUpdate(msg(7, '/stop'), h.deps);
    expect(await h.store.active()).toHaveLength(0);
    expect(h.texts(7).at(-1)).toContain('/start');
  });

  it('/demo from a presenter reaches every active sub', async () => {
    const h = harness([99]);
    await h.store.upsert({ chatId: 7, profile: 'child', stationId: 'sc-35767' });
    await h.store.upsert({ chatId: 8, profile: 'asthma', stationId: 'sc-35767' });
    await handleUpdate(msg(99, '/demo'), h.deps);
    expect(h.texts(7)[0]!.startsWith('🔁 Повторение')).toBe(true);
    expect(h.texts(8)[0]!.startsWith('🔁 Повторение')).toBe(true);
    expect(h.texts(99)).toEqual(['Изпратено до 2']);
  });

  it('/demo from anyone else sends nothing to subs', async () => {
    const h = harness([99]);
    await h.store.upsert({ chatId: 7, profile: 'child', stationId: 'sc-35767' });
    await handleUpdate(msg(5, '/demo'), h.deps);
    expect(h.texts(7)).toEqual([]);
    expect(h.texts(5)).toHaveLength(1);
  });

  it('a sub whose station is gone gets VT', async () => {
    const h = harness();
    await h.store.upsert({ chatId: 7, profile: 'child', stationId: 'gone' });
    await handleUpdate(tap(7, 'p:asthma'), h.deps);
    expect((await h.store.get(7))!.stationId).toBe('sc-35767');
    expect(h.texts(7).at(-1)).toContain('ВТ – център');
  });

  it('/id replies with the chat id', async () => {
    const h = harness();
    await handleUpdate(msg(42, '/id'), h.deps);
    expect(h.texts(42)[0]).toContain('42');
  });

  it('the route rejects a wrong secret and returns 200 otherwise', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret';
    delete process.env.DATABASE_URL;
    const { POST } = await import('@/app/api/telegram/route');
    const body = JSON.stringify(msg(7, '/start'));
    expect((await POST(new Request('http://x/api/telegram', { method: 'POST', body }))).status).toBe(401);
    const ok = await POST(
      new Request('http://x/api/telegram', { method: 'POST', body, headers: { 'x-telegram-bot-api-secret-token': 's3cret' } }),
    );
    expect(ok.status).toBe(200);
  });
});
