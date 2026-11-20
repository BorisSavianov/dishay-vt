# Master plan: polish „Дишай ВТ“ for the jury (20.11.2026, 13:15 → 16:30 freeze)

**Owners: Velko (web, deck) and Boris (merge and deploys, app, bot, demo).** Teodor has no build tasks: he is preparing the ML story from `docs/jury-guide.md` and will present slides 4, 6 and 7. The forecast loop runs on his PC. Don't change `ml/` or restart anything there. If `/api/aq` shows a `generated_at` older than 2 hours, tell him.

Every task has a priority:
- **P0:** must ship;
- **P1:** should ship;
- **P2:** only if there's time.

Each task also has its "done when" condition.

## Where we are (13:00)

**Live and working:**
- **Forecast:** 72 h for 560 stations, every hour, on Neon.
- **Web:** home, map with a 72 h slider, „Защо?“ with „Проверка на живо“, AI explanation, methodology, sources.
- **App:** iOS app with profiles and local alerts.
- **Telegram bot @dishay_vt_bot:**
  - `/start` → profile → forecast;
  - `/demo` sends a replay;
  - the hourly notify works (`{"ok":true}`).

**New in the payload since PR #11** (branch `teodor/aq-ml`, not yet in `main`):
- `model.scoreboard`: the November replay plus the live score;
- `daily[].sources` (VT) and `model.sources_what_if`, including `last_winter.shares`;
- the fix for the forecast jump at hour 63, where CAMS ends.

All of these are documented in `contract/CONTRACT.md`.

**Numbers for every slide and page:** `docs/slides/numbers.md`. Use these, and nothing else:

| Claim | Value |
|---|---|
| VT, last winter (holdout), PM2.5 MAE at 24 h | model **3.2**, „утре = днес“ 4.8, CAMS 6.1 → **48% по-точно от CAMS** |
| All of BG, last winter | 2.7 / 3.7 / 8.5 → **68%** |
| This season (1–19 Nov 2026, real forecast weather) | VT **2.6 vs 5.2** → **50%**; BG 2.9 vs 7.8 → 63% |
| Day-before warnings, VT, last winter | **18 of 23** bad days (11 false alarms); CAMS 20 of 23 (23 false alarms) |
| Smog episode | **18.12.2025:** PM10 68.9; we warned the day before (level 3) |
| Sources, VT last winter (**оценка**) | heating **45%**, пренос 25%, друго 27%, трафик 3%; 20% switch → **15 instead of 23** bad days |
| Data | **555** sensors, **5.28M** hourly readings, 6 sources |

Use **23** for "bad days last winter" everywhere. `numbers.md` also has a "15 of 179" line, which is a different definition (25 km, per sensor). Don't put it on slides.

---

## Timeline

| Time | Velko | Boris |
|---|---|---|
| 13:15–13:30 | V1 starts | **B1:** merge the PR and deploy |
| 13:30–14:30 | V1 sources UI, V2 consistent numbers | B2 Telegram phone pass and video, B3 app alert video |
| 14:30–15:00 | **V8 deck draft (due 15:00)** | B5 code link decision, B4 app polish |
| 15:00–16:00 | V3–V7 polish, phone pass | B4 continued, help Velko with the phone pass |
| 16:00–16:30 | Final `pnpm check`, merge | **B6:** freeze deploy and smoke test |
| 16:30–17:00 | 2 timed run-throughs (everyone) | 2 timed run-throughs, open the pages on the demo laptop |

**Cut list (drop in this order if late):** V9, V5, V4, B4, V7. **Never cut:** the live forecast, the model-vs-CAMS proof (slide 6 and „Защо?“), and the phone alert or Telegram `/demo`.

---

## Velko: web and deck

### V1 (P0, 45 min): „Кой замърсява?“ on the web
Follow **Task 5 of `docs/superpowers/plans/2026-11-20-sources.md`**: it has the exact BG copy, the helper names and the tests. `web/src/lib/aq/sources.ts` (`AqSources`, `sourcesLine`, `showSources`) already exists, from Boris, so build on it.
- **Day cards:** the 4-colour bar and „Източници (оценка): …“ when `showSources(day)`, i.e. `pm25_mean ≥ 5`. This week is clean, so the bar stays hidden, as designed.
- **What-if line:**
  - when `evening_drop_pm25 < 0.5` (every day this week), show only the last-winter clause: „Ако 20% от домовете на дърва сменят отоплението: 15 вместо 23 лоши дни миналата зима (оценка).“;
  - never show „−0 µg/m³“.
- **„Защо?“:** a season split from `model.sources_what_if.last_winter.shares`, under „Миналата зима (01.10.2025–31.03.2026)“, using `sourcesLine`. This is the demo-visible part.
- **Methodology:** the BG method paragraph from the plan, including both biases.
- **Done when:** `pnpm check` is green, and on the live data „Защо?“ shows „отопление 45% · трафик 3% · пренос 25%“ and the what-if line without „−0“.

### V2 (P0, 20 min): one set of numbers
- **Home side card** „По-точно от официалната прогноза?“: it shows the all-BG holdout (2,7 vs 8,5) next to a VT card. Show VT instead.
  - Preferably this season: „Този сезон за ВТ: 2,6 срещу 5,2 (CAMS)“ from `model.scoreboard.replay.mae_pm25_next_day.vt`.
  - Otherwise use `model.mae_vt` (3,2 vs 6,1).
- **„Защо?“ KPI tile** „Улавяме ли лошите часове? 0,49 / 0,21“: F1 means nothing to the jury. Replace it with „Предупредихме за 18 от 23 лоши дни вечерта преди това“, with the sub-line „CAMS: 20 от 23, но с 23 фалшиви тревоги (ние: 11)“. The data is in `model.episode.score` (`model_alert`, `cams`). Keep F1 in the methodology.
- **Done when:** every number on home and „Защо?“ matches the table above.

### V3 (P1, 15 min): freshness in the header
- „Последна актуализация: 20.11.2026 г.“ shows only the date. Make it „днес, 13:07“ (from `generated_at`).
- If `generated_at` is more than 2 h old, show an amber note: „Прогнозата е от 11:07 – обновява се всеки час“.
- **Done when:** the header shows the time, and the stale note shows when you fake an old `generated_at` in a test.

### V4 (P1, 20 min): clean-day cards
- Cards for clean days have no „ЗАЩО“ reasons and a big blank area: Sat and Sun right now. Add one line, „Чист въздух – няма рискови фактори“, so the three cards look equal.
- **Done when:** all 3 cards have the same height and structure on the live data.

### V5 (P2, 15 min): the chart's CAMS horizon
- The dashed CAMS line correctly stops at about hour 63. Add a small legend note: „CAMS прогнозира ~2,5 дни напред“.
- The pinned tooltip at „сега“ covers the first hours: offset it to the right of the dot.
- **Done when:** the line's end is explained and nothing covers the first 6 hours.

### V6 (P1, 30 min): phone and dark-mode pass
- At **390 px**, check home, map, „Защо?“, AI and methodology:
  - no horizontal scroll;
  - the sidebar becomes a top bar or menu;
  - the map's slider is usable with a thumb;
  - the charts are readable.
- Then the same pages in dark mode.
- **Done when:** screenshots of each page at 390 px, in light and dark, show no overflow or unreadable text. Save them in `docs/slides/backup/` as demo backups.

### V7 (P1, 15 min): methodology page
Add three short paragraphs. The source text is `docs/aq-model.md` („Testing“, „Live“, „Limits“) and `docs/jury-guide.md` §4 and §6.
- **„Проверка на живо“:** the November replay with weather as forecast at the time, and the CAMS-archive caveat.
- **The CAMS horizon:** the model repeats CAMS's last day past its end, and the dashed line stops honestly.
- **The sources estimate and its biases.**
- **Done when:** the three paragraphs are live in BG and EN.

### V8 (P0, due 15:00): the deck (8 slides, ≤ 5 min)
Follow the plan in `docs/hackathon-plan.md` („The 8 slides“), with these updates:
- **Slide 5:** the QR is `docs/slides/telegram_qr.png` (it opens `t.me/dishay_vt_bot?start=jury`).
- **Slide 6:**
  - the chart `docs/slides/mae_24h.png` (holdout plus this season, footnote included);
  - one line „Предупредихме за 18 от 23 лоши дни вечерта преди това“;
  - optionally `docs/slides/episode.png`.
- **Slide 6 or 7:** one sources line: „Миналата зима ~45% от PM2.5 във ВТ е от отопление (оценка); 20% смяна → 15 вместо 23 лоши дни“.
- **Slide 8:** the code link, depending on Boris's B5 decision.
- **Done when:** the deck is shared with the team by 15:00, and every number is from the table above.

### V10 (P0, 10 min): a flaky test that blocks `pnpm check`
- `src/lib/aq/explain.test.ts`, the test „answers 400 for a bad profile and text for a good one“, posts with a fake `GROQ_API_KEY`. That makes a real network call, which timed out at 5 s on Teodor's machine (155/156 passing).
- **Fix:** stub `fetch` in that test, or run it with `MOCK_LLM=1`, so the suite never needs the network.
- **Done when:** `pnpm test` passes offline (Wi-Fi off).

### V9 (P2): AI section
The „Какво означава това за мен?“ card has a large empty area under the button. Make it compact, or show the last answer inline.

---

## Boris: merge and deploys, app, bot, demo

### B1 (P0, now, 15 min): merge `teodor/aq-ml` → `main`
- Teodor's PR has the scoreboard backend, sources, the CAMS-horizon fix, this plan and the jury guide.
- **Steps:**
  1. Check the Vercel preview of the PR: home, „Защо?“, `/api/aq` and `/api/health`.
  2. Merge.
  3. Confirm the production deploy.
- **Done when:** production `/api/aq` returns `model.scoreboard`, `model.sources_what_if.last_winter.shares`, and `source: "database"`.

### B2 (P0, 20 min): Telegram phone pass and backup video
- **On a real phone:**
  1. Scan the slide-5 QR, `/start`, tap „Дете“ → the 3-day forecast arrives.
  2. Tap „📍 Най-близка станция“ (location can't be tested from Telegram Web).
  3. Send `/demo` from the presenter chat → „Повторение от 18.12.2025 …“ arrives, and the presenter gets „Изпратено до N“.
- Screen-record the whole flow (under 40 s) as the backup video.
- **Done when:** the video is saved where the demo laptop can play it offline.

### B3 (P0, 15 min): app alert video
- **In the iOS app:**
  1. Pick the asthma profile and the VT station.
  2. Use the debug „Тествай известие сега“ button → the notification fires.
- Record it.
- **Done when:** the video is saved next to the Telegram one.

### B4 (P1, 30–45 min): app polish
- **Mirror V3:** show the forecast time, not only the date.
- **Mirror V4:** clean-day cards say „Чист въздух – няма рискови фактори“.
- **Optional:** the sources line on day 1, with the same rule as the web (`pm25_mean ≥ 5`, `sourcesLine`).
- **Check** that the map's +24/48/72 control works with 560 stations without lag.
- **Done when:** the app runs against the live API with no blank areas.

### B5 (P0, by 15:00): code link for slide 8
`BorisSavianov/dishay-vt` must be openable by the jury.
1. **Scan for secrets first:**
   ```bash
   git log -p --all | grep -nE "postgres(ql)?://|TELEGRAM_BOT_TOKEN=|TELEGRAM_NOTIFY_SECRET=|DATABASE_URL=|GROQ_API_KEY=|[0-9]{9,10}:AA[A-Za-z0-9_-]{30,}"
   ```
2. **If it's clean,** make the repo public.
3. **If anything shows up,** don't make it public: change the slide-8 link to the live site and the README, or to a fresh repo with a squashed history.

**Done when:** the link on slide 8 opens in a private browser window. Tell Velko by 15:00.

### B6 (P0, 16:00–16:30): freeze and smoke test
1. **Merge:** `pnpm check` is green on `main`, and everyone's last PRs are merged by 16:15.
2. **Deploy production,** then check:
   - `/api/health` is OK;
   - `/api/aq` shows `source: "database"` and a `generated_at` under 2 h old;
   - home, map (slider), „Защо?“, methodology and AI all open with no console errors.
3. **Telegram:** `/start` replies.
4. **On the demo laptop:**
   - open all the pages once, so they're cached;
   - have the backup screenshots (`docs/slides/backup/`) and both videos ready offline;
   - have a phone hotspot ready in case the venue Wi-Fi fails.

**Done when:** every item above is ticked in this file (edit the checkboxes below).

### B7 (after the demo)
Rotate the bot token and the notify secret: they were shared in chat. Use `/revoke` in BotFather, then update Vercel and `web/.env.local`, then run `pnpm tg:webhook`.

---

## Freeze checklist (B6, tick in this file)

- [x] PR `teodor/aq-ml` merged; production `/api/aq` has the scoreboard and sources
- [ ] Velko's V1 and V2 merged; `pnpm check` green
- [ ] `/api/aq` `generated_at` < 2 h, `source: "database"`
- [ ] Telegram `/start` and `/demo` work from the demo phone
- [ ] Backup video: Telegram flow
- [x] Backup video: app alert (`docs/slides/backup/app-alert.mp4`)
- [ ] Backup screenshots in `docs/slides/backup/`
- [ ] Deck final; QR scans; the code link opens in a private window
- [ ] 2 timed run-throughs, ≤ 5:00 each (the speaking times add up to about 4:40)
- [ ] Demo laptop charged, charger at hand, pages pre-opened, hotspot ready

## Who answers what at the jury

- **ML, data, validation, sources:** Teodor (`docs/jury-guide.md`).
- **Web, design, accessibility, AI explanation:** Velko.
- **App, alerts, Telegram, deployment and hosting cost:** Boris.
