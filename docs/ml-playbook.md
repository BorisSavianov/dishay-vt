# ML playbook for Friday 20.11

The goal is a real model live by 12:00, improved until the 15:30 feature freeze. Commands run from the repo root on Teodor's laptop. Web (Velko) and mobile (Boris) build against `/api/model` all day: the placeholder model already answers, so nobody waits on the ML work.

## Before 09:00

```bash
git pull
uv sync --group ml
uv run --group ml pytest -q
cd web && pnpm install && pnpm test
```

Expected: 12 Python tests and all web tests pass, including the parity test.

## 09:00–09:20: pick the question

Write one sentence: "Given X, predict Y for Z." It must be a question the jury cares about and one the data can answer.

| The question asks for | Task | Primary metric |
| --- | --- | --- |
| A number (count, price, rate, level) | regression | RMSE (also MAE, R²) |
| A category (yes/no, risk band, type) | classification | macro F1 (also accuracy, ROC-AUC) |
| Next year's value of a series | regression with a time split and lag features | RMSE on the latest years |
| Groups or anomalies, no label | not supported by the exporter: compute in `pipeline/`, ship as JSON | — |

Prefer a target with at least a few hundred rows. If the only data is an 11-point series, fit a simple trend in `pipeline/` and say so; a tree on 11 rows is not credible.

## 09:20–10:30: data

1. Download raw files into `data/raw/` (git-ignored). Note source, licence and date for `docs/sources.md`.
2. Look at them:

   ```bash
   uv run --group ml python -m ml.inspect data/raw/<file>.csv
   ```

   Bulgarian CSVs (`;`, decimal comma, cp1251) load without flags. Use `--sheet` for XLSX and `--encoding` if text looks wrong.
3. If the data needs joining, filtering or lag features, write a short script that saves one clean CSV to `data/processed/<name>.csv`. Lags for "next year" questions:

   ```python
   df = df.sort_values(["region", "year"])
   df["value_lag1"] = df.groupby("region")["value"].shift(1)
   ```

4. Drop columns that leak the answer: the target under another name, or values measured after the target.

## 10:30–12:00: first model, live

```bash
uv run --group ml python -m ml.train --data data/processed/<name>.csv --target <column> --features a,b,c --unit "<unit>" --source "<source>" --license "<licence>" --as-of <YYYY-MM-DD>
```

- Time series: add `--time-col year --test-from 2022` to hold out the latest years.
- The output lists cross-validation scores per model, then holdout scores for the chosen model and the baseline. **If the model does not beat the baseline, do not ship it.** Change the features or the question.
- For a model the jury can read, force a single tree with `--models tree`; the UI then shows its decision path. Use it when it scores within a few points of the best model.
- `model.json` must stay under 2 MB (the script warns). Forests are capped at 50 trees of depth 8.

Then:

```bash
cd web && pnpm test && pnpm build
git add web/src/model/model.json && git commit -m "feat(ml): <target> model" && git push
```

Boris makes the deploy commit. On the live URL, `/api/health` must show `model.kind` = `"trained"`.

## 12:00–15:30: improve

- Try `--models gbm,forest` and feature changes. Keep the report files in `ml/reports/` for the presentation.
- Each improvement is the same loop: train, `pnpm test`, commit, deploy.
- Velko and Boris replace the generic forms with themed screens. Field names come from `model.features`.

## Presenting the model (one slide)

The question; the data (rows, source, date); model vs baseline on the holdout (from `/api/model`); the top 3 features; one live prediction; for a tree, its decision path. Say what the model cannot do.

## If something breaks

| Symptom | Fix |
| --- | --- |
| Parity test fails after editing `ml/preprocess.py` or `ml/export.py` | `uv run --group ml python -m ml.parity`, then mirror the change in `web/src/lib/ml/` |
| `/api/predict` returns 503 | `model.json` is invalid. Retrain, or `git checkout HEAD~1 -- web/src/model/model.json` |
| A form field is rejected | `error.details` names the row and field; compare with `features` from `/api/model` |
| The model needs text, images or HistGradientBoosting | Use a supported model, or precompute predictions in `pipeline/` and ship them as JSON |
