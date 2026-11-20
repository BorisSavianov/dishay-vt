import { describe, expect, it } from 'vitest';
import type { AqLoad } from '@/lib/aq/load';
import { day, forecastOf, NOW, vt } from './fixtures';
import { dueAlerts, notifyAll } from './notify';
import { memoryStore, type Sub } from './store';
import { TgError } from './telegram';

const sub: Sub = { chatId: 7, profile: 'child', stationId: 'sc-35767' };
const f = forecastOf(vt([day('2026-11-21', 2, 3)]));
const evening = new Date(2026, 10, 20, 19, 7);

function deps(load: AqLoad, failFor: number[] = []) {
  const store = memoryStore();
  const sent: number[] = [];
  return {
    sent,
    store,
    deps: {
      store,
      load: async () => load,
      now: () => evening,
      send: async (_method: string, body: Record<string, unknown>) => {
        const chat = Number(body.chat_id);
        if (failFor.includes(chat)) throw new TgError(403, 'Forbidden: bot was blocked by the user');
        sent.push(chat);
      },
    },
  };
}

describe('due alerts', () => {
  it('sends at 19:00 the evening before, once', () => {
    const due = dueAlerts([sub], f, evening, new Set());
    expect(due.map((d) => d.key)).toEqual(['7|sc-35767|2026-11-21|child']);
    expect(due[0]!.text.split('\n')[0]).toContain('Утре');
    expect(dueAlerts([sub], f, evening, new Set(['7|sc-35767|2026-11-21|child']))).toHaveLength(0);
  });
  it('waits until the time', () => expect(dueAlerts([sub], f, NOW, new Set())).toHaveLength(0));
  it('sends right away when the window has passed and the day is on', () =>
    expect(dueAlerts([sub], f, new Date(2026, 10, 21, 9, 0), new Set())).toHaveLength(1));
  it('general needs 4', () => expect(dueAlerts([{ ...sub, profile: 'general' }], f, evening, new Set())).toHaveLength(0));
  it('a gone station falls back to VT', () =>
    expect(dueAlerts([{ ...sub, stationId: 'gone' }], f, evening, new Set())).toHaveLength(1));
  it("another chat's sent key does not block this chat", () =>
    expect(dueAlerts([sub], f, evening, new Set(['8|sc-35767|2026-11-21|child']))).toHaveLength(1));
});

describe('notifyAll', () => {
  it('never alerts from a demo forecast', async () => {
    const h = deps({ source: 'demo', forecast: f });
    await h.store.upsert(sub);
    expect(await notifyAll(h.deps)).toEqual({ sent: 0, skipped: 'demo' });
    expect(h.sent).toEqual([]);
  });
  it('a second run sends nothing new', async () => {
    const h = deps({ source: 'database', forecast: f });
    await h.store.upsert(sub);
    expect((await notifyAll(h.deps)).sent).toBe(1);
    expect((await notifyAll(h.deps)).sent).toBe(0);
  });
  it('a blocked chat is deactivated, others still get theirs', async () => {
    const h = deps({ source: 'database', forecast: f }, [7]);
    await h.store.upsert(sub);
    await h.store.upsert({ ...sub, chatId: 8 });
    expect((await notifyAll(h.deps)).sent).toBe(1);
    expect(h.sent).toEqual([8]);
    expect((await h.store.active()).map((s) => s.chatId)).toEqual([8]);
  });
  it('runs on Sofia time on a UTC server', async () => {
    process.env.TZ = 'UTC';
    await import('./tz');
    expect(new Date(2026, 10, 20, 19).getUTCHours()).toBe(17);
  });
});
