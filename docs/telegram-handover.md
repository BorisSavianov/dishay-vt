# Telegram bot — handover

Bot: [@dishay_vt_bot](https://t.me/dishay_vt_bot). Backend: `https://dishay-vt.vercel.app` (`/api/telegram` webhook, `/api/telegram/notify`).
Tested live on 2026-11-20: `/start` → profile → 3-day forecast, `/id`, `/demo` („Изпратено до 1“).

## Teodor — ML run sends the alerts

`ml/aq_forecast.py` now calls `notify_telegram()` after `upsert()`. It reads two values from `web/.env.local`:

```
TG_NOTIFY_URL=https://dishay-vt.vercel.app/api/telegram/notify
TELEGRAM_NOTIFY_SECRET=<ask Boris; sent privately, never in the repo or chat>
```

Without them the run still works; it just skips the alerts. Please review the change in `ml/aq_forecast.py` and `ml/tests/test_aq_notify.py`.

## Velko — slide 5

QR for the jury: `docs/slides/telegram_qr.png` (1024 px) or `docs/slides/telegram_qr.svg`.
It opens `https://t.me/dishay_vt_bot?start=jury` (verified by decoding the image).

## Presenter

`/demo` works only from chat ids in `TELEGRAM_PRESENTER_IDS` (Vercel production + `web/.env.local`). To add someone: they send `/id` to the bot, append the id (comma-separated), redeploy.

## Before the demo

- Tap „📍 Най-близка станция“ on a phone once (location sharing can't be tested from Telegram Web).
- Record a backup screen video: `/start` → Дете → forecast, then `/demo`.
- Optional: the bot token was visible in the BotFather chat. To rotate: `/revoke` in BotFather, put the new token in `web/.env.local` and Vercel (`vercel env rm/add TELEGRAM_BOT_TOKEN production`), redeploy, run `pnpm tg:webhook`.
