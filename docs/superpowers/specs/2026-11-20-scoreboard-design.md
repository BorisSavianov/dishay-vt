# Live forecast scoreboard („Проверка на живо“): design

Owners: Teodor (data, from about 12:15) and Velko (UI, from 13:00). Size: small project (short design).

## Why

The holdout numbers come from last winter, scored with *observed* weather. The jury will ask whether the model works now, with real forecast weather, and whether it used future data. The scoreboard answers both:
- on data nobody trained on (this season);
- with the weather as it was actually forecast;
- and with every live run from today scored as the sensors report.

This targets "Използване на данните" (25 pts) and "Полезност и резултати" (20 pts), and it adds a pair of bars to slide 6.

## Goals

- **Replay of 1–19 Nov 2026.** A forecast issued every day at 12:00 local, using the `ml/models/aq_*_eval` models. Those were trained before winter 2025/26, so they have seen neither last winter nor this autumn. Baselines: CAMS and persistence. Scope: VT and all of BG.
- **Live:** every hourly forecast from today is logged, then scored as the readings arrive.
- **On the page:**
  - the headline MAE for model vs CAMS vs persistence;
  - VT day rows: „казахме / CAMS / измерено“;
  - the live strip: „На живо от 10:00: N проверени часа, грешка …“.

## Non-goals and anti-goals

- **Non-goals:** retraining; a new Neon table or API route; replaying more than this season.
- **Anti-goals:**
  - Any future data that isn't disclosed. Every replay number states its weather source and its BLH mode.
  - Scoring with the production models, which were refitted on everything and so would make the replay in-sample.

## Approaches (data path)

| | Approach | Trade-off | |
|---|---|---|---|
| A | **A `model.scoreboard` field in the forecast payload.** The PC logs the forecasts it issues and rescores every hour. The field rides the existing Neon `_model` row and the fallback JSON. | No new table, route or deploy, and it works offline. History is limited to what the PC keeps. | **Picked** |
| B | A Neon `aq_verify` table plus `/api/aq/verify` | Easier to query, but more plumbing before 13:00 | Rejected |
| C | A static `web/src/data/aq_scoreboard.json` | The simplest option, but the live part only moves when someone recommits | Rejected |

## Design

**Replay** (`python -m ml.aq_scoreboard --replay`, run once, cached in `data/processed/scoreboard_replay.json`):

- **Issue times:** every day from 31 Oct to 18 Nov 2026 at 12:00 Europe/Sofia. The targets are the next day's 24 hours, 12–35 h ahead.
- **Sensor features:** from the hourly archive, using hours before the issue time only. The panel is built as in `ml/aq_episode.py` (`build_panel`, `derive`, `features`).
- **Weather at the target hour:** Open-Meteo Previous Runs API (`previous-runs-api.open-meteo.com/v1/forecast`). It covers temperature, RH, wind speed and direction, precipitation and surface pressure. A target on day D, issued on day I, uses `*_previous_day{D−I}`. For the next-day replay that's always `previous_day1`. The calls go per 0.25° cell, as in the live run, and are cached.
- **Boundary-layer height.** The archive has none (checked for GFS, ECMWF and ICON), so the replay runs twice:
  - `blh: "none"`: BLH is left NaN. LightGBM sends missing values down its learned default branch.
  - `blh: "era5"`: observed ERA5 BLH. It ends on 14 Nov; after that, fill it from the live forecast API's `past_days`.
  - The payload carries the strict `"none"` run if its VT MAE still beats CAMS. Otherwise it carries `"era5"`, and the page says the boundary layer is observed.
- **CAMS:** from the same continuous Open-Meteo archive the holdout used, which if anything flatters CAMS.
- **Persistence:** the last value at the issue time.
- **Score:**
  - MAE of hourly PM2.5 over the next-day hours, per sensor-hour, as the holdout numbers do, for VT sensors and all BG sensors.
  - VT day rows use the VT city mean, the same way the episode does.
  - Hours with no observation are skipped. The `days` count reports the days actually scored.

**Live log and score** (inside `run_once`):

- **Log:** after each run, append the issued forecasts to `data/forecast_log/issued-YYYY-MM-DD.parquet`. Columns: `issued_at`, `station_id`, `t`, `horizon_h`, `pm25`, `pm10`, `cams_pm25`, plus `persistence_pm25`, the last value at issue.
- **Score:** each hour, join the log with the observed hourly means from the live collector plus the archive, for every hour whose `t` has passed, and compute MAE for model, CAMS and persistence over all checked sensor-hours.
- **Horizon label:** `horizons` is the span actually checked so far, for example "1–6 h".
- **Contract:** `aq_contract.py` validates the block as optional.

**Contract** (an optional field; add it to `contract/CONTRACT.md` and to the web's `AqModel` type):

```jsonc
"scoreboard": {
  "updated_at": "2026-11-20T13:07:00+02:00",
  "replay": {
    "from": "2026-11-01", "to": "2026-11-19", "issued_local": "12:00",
    "models": "trained before winter 2025/26",
    "weather": "forecast",                 // archived forecast runs (Open-Meteo Previous Runs)
    "blh": "none",                         // "none" | "era5" (observed: the page must say so)
    "days": 19,
    "mae_pm25_next_day": { "vt": { "model": 3.4, "cams": 6.0, "persistence": 4.9 },
                           "bg": { "model": 3.0, "cams": 7.7, "persistence": 4.2 } },
    "vt_days": [ { "date": "2026-11-02", "model_pm10": 41.0, "cams_pm10": 22.0, "observed_pm10": 45.3,
                   "model_level": 2, "observed_level": 2 } ]
  },
  "live": { "since": "2026-11-20T10:00:00+02:00", "checked_hours": 37, "horizons": "1–6 h",
            "mae_pm25": { "model": 2.1, "cams": 4.0, "persistence": 2.6 } }
}
```

**Mock first.** By 12:45, Teodor commits the fallback JSON with a `scoreboard` block labelled mock, so Velko can build against it at 13:00. The numbers become real when the replay lands.

**Web (Velko):**
- **„Защо?“:** a „Проверка на живо“ section with three parts:
  - headline bars (VT and BG);
  - a 3-week line of observed vs model vs CAMS PM10, from `vt_days`;
  - the live strip.
  - A one-line note gives the weather source and the BLH mode. When `blh` is `"era5"`: „слоят на смесване е измерен, не прогнозен“.
- **Home (optional):** „Вчера за днес казахме X, измерено Y“, from the last `vt_days` row, once it covers yesterday.
- When the field is missing, the section is hidden.

**Slide 6 (Teodor):** `aq_slides.py` adds a "this season, forecast weather" pair of bars next to the holdout bars.

**Tests (pytest, small frames):**
- Lead-day mapping: target D, issue I → `previous_day{D−I}`.
- Scoring skips missing observations and computes MAE per sensor-hour.
- Live log append and score on a toy log.
- BLH selection: the strict run is picked when it beats CAMS, otherwise ERA5.
- Contract validation of the optional block.

## Left to the builder

The cell batching and caching for the Previous Runs API, the parquet partitioning, the chart styling on „Защо?“, and whether the home-page line ships.
