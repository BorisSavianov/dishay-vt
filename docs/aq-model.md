# „Дишай ВТ“ forecast model

What it predicts, from what, how it was tested, and what it cannot do. The current numbers are in `docs/slides/numbers.md`, which `python -m ml.aq_slides` writes from the latest training report.

## The question

Given the latest readings of a citizen PM sensor, its neighbours, the weather forecast and the CAMS forecast, predict hourly PM2.5 and PM10 at that sensor for the next 72 hours.

## Data

- **Target:** sensor.community PM sensors in Bulgaria (SDS011, PMS*, SPS30), outdoor. Daily archive files are reduced to hourly means. Heating seasons Oct 2023 → today (the weather history covers Oct–Mar only).
- **Weather:** ERA5 (Open-Meteo archive) in training and the Open-Meteo forecast live. Temperature, humidity, wind speed and direction, rain, pressure tendency, boundary-layer height.
- **CAMS Europe:** PM forecast at the station (Open-Meteo Air Quality). Used both as a feature and as the baseline to beat.
- **Static:** latitude, longitude, elevation, sensor type.

## Cleaning

- Keep an hour only with at least 6 readings.
- Drop values above 999, and 6-hour flatlines.
- **Broken sensors:**
  - An hour is dropped when it reads over 8× the median of the sensors within 15 km and is above 100 µg/m³.
  - A whole sensor is dropped when more than 30% of its hours are flagged that way, or when it reads under 1/8 of its neighbours more than half the time they see real pollution (> 20 µg/m³).
  - Example: Арбанаси (sensor 76712) averaged 294 µg/m³ last winter. ВТ – Акация (63801) is stuck at 0.6.
- **Humidity:** optical sensors over-read in humid air. Above 80% RH the reading is divided by the κ-Köhler growth factor (Crilley et al. 2018, κ = 0.4) relative to 80%, with RH capped at 95%. The correction is larger than 1.5× in about a third of winter hours in VT (valley fog).
- **Uptime:** sensors with under 60% uptime within the days we have are dropped.

## Model

- **Direct multi-horizon.** One model with the horizon (1–72 h) as a feature. The training rows are sensor × issue hour × randomly sampled horizon, with 40% of rows at 1–6 h.
- **Target:** the change from the last known level, in µg/m³. Boosting starts from persistence, so the short horizons stay close to "now": at 1 h persistence is marginally better (1.2 vs 1.3 µg/m³), and from 3 h on the model wins.
- **XGBoost on the GPU (RTX 4070), live as `xgb-v2`.** An L1 loss for the point forecast, plus 10% and 90% quantile models for the band, and a separate PM10 model. All 4 models refit on 5.06M rows in about 2 minutes.
  - LightGBM on the CPU tied on the same data: 24 h MAE 2.74 against 2.76 for XGBoost. Averaging the two gained nothing.
  - XGBoost was chosen for VT (3.21 vs 3.25), PM10 > 50 F1, and retraining speed. `ml/models_v1/` keeps the LightGBM v1.
  - Tried and not shipped: L2 and Huber losses (worse MAE or F1), and upwind-neighbour features (`--upwind`, 2.76 vs 2.76).
- **Features:**
  - lags 1, 2, 3, 6, 24 and 48 h, the 24 h mean and max, and the same hour on the last observed day;
  - the neighbour mean within 5 km;
  - weather at the target hour, plus BLH minimum, wind mean and rain over the previous 6 h;
  - CAMS at the target and the issue hour, and the sensor/CAMS ratio;
  - local hour, weekday, month, heating season, Bulgarian holidays.
- **Missing lags:** short lags are hidden in 15% of the training rows. Live, today's early hours are missing until the archive publishes them.

## Testing

- **Split by time, never shuffled:**
  - train: Oct 2023 – Mar 2025;
  - early stopping: 15 Feb – 31 Mar 2025;
  - holdout: winter 2025/26, 1 Oct – 31 Mar, with a 72 h gap before it.
- **Baselines:**
  - persistence (last value; same hour yesterday);
  - CAMS raw;
  - CAMS × the train-period sensor/CAMS ratio.
- **Metrics:**
  - MAE by horizon, for all of BG and for VT;
  - F1 of "tomorrow's PM10 mean > 50" (forecast issued at 12:00);
  - coverage of the 10–90% band;
  - day-before warnings for sensitive groups in VT (EAQI ≥ 3): hits, misses and false alarms, from `ml/aq_episode.py`.
- **Production:** after scoring, the production model is refitted on all rows, the holdout included. The replay of past episodes uses the models trained *before* the holdout.

## Live

`ml/aq_forecast.py` runs every hour on GitHub Actions (`.github/workflows/forecast.yml`, cron `7 * * * *`, CPU runner), not on anyone's PC. Each run:
1. Downloads the models and sensor lists from the GitHub Release `models-latest` (`ml/aq_release.py`).
2. Fetches sensor.community's 1-hour averages (`data.1h.json`) and files them as the last complete hour. It reads the 7 days before from Neon `aq_live_hourly` (`ml/aq_live.py`, kept 8 days). Neither the archive nor a collector is read at inference.
   - `data.1h.json` has no reading count, so each 1-hour mean gets `n = 24`, the archive's median readings per hour. `build_panel` then counts it as a valid hour (it needs ≥ 6), so the uptime rule works as it does on the archive.
   - It is a rolling 60 minutes, not a clock hour. A run that starts at :20 averages about :20 to :20, a 20-minute shift.
3. Fetches the Open-Meteo and CAMS forecasts for every 0.25° cell, cached for 3 h with `actions/cache`. Shared runner IPs get 429s: a run waits up to three times, then serves the cached copy if it is under 24 h old, and fails only without one.
4. Predicts 1–96 h for every station on CPU (XGBoost loads the CUDA-trained models with `device=cpu`). Hours past 72 use the 72 h model at its limit, and only the daily cards use them.
   - The CAMS Europe forecast ends about 63 h out. Past its last hour, the model's CAMS inputs repeat CAMS's last forecast day: as NaN, they made the forecast jump from 2.2 to 8.3 µg/m³.
   - The payload's `cams_pm25` stays the real value, so the dashed CAMS line on the chart stops where CAMS stops.
5. Builds SHAP reasons per day from the physical drivers only.
6. Writes Neon in one transaction: this hour's readings, `aq_forecast` (replaced), the run's log (`aq_forecast_log`, one row per station with 72-hour arrays, kept 4 days), and the score of every hour that just got readings (`aq_forecast_score`, scored in SQL). If anything fails, the job exits non-zero and Neon keeps the previous forecast. Then it asks the web app to send due Telegram alerts.

`web/src/data/aq_forecast.json` (the bundled fallback) is no longer rewritten every hour. Refresh it by hand: `uv run --group ml python -u -m ml.aq_forecast --once --no-db --fallback`.

### Run book

- **Run time:** a job takes about 2–2½ min on `ubuntu-latest` (4 vCPU, measured 20 Nov 2026). The forecast step is about 2 min, of which SHAP on CPU is about 1¾ min; setup and the 105 MB model download take seconds. The timeout is 20 min. Minutes are free for this public repo. GitHub starts the `:07` cron late, often by 10–30 min.
- **Dry run** (reads Neon, runs every write, then rolls back): Actions → forecast → Run workflow with `dry_run` ticked. Locally: `uv run --group ml python -u -m ml.aq_forecast --once --no-db --out forecast.json`, then `uv run --group ml python -m ml.aq_contract forecast.json`.
- **Force a live run:** Run workflow with `dry_run` unticked.
- **Switch:** scheduled runs write only while the repo variable `FORECAST_LIVE` is `true`. To pause the cloud writer: `gh variable set FORECAST_LIVE --body false -R BorisSavianov/dishay-vt`.
- **Config:** the job reads the repo secrets `DATABASE_URL`, `TG_NOTIFY_URL` and `TELEGRAM_NOTIFY_SECRET`. Locally the same names fall back to `web/.env.local`.
- **Check the 1-hour means:** `uv run --group ml python -u -m ml.aq_live --check-archive 2026-11-20` compares the stored hours of a past UTC day with the archive's hourly means. The archive publishes a day after it ends.

### Retrain and upload (Teodor's PC, RTX 4070)

1. Fetch new archive days and weather as usual (`ml.aq_fetch`, `ml.aq_weather`), then retrain on the GPU, e.g. `uv run --group ml python -u -m ml.aq_train --algo xgb --name xgb-v3 --final`. This writes `ml/models/aq_*` and `aq_meta.json`.
2. Optional: `uv run --group ml python -u -m ml.aq_scoreboard --replay` and `ml.aq_sources` if the replay or the source shares should change.
3. Check locally on CPU: `uv run --group ml python -u -m ml.aq_forecast --once --no-db --out forecast.json`.
4. Upload: `uv run --group ml python -u -m ml.aq_release upload`. This replaces the `models-latest` assets: the four models of `aq_meta.json`'s algo, `aq_meta.json`, `aq_sources.json`, `sensors_bg.json`, `names.json`, `cells.json`, `elevation.json` and `scoreboard_replay.json`.
5. The next hourly run picks them up. To see it at once, start a manual run.

## Limits (say them out loud)

- Training uses observed weather (ERA5), while live forecasts use forecast weather, so live errors will be somewhat larger than the holdout numbers. The November 2026 replay (`ml/aq_scoreboard.py`) fixes this for the weather by using archived forecast runs. It doesn't fix it for CAMS: CAMS, both input and baseline, comes from the archive, which keeps the newest run for each hour.
- Citizen sensors are not reference instruments. The humidity correction is a published approximation, not a calibration against an official station.
- The model is trained on heating seasons only. Summer (ozone and dust events) is out of scope.
- Day-before warnings: the point forecast (`level`) is conservative on smog days. It caught 7 of 23 bad VT days.
  - Alerts therefore use `alert_level`, the upper-middle of the band (about the 70th percentile).
  - With it the model caught 18 of 23 with 11 false alarms. CAMS caught 20 of 23 with 23 false alarms.
