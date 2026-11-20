# Telegram alert bot: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a Telegram bot. `/start` → pick a profile → it replies with the 3-day forecast. It sends real day-before alerts, and `/demo` sends a labelled replay of last winter's smog episode.

**Architecture:**
- Two Next.js routes in `web/` on Vercel: the webhook `/api/telegram`, and `/api/telegram/notify`, which Teodor's hourly forecast loop calls.
- The logic is pure functions in `web/src/lib/tg/`, with dependencies injected so vitest can test them with fakes.
- Subscribers live in Neon. The forecast comes from the existing `loadForecast()`.

**Tech stack:** Next.js 15 route handlers (Node runtime), `@neondatabase/serverless`, vitest, Telegram Bot API over plain `fetch`, and Python `httpx` on the ML side.

**Spec:** `docs/superpowers/specs/2026-11-20-telegram-bot-design.md`

**Owner:** Boris. Branch `boris/tg-bot`, off `origin/main`. Task 6 touches Teodor's forecast loop, so Teodor does it or reviews it.

## Global constraints

**Content and storage**
- Bulgarian only. Messages are plain text, with no `parse_mode`.
- Store only `chat_id`, `profile` and `station_id`. No names or usernames.
- Every `/demo` message starts with `🔁 Повторение от <dd.mm.yyyy>`.

**Rules and time**
- A day is bad for a profile when `alert_level ?? level` is at least `alertThreshold(profile)`: 3 for sensitive groups, 4 for `general`. The timing comes from `planAlerts`: 19:00 the evening before, otherwise 07:30 that morning, otherwise right away while the day is still on.
- A forecast whose `source` is `'demo'` must never trigger alerts.
- All times are Europe/Sofia. `web/src/lib/tg/tz.ts` sets `process.env.TZ = 'Europe/Sofia'`, and both routes import it first.

**Code and secrets**
- No new npm dependencies.
- Routes export `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`.
- The only edits to existing files are the ones listed in the tasks. Everything else is a new file, so nothing clashes with Velko's branches.
- Secrets live only in Vercel env vars and `web/.env.local`, never in git:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_WEBHOOK_SECRET`
  - `TELEGRAM_NOTIFY_SECRET`
  - `TELEGRAM_PRESENTER_IDS` (comma-separated chat ids)
  - `TG_WEBHOOK_URL` (script only)
  - `TG_NOTIFY_URL` (ML only)

## Review focus

1. **A demo or mock forecast** (the fallback JSON is the mock today) must send no alerts at all. Covered by a test in Task 5.
2. **The Vercel server clock is UTC.** Alerts must fire at 19:00 Sofia time, not 19:00 UTC, and "today" must be the Sofia date. Covered by a test in Task 5.
3. **A subscriber's station leaves the forecast** (for example, cleaning drops the sensor). They get the featured VT station, with no crash. Covered by tests in Tasks 4 and 5.
4. **The loop runs twice in one hour, or Telegram retries an update.** No alert is sent twice. Covered by a test in Task 5. The webhook returns 200 for every authenticated request.
5. **A user blocks the bot,** so `sendMessage` fails with 403. The other subscribers still get their alerts, and that chat is deactivated. Covered by a test in Task 5.

---

### Task 1: Alerts use `alert_level`

**Files:**
- Modify: `web/src/lib/aq/types.ts`. In `AqDay`, after `exceeds_eu_limit`, add exactly the line Velko's `w4-why` branch has, so the two branches merge cleanly: `  alert_level?: number; // sent by the live forecast; not in the contract yet`
- Modify: `web/src/lib/aq/levels.ts`. Add `alertLevelOf`. In `planAlerts`, replace `isBadFor(profile, day.level)` with `isBadFor(profile, alertLevelOf(day))`.
- Modify: the same two changes in `mobile/src/aq/types.ts` and `mobile/src/aq/levels.ts`.
- Create: `web/src/lib/tg/fixtures.ts` (test fixtures, reused by Tasks 2–5).
- Test: `web/src/lib/aq/alerts.test.ts`

**Interfaces:**
- **Produces:**
  - `alertLevelOf(day: AqDay): Level`, which returns `clampLevel(day.alert_level ?? day.level)`.
  - `fixtures.ts`:
    - `NOW = new Date(2026, 10, 20, 12, 0)`;
    - `day(date: string, level: number, alert_level?: number): AqDay`, with `pm10_mean: 58`, `pm25_mean: 34`, `exceeds_eu_limit: true` and three reasons. The first two are `'нисък слой на смесване (инверсия)'` and `'слаб вятър'`; the third is `'студена нощ – отопление'`;
    - `vt(daily: AqDay[]): AqStation`, with id `'sc-35767'`, name `'ВТ – център'`, city `'Велико Търново'`, `featured: true`, lat 43.0786, lon 25.6211 and `hourly: []`;
    - `sofia(daily: AqDay[]): AqStation`, with id `'sc-sofia'`, name `'София – център'`, city `'София'`, lat 42.6977 and lon 23.3219;
    - `forecastOf(...stations: AqStation[]): AqForecast`, with model kind `'trained'`.

- [ ] **Step 1: Write the failing test**

```ts
it('warns on alert_level even when level is lower', () => {
  const plan = planAlerts(vt([day('2026-11-21', 2, 3)]), 'asthma', NOW, new Set());
  expect(plan).toHaveLength(1);
  expect(plan[0]!.fireAt).toEqual(new Date(2026, 10, 20, 19, 0, 0));
});
it('falls back to level, and general needs 4', () => {
  expect(planAlerts(vt([day('2026-11-21', 3)]), 'child', NOW, new Set())).toHaveLength(1);
  expect(planAlerts(vt([day('2026-11-21', 3)]), 'general', NOW, new Set())).toHaveLength(0);
});
it('alertLevelOf prefers alert_level', () => {
  expect(alertLevelOf(day('2026-11-21', 2, 4))).toBe(4);
  expect(alertLevelOf(day('2026-11-21', 2))).toBe(2);
});
```

- [ ] **Step 2: Run** `cd web && pnpm vitest run src/lib/aq/alerts.test.ts`. Expected: FAIL (`alertLevelOf` is not exported).
- [ ] **Step 3: Make the type, `alertLevelOf` and `planAlerts` changes** in web and in mobile.
- [ ] **Step 4: Run** `cd web && pnpm test && pnpm typecheck`, then `cd mobile && npm test && npm run typecheck`. Expected: all pass.
- [ ] **Step 5: Commit:** `fix(aq): alerts use alert_level (contract), web and mobile`

### Task 2: Message formatting

**Files:**
- Create: `web/src/lib/tg/format.ts`
- Create: `web/src/lib/tg/episode.ts`
- Copy: `git checkout origin/teodor/aq-ml -- web/src/data/aq_episode.json`
- Test: `web/src/lib/tg/format.test.ts`

**Interfaces:**
- **Consumes:**
  - `alertLevelOf`, `isBadFor`, `bestWindow` and `Level` from `levels.ts`;
  - `air`, `advice`, `levelName` and `profileName` from `strings.ts`;
  - the fixtures.
- **Produces:**
  - `LEVEL_EMOJI: Record<Level, string> = {1:'🟢',2:'🔵',3:'🟡',4:'🟠',5:'🔴',6:'🟣'}`
  - `formatForecast(station: AqStation, profile: Profile, now: Date, demo: boolean): string`
  - `formatAlert(station: AqStation, profile: Profile, day: AqDay, now: Date): string`
  - `formatReplay(ep: Episode, profile: Profile): string`
  - `type Episode = { date; place; observed_daily: { pm10_mean; level; exceeds_eu_limit }; cams_daily: { pm10_mean }; forecasts: { issued; days_before; daily: { pm10_mean; level; alert_level? } }[]; score: { bad_days; model_alert: { hits } } }`
  - `episodeOf(raw: unknown): Episode | null`, a shape guard. Use it as `episodeOf(episodeJson)`, with `import episodeJson from '@/data/aq_episode.json'`. That's a static import, so no file tracing is needed.

**Formatting rules**

The tests check these. The builder chooses any other wording.

- **`formatForecast`**, line by line:
  1. When `demo` is true, the first line is `air('bg','air.demo')`.
  2. `${station.name} · ${station.city}`
  3. `Профил: ${profileName}`
  4. One line per day: `${emoji(level)} ${weekday} ${dd.mm} · ${levelName(level)} · PM10 ~${round(pm10_mean)} µg/m³`, followed by an indented line with the top 2 reasons joined by `', '`. The weekday is short Bulgarian: Нд Пн Вт Ср Чт Пт Сб.
  5. The advice line. For the first day that is bad for the profile: `⚠ ${Днес|Утре|dd.mm}: ${advice('bg', profile, alertLevelOf(day))}`. Otherwise: `✅ ${advice('bg', profile, 1)}`.
  6. When `bestWindow(station.hourly ?? [], now)` returns a window: `${air('bg','air.best.title')}: ${air('bg','air.best.body', {start: HH:MM, end: HH:MM, pm})}`.
  7. The last line, exactly: `Ще ви пишем вечерта преди лош ден. /stop – спиране.`
- **`formatAlert`:**
  - Line 1: `${emoji(alertLevelOf(day))} ` followed by `notif.title.today` (when `day.date` is today) or `notif.title.tomorrow`. Fill it with the lowercase `levelName` of `alertLevelOf(day)` and `station.city`.
  - Line 2: `notif.body`, with the advice taken at `alertLevelOf(day)`.
  - Line 3: the top 2 reasons.
- **`formatReplay`:** it uses the forecast with `days_before === 1`.
  - Line 1: `🔁 Повторение от ${dd.mm.yyyy}: реален смог ${във|в} ${place}, предупреден ден по-рано`. Use „във“ when the place starts with В or Ф.

- [ ] **Step 1: Write the failing test**

```ts
const s = vt([day('2026-11-21', 3, 4), day('2026-11-22', 2), day('2026-11-23', 1)]);
it('formats the 3-day reply', () => {
  const t = formatForecast(s, 'asthma', NOW, false);
  expect(t).toContain('ВТ – център · Велико Търново');
  expect(t).toContain('🟡 Сб 21.11 · Умерен · PM10 ~58 µg/m³');
  expect(t).toContain('нисък слой на смесване (инверсия), слаб вятър');
  expect(t).not.toContain('студена нощ');
  expect(t).toContain(`⚠ Утре: ${advice('bg', 'asthma', 4)}`);
  expect(t.endsWith('/stop – спиране.')).toBe(true);
  expect(formatForecast(s, 'asthma', NOW, true).startsWith(air('bg', 'air.demo'))).toBe(true);
});
it('says clean air when no day is bad for the profile', () => {
  expect(formatForecast(vt([day('2026-11-21', 3)]), 'general', NOW, false)).toContain(`✅ ${advice('bg', 'general', 1)}`);
});
it('formats an alert at the alert level', () => {
  const t = formatAlert(s, 'child', day('2026-11-21', 2, 3), NOW);
  expect(t.split('\n')[0]).toBe('🟡 Утре: умерен въздух в Велико Търново');
  expect(t).toContain(advice('bg', 'child', 3));
});
it('formats the replay from the real episode file', () => {
  const t = formatReplay(episodeOf(episodeJson)!, 'asthma');
  expect(t.split('\n')[0]).toBe('🔁 Повторение от 18.12.2025: реален смог във Велико Търново, предупреден ден по-рано');
  expect(t).toContain('Прогноза от 17.12, 12:00: 🟡 Умерен · PM10 ~41');
  expect(t).toContain('Измерено: 🟡 Умерен · PM10 ~69 · над нормата на ЕС');
  expect(t).toContain('CAMS: PM10 ~22');
  expect(t).toContain(advice('bg', 'asthma', 3));
  expect(t).toContain('18 от 23');
});
it('rejects a malformed episode', () => {
  expect(episodeOf({ date: '2025-12-18' })).toBeNull();
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/tg/format.test.ts`. Expected: FAIL (the module is missing).
- [ ] **Step 3: Implement** `format.ts` and `episode.ts` to the rules above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(tg): message formatting and episode replay`

### Task 3: Bot API client, time zone, subscriber store and schema

**Files:**
- Create: `web/src/lib/tg/telegram.ts`
- Create: `web/src/lib/tg/tz.ts` (one line: `process.env.TZ = 'Europe/Sofia';`)
- Create: `web/src/lib/tg/store.ts`
- Modify: `web/db/schema.sql`. Append the `tg_subscribers` and `tg_alerts_sent` tables exactly as they are in the spec.
- Test: `web/src/lib/tg/store.test.ts`

**Interfaces:**
- **Produces:**
  - `class TgError extends Error { code: number }`
  - `type Send = (method: string, body: Record<string, unknown>) => Promise<void>`
  - `botSend(token: string): Send`. It POSTs JSON to `https://api.telegram.org/bot${token}/${method}`, and throws `new TgError(error_code, description)` when the response's `ok` is false.
  - `type Sub = { chatId: number; profile: Profile; stationId: string }`
  - `type Store = { get(chatId): Promise<Sub | null>; upsert(sub: Sub): Promise<void>; deactivate(chatId): Promise<void>; active(): Promise<Sub[]>; sentKeys(): Promise<Set<string>>; markSent(keys: string[]): Promise<void> }`
    - `get` returns only active subscribers.
    - `upsert` sets `active = true`.
    - `sentKeys` returns the keys sent in the last 4 days.
  - `memoryStore(): Store` and `neonStore(sql: NonNullable<ReturnType<typeof getSql>>): Store`

- [ ] **Step 1: Write the failing test** for `memoryStore`:
  - `upsert` then `get` returns the sub;
  - `deactivate` → `get` is null and `active()` is empty;
  - `upsert` again reactivates;
  - `markSent(['a'])` → `sentKeys()` has `'a'`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/tg/store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `telegram.ts`, `tz.ts` and `store.ts`. For `neonStore`, use tagged-template SQL with `on conflict (chat_id) do update` and `on conflict (key) do nothing`.
- [ ] **Step 4: Run** the same command plus `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(tg): bot API client, subscriber store, schema`

### Task 4: Webhook: `/start`, profile, location, `/stop`, `/demo`, `/id`

**Files:**
- Create: `web/src/lib/tg/bot.ts`
- Create: `web/src/lib/tg/deps.ts`
- Create: `web/src/app/api/telegram/route.ts`
- Test: `web/src/lib/tg/bot.test.ts`

**Interfaces:**
- **Consumes:**
  - Task 2's formatters and `episodeOf`;
  - Task 3's `Store`, `Send` and `memoryStore`;
  - `loadForecast`, `featuredStation` and `AqLoad` from `@/lib/aq/load`.
- **Produces:**
  - `type TgUpdate = { message?: { chat: { id: number }; text?: string; location?: { latitude: number; longitude: number } }; callback_query?: { id: string; data?: string; message?: { chat: { id: number } } } }`
  - `type BotDeps = { store: Store; send: Send; load: () => Promise<AqLoad>; episode: () => Episode | null; presenters: ReadonlySet<number>; now: () => Date }`
  - `handleUpdate(update: TgUpdate, deps: BotDeps): Promise<void>`
  - `stationFor(forecast: AqForecast, stationId: string): AqStation`. It returns that station, or `featuredStation(forecast)`.
  - `nearestStation(stations: AqStation[], lat: number, lon: number): AqStation` (haversine).
  - `botDeps(sql): BotDeps`, in `deps.ts`. It reads the env and builds `neonStore`, `botSend`, `loadForecast({ sql })`, `episodeOf(episodeJson)` and the presenter ids.

**Behaviour**

- **`/start [payload]`:** send the profile prompt with an inline keyboard of the 5 `PROFILES`. The labels are `profileName('bg', p)` and the `callback_data` is `p:<profile>`.
- **Callback `p:<profile>`:**
  1. `answerCallbackQuery`.
  2. Keep the existing station if it's still in the forecast, otherwise use the featured one. Then `upsert`.
  3. Send `formatForecast(…, source === 'demo')` with `reply_markup: { keyboard: [[{ text: '📍 Най-близка станция', request_location: true }]], resize_keyboard: true }`.
- **A shared location:**
  - With an active sub: move it to `nearestStation` and send `formatForecast`.
  - With no sub: send the profile prompt.
- **`/stop`:** `deactivate`, then send a goodbye that mentions `/start`.
- **`/id`:** reply with the chat id. This is how presenters find their id.
- **`/demo`:**
  - From a chat in `presenters`: send `formatReplay(ep, sub.profile)` to every active sub, then reply `Изпратено до ${n}` to the presenter.
  - From anyone else: the help text, and nothing sent to subscribers.
- **Anything else:** a help text listing `/start` and `/stop`.
- **The route** (`POST /api/telegram`):
  1. `import '@/lib/tg/tz'` first.
  2. Return 401 unless the `x-telegram-bot-api-secret-token` header equals `TELEGRAM_WEBHOOK_SECRET`.
  3. Without `getSql()`, log and return 200.
  4. Otherwise run `handleUpdate`, catching and logging any error, and always return 200.

- [ ] **Step 1: Write the failing tests.** Use a harness with `memoryStore()`, a `send` that records `{ method, body }`, and `forecastOf(vt(...), sofia(...))` with source `'database'`.

```ts
it('/start shows 5 profile buttons');                 // inline_keyboard.flat() length 5, first callback_data 'p:asthma'
it('a profile tap subscribes to VT and replies');     // store.get(7) → { chatId: 7, profile: 'child', stationId: 'sc-35767' }; a sendMessage containing 'ВТ – център'; keyboard[0][0].request_location === true
it('a location moves the sub to the nearest station');// location 42.70, 23.33 → stationId 'sc-sofia', reply contains 'София – център'
it('a location before a profile asks for the profile');
it('/stop deactivates');                              // (await store.active()).length === 0
it('/demo from a presenter reaches every active sub');// subs 7 and 8, presenter 99 → texts to 7 and 8 start with '🔁 Повторение'; 99 gets 'Изпратено до 2'
it('/demo from anyone else sends nothing to subs');
it('a sub whose station is gone gets VT');            // upsert stationId 'gone', tap 'p:asthma' → reply contains 'ВТ – център'
it('the route rejects a wrong secret and returns 200 otherwise'); // POST without the header → 401; with it and no DATABASE_URL → 200
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/tg/bot.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `bot.ts`, `deps.ts` and the route.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(tg): webhook with profile, location, stop, demo replay`

### Task 5: Due alerts and the notify route

**Files:**
- Create: `web/src/lib/tg/notify.ts`
- Create: `web/src/app/api/telegram/notify/route.ts`
- Test: `web/src/lib/tg/notify.test.ts`

**Interfaces:**
- **Consumes:** `planAlerts`, `stationFor`, `formatAlert`, `Store`, `Send` and `TgError`.
- **Produces:**
  - `dueAlerts(subs: Sub[], forecast: AqForecast, now: Date, sent: ReadonlySet<string>): { key: string; chatId: number; text: string }[]`
    - `key` is `${chatId}|${planKey}`.
    - `planAlerts` receives that chat's keys with the `${chatId}|` prefix removed.
    - An alert is due when `fireAt <= now + 60 s`. The 60 seconds covers `planAlerts`' "now + 5 s" case.
  - `notifyAll(deps: Pick<BotDeps, 'store' | 'send' | 'load' | 'now'>): Promise<{ sent: number; skipped?: 'demo' }>`
    - It returns `{ sent: 0, skipped: 'demo' }` without sending when `source === 'demo'`.
    - It runs `markSent` after each successful send.
    - On `TgError` with code 403, it deactivates the chat and carries on.
  - **The route** (`POST /api/telegram/notify`):
    1. `import '@/lib/tg/tz'` first.
    2. Return 401 unless the `authorization` header equals `` `Bearer ${TELEGRAM_NOTIFY_SECRET}` ``.
    3. Without the database, return 503.
    4. Otherwise run `notifyAll` and return `Response.json({ ok: true, ...result })`.

- [ ] **Step 1: Write the failing tests**

```ts
const sub = { chatId: 7, profile: 'child' as const, stationId: 'sc-35767' };
const f = forecastOf(vt([day('2026-11-21', 2, 3)]));
it('sends at 19:00 the evening before, once', () => {
  const at = new Date(2026, 10, 20, 19, 7);
  const due = dueAlerts([sub], f, at, new Set());
  expect(due.map((d) => d.key)).toEqual(['7|sc-35767|2026-11-21|child']);
  expect(dueAlerts([sub], f, at, new Set(['7|sc-35767|2026-11-21|child']))).toHaveLength(0);
});
it('waits until the time', () => expect(dueAlerts([sub], f, NOW, new Set())).toHaveLength(0));
it('sends right away when the window has passed and the day is on', () =>
  expect(dueAlerts([sub], f, new Date(2026, 10, 21, 9, 0), new Set())).toHaveLength(1));
it('general needs 4', () =>
  expect(dueAlerts([{ ...sub, profile: 'general' }], f, new Date(2026, 10, 20, 19, 7), new Set())).toHaveLength(0));
it('a gone station falls back to VT', () =>
  expect(dueAlerts([{ ...sub, stationId: 'gone' }], f, new Date(2026, 10, 20, 19, 7), new Set())).toHaveLength(1));
it('never alerts from a demo forecast');        // load → source 'demo' → { sent: 0, skipped: 'demo' }, no send calls
it('a second run sends nothing new');           // notifyAll twice at 19:07 → 1 then 0
it('a blocked chat is deactivated, others still get theirs'); // send throws new TgError(403, 'Forbidden') for chat 7 → chat 8 sent; active() is only 8
it('runs on Sofia time on a UTC server', async () => {
  process.env.TZ = 'UTC';
  await import('./tz');
  expect(new Date(2026, 10, 20, 19).getUTCHours()).toBe(17);
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/tg/notify.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `notify.ts` and the route.
- [ ] **Step 4: Run** `pnpm check` (typecheck, test, build). Expected: all green.
- [ ] **Step 5: Commit:** `feat(tg): hourly notify of due alerts`

### Task 6: The forecast loop calls notify (Teodor)

**Files:**
- Modify: `ml/aq_forecast.py`
  - Add `env_value(key: str) -> str | None`, which reads `web/.env.local`, and make `database_url()` use it.
  - Add `notify_telegram(post=httpx.post) -> None`, and call it in `run_once` right after `upsert(payload)`.
- Test: `ml/tests/test_aq_notify.py`

**Interfaces:**
- **`notify_telegram`:**
  - It reads `TG_NOTIFY_URL` and `TELEGRAM_NOTIFY_SECRET` through `env_value`. If either is missing, it logs a skip and returns.
  - Otherwise it calls `post(url, headers={"Authorization": f"Bearer {secret}"}, timeout=10)` and logs the response body.
  - Any exception is logged and swallowed.

- [ ] **Step 1: Write the failing tests:**
  - with the env missing, `post` is never called;
  - with both values, `post` gets the bearer header and `timeout=10`;
  - when `post` raises `httpx.ConnectError`, nothing propagates.

  Monkeypatch `aq_forecast.env_value`.
- [ ] **Step 2: Run** `uv run pytest ml/tests/test_aq_notify.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `uv run pytest ml/tests -q`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(aq): forecast loop triggers Telegram alerts`

### Task 7: Bot setup, deploy, live check

**Files:**
- Create: `web/scripts/tg-webhook.ts`. It calls:
  - `setWebhook` with `{ url: TG_WEBHOOK_URL, secret_token: TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }`;
  - `setMyCommands` with `start` („Профил и прогноза“) and `stop` („Спри известията“);
  - `getWebhookInfo`, printing the result.
- Modify: `web/package.json`. Add the script `"tg:webhook": "tsx --env-file=.env.local scripts/tg-webhook.ts"`.

**Steps:**

- [ ] **Step 1: Create the bot.** In @BotFather, run `/newbot` with the name „Дишай ВТ“ and note the username. Generate two secrets with `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.
- [ ] **Step 2: Create the tables.** Paste the two `create table` statements into the Neon SQL editor. **Don't run `pnpm seed`:** it also rewrites `aq_forecast` from the bundled (mock) file.
- [ ] **Step 3: Set the env vars.**
  - Vercel Production: the four `TELEGRAM_*` vars. Leave `TELEGRAM_PRESENTER_IDS` empty for now.
  - `web/.env.local`: the same four, plus `TG_WEBHOOK_URL=https://<prod>/api/telegram`.
  - Teodor's `web/.env.local`: `TG_NOTIFY_URL=https://<prod>/api/telegram/notify` and the notify secret.
- [ ] **Step 4: Deploy, then run** `pnpm tg:webhook`. Expected: `getWebhookInfo` shows the URL, with `pending_update_count: 0` and no `last_error_message`.
- [ ] **Step 5: Check on your phone.**
  1. Send `/id`. Put the id in `TELEGRAM_PRESENTER_IDS` and redeploy.
  2. `/start` → Дете → the 3-day reply arrives.
  3. 📍 → the nearest station.
  4. `/demo` → the replay arrives, and the presenter gets „Изпратено до 1“.
- [ ] **Step 6: Run** `curl -s -X POST -H "Authorization: Bearer <notify secret>" https://<prod>/api/telegram/notify`. Expected: `{"ok":true,"sent":N}`. On the mock forecast it shows `"skipped":"demo"`.
- [ ] **Step 7: Hand over the slide link.** Give Velko `https://t.me/<username>?start=jury` for the slide 5 QR, and record the backup screen video of `/start` → reply → `/demo`.
- [ ] **Step 8: Commit and push:** `feat(tg): webhook setup script`. Push `boris/tg-bot` and open a PR to `main`.
