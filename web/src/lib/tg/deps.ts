// The real dependencies of the bot, read from the environment.
import episodeJson from '@/data/aq_episode.json';
import { loadForecast } from '@/lib/aq/load';
import type { getSql } from '@/lib/db';
import type { BotDeps } from './bot';
import { episodeOf } from './episode';
import { neonStore } from './store';
import { botSend } from './telegram';

export function presenterIds(raw = process.env.TELEGRAM_PRESENTER_IDS ?? ''): Set<number> {
  return new Set(
    raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n !== 0),
  );
}

export function botDeps(sql: NonNullable<ReturnType<typeof getSql>>): BotDeps {
  return {
    store: neonStore(sql),
    send: botSend(process.env.TELEGRAM_BOT_TOKEN ?? ''),
    load: () => loadForecast({ sql }),
    episode: () => episodeOf(episodeJson),
    presenters: presenterIds(),
    now: () => new Date(),
  };
}
