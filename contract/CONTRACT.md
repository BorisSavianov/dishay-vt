# Data contract

Every file in `web/src/data/` is written by `pipeline/build.py`. The same files are seeded into the Neon `datasets` table by `pnpm seed`, and the app falls back to them when the database is not set or unreachable. The web types in `web/src/lib/types.ts` must match these shapes. Change a shape only after telling the whole team.

## Meta (every file)

- `source`: human-readable source name
- `as_of`: `YYYY-MM-DD`, the date of the source data
- `license`: licence or reuse condition, shown in the app footer
- `generated_at`: ISO 8601 UTC timestamp of the build

## Time series

`{ "meta": Meta, "series": [{ "year": int, "value": number }] }`, sorted by year.

Files: `population_veliko_tarnovo.json`, `health_physicians_bg.json`.

## Points

`{ "meta": Meta, "counts": { "<type>": int }, "points": [Point] }`

`Point`: `{ "lat": number, "lon": number, "type": string, "name"?: string, "address"?: string, "hours"?: string, "phone"?: string, "website"?: string }`. Everything after `type` is optional and copied as typed from OpenStreetMap tags (`name`, `addr:*`, `opening_hours`, `phone`, `website`). A point without a field has no such key. The apps open `website` only when it is an http or https address.

Files: `facilities_veliko_tarnovo.json`.

## Region

`{ "meta": Meta, "geometry": { "type": "Polygon" | "MultiPolygon", "coordinates": ... }, "check": { "points": int, "inside": int } }`

The outline of Veliko Tarnovo province (OpenStreetMap relation 1739524, admin level 4), simplified to about 1,500 vertices. Coordinates are `[lon, lat]`, rings are closed, the first ring of a polygon is its outer edge. `check` is the pipeline's own test: how many of the facility points lie inside the outline. The apps say that every point is inside only when `inside` equals `points`.

Files: `region_veliko_tarnovo.json`. It is bundled with the apps and never seeded into the database, so the map outline needs no database.

## ML API

The model is `web/src/model/model.json`, written by `python -m ml.train` and bundled with the app. The web app and the mobile app call the same routes on the deployed URL. TypeScript types: `web/src/lib/ml/types.ts` (copied to `mobile-kit/ml/types.ts`). All responses carry `Access-Control-Allow-Origin: *` and `Cache-Control: no-store`.

### `GET /api/model`

`{ "ok": true, "model": ModelInfo }`

- `name`, `version`, `kind` (`"fixture"` = placeholder on toy data, `"trained"` = real), `algorithm`, `task` (`"regression"` | `"classification"`), `trained_at`
- `target`: `{ name, unit, classes? }`; `classes` only for classification
- `features`: the inputs, in order. Build forms from this list.
  - number: `{ name, type: "number", required, impute, min, max }`
  - category: `{ name, type: "category", required, impute, categories }`; `"__other__"` means any other value
- `metrics`: `{ primary, model, baseline, rows: { train, test }, split, refit_on_all_rows }`. Regression: `mae`, `rmse`, `r2`. Classification: `accuracy`, `f1_macro`, `roc_auc` (binary only). Measured on the holdout; the baseline predicts the mean or the most common class.
- `importances`: `[{ feature, value }]`, summing to 1, largest first
- `meta`: `{ source, as_of, license, generated_at }`, as for the datasets

### `POST /api/predict`

Request: `{ "inputs": { "<feature>": value, ... } }` or `{ "inputs": [ {...}, ... ] }`, 1 to 100 rows, body at most 32 KB.

- Numbers may be sent as text: `"12,5"` and `"1 200"` are read as 12.5 and 1200.
- A missing, `null` or empty value is filled with the feature's `impute`, unless the feature is `required`.
- A category value never seen in training gives a warning, not an error.
- An unknown feature name is an error, so typos are caught.

Response `200`:

```json
{
  "ok": true,
  "task": "regression",
  "predictions": [{ "value": 208.57 }],
  "explanations": [[{ "feature": "bmi", "op": ">", "threshold": 27.75, "input": 31.5 }]],
  "warnings": [{ "row": 0, "field": "age", "issue": "missing, used 50" }],
  "model": { "name": "fixture-diabetes", "version": "20261119-151118", "kind": "fixture", "algorithm": "DecisionTreeRegressor [tree(max_depth=3)]", "unit": "disease progression score" }
}
```

- Regression prediction: `{ "value": number }`. Classification: `{ "label": string, "probabilities": { "<class>": number } }`.
- `explanations` appears only when the model is a single decision tree: one list of steps per row. A step is `{ feature, op: "<=" | ">", threshold, input }` or `{ feature, op: "=" | "!=", value, input }`.

Errors: `{ "ok": false, "error": { "code", "message", "details"? } }`

| Status | `code` | When |
| --- | --- | --- |
| 400 | `invalid_json` | Body is not JSON |
| 400 | `invalid_input` | Wrong shape, 0 or over 100 rows, unknown feature, not a number, required missing. `details`: `[{ row, field, issue }]` |
| 413 | `too_large` | Body over 32 KB |
| 503 | `model_unavailable` | `model.json` missing or invalid |

The client in `web/src/lib/ml/client.ts` adds `network`, `timeout` and `bad_response`.

### `GET /api/health`

Also returns `model: { name, version, kind, algorithm, unit }`, or `null` when no model loads.

### Changing the model

Train, commit `web/src/model/model.json`, deploy. The routes and the clients do not change. Only screens that hard-code feature names need updating; screens built from `features` adapt on their own.

## Air quality (forecast)

Written by `ml/aq_forecast.py` on Teodor's PC every hour, upserted into Neon and served by `/api/aq`. The bundled fallback is `web/src/data/aq_forecast.json` (the same shape; a mock from `python -m ml.aq_mock` until the real one is committed at the freeze). Types: `mobile/src/aq/types.ts`. Shape check: `ml/aq_contract.py`.

```jsonc
{
  "generated_at": "2026-11-20T11:00:00+02:00",
  "model": { "name": "lgbm-v1", "kind": "trained",          // "mock" for demo data: label it as such
             "trained_rows": 6100000, "sensors": 310, "holdout": "winter 2025/26",
             "mae": { "model": 6.1, "cams": 9.8, "persistence": 8.4 },   // µg/m³, PM2.5, 24 h horizon, holdout
             "exceedance_f1": { "model": 0.78, "cams": 0.55 } },        // next-day PM10 mean > 50
  "stations": [{
    "id": "sc-35767", "name": "ВТ – Център", "city": "Велико Търново", "featured": true,
    "lat": 43.0786, "lon": 25.6211,
    "latest": { "t": "2026-11-20T10:55:00+02:00", "pm25": 18.2, "pm10": 31.0 },   // or null
    "hourly": [ { "t": "2026-11-20T11:00:00+02:00", "pm25": 19.1, "pm10": 33.0,
                  "pm25_lo": 14.0, "pm25_hi": 25.0, "cams_pm25": 16.0 } ],      // 72 items, next hour first
    "daily": [ { "date": "2026-11-21", "pm10_mean": 58.0, "pm25_mean": 34.0, "level": 3, "alert_level": 4,
                 "exceeds_eu_limit": true,
                 "reasons": [ { "feature": "pbl_height", "label_bg": "нисък слой на смесване (инверсия)",
                                "label_en": "low mixing layer (inversion)", "impact": 11.2 } ] } ]  // 3 days
  }]
}
```

- Times are local (`Europe/Sofia`, `+02:00` in winter) with the offset. `daily[].date` is a local calendar date; the 3 days are tomorrow, +2 and +3 (today is in `hourly`).
- Values are µg/m³, one decimal. Sensor values are humidity-corrected (SDS011 and similar over-read in fog); `cams_pm25` is the raw CAMS Europe forecast at the station.
- `pm25_lo` / `pm25_hi` are the 10th and 90th percentiles. `lo <= pm25 <= hi` always.
- `level` is the EEA EAQI 1..6 of the daily means: the worse of the PM2.5 and PM10 bands. Band edges: `mobile/src/aq/levels.ts` (`PM25_BANDS`, `PM10_BANDS`); `ml/aq_levels.py` mirrors them and a test fails if they drift. The web should use the same numbers.
- `exceeds_eu_limit` is `pm10_mean > 50`.
- `alert_level` (optional, 1..6, always `>= level`): **the level the alerts use.** It is the EAQI of the upper-middle of the forecast band (about the 70th percentile of the day), because missing a smog day costs more than a false alarm. On the winter 2025/26 holdout in VT, day-before warnings at level 3 with `alert_level` caught 18 of 23 bad days with 11 false alarms (CAMS: 20 caught, 23 false; `level`: 7 caught, 2 false). Show `level` as the forecast; decide push alerts and "risky for sensitive groups" badges with `alert_level ?? level`.
- `reasons`: up to 3 per day, largest `|impact|` first. `impact` is the µg/m³ the feature group adds (positive) or removes (negative) from the day's PM2.5. `feature` is one of `pbl_height`, `wind_speed`, `temp`, `rh`, `precip`, `persistence`, `neighbours`, `cams`, `calendar`. `label_en` is optional.
- Ids: `sc-<sensor.community sensor id>`. `featured` marks the Veliko Tarnovo stations shown first (within 10 km of the centre).
- Levels: the EEA defines the index on hourly values (airindex.eea.europa.eu, 2024 revision); `daily[].level` applies the same bands to the daily means.

Optional `model` fields for the „Защо?“ page (all measured on the winter 2025/26 holdout, PM2.5, µg/m³):

```jsonc
"algorithm": "XGBoost (GPU, RTX 4070)",       // or "LightGBM": show this, do not hard-code the library
"band_coverage": 0.77,                         // share of real values inside pm25_lo..pm25_hi (nominal 0.8)
"mae_vt": { "model": 6.3, "cams": 16.5, "persistence": 8.0 },            // Veliko Tarnovo stations only, 24 h
"mae_by_horizon": [ { "h": 1, "model": 1.6, "persistence": 1.5, "cams": 11.9 }, ... ],  // h = 1,3,6,12,24,36,48,72
"importance": [ { "group": "persistence", "label_bg": "замърсяване в последните часове",
                  "label_en": "pollution in the last hours", "share": 0.38 }, ... ]  // shares sum to 1, largest first
```

### Neon table

```sql
create table if not exists aq_forecast (
  id text primary key,                 -- '_model' or a station id
  generated_at timestamptz not null,
  payload jsonb not null               -- '_model': { generated_at, model }; station rows: one AqStation
);
```

Each run replaces all rows in one transaction (stations missing from the run are deleted), so a reader never sees two runs mixed. `/api/aq` = the `_model` row plus all station rows; fall back to the bundled JSON when the table is empty or the query fails, as `loadDatasets` does. Note: the app reads `DATABASE_URL`; the Vercel Postgres integration only sets `POSTGRES_URL`, so set `DATABASE_URL` in Vercel too.

### `GET /api/aq`

`{ generated_at, model, stations[] }`. Stations leave out `hourly` to keep the response small; `daily` (3 days) and `latest` are always present. `404` or an error makes the apps fall back to their labelled demo data.

### `GET /api/aq/<station id>`

One `AqStation` with `hourly` (72 items). `404` for an unknown id.

### Web implementation of the two routes

- Both return bare JSON (no `ok` wrapper) plus `source`: `"database"` (Neon), `"bundled"` (`web/src/data/aq_forecast.json`) or `"demo"`. `"demo"` means invented numbers: either `model.kind` is `"mock"`, or neither Neon nor the file has a forecast and the web built one with the same generator as `mobile/src/aq/mock.ts`. A client must label `"demo"` as demo data. The same value is in the `X-Data-Source` header.
- Unknown station: `404 { "ok": false, "error": { "code": "not_found", "message" } }`.
- Headers: `Access-Control-Allow-Origin: *`; `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` (errors: `no-store`).
- Web copies of the types and levels: `web/src/lib/aq/` (`types.ts`, `levels.ts`, `mock.ts`, `strings.ts`). Change band edges in every copy at once.
- `GET /api/health` also returns `aq: { source, generated_at, model, stations }`.

### Optional model fields (web „Защо?“ page)

All optional; the page hides a block whose field is missing.

- `model.importance`: `[{ group, label_bg, label_en, share }]`, feature importance by reason group, largest first (see "Optional `model` fields" above; an earlier draft called it `importances`).
- `model.episode`: `{ station_id, date, issued_at, observed: [{ t, pm10 }], predicted: [{ t, pm10 }], cams?: [{ t, pm10 }] }`, one past smog day and the forecast issued the day before it. The ML writer also sends `pm25` per point and the daily and score blocks below.

### `model.episode` (in every forecast, for the „Защо?“ page)

The day-before forecast of the replayed smog day, in the shape `web/src/lib/aq/types.ts` expects, plus additive fields:

```jsonc
"episode": { "station_id": "vt-city", "place": "Велико Търново", "place_en": "Veliko Tarnovo",
             "date": "2025-12-18", "issued_at": "2025-12-17T12:00:00+02:00",
             "observed":  [ { "t": "...", "pm10": 70.1, "pm25": 31.2 } ],   // 24 hourly, VT city mean
             "predicted": [ { "t": "...", "pm10": 41.2, "pm25": 19.3 } ],
             "cams":      [ { "t": "...", "pm10": 25.3, "pm25": 19.0 } ],
             "observed_daily": {...}, "predicted_daily": { ..., "alert_level": 3 }, "cams_daily": {...},
             "score": {...} }                                                 // as in aq_episode.json
```

### Episode replay: `web/src/data/aq_episode.json`

Written by `python -m ml.aq_episode` (bundled, static). A real smog day in Veliko Tarnovo from the winter 2025/26 holdout, replayed with the models trained *before* that winter, so it is an honest forecast. For the „Защо?“ page and slide 6.

```jsonc
{
  "date": "2025-12-18", "place": "Велико Търново", "place_en": "Veliko Tarnovo", "sensors": 9, "model": "xgb-v2",
  "observed": [ { "t": "2025-12-18T00:00:00+02:00", "pm25": 31.2, "pm10": 70.1 } ],   // 24 hourly, VT city mean
  "cams":     [ { "t": "...", "pm25": 19.0, "pm10": 25.3 } ],                         // CAMS at the same hours
  "observed_daily": { "pm10_mean": 68.9, "pm25_mean": 30.0, "level": 3, "exceeds_eu_limit": true },
  "cams_daily":     { "pm10_mean": 25.7, "pm25_mean": 19.7, "level": 3, "exceeds_eu_limit": false },
  "forecasts": [ { "issued": "2025-12-16T12:00:00+02:00", "days_before": 2, "lead_hours": [36, 59],
                   "hourly": [ { "t": "...", "pm25": 23.1, "pm10": 43.2, "pm25_lo": 12.0, "pm25_hi": 35.0 } ],
                   "daily": { "pm10_mean": 43.2, "pm25_mean": 23.1, "level": 3, "exceeds_eu_limit": false } },
                 { "days_before": 1, ... } ],
  "score": { "days": 178, "bad_days": 23,                                             // day-before warnings, level >= 3
             "model_alert": { "hits": 18, "misses": 5, "false_alarms": 11, "pod": 0.78, "far": 0.38 },  // alert_level
             "model_level": { "hits": 7, "misses": 16, "false_alarms": 2, "pod": 0.3, "far": 0.22 },
             "cams":  { "hits": 20, "misses": 3, "false_alarms": 23, "pod": 0.87, "far": 0.53 },
             "worst10": { "model_warned": 9, "cams_warned": 10 } }
}
```

### `model.scoreboard` (optional, for the „Защо?“ page „Проверка на живо“)

Written by `ml/aq_forecast.py` every hour. The two parts are:
- `replay`: from `python -m ml.aq_scoreboard --replay`, cached on Teodor's PC;
- `live`: the forecasts logged since the loop started, scored as the readings arrive.

Either part may be missing. When both are missing, the whole field is left out, and it never carries mock numbers. The web hides the section when the field is missing.

```jsonc
"scoreboard": {
  "updated_at": "2026-11-20T13:07:00+02:00",
  "replay": {                              // 1–19 Nov 2026, never seen by the models
    "from": "2026-11-01", "to": "2026-11-19", "issued_local": "12:00",
    "models": "trained before winter 2025/26",
    "weather": "forecast",                 // archived forecast runs (Open-Meteo Previous Runs), never newer than the issue time
    "blh": "none",                         // "none" = no boundary-layer height at all; "era5" = observed BLH: the page MUST say so
    "cams": "archive",                     // CAMS (model input and baseline) is Open-Meteo's CAMS archive, fresher than the issue time: the page MUST say so
    "days": 19,
    "mae_pm25_next_day": { "vt": { "model": 3.4, "cams": 6.0, "persistence": 4.9 },   // µg/m³, hourly PM2.5, next-day hours (12–35 h ahead)
                           "bg": { "model": 3.0, "cams": 7.7, "persistence": 4.2 } },
    "vt_days": [ { "date": "2026-11-02", "model_pm10": 41.0, "cams_pm10": 22.0, "observed_pm10": 45.3,
                   "model_level": 2, "observed_level": 2 } ]          // VT city mean, days with >= 18 observed hours
  },
  "live": { "since": "2026-11-20T10:00:00+02:00",   // first logged run
            "checked_hours": 37,                     // distinct forecast hours that have passed and were scored (>= 1)
            "horizons": "1–6 h",                     // horizons scored so far
            "mae_pm25": { "model": 2.1, "cams": 4.0, "persistence": 2.6 } }
}
```

All three MAEs are computed over the same hours: an hour counts only when the observation, the model, CAMS and persistence are all present.

Honesty note: the weather is as forecast at the time, but CAMS (both the model's CAMS input and the CAMS baseline) is the archive, which keeps the newest run for each hour. Model vs CAMS is therefore like-for-like, while model vs persistence is slightly flattered. The holdout numbers share this. The BG numbers cover the 50 cells with CAMS history.

### `sources` (estimate, VT only) and `model.sources_what_if`

These are written by `ml/aq_forecast.py` from `ml/models/aq_sources.json` (`python -m ml.aq_sources --profiles`). They are an **estimate**, with no chemical analysis behind them, and every place that shows them must say „оценка“.

```jsonc
// on the featured (VT) stations' daily[] items: shares of the day's PM2.5, summing to 1
"sources": { "heating": 0.64, "traffic": 0.08, "regional": 0.15, "other": 0.13 }

// on model
"sources_what_if": { "method": "estimate", "switch_share": 0.2,     // 20% of wood-heated homes switch heating
                     "date": "2026-11-21", "evening_drop_pm25": 3.1, // µg/m³, mean over that date's 18:00–23:59
                     "last_winter": { "bad_days": 15, "bad_days_after": 11, "days": 170 } }  // winter 2025/26, EAQI >= 3
```

How the split works:
- **regional:** the 20th percentile of forecasts for stations 15–80 km from VT.
- **always-on local excess:** taken from warm hours (> 10 °C) by hour and weekday/weekend, using the winters before the holdout.
- **traffic:** that excess on weekdays minus weekends.
- **heating:** the rest of the local excess.

Two biases to state:
- on inversion nights, traffic smoke is trapped too, so heating is slightly over-credited;
- „пренос“ includes the smoke of nearby villages.
