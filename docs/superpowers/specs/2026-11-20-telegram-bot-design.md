# Telegram alert bot („Дишай ВТ“ bot): design

Owner: Boris. Slot: 11:45–14:00, 20.11.2026. Size: small project (short design).

## Why

- **On stage:** the jury scans a QR on slide 5 and gets the real forecast for their profile on their own phones. This targets the "Работещ прототип" line (25 pts) and the „Решението, което най-много би помогнало на хората“ prize.
- **After the hackathon:** it reaches parents and elderly people who won't install an app.

## Goals

- `/start` → choose a profile → choose a station → an instant reply with the next 3 days for that profile. This works even on a clean-air day.
- Real day-before alerts, using the same rule and timing as the app.
- `/demo` (presenter only) sends every subscriber last winter's real smog episode, labelled as a replay.
- `/stop` unsubscribes.

## Non-goals and anti-goals

- **Non-goals:**
  - Viber, which now needs a paid partner account for new bots.
  - English. The bot is Bulgarian only.
  - Free-text chat or the AI summary.
- **Anti-goals:**
  - A replay that could pass for a live forecast. Every `/demo` message says „Повторение от <date>“.
  - Storing names or usernames. We keep only the chat id, profile and station.
  - The bot dying on stage because a laptop slept.

## Approaches

| | Approach | Trade-off | |
|---|---|---|---|
| A | **Vercel webhook** in `web/` (`/api/telegram`), subscribers in Neon. Teodor's hourly forecast loop POSTs `/api/telegram/notify` to send any alerts that are due. | Always up, reuses `/api/aq` and `web/src/lib/aq/*`, adds only new files. Needs a one-time `setWebhook`. | **Picked** |
| B | A Python long-polling bot on Teodor's PC, next to `ml/aq_forecast.py` | No webhook, but the PC and the venue Wi-Fi become a single point of failure on stage, and Boris has to move into the ML code | Rejected |

Vercel Hobby cron runs only once a day, so the hourly trigger comes from the forecast loop rather than from cron.

## Design

**Routes** (Node runtime). I'll call the Bot API with plain `fetch`, with no new dependency:

- **`POST /api/telegram`**: the webhook.
  - It rejects the request unless `X-Telegram-Bot-Api-Secret-Token` equals `TELEGRAM_WEBHOOK_SECRET`.
  - It handles `/start [payload]`, the profile buttons (inline keyboard), the station choice and `/stop`. The station is either "ВТ – център" or "📍 Най-близка", which uses a reply-keyboard `request_location` and the haversine distance to the nearest station.
  - It handles `/demo` only from the chat ids in `TELEGRAM_PRESENTER_IDS`.
- **`POST /api/telegram/notify`**: needs `Authorization: Bearer $TELEGRAM_NOTIFY_SECRET`. For each active subscriber it runs `planAlerts(station, profile, now, sent)`. It sends every alert whose `fireAt <= now` and records its key. `ml/aq_forecast.py` calls it at the end of each hourly run, in a try/except with a 10 s timeout, so a failed call can't break the forecast loop.

**Message content.** It reuses `web/src/lib/aq/levels.ts` and `strings.ts`:

- **Instant reply:** 3 lines, one per day: date, level name with a colour emoji (🟢🔵🟡🟠🔴🟣), PM10 mean and the top 2 `reasons[].label_bg`. Then the profile advice and today's best hours from `bestWindow`.
- **Alert:** the app's `notif.title.*` / `notif.body` text, plus the reasons.
- **`/demo`:** built from `web/src/data/aq_episode.json`, with the header „Повторение от <date>: реален смог в <place>, предупреден ден по-рано“, then the predicted and observed levels.

**Alert rule.**

- A day counts as bad when `alert_level ?? level` is at or above `alertThreshold(profile)`, which is 3 for sensitive groups and 4 for everyone else.
- The timing is the app's: 19:00 the evening before, otherwise 07:30 the same morning, otherwise right away if the day hasn't ended.
- Each `chat|station|date|profile` key is sent once.
- Because the loop is hourly, an alert can arrive up to about an hour late. That's acceptable.

**Data.** Append to `web/db/schema.sql`:

```sql
create table if not exists tg_subscribers (
  chat_id bigint primary key,
  profile text not null,
  station_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists tg_alerts_sent (
  key text primary key,          -- chat_id|station_id|date|profile
  sent_at timestamptz not null default now()
);
```

**Setup.**

- Create the bot with @BotFather. Put the token and the three secrets in Vercel env vars and `.env.local`, never in git.
- `pnpm tg:webhook` (`web/scripts/tg-webhook.ts`) calls `setWebhook` once with the production URL and `secret_token`. Preview deployments are protected, so the webhook points at production.
- The QR on slide 5 opens `https://t.me/<bot>?start=jury`.

**Tests** (vitest, pure functions):

- the message formatter (3-day reply, alert, replay header);
- the nearest station;
- the notify selection: due versus not due, already sent, and `alert_level` versus `level`.

**Demo script.**

1. Jury scans the QR and taps a profile; the instant reply arrives.
2. The presenter sends `/demo`; every jury phone buzzes with the replay.
3. Backup: a screen recording of steps 1–2.

## Found along the way

`planAlerts` in `web/src/lib/aq/levels.ts` (on main) checks `day.level`, but the contract says alerts use `alert_level ?? level`. The bot needs the contract rule, so the fix (one line) goes into `levels.ts` and `npm run sync` copies it to mobile.

## Left to the builder

The keyboard layout and wording, the colour-emoji mapping, how the webhook replies on error (always 200 to Telegram, with the error logged), and the rate of the `/demo` loop. A jury of about 20 is far below Telegram's 30 messages/s limit.
