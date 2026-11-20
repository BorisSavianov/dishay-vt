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
- **Target:** the change from the last known level, in µg/m³. Boosting starts from persistence, so the short horizons cannot do worse than "now".
- **LightGBM.** An L1 loss for the point forecast, plus 10% and 90% quantile models for the band. A separate PM10 model.
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

`ml/aq_forecast.py` runs every hour on Teodor's PC. It does the following:
1. Takes the archive up to yesterday, plus the 5-minute live collector for today.
2. Fetches the Open-Meteo and CAMS forecasts for every 0.25° cell, cached for 3 h.
3. Predicts 1–96 h for every station. Hours past 72 use the 72 h model at its limit, and only the daily cards use them.
4. Builds SHAP reasons per day from the physical drivers only.
5. Writes Neon (`aq_forecast`) in one transaction, and a slim fallback JSON.

## Limits (say them out loud)

- Training uses observed weather (ERA5), while live forecasts use forecast weather, so live errors will be somewhat larger than the holdout numbers.
- Citizen sensors are not reference instruments. The humidity correction is a published approximation, not a calibration against an official station.
- The model is trained on heating seasons only. Summer (ozone and dust events) is out of scope.
- Day-before warnings: the point forecast is conservative on the very worst days. See the warning score in `aq_episode.json` and the slide numbers.
