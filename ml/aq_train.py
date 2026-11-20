"""Train the 72 h PM2.5 / PM10 forecaster and score it against persistence and CAMS on winter 2025/26.

    uv run --group ml python -u -m ml.aq_train [--issue-every 3] [--horizons 3] [--final]

Writes ml/models/aq_{pm25,pm25_q10,pm25_q90,pm10}.txt, ml/models/aq_meta.json (the contract's model block)
and a report in ml/reports/. --final also refits on every row (holdout included) after scoring."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import f1_score

from ml.aq_features import (CATEGORICAL, FEATURES, base_log, derive, features, load_hourly, load_sensors, mask_short_lags,
                            targets, weather_frames, build_panel)
from ml.aq_levels import ALERT_THRESHOLD, EU_PM10_DAILY_LIMIT, level_of

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "ml" / "models"
REPORTS = ROOT / "ml" / "reports"
START = pd.Timestamp("2023-10-01", tz="UTC")
VAL = (pd.Timestamp("2025-02-15", tz="UTC"), pd.Timestamp("2025-03-31 23:00", tz="UTC"))       # early stopping
HOLDOUT = (pd.Timestamp("2025-10-01", tz="UTC"), pd.Timestamp("2026-03-31 23:00", tz="UTC"))
EVAL_H = [1, 3, 6, 12, 24, 36, 48, 72]
BASE_PARAMS = dict(learning_rate=0.05, num_leaves=127, min_data_in_leaf=100, feature_fraction=0.8,
                   bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, max_bin=255, verbose=-1, num_threads=16)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def log(msg: str) -> None:
    print(f"{dt.datetime.now():%H:%M:%S} {msg}", flush=True)


def pick_device() -> str:
    """LightGBM on the GPU (OpenCL) when the wheel and driver allow it, else CPU."""
    X = np.random.default_rng(0).random((2000, 5))
    try:
        lgb.train({**BASE_PARAMS, "device_type": "gpu", "objective": "l2", "verbose": -1},
                  lgb.Dataset(X, X[:, 0]), num_boost_round=2)
        return "gpu"
    except Exception as e:
        log(f"GPU not available for LightGBM ({str(e)[:80]}), using CPU")
        return "cpu"


def sample(panel, rng, lo, hi, issue_every: int, horizons: int):
    """Random-horizon rows with issue i in [lo, hi] (and T <= hi) where the sensor has a reading at i."""
    t = panel.times
    i_lo, i_hi = int(t.searchsorted(lo)), int(t.searchsorted(hi, side="right")) - 1
    n_s = panel.pm25.shape[1]
    ii, ss = np.nonzero(~np.isnan(panel.pm25[i_lo : i_hi + 1]))
    ii = ii + i_lo
    keep = ((ii + ss) % issue_every) == 0
    ii, ss = ii[keep], ss[keep]
    i = np.repeat(ii, horizons)
    s = np.repeat(ss, horizons)
    # Short horizons get more rows (they need the finest detail); every horizon 1..72 is still covered.
    u = rng.random(len(i))
    h = np.where(u < 0.4, rng.integers(1, 7, len(i)),
                 np.where(u < 0.7, rng.integers(7, 25, len(i)), rng.integers(25, 73, len(i))))
    ok = (i + h) <= i_hi
    return i[ok], s[ok], h[ok]


def grid(panel, lo, hi, hours_utc, horizons):
    t = panel.times
    idx = np.flatnonzero((t >= lo) & (t <= hi) & np.isin(t.hour, hours_utc))
    i, s, h = [], [], []
    for k in idx:
        cols = np.flatnonzero(~np.isnan(panel.pm25[k]))
        for hh in horizons:
            i.append(np.full(len(cols), k)); s.append(cols); h.append(np.full(len(cols), hh))
    i, s, h = np.concatenate(i), np.concatenate(s), np.concatenate(h)
    ok = (i + h) < len(t)
    return i[ok], s[ok], h[ok]


def usable(X: pd.DataFrame, y: np.ndarray) -> np.ndarray:
    return ~np.isnan(y) & X["temp"].notna().to_numpy() & X["cams_pm25"].notna().to_numpy()


def predict_all(models: dict, X: pd.DataFrame) -> dict[str, np.ndarray]:
    """Models predict the log-change from the last known level; this maps back to µg/m³."""
    space = models.get("_space", "raw")
    b25, b10 = base_log(X, "pm25"), base_log(X, "pm10")
    if space == "log":
        back = lambda b, m: np.expm1(b + m.predict(X))
    else:  # raw: the models predict µg/m³ change from the last known level
        back = lambda b, m: np.expm1(b) + m.predict(X)
    pm25 = np.maximum(back(b25, models["pm25"]), 0.0)
    pm10 = np.maximum(back(b10, models["pm10"]), pm25)
    lo = np.clip(back(b25, models["pm25_q10"]), 0.0, pm25)
    hi = np.maximum(back(b25, models["pm25_q90"]), pm25)
    return {"pm25": pm25, "pm10": pm10, "lo": lo, "hi": hi, "log25": np.log1p(pm25)}


SPACE = "raw"


def weights(X: pd.DataFrame) -> np.ndarray | None:
    """Log space: rows weigh more as the air gets dirtier (MAE and alerts are decided by high values).
    Raw space already weighs them by size."""
    return np.sqrt(1.0 + np.expm1(base_log(X, "pm25"))) if SPACE == "log" else None

def residual(y: np.ndarray, X: pd.DataFrame, species: str) -> np.ndarray:
    b = base_log(X, species)
    return np.log1p(y) - b if SPACE == "log" else y - np.expm1(b)


def fit(params, X, y, Xv, yv, rounds=3000, stop=100):
    dtr = lgb.Dataset(X, y, weight=weights(X), categorical_feature=CATEGORICAL, free_raw_data=False)
    dv = lgb.Dataset(Xv, yv, weight=weights(Xv), reference=dtr, categorical_feature=CATEGORICAL)
    return lgb.train(params, dtr, num_boost_round=rounds, valid_sets=[dv],
                     callbacks=[lgb.early_stopping(stop, verbose=False), lgb.log_evaluation(0)])


def mae(a, b):
    m = ~np.isnan(a) & ~np.isnan(b)
    return float(np.mean(np.abs(a[m] - b[m]))) if m.any() else float("nan")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--issue-every", type=int, default=3)
    ap.add_argument("--horizons", type=int, default=3)
    ap.add_argument("--final", action="store_true", help="refit on all rows after scoring")
    ap.add_argument("--name", default="lgbm-v1")
    ap.add_argument("--leaves", type=int, default=31)
    ap.add_argument("--lr", type=float, default=0.03)
    ap.add_argument("--min-leaf", type=int, default=200)
    ap.add_argument("--space", choices=["raw", "log"], default="raw")
    args = ap.parse_args()
    global SPACE
    SPACE = args.space
    t0 = time.monotonic()
    rng = np.random.default_rng(42)

    sensors = load_sensors()
    hourly = load_hourly()
    era5, cams = weather_frames()
    end = pd.Timestamp.now(tz="UTC").floor("h")
    panel = build_panel(hourly, sensors, era5, cams, START, end)
    d = derive(panel)
    n_obs = int((~np.isnan(panel.pm25)).sum())
    log(f"panel: {panel.pm25.shape[1]} sensors, {len(panel.times)} hours, {n_obs:,} sensor-hours "
        f"({len(hourly):,} raw hourly rows)")

    # Training rows: everything before the holdout, minus a 72 h gap; the early-stopping slice is the
    # end of winter 2024/25, so the holdout is never seen before scoring.
    gap = pd.Timedelta(hours=72)
    i, s, h = sample(panel, rng, START, HOLDOUT[0] - gap, args.issue_every, args.horizons)
    X = mask_short_lags(features(panel, d, i, s, h), rng)
    y25, y10 = targets(panel, i, s, h)
    ok = usable(X, y25) & ~np.isnan(y10)
    X, y25, y10, iT = X[ok], y25[ok], y10[ok], i[ok] + h[ok]
    in_val = (panel.times[iT] >= VAL[0]) & (panel.times[iT] <= VAL[1])
    log(f"train rows {int((~in_val).sum()):,}, early-stopping rows {int(in_val.sum()):,}")
    if in_val.sum() < 1000:
        raise SystemExit("too few early-stopping rows yet: let the download run longer")

    device = pick_device()
    params = {**BASE_PARAMS, "device_type": device, "num_leaves": args.leaves, "learning_rate": args.lr,
              "min_data_in_leaf": args.min_leaf, "lambda_l2": 5.0}
    Xt, Xv = X[~in_val], X[in_val]
    models, best = {"_space": SPACE}, {}
    r25, r10 = residual(y25, X, "pm25"), residual(y10, X, "pm10")
    point = {"objective": "l2"} if SPACE == "log" else {"objective": "l1"}
    specs = {
        "pm25": (point, r25),
        "pm10": (point, r10),
        "pm25_q10": ({"objective": "quantile", "alpha": 0.1}, r25),
        "pm25_q90": ({"objective": "quantile", "alpha": 0.9}, r25),
    }
    for name, (extra, y) in specs.items():
        m = fit({**params, **extra}, Xt, y[~in_val], Xv, y[in_val])
        models[name], best[name] = m, m.best_iteration
        log(f"{name}: {m.best_iteration} trees ({device})")

    # ---------- holdout scoring ----------
    hi_i, hi_s, hi_h = grid(panel, HOLDOUT[0], HOLDOUT[1] - gap, [0, 12], EVAL_H)
    Xh = features(panel, d, hi_i, hi_s, hi_h)
    yh25, yh10 = targets(panel, hi_i, hi_s, hi_h)
    okh = usable(Xh, yh25)
    Xh, yh25, yh10, hi_s, hi_h = Xh[okh], yh25[okh], yh10[okh], hi_s[okh], hi_h[okh]
    P = predict_all(models, Xh)
    pred25, lo, hi = P["pm25"], P["lo"], P["hi"]
    pers = Xh["pm25_lag1"].to_numpy()
    same = Xh["pm25_same_hour"].to_numpy()
    cams_raw = Xh["cams_pm25"].to_numpy()
    # A stricter CAMS baseline: CAMS times the train-period median ratio sensor/CAMS.
    ratio = float(np.nanmedian(y25[~in_val] / np.maximum(X["cams_pm25"].to_numpy()[~in_val], 0.1)))
    cams_bc = cams_raw * ratio
    is_vt = panel.sensors["vt"].to_numpy()[hi_s]

    def table(mask):
        rows = []
        for hh in EVAL_H:
            m = mask & (hi_h == hh)
            rows.append({"h": hh, "n": int(m.sum()), "model": mae(pred25[m], yh25[m]),
                         "persistence": mae(pers[m], yh25[m]), "same_hour": mae(same[m], yh25[m]),
                         "cams": mae(cams_raw[m], yh25[m]), "cams_bias_corrected": mae(cams_bc[m], yh25[m])})
        return rows

    all_bg, vt = table(np.ones(len(hi_h), bool)), table(is_vt)
    coverage = float(np.mean((yh25 >= lo) & (yh25 <= hi)))

    # ---------- next-day exceedance and alert days (issue 10 UTC = 12:00 local) ----------
    di, ds, dh = grid(panel, HOLDOUT[0], HOLDOUT[1] - gap, [10], list(range(12, 36)))
    Xd = features(panel, d, di, ds, dh)
    _, yd10 = targets(panel, di, ds, dh)
    yd25, _ = targets(panel, di, ds, dh)
    okd = Xd["temp"].notna().to_numpy() & Xd["cams_pm10"].notna().to_numpy()
    df = pd.DataFrame({"issue": di[okd], "s": ds[okd], "obs10": yd10[okd], "obs25": yd25[okd],
                       "m10": predict_all(models, Xd[okd])["pm10"], "m25": predict_all(models, Xd[okd])["pm25"],
                       "c10": Xd["cams_pm10"].to_numpy()[okd], "c25": Xd["cams_pm25"].to_numpy()[okd],
                       "p10": Xd["pm10_roll24_mean"].to_numpy()[okd]})
    g = df.groupby(["issue", "s"])
    day = g.agg(obs10=("obs10", "mean"), obs25=("obs25", "mean"), n=("obs10", "count"), m10=("m10", "mean"),
                m25=("m25", "mean"), c10=("c10", "mean"), c25=("c25", "mean"), p10=("p10", "first")).reset_index()
    day = day[day["n"] >= 18]
    truth = day["obs10"] > EU_PM10_DAILY_LIMIT
    f1 = {k: float(f1_score(truth, day[c] > EU_PM10_DAILY_LIMIT, zero_division=0))
          for k, c in (("model", "m10"), ("cams", "c10"), ("persistence", "p10"))}
    day["vt"] = panel.sensors["vt"].to_numpy()[day["s"].to_numpy()]
    vt_day = day[day["vt"]].groupby("issue")[["obs10", "obs25", "m10", "m25"]].mean()
    obs_lvl = [level_of(a, b) for a, b in zip(vt_day["obs25"], vt_day["obs10"])]
    mod_lvl = [level_of(a, b) for a, b in zip(vt_day["m25"], vt_day["m10"])]
    alert_days = {p: {"observed": int(sum(l >= th for l in obs_lvl)), "forecast": int(sum(l >= th for l in mod_lvl)),
                      "days": len(obs_lvl)} for p, th in (("sensitive", 3), ("general", 4))}
    vt_exceed = int((vt_day["obs10"] > EU_PM10_DAILY_LIMIT).sum())

    h24 = next(r for r in all_bg if r["h"] == 24)
    h24_vt = next(r for r in vt if r["h"] == 24)
    trained_rows = int(len(X))
    meta = {
        "name": args.name, "kind": "trained", "trained_rows": trained_rows,
        "sensors": int(panel.pm25.shape[1]), "holdout": "winter 2025/26",
        "mae": {"model": round(h24["model"], 1), "cams": round(h24["cams"], 1), "persistence": round(h24["persistence"], 1)},
        "mae_vt": {"model": round(h24_vt["model"], 1), "cams": round(h24_vt["cams"], 1),
                   "persistence": round(h24_vt["persistence"], 1)},
        "exceedance_f1": {"model": round(f1["model"], 2), "cams": round(f1["cams"], 2)},
        "trained_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "device": device, "best_iteration": best, "space": SPACE, "sensor_hours": n_obs,
    }
    beats = h24["model"] < min(h24["persistence"], h24["cams"])
    report = {"meta": meta, "mae_by_horizon_bg": all_bg, "mae_by_horizon_vt": vt, "band_coverage_10_90": coverage,
              "exceedance_f1": f1, "vt_alert_days_holdout": alert_days, "vt_exceedance_days_holdout": vt_exceed,
              "cams_bias_ratio": ratio, "beats_baselines_24h": beats,
              "importance": sorted(({"feature": f, "gain": float(g_)} for f, g_ in
                                    zip(FEATURES, models["pm25"].feature_importance("gain"))),
                                   key=lambda r: -r["gain"])[:15]}
    REPORTS.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    (REPORTS / f"aq_{stamp}.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")

    log("MAE PM2.5 (µg/m³) on winter 2025/26, all BG:")
    for r in all_bg:
        log(f"  h={r['h']:>2}  model {r['model']:5.2f}  persistence {r['persistence']:5.2f}  same-hour {r['same_hour']:5.2f}"
            f"  CAMS {r['cams']:5.2f}  CAMS×bias {r['cams_bias_corrected']:5.2f}  (n={r['n']:,})")
    log(f"VT h=24: model {h24_vt['model']:.2f}  persistence {h24_vt['persistence']:.2f}  CAMS {h24_vt['cams']:.2f}")
    log(f"next-day PM10>50 F1: {f1}; 10–90 band coverage {coverage:.2f}")
    log(f"VT holdout days: {alert_days}; PM10>50 days: {vt_exceed}")
    log(f"beats both baselines at 24 h: {beats}")

    MODELS.mkdir(parents=True, exist_ok=True)
    if args.final:
        # Refit on every row up to now with the early-stopped tree counts (+10 %).
        i2, s2, h2 = sample(panel, rng, START, end, args.issue_every, args.horizons)
        X2 = mask_short_lags(features(panel, d, i2, s2, h2), rng)
        a25, a10 = targets(panel, i2, s2, h2)
        ok2 = usable(X2, a25) & ~np.isnan(a10)
        X2, a25, a10 = X2[ok2], a25[ok2], a10[ok2]
        meta["trained_rows"] = int(len(X2))
        for name, (extra, _) in specs.items():
            y = residual(a10, X2, "pm10") if name == "pm10" else residual(a25, X2, "pm25")
            models[name] = lgb.train({**params, **extra}, lgb.Dataset(X2, y, weight=weights(X2), categorical_feature=CATEGORICAL),
                                     num_boost_round=int(best[name] * 1.1) + 1)
            log(f"refit {name} on {len(X2):,} rows")
    for name, m in models.items():
        if name.startswith("_"):
            continue
        m.save_model(str(MODELS / f"aq_{name}.txt"))
    (MODELS / "aq_meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    log(f"saved models and ml/reports/aq_{stamp}.json in {time.monotonic() - t0:.0f}s")


if __name__ == "__main__":
    main()
