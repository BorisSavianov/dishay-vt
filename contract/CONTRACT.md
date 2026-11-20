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
    "daily": [ { "date": "2026-11-21", "pm10_mean": 58.0, "pm25_mean": 34.0, "level": 3,
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
- `reasons`: up to 3 per day, largest `|impact|` first. `impact` is the µg/m³ the feature group adds (positive) or removes (negative) from the day's PM2.5. `feature` is one of `pbl_height`, `wind_speed`, `temp`, `rh`, `precip`, `persistence`, `neighbours`, `cams`, `calendar`. `label_en` is optional.
- Ids: `sc-<sensor.community sensor id>`. `featured` marks the Veliko Tarnovo stations shown first.

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
