// The webhook's logic: /start → profile buttons → the 3-day forecast; 📍 picks the nearest station;
// /stop unsubscribes; /demo (presenters only) sends the labelled smog replay to every subscriber.
import { featuredStation, type AqLoad } from '@/lib/aq/load';
import { PROFILES, type Profile } from '@/lib/aq/levels';
import { profileName } from '@/lib/aq/strings';
import type { AqForecast, AqStation } from '@/lib/aq/types';
import type { Episode } from './episode';
import { formatForecast, formatReplay } from './format';
import type { Store } from './store';
import type { Send } from './telegram';

export type TgUpdate = {
  message?: { chat: { id: number }; text?: string; location?: { latitude: number; longitude: number } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
};

export type BotDeps = {
  store: Store;
  send: Send;
  load: () => Promise<AqLoad>;
  episode: () => Episode | null;
  presenters: ReadonlySet<number>;
  now: () => Date;
};

const PROMPT = 'Здравейте! „Дишай ВТ“ предупреждава вечерта преди ден с мръсен въздух. За кого следим?';
const HELP = '/start – избор на профил и прогноза\n/stop – спиране на известията';
const BYE = 'Известията са спрени. /start – за да ги включите отново.';
const LOCATION_KEYBOARD = { keyboard: [[{ text: '📍 Най-близка станция', request_location: true }]], resize_keyboard: true };

export function stationFor(forecast: AqForecast, stationId: string): AqStation {
  return forecast.stations.find((s) => s.id === stationId) ?? featuredStation(forecast);
}

export function nearestStation(stations: AqStation[], lat: number, lon: number): AqStation {
  const rad = (x: number) => (x * Math.PI) / 180;
  const km = (s: AqStation) => {
    const dLat = rad(s.lat - lat);
    const dLon = rad(s.lon - lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(s.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  };
  return stations.reduce((best, s) => (km(s) < km(best) ? s : best), stations[0]!);
}

const text = (send: Send, chatId: number, body: string, extra: Record<string, unknown> = {}) =>
  send('sendMessage', { chat_id: chatId, text: body, ...extra });

const askProfile = (send: Send, chatId: number) =>
  text(send, chatId, PROMPT, {
    reply_markup: { inline_keyboard: PROFILES.map((p) => [{ text: profileName('bg', p), callback_data: `p:${p}` }]) },
  });

async function replyForecast(deps: BotDeps, chatId: number, profile: Profile, station: AqStation, demo: boolean) {
  await text(deps.send, chatId, formatForecast(station, profile, deps.now(), demo), { reply_markup: LOCATION_KEYBOARD });
}

export async function handleUpdate(update: TgUpdate, deps: BotDeps): Promise<void> {
  const cb = update.callback_query;
  if (cb) {
    await deps.send('answerCallbackQuery', { callback_query_id: cb.id });
    const chatId = cb.message?.chat.id;
    const profile = PROFILES.find((p) => `p:${p}` === cb.data);
    if (chatId === undefined || !profile) return;
    const { forecast, source } = await deps.load();
    const prev = await deps.store.get(chatId);
    const station = stationFor(forecast, prev?.stationId ?? '');
    await deps.store.upsert({ chatId, profile, stationId: station.id });
    await replyForecast(deps, chatId, profile, station, source === 'demo');
    return;
  }

  const m = update.message;
  if (!m) return;
  const chatId = m.chat.id;

  if (m.location) {
    const sub = await deps.store.get(chatId);
    if (!sub) return askProfile(deps.send, chatId);
    const { forecast, source } = await deps.load();
    const station = nearestStation(forecast.stations, m.location.latitude, m.location.longitude);
    await deps.store.upsert({ ...sub, stationId: station.id });
    await replyForecast(deps, chatId, sub.profile, station, source === 'demo');
    return;
  }

  // "/start@DishayVTBot jury" → "/start"
  const command = (m.text ?? '').trim().split(/\s+/)[0]!.split('@')[0]!.toLowerCase();
  switch (command) {
    case '/start':
      return askProfile(deps.send, chatId);
    case '/stop':
      await deps.store.deactivate(chatId);
      return text(deps.send, chatId, BYE, { reply_markup: { remove_keyboard: true } });
    case '/id':
      return text(deps.send, chatId, `Вашият chat id: ${chatId}`);
    case '/demo': {
      if (!deps.presenters.has(chatId)) return text(deps.send, chatId, HELP);
      const ep = deps.episode();
      if (!ep) return text(deps.send, chatId, 'Няма запис за повторение.');
      let sent = 0;
      for (const sub of await deps.store.active()) {
        try {
          await text(deps.send, sub.chatId, formatReplay(ep, sub.profile));
          sent++;
        } catch (e) {
          console.error('tg demo send failed', sub.chatId, e);
        }
      }
      return text(deps.send, chatId, `Изпратено до ${sent}`);
    }
    default:
      return text(deps.send, chatId, HELP);
  }
}
