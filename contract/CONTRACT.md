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

`{ "meta": Meta, "counts": { "<type>": int }, "points": [{ "lat": number, "lon": number, "type": string, "name"?: string }] }`

Files: `facilities_veliko_tarnovo.json`.

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
