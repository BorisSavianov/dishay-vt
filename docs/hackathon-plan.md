# Хакатон 20.11.2026: execution plan

**Project: „Дишай ВТ“: 72-hour air-pollution forecast and health alerts.**

> Given the latest readings from citizen PM sensors, the weather forecast and the location, predict hourly PM2.5 and PM10 for the next 72 hours at every sensor in Bulgaria. Warn sensitive groups (asthma, children, elderly, runners) before a bad-air day. Veliko Tarnovo is the featured city.

## Why this topic

- **Judging.** The jury checks three things: does the prototype work, how well is the data used, and how useful is the idea.
  - This is the organisers' own example idea: "прогноза за замърсяването за 3 дни + предупреждение за чувствителни групи".
  - It joins 5 or more sources.
  - It ships a live forecast to the web and to a phone.
- **Data size.** It has the largest data volume of any topic.
  - About 300 Bulgarian sensors × 3 years × hourly ≈ 5–8M rows.
  - Weather back to 1940.
  - CAMS model output to use as a baseline.
- **ML story.** The model has to beat 2 baselines on a held-out winter:
  - persistence ("tomorrow = today");
  - the official CAMS/Copernicus model.
  - The slide: "our local model beats Copernicus for VT by X%".
- **Reuse.** It builds on what already exists: the shell, the maps (MapLibre and Apple Maps), the Health pages, the Groq summaries, Neon, Vercel and the Expo app.

## Data sources (checked live at 09:15 today)

| # | Source | Use | Access |
|---|---|---|---|
| 1 | sensor.community (Luftdaten) | **Target** and lag features. 10 PM sensors are active in VT; hundreds in BG. | Live: `data.sensor.community/airrohr/v1/filter/area=LAT,LON,KM`. History: `archive.sensor.community/YYYY-MM-DD/` per-sensor daily CSVs. The monthly global zips are 3.2 GB/month, so avoid them. |
| 2 | Open-Meteo historical weather (ERA5) | Features: temperature, wind, humidity, boundary-layer height, precipitation, pressure | `archive-api.open-meteo.com/v1/archive`. Free, no key. |
| 3 | Open-Meteo forecast | The same features for the next 72 hours, used at inference | `api.open-meteo.com/v1/forecast` |
| 4 | Open-Meteo Air Quality (CAMS) | Baseline, and a feature (the CAMS PM forecast) | `air-quality-api.open-meteo.com/v1/air-quality`, history and forecast |
| 5 | OpenStreetMap / Overpass | Static features per sensor: roads, buildings, industry within 500 m, elevation. Health layer: pharmacies and hospitals (already fetched). | existing `pipeline/` |
| 6 | Eurostat `sdg_11_50` (PM2.5 exposure) and EEA premature-death estimates | Context screen: Bulgaria vs the EU | Eurostat API (already used) |

Licences go in `docs/sources.md`: sensor.community ODbL, Open-Meteo CC BY 4.0, CAMS (Copernicus licence, attribution), OSM ODbL, Eurostat with source acknowledged.

## Architecture (fits Vercel free)

```
Teodor's PC (RTX 4070)                       Vercel (free)                 Phone
 ml/aq_fetch.py   -> data/raw/aq/...
 ml/aq_features.py -> data/processed/aq.parquet
 ml/aq_train.py   -> ml/models/aq_lgbm.txt (+ report)
 ml/aq_forecast.py (every hour, loop) --upsert--> Neon: aq_forecast  <-- /api/aq  <-- web + mobile
                                      \--write--> web/src/data/aq_forecast.json (fallback, committed at the freeze)
```

- **Why batch inference.** Vercel free can't host LightGBM, Python or GPU work: function size and time limits apply, and Hobby cron runs once a day. So the big model runs on Teodor's PC, and Vercel only serves rows. Quality is not capped by the hosting.
- **The existing exporter stays** for a "what-if" tree. On `/predict`, the user moves wind and temperature and sees the PM change. It's optional, from 14:00 if there's time.
- **Stretch:** GitHub Actions cron (free) runs `aq_forecast.py` hourly after the hackathon.

## Shared contract: `aq_forecast.json` (from `/api/aq`)

Freeze this shape **at 09:45**. Teodor commits a **mock file** with this shape by 09:45, so Velko and Boris build against it straight away. Add it to `contract/CONTRACT.md`.

```jsonc
{
  "generated_at": "2026-11-20T11:00:00+02:00",
  "model": { "name": "lgbm-v1", "trained_rows": 6100000, "sensors": 310,
             "holdout": "winter 2025/26",
             "mae": { "model": 6.1, "cams": 9.8, "persistence": 8.4 },   // µg/m³, PM2.5, 24h horizon
             "exceedance_f1": { "model": 0.78, "cams": 0.55 } },
  "stations": [{
    "id": "sc-35767", "name": "ВТ – център", "city": "Велико Търново", "featured": true,
    "lat": 43.0786, "lon": 25.6211,
    "latest": { "t": "2026-11-20T10:55:00+02:00", "pm25": 18.2, "pm10": 31.0 },
    "hourly": [ { "t": "2026-11-20T11:00:00+02:00", "pm25": 19.1, "pm10": 33.0,
                  "pm25_lo": 14.0, "pm25_hi": 25.0, "cams_pm25": 16.0 } ],     // 72 items
    "daily": [ { "date": "2026-11-21", "pm10_mean": 58.0, "pm25_mean": 34.0,
                 "level": 4,                       // EEA EAQI 1..6 (good .. extremely poor)
                 "exceeds_eu_limit": true,         // PM10 daily mean > 50 µg/m³
                 "reasons": [ { "feature": "pbl_height", "label_bg": "нисък слой на смесване (инверсия)", "impact": 11.2 },
                              { "feature": "wind_speed", "label_bg": "слаб вятър", "impact": 7.4 },
                              { "feature": "temp", "label_bg": "студена нощ – отопление", "impact": 5.1 } ] } ]  // 3 days
  }]
}
```

- **Levels:** EEA European Air Quality Index bands. Teodor checks the current band cut-offs on eea.europa.eu before 10:30 and puts them in one shared constant.
- **Profile rules** (web and mobile share them through `npm run sync`):
  - asthma, child, elderly: alert at level ≥ 3;
  - runner: alert at level ≥ 3, with advice on the best hours to run;
  - everyone else: alert at level ≥ 4.

---

## Teodor: ML (RTX 4070)

| Time | Task | Done when |
|---|---|---|
| 09:20–09:45 | `ml/aq_fetch.py`. Sensor list from `data.sensor.community/static/v2/data.24h.json`, filtered to country BG (SDS011, PMS*, SPS30). **Start the downloader in the background now**: async, 32–64 parallel, resumable, VT sensors first, then the rest of BG ordered by length of history. Aggregate each daily file to hourly means as it lands, and never keep the raw 5-min rows. Commit the **mock `aq_forecast.json`**. | Download running; mock pushed |
| 09:45–10:30 | Weather and CAMS history from Open-Meteo for every sensor coordinate, rounded to a 0.1° grid to cut calls. Clean the sensors: drop flatlines, drop values above 999, apply a humidity correction to SDS011 readings (they over-read when RH > 80%), drop sensors with < 60% uptime. | `data/processed/aq.parquet` |
| 10:30–11:15 | **Features.** Lags 1/3/6/24/48 h; rolling 24 h mean and max; neighbouring sensors' mean within 5 km; weather at the target hour (temperature, wind speed and direction, RH, boundary-layer height, precipitation, pressure tendency); CAMS at the target hour; hour, day of week, month, heating season, holiday; static OSM features; `horizon_h` (1..72). **Direct multi-horizon:** one model with `horizon_h` as a feature, sampling horizons {1,3,6,12,24,36,48,72} to keep the row count sane. **Split by time:** train until Sep 2025, validate on winter 2025/26; never shuffle. | train/val matrices |
| 11:15–12:00 | **LightGBM on GPU** (or XGBoost `device=cuda`), target `log1p(pm25)`, a second model for PM10. Quantile models at 0.1 and 0.9 give the `lo`/`hi` band. Report MAE per horizon vs persistence vs CAMS, plus exceedance F1, for all of BG **and for VT separately**. | Model beats both baselines; report saved |
| 12:00 | `ml/aq_forecast.py`: pull live sensors, the Open-Meteo forecast and the CAMS forecast → predict 72 h → SHAP top 3 per day → upsert into Neon `aq_forecast` and write the fallback JSON. Run it in a loop every 60 min. | **Live on the deployed site by 12:15** |
| 12:15–15:30 | Improve in priority order: (1) tune on the VT holdout; (2) neighbour and upwind features using wind direction; (3) a challenger, either a small temporal model on the 4070 or a LightGBM ensemble, shipped only if it wins; (4) a distilled tree through `ml.train` for the what-if page. Keep every report in `ml/reports/`. | Each win is redeployed |
| 15:30–16:30 | Freeze the model. Make the ML slide: data volume, model vs CAMS vs persistence, top features, one real past smog episode the model caught. Commit the final fallback JSON. | Slide and numbers final |

**Guardrails**
- No future data in the features: CAMS and weather must be the *forecast* values available at issue time. For history, use the observed values and say so on the slide.
- If the download is slow at 10:30, train on what has landed. VT plus about 50 BG sensors is enough.

## Velko: Web (Next.js on Vercel)

| Time | Task | Done when |
|---|---|---|
| 09:20–09:45 | Neon: add an `aq_forecast` table (one JSONB row per station plus `generated_at`) to `web/db/schema.sql`. Build `/api/aq` (all stations, summary) and `/api/aq/[id]` (full 72 h). Fall back to the bundled JSON as the current data loader does. Cache for 5 min. | API returns the mock |
| 09:45–11:30 | **New home page, „Въздух сега“:** the VT card first (today's level, colour and advice); a 72 h line chart with the uncertainty band and a dashed CAMS line; 3 day cards with reasons ("слаб вятър + инверсия"). Bulgarian and English as now. | Works on the mock at 390 px and on desktop |
| 11:30–12:30 | **Map:** stations coloured by the forecast level, with a time slider (now → +72 h) that animates the colours. Toggle the health layer: pharmacies and hospitals already exist. Clicking a station opens its forecast. | Slider animates |
| 12:30–14:00 | **"Защо?" page:** model vs CAMS vs persistence chart (from `model.mae`), feature importance, and the past-episode replay. **Bulgaria vs EU** context from Eurostat `sdg_11_50`. AI Insights: point the existing Groq summary at the forecast ("explain tomorrow for parents of an asthmatic child"), keeping the figure-built fallback. | All three render |
| 14:00–15:30 | What-if page (reuse `/predict` with Teodor's distilled tree) if it's ready; otherwise polish. Update Methodology and Sources. Remove the old health-only dashboard from the nav, or fold it into the health layer. | |
| 15:30–16:30 | Full test pass: `pnpm typecheck && pnpm test && pnpm build`, a phone check, and offline fallback mode. | Green build |

## Boris: Mobile (Expo) and deploys

| Time | Task | Done when |
|---|---|---|
| 09:20–09:45 | Make sure the iOS dev build runs (`npx expo run:ios`). Add `expo-notifications` and rebuild **now**, because native modules need a rebuild. Deploy the site once to confirm the pipeline still works. | Dev build with notifications |
| 09:45–11:30 | Onboarding: pick a profile (астма / дете / възрастен / бегач / друго) and a home station (nearest by GPS, or VT). Stored with AsyncStorage. **Tab 1, „Въздух“:** today's level card, 72 h chart and 3 day cards, built from the mock via `npm run sync` types. | Works on the mock |
| 11:30–13:00 | **Alerts:** on app open and on background fetch, pull `/api/aq/[home]`, apply the profile rule, and schedule a **local notification** for 07:30 on the day before each bad day ("Утре PM10 ~58 µg/m³. За деца с астма: без навън след 17:00"). Add a debug "test alert now" button for the demo. | Notification fires on the phone |
| 13:00–14:30 | Map tab: Apple Maps stations coloured by level (reuse the clustering) with a +24/+48/+72 h segmented control. Health tab: nearest pharmacy and hospital from the existing data. | |
| 14:30–15:30 | A "best hours to go out today" strip (the lowest-PM window in the hourly forecast), and widget-style polish. | |
| All day | **Deploy owner:** deploy every teammate push within 10 minutes. Check `/api/health` and `/api/aq` after each deploy. | |
| 15:30–16:30 | Record a backup screen video of the push alert, in case the demo phone or the Wi-Fi fails. | Video saved |

---

## Presentation (official format: Null Pointers, table 6, 8 slides, at most 5 min)

### Jury rubric (100 points) and how we score each line

| Criterion | Pts | What earns it for us |
|---|---|---|
| Проблем и цел | 15 | One number on slide 2 (Eurostat: BG vs the EU average, plus how many days VT had PM10 > 50 last winter). Who has the problem: about 1 in 10 children with asthma, the elderly, runners. One goal sentence. |
| Използване на данните | **25** | Six joined sources, ~6M rows, honest cleaning (the SDS011 humidity correction), a time split, no leakage. Have a ready answer to **„а защо точно тези данни?“**: official stations don't cover VT, so citizen sensors are the only measured VT series; weather drives smog, so we use weather; CAMS is the official forecast, so it's the baseline we must beat. |
| Работещ прототип | **25** | A live URL, a live phone alert, and a forecast generated today. Complete against the goal: forecast + explanation + alert. |
| Полезност и резултати | 20 | Model vs CAMS vs persistence in one bar chart. One past smog episode the model warned about 24–48 h ahead. "A parent would have known the evening before." |
| Демо и следващи стъпки | 15 | Answer all 6 questions clearly; a concrete slide 7. |

**Special prizes we target:** „Най-умно използване на публични данни“ (beating Copernicus with citizen data) and „Решението, което най-много би помогнало на хората“ (alerts for sensitive groups).

### The 8 slides (rules: little text, big fonts, one idea per slide, charts not tables; everyone speaks; time it)

| # | Slide | Content | Speaker | Time |
|---|---|---|---|---|
| 1 | Заглавие | „Дишай ВТ“ · Null Pointers · Teodor, Velko, Boris. "Прогноза за мръсния въздух 72 часа напред и предупреждение за чувствителните." | Boris | 15 s |
| 2 | Проблемът | One big chart: BG vs the EU on PM2.5, plus the VT exceedance days. Who suffers. | Velko | 35 s |
| 3 | Целта | One sentence: "Да предупредим човек с астма в ВТ ден по-рано, по-точно от официалната прогноза." | Velko | 15 s |
| 4 | Решението и данните | A simple diagram: 6 sources → model on the 4070 → Neon → web + phone. Numbers: rows, sensors, years. | Teodor | 45 s |
| 5 | **Демо на живо** | Web: VT card → 72 h chart → reasons → map slider. Phone: asthma profile → alert. **Backup screenshots and video ready.** | Velko (web), Boris (phone) | 100 s |
| 6 | Резултати | Bar chart: MAE model vs CAMS vs persistence (VT and all BG); exceedance F1; the past episode the model caught. | Teodor | 45 s |
| 7 | Какво следва | Hourly GitHub cron, schools and municipalities as users, more cities, calibrating against official stations. | Teodor | 20 s |
| 8 | Благодарим | Code link + QR to the live URL. Questions. | Boris | 5 s |

### Before the demo (the organisers' checklist)

- [ ] Code link and description submitted
- [ ] Slides open, full screen
- [ ] Everyone knows which slides they present
- [ ] Backup screenshots and video of the demo
- [ ] Laptop charged, charger at hand
- [ ] Full demo run at least once, start to end
- [ ] Timed: under 5 minutes
- [ ] Answer ready for „а защо точно тези данни?“

## Milestones (shared)

| Time | Gate |
|---|---|
| 09:45 | Contract and mock JSON pushed; API reads the mock |
| 12:15 | A real forecast live on the deployed URL |
| 14:30 | All main screens done on web and mobile |
| 16:30 | **Feature freeze.** Only fixes after this. Final fallback JSON committed. |
| 15:00 | Slides drafted (Velko owns the deck; Teodor adds slides 4 and 6) |
| After 16:30 | 2 timed rehearsals (≤ 5 min); backup video; checklist ticked |

## Cut list (drop in this order if late)

1. What-if page
2. The challenger model
3. Mobile map tab
4. The AI summary for the forecast
5. Bulgaria vs EU context

Never cut: the live forecast, the model-vs-CAMS proof, or the phone alert.
