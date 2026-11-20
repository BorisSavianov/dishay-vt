"""Replay the worst Veliko Tarnovo smog day of winter 2025/26: what did the model say 1 and 2 days before?

    uv run --group ml python -u -m ml.aq_episode [--date YYYY-MM-DD]

Uses the models trained before the holdout (ml/models/aq_*_eval.txt), so the replay is an honest forecast.
Writes web/src/data/aq_episode.json (contract/CONTRACT.md "Episode replay") and docs/slides/episode.png."""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from ml.aq_features import TZ, build_panel, derive, features, load_hourly, load_sensors, targets, weather_frames
from ml.aq_levels import EU_PM10_DAILY_LIMIT, level_of
from ml.aq_models import Model
from ml.aq_train import HOLDOUT, START, predict_all

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "ml" / "models"
OUT = ROOT / "web" / "src" / "data" / "aq_episode.json"
PNG = ROOT / "docs" / "slides" / "episode.png"
VT = (43.0786, 25.6211)


def r1(x) -> float | None:
    return None if x != x else round(float(x), 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="local date of the episode (default: worst VT day the model warned about)")
    ap.add_argument("--models-dir", default=str(MODELS))
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    md = Path(args.models_dir)
    meta = json.loads((md / "aq_meta.json").read_text(encoding="utf-8"))
    models = {n: Model.load(md / f"aq_{n}_eval", meta.get("algo", "lgbm")) for n in ("pm25", "pm10", "pm25_q10", "pm25_q90")}
    models["_space"] = meta.get("space", "raw")

    sensors = load_sensors()
    era5, cams = weather_frames()
    p = build_panel(load_hourly(), sensors, era5, cams, START, HOLDOUT[1] + pd.Timedelta(days=4))
    d = derive(p)
    lat, lon = p.sensors["lat"].to_numpy(), p.sensors["lon"].to_numpy()
    vt_cols = np.flatnonzero(np.hypot((lat - VT[0]) * 111.2, (lon - VT[1]) * 81.3) <= 10)
    local = p.times.tz_convert(TZ)
    dates = pd.Series(local.date)

    # VT city mean per hour (sensors that report), then per local day.
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        vt10 = np.nanmean(p.pm10[:, vt_cols], axis=1)
        vt25 = np.nanmean(p.pm25[:, vt_cols], axis=1)
    hol = (p.times >= HOLDOUT[0]) & (p.times <= HOLDOUT[1] - pd.Timedelta(days=3))
    day = pd.DataFrame({"date": dates, "pm10": vt10, "pm25": vt25})[hol].groupby("date").agg(
        pm10=("pm10", "mean"), pm25=("pm25", "mean"), n=("pm25", "count"))
    day = day[day["n"] >= 18]
    cams_cols = p.sensor_cell[vt_cols]
    cams_cols = cams_cols[cams_cols >= 0]

    def forecast(target, days_before: int):
        """VT-mean hourly forecast for local day `target`, issued at 12:00 local `days_before` days earlier
        (the last complete hour is 11:00-12:00)."""
        day_hours = np.flatnonzero(np.array([x == target for x in local.date]))
        issue_bin = pd.Timestamp(str(target), tz=TZ) - pd.Timedelta(days=days_before) + pd.Timedelta(hours=11)
        i = p.index_of(issue_bin)
        cols = np.array([c for c in vt_cols if not np.isnan(p.pm25[i, c])])
        if not len(cols):
            return None
        hh = day_hours - i
        X = features(p, d, np.repeat(np.full(len(cols), i), len(hh)), np.repeat(cols, len(hh)),
                     np.minimum(np.tile(hh, len(cols)), 72))
        P = predict_all(models, X)
        mean = {k: P[k].reshape(len(cols), len(hh)).mean(axis=0) for k in ("pm25", "pm10", "lo", "hi")}
        return {"issued": (issue_bin + pd.Timedelta(hours=1)).isoformat(), "lead": [int(hh.min()), int(hh.max())],
                "hours": day_hours, **mean}

    def cams_day(day_hours):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            return (float(np.nanmean(p.cams25[day_hours][:, cams_cols])), float(np.nanmean(p.cams10[day_hours][:, cams_cols])))

    # Score the day-before warning (sensitive groups: level >= 3) on every holdout day, and on the 10 worst.
    rows = []
    for dte, o in day.iterrows():
        f = forecast(dte, 1)
        if f is None:
            continue
        c25, c10 = cams_day(f["hours"])
        m25, m10, h25 = float(f["pm25"].mean()), float(f["pm10"].mean()), float(f["hi"].mean())
        ratio = m10 / max(m25, 0.1)
        rows.append({"date": dte, "obs_level": level_of(o.pm25, o.pm10), "obs25": o.pm25, "obs10": o.pm10,
                     "model_level": level_of(m25, m10),
                     "warn_mid": level_of((m25 + h25) / 2, (m25 + h25) / 2 * ratio),
                     "warn_hi": level_of(h25, h25 * ratio),
                     "cams_level": level_of(c25, c10)})
    sc = pd.DataFrame(rows)
    bad = sc["obs_level"] >= 3

    def pod_far(col):
        warn = sc[col] >= 3
        hits = int((warn & bad).sum())
        return {"hits": hits, "misses": int((~warn & bad).sum()), "false_alarms": int((warn & ~bad).sum()),
                "pod": round(hits / max(1, int(bad.sum())), 2), "far": round(int((warn & ~bad).sum()) / max(1, int(warn.sum())), 2)}

    worst = sc.sort_values("obs25", ascending=False).head(10)
    score = {"days": int(len(sc)), "bad_days": int(bad.sum()), "model_alert": pod_far("warn_mid"),
             "model_level": pod_far("model_level"), "cams": pod_far("cams_level"),
             "worst10": {"model_warned": int((worst["warn_mid"] >= 3).sum()),
                         "cams_warned": int((worst["cams_level"] >= 3).sum())}}
    print(f"day-before warnings for sensitive groups (level >= 3), VT, {score['days']} holdout days, "
          f"{score['bad_days']} bad: model alert {score['model_alert']}, model level {score['model_level']}, CAMS {score['cams']}")
    print(f"10 worst PM2.5 days: model warned on {score['worst10']['model_warned']}, CAMS on {score['worst10']['cams_warned']}")

    if args.date:
        target = pd.Timestamp(args.date).date()
    else:
        caught = worst[worst["warn_mid"] >= 3]
        target = (caught if len(caught) else worst).iloc[0]["date"]
    obs = day.loc[target]
    print(f"episode {target}: VT mean PM2.5 {obs.pm25:.1f}, PM10 {obs.pm10:.1f} µg/m³")
    day_hours = np.flatnonzero(np.array([x == target for x in local.date]))
    result = {"date": str(target), "place": "Велико Търново", "place_en": "Veliko Tarnovo",
              "sensors": int(len(vt_cols)), "model": meta["name"], "score": score, "forecasts": []}
    result["observed"] = [{"t": local[k].isoformat(), "pm25": r1(vt25[k]), "pm10": r1(vt10[k])} for k in day_hours]
    result["cams"] = [{"t": local[k].isoformat(), "pm25": r1(np.nanmean(p.cams25[k, cams_cols])),
                       "pm10": r1(np.nanmean(p.cams10[k, cams_cols]))} for k in day_hours]
    result["observed_daily"] = {"pm10_mean": r1(obs.pm10), "pm25_mean": r1(obs.pm25),
                                "level": level_of(obs.pm25, obs.pm10), "exceeds_eu_limit": bool(obs.pm10 > EU_PM10_DAILY_LIMIT)}
    c25, c10 = cams_day(day_hours)
    result["cams_daily"] = {"pm10_mean": r1(c10), "pm25_mean": r1(c25), "level": level_of(c25, c10),
                            "exceeds_eu_limit": bool(c10 > EU_PM10_DAILY_LIMIT)}
    for days_before in (2, 1):
        f = forecast(target, days_before)
        if f is None:
            continue
        m25, m10 = float(f["pm25"].mean()), float(f["pm10"].mean())
        mid = (m25 + float(f["hi"].mean())) / 2
        alert = max(level_of(m25, m10), level_of(mid, mid * m10 / max(m25, 0.1)))
        result["forecasts"].append({
            "issued": f["issued"], "days_before": days_before, "lead_hours": f["lead"],
            "hourly": [{"t": local[k].isoformat(), "pm25": r1(a), "pm10": r1(b), "pm25_lo": r1(c), "pm25_hi": r1(e)}
                       for k, a, b, c, e in zip(f["hours"], f["pm25"], f["pm10"], f["lo"], f["hi"])],
            "daily": {"pm10_mean": r1(m10), "pm25_mean": r1(m25), "level": level_of(m25, m10), "alert_level": alert,
                      "exceeds_eu_limit": bool(m10 > EU_PM10_DAILY_LIMIT)},
        })
        print(f"  issued {f['issued'][:16]} ({days_before} d before): PM2.5 {m25:.1f}, PM10 {m10:.1f}, level "
              f"{level_of(m25, m10)} (alert {alert}) | CAMS PM2.5 {c25:.1f}, level {level_of(c25, c10)} | observed level {level_of(obs.pm25, obs.pm10)}")
    if args.no_write:
        return
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    try:
        plot(result)
    except ImportError:
        print("matplotlib not installed: skipped the PNG")


def plot(res: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    hours = [pd.Timestamp(x["t"]).hour for x in res["observed"]]
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=150)
    ax.plot(hours, [x["pm25"] for x in res["observed"]], color="#1b1b1f", lw=3, label="измерено (сензори)")
    colors = {2: "#ef7e3a", 1: "#d6334a"}
    for f in res["forecasts"]:
        ax.plot(hours, [x["pm25"] for x in f["hourly"]], color=colors[f["days_before"]], lw=2.2,
                label=f"прогноза {f['days_before']} дни преди" if f["days_before"] > 1 else "прогноза 1 ден преди")
    ax.plot(hours, [x["pm25"] for x in res["cams"]], color="#4fa3d6", lw=2, ls="--", label="CAMS (Copernicus)")
    ax.axhline(15, color="#8e2b8c", lw=1, ls=":")
    ax.text(23, 13.2, "праг „умерено“ (EAQI 3): предупреждение за чувствителни", color="#8e2b8c", fontsize=10, ha="right")
    ax.set_ylim(bottom=0)
    ax.set_xlabel("час")
    ax.set_ylabel("PM2.5, µg/m³")
    ax.set_title(f"Велико Търново, {res['date']}: смог, предупреден предварително", fontsize=14, loc="left")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.legend(frameon=False, fontsize=10)
    PNG.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(PNG)
    print(f"wrote {PNG.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
