// Bot subscribers and the alerts already sent. Only the chat id, profile and station are kept: no names.
import type { getSql } from '@/lib/db';
import { PROFILES, type Profile } from '@/lib/aq/levels';

export type Sub = { chatId: number; profile: Profile; stationId: string };

export type Store = {
  get(chatId: number): Promise<Sub | null>; // active subscribers only
  upsert(sub: Sub): Promise<void>; // also reactivates
  deactivate(chatId: number): Promise<void>;
  active(): Promise<Sub[]>;
  sentKeys(): Promise<Set<string>>; // keys sent in the last 4 days
  markSent(keys: string[]): Promise<void>;
};

export function memoryStore(): Store {
  const subs = new Map<number, Sub & { active: boolean }>();
  const sent = new Set<string>();
  return {
    async get(chatId) {
      const s = subs.get(chatId);
      return s?.active ? { chatId: s.chatId, profile: s.profile, stationId: s.stationId } : null;
    },
    async upsert(sub) {
      subs.set(sub.chatId, { ...sub, active: true });
    },
    async deactivate(chatId) {
      const s = subs.get(chatId);
      if (s) s.active = false;
    },
    async active() {
      return [...subs.values()].filter((s) => s.active).map(({ chatId, profile, stationId }) => ({ chatId, profile, stationId }));
    },
    async sentKeys() {
      return new Set(sent);
    },
    async markSent(keys) {
      for (const k of keys) sent.add(k);
    },
  };
}

type Row = { chat_id: string | number; profile: string; station_id: string };
const toSub = (r: Row): Sub | null => {
  const profile = PROFILES.find((p) => p === r.profile);
  return profile ? { chatId: Number(r.chat_id), profile, stationId: r.station_id } : null;
};

export function neonStore(sql: NonNullable<ReturnType<typeof getSql>>): Store {
  return {
    async get(chatId) {
      const rows = (await sql`select chat_id, profile, station_id from tg_subscribers where chat_id = ${chatId} and active`) as Row[];
      return rows[0] ? toSub(rows[0]) : null;
    },
    async upsert(sub) {
      await sql`insert into tg_subscribers (chat_id, profile, station_id, active) values (${sub.chatId}, ${sub.profile}, ${sub.stationId}, true)
                on conflict (chat_id) do update set profile = excluded.profile, station_id = excluded.station_id, active = true`;
    },
    async deactivate(chatId) {
      await sql`update tg_subscribers set active = false where chat_id = ${chatId}`;
    },
    async active() {
      const rows = (await sql`select chat_id, profile, station_id from tg_subscribers where active`) as Row[];
      return rows.map(toSub).filter((s): s is Sub => s !== null);
    },
    async sentKeys() {
      const rows = (await sql`select key from tg_alerts_sent where sent_at > now() - interval '4 days'`) as { key: string }[];
      return new Set(rows.map((r) => r.key));
    },
    async markSent(keys) {
      for (const key of keys) await sql`insert into tg_alerts_sent (key) values (${key}) on conflict (key) do nothing`;
    },
  };
}
