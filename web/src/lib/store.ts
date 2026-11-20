import { getSql } from './db';

export type CacheHit = { text: string; provider: string };

export interface Store {
  getCache(key: string): Promise<CacheHit | null>;
  putCache(key: string, hit: CacheHit): Promise<void>;
  // Counts one request in the current window. True while the count is within the limit.
  allow(key: string, windowMs: number, limit: number): Promise<boolean>;
}

export function createMemoryStore(): Store {
  const cache = new Map<string, CacheHit>();
  const counts = new Map<string, number>();
  return {
    async getCache(key) {
      return cache.get(key) ?? null;
    },
    async putCache(key, hit) {
      cache.set(key, hit);
    },
    async allow(key, windowMs, limit) {
      const id = `${key}:${Math.floor(Date.now() / windowMs)}`;
      const next = (counts.get(id) ?? 0) + 1;
      counts.set(id, next);
      return next <= limit;
    },
  };
}

type Sql = NonNullable<ReturnType<typeof getSql>>;

function createNeonStore(sql: Sql): Store {
  return {
    async getCache(key) {
      const rows = (await sql`select text, provider from ai_cache where key = ${key} limit 1`) as CacheHit[];
      return rows[0] ?? null;
    },
    async putCache(key, hit) {
      await sql`insert into ai_cache (key, text, provider) values (${key}, ${hit.text}, ${hit.provider})
                on conflict (key) do nothing`;
    },
    async allow(key, windowMs, limit) {
      const start = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
      const rows = (await sql`insert into rate_limits (key, window_start, count) values (${key}, ${start}, 1)
                              on conflict (key, window_start) do update set count = rate_limits.count + 1
                              returning count`) as { count: number }[];
      return Number(rows[0]?.count ?? 0) <= limit;
    },
  };
}

// If the database fails, the memory store answers instead, so a DB outage never breaks the demo.
function withFallback(primary: Store, fallback: Store): Store {
  return {
    async getCache(key) {
      try {
        return await primary.getCache(key);
      } catch {
        return fallback.getCache(key);
      }
    },
    async putCache(key, hit) {
      try {
        await primary.putCache(key, hit);
      } catch {
        await fallback.putCache(key, hit);
      }
    },
    async allow(key, windowMs, limit) {
      try {
        return await primary.allow(key, windowMs, limit);
      } catch {
        return fallback.allow(key, windowMs, limit);
      }
    },
  };
}

let shared: Store | undefined;

export function getStore(): Store {
  if (!shared) {
    const sql = getSql();
    const memory = createMemoryStore();
    shared = sql ? withFallback(createNeonStore(sql), memory) : memory;
  }
  return shared;
}
