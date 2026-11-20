"""„Проверка на живо“: how good the forecast is with real forecast weather, on data no model has seen.

    uv run --group ml python -u -m ml.aq_scoreboard --replay

- Replay: 1–19 Nov 2026, one forecast a day at 12:00 local for the next day, by the models trained before winter
  2025/26 (ml/models/aq_*_eval). The weather is what was forecast at the time (Open-Meteo Previous Runs), never from
  a run newer than the issue time. The archive has no boundary-layer height, so the replay runs twice: without it
  ("none") and with observed ERA5 ("era5"). The payload carries "none" if it still beats CAMS for VT.
- Live: ml/aq_forecast.py logs every hourly run to data/forecast_log/ and scores it as the readings arrive.

The result is `model.scoreboard` in the forecast payload (contract/CONTRACT.md)."""
from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from ml.aq_features import TZ, Panel
from ml.aq_weather import HEADERS, WEATHER_VARS, cell_center, get_json

ROOT = Path(__file__).resolve().parents[1]
PREV_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
PREV_CACHE = ROOT / "data" / "raw" / "aq" / "previous_runs"
# Previous Runs has every weather feature except the boundary-layer height (checked for GFS, ECMWF and ICON).
PREV_VARS = [v for v in WEATHER_VARS if v != "boundary_layer_height"]
ISSUE_HOUR = 12  # local; the last complete hour is 11:00–12:00


def lead_day(lead_h: int) -> int:
    """Which `_previous_dayN` is safe for a target `lead_h` hours after the issue: the run behind dayN is at
    least 24·N hours older than the target, so N = ceil(lead / 24) is never newer than the issue time."""
    return max(1, math.ceil(lead_h / 24))


def _windows(start: dt.date, end: dt.date, days: int = 14):
    a = start
    while a <= end:
        b = min(end, a + dt.timedelta(days=days - 1))
        yield a, b
        a = b + dt.timedelta(days=1)


def previous_runs(cells: list[str], start: dt.date, end: dt.date) -> dict[int, pd.DataFrame]:
    """Forecast weather as issued 1 and 2 days before each hour, per 0.25° cell, in era5.parquet's schema
    (time UTC, the PREV_VARS, cell). Responses are cached per cell and window; nulls become NaN."""
    PREV_CACHE.mkdir(parents=True, exist_ok=True)
    cols = [f"{v}_previous_day{n}" for n in (1, 2) for v in PREV_VARS]
    out: dict[int, list[pd.DataFrame]] = {1: [], 2: []}
    with httpx.Client(headers=HEADERS) as client:
        for cell in cells:
            lat, lon = cell_center(cell)
            for a, b in _windows(start, end):
                path = PREV_CACHE / f"{cell}_{a}_{b}.json"
                if path.exists():
                    data = json.loads(path.read_text(encoding="utf-8"))
                else:
                    data = get_json(client, PREV_URL, {"latitude": lat, "longitude": lon, "hourly": ",".join(cols),
                                                       "start_date": a.isoformat(), "end_date": b.isoformat(),
                                                       "timezone": "UTC"})
                    path.write_text(json.dumps(data), encoding="utf-8")
                h = data.get("hourly") or {}
                t = pd.to_datetime(h.get("time", []), utc=True)
                for n in (1, 2):
                    df = pd.DataFrame({"time": t, "cell": cell})
                    for v in PREV_VARS:
                        df[v] = pd.to_numeric(pd.Series(h.get(f"{v}_previous_day{n}", [None] * len(t))), errors="coerce").to_numpy(dtype=float)
                    out[n].append(df)
    return {n: (pd.concat(f, ignore_index=True) if f else pd.DataFrame(columns=["time", "cell", *PREV_VARS]))
            for n, f in out.items()}


def forecast_weather(frames: dict[int, pd.DataFrame]) -> pd.DataFrame:
    """The weather a forecast issued at 12:00 local the day before would have had for each hour:
    lead = local hour + 12, so 00:00–12:00 come from previous_day1 and 13:00–23:00 from previous_day2."""
    parts = []
    for n, df in frames.items():
        if df.empty:
            continue
        hour = pd.to_datetime(df["time"], utc=True).dt.tz_convert(TZ).dt.hour
        need = (hour + (24 - ISSUE_HOUR)).map(lead_day)
        parts.append(df[need == n])
    if not parts:
        return pd.DataFrame(columns=["time", "cell", *PREV_VARS])
    return pd.concat(parts, ignore_index=True).sort_values(["cell", "time"]).reset_index(drop=True)


def apply_weather(p: Panel, wx: pd.DataFrame, blh: str, start: pd.Timestamp, end: pd.Timestamp) -> None:
    """Overwrite the panel's weather inside [start, end] with the forecast weather (NaN where there is none).
    blh "none" also blanks the boundary-layer height there; "era5" keeps the observed one. Call derive() after."""
    rows = np.flatnonzero((p.times >= start) & (p.times <= end))
    if not len(rows):
        return
    w = wx.copy()
    w["time"] = pd.to_datetime(w["time"], utc=True)
    for v in PREV_VARS:
        wide = (w.pivot_table(index="time", columns="cell", values=v, aggfunc="mean")
                .reindex(index=p.times[rows], columns=p.cells))
        arr = p.weather[v].astype(float, copy=True)
        arr[rows, :] = wide.to_numpy(dtype=float)
        p.weather[v] = arr
    if blh == "none":
        arr = p.weather["boundary_layer_height"].astype(float, copy=True)
        arr[rows, :] = np.nan
        p.weather["boundary_layer_height"] = arr


# ---------------- Replay: score ----------------

VT = (43.0786, 25.6211)
VT_KM = 10
REPLAY_FROM = dt.date(2026, 11, 1)   # first target day
REPLAY_TO = dt.date(2026, 11, 19)    # last target day (the archive ends there)
CACHE = ROOT / "data" / "processed" / "scoreboard_replay.json"
_TRIO = {"model": "model_pm25", "cams": "cams_pm25", "persistence": "persistence_pm25"}


def mae(rows: pd.DataFrame) -> dict[str, float]:
    """MAE of hourly PM2.5 over the rows where the observation and all three forecasts are present."""
    ok = rows[["obs_pm25", *_TRIO.values()]].notna().all(axis=1)
    r = rows[ok]
    return {k: round(float((r[c] - r["obs_pm25"]).abs().mean()), 1) for k, c in _TRIO.items()}


def vt_days(rows: pd.DataFrame) -> list[dict]:
    """VT city mean per hour (across sensors), then per local day; days with >= 18 observed hours."""
    from ml.aq_levels import level_of

    vt = rows[rows["vt"]]
    if vt.empty:
        return []
    hourly = vt.groupby(["date", "t"]).agg(model_pm25=("model_pm25", "mean"), model_pm10=("model_pm10", "mean"),
                                           cams_pm10=("cams_pm10", "mean"), obs_pm25=("obs_pm25", "mean"),
                                           obs_pm10=("obs_pm10", "mean")).reset_index()
    out = []
    for date, g in hourly.groupby("date"):
        if int(g["obs_pm25"].notna().sum()) < 18:
            continue
        m25, m10, o25, o10 = (float(g[c].mean()) for c in ("model_pm25", "model_pm10", "obs_pm25", "obs_pm10"))
        out.append({"date": str(date), "model_pm10": round(m10, 1), "cams_pm10": round(float(g["cams_pm10"].mean()), 1),
                    "observed_pm10": round(o10, 1), "model_level": level_of(m25, m10), "observed_level": level_of(o25, o10)})
    return out


def pick_blh(runs: dict[str, dict]) -> str:
    """The strict run (no boundary-layer height at all) if it still beats CAMS for VT, else observed ERA5."""
    vt = runs["none"]["mae_pm25_next_day"]["vt"]
    return "none" if vt["model"] < vt["cams"] else "era5"


def run_block(rows: pd.DataFrame, blh: str) -> dict:
    """The contract's `replay` block for one BLH mode."""
    ok = rows[["obs_pm25", *_TRIO.values()]].notna().all(axis=1)
    dates = sorted(str(x) for x in rows.loc[ok, "date"].unique())
    return {"from": dates[0] if dates else str(REPLAY_FROM), "to": dates[-1] if dates else str(REPLAY_TO),
            "issued_local": f"{ISSUE_HOUR:02d}:00", "models": "trained before winter 2025/26",
            "weather": "forecast", "blh": blh, "days": len(dates),
            "mae_pm25_next_day": {"vt": mae(rows[rows["vt"]]), "bg": mae(rows)},
            "vt_days": vt_days(rows)}


# ---------------- Replay: forecast ----------------

def replay_rows(p: Panel, d, models: dict, issue_dates: list[dt.date]) -> pd.DataFrame:
    """One row per (issue, sensor, next-day hour): the forecast issued at 12:00 local (last complete hour
    11:00–12:00, as in ml/aq_episode.py), CAMS, persistence and the observation."""
    from ml.aq_features import features
    from ml.aq_train import predict_all

    lat, lon = p.sensors["lat"].to_numpy(), p.sensors["lon"].to_numpy()
    is_vt = np.hypot((lat - VT[0]) * 111.2, (lon - VT[1]) * 81.3) <= VT_KM
    local_dates = np.array(p.times.tz_convert(TZ).date)
    frames = []
    for issue in issue_dates:
        target = issue + dt.timedelta(days=1)
        hours = np.flatnonzero(local_dates == target)
        i = p.index_of(pd.Timestamp(str(issue), tz=TZ) + pd.Timedelta(hours=ISSUE_HOUR - 1))
        cols = np.flatnonzero(~np.isnan(p.pm25[i]))
        if not len(hours) or not len(cols):
            continue
        hh = hours - i
        ss, tt = np.repeat(cols, len(hh)), np.tile(hours, len(cols))
        X = features(p, d, np.full(len(ss), i), ss, np.minimum(np.tile(hh, len(cols)), 72))
        P = predict_all(models, X)
        cell = p.sensor_cell[ss]
        cams25 = np.where(cell >= 0, p.cams25[tt, np.maximum(cell, 0)], np.nan)
        cams10 = np.where(cell >= 0, p.cams10[tt, np.maximum(cell, 0)], np.nan)
        frames.append(pd.DataFrame({
            "date": str(target), "sensor": p.sensors["id"].to_numpy()[ss], "t": p.times[tt], "vt": is_vt[ss],
            "model_pm25": P["pm25"], "model_pm10": P["pm10"], "cams_pm25": cams25, "cams_pm10": cams10,
            "persistence_pm25": p.pm25[i, ss], "obs_pm25": p.pm25[tt, ss], "obs_pm10": p.pm10[tt, ss]}))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def replay_main() -> None:
    import dataclasses

    from ml.aq_features import build_panel, derive, load_hourly, load_sensors, weather_frames
    from ml.aq_forecast import forecast_frames
    from ml.aq_models import Model

    md = ROOT / "ml" / "models"
    meta = json.loads((md / "aq_meta.json").read_text(encoding="utf-8"))
    models = {n: Model.load(md / f"aq_{n}_eval", meta.get("algo", "lgbm")) for n in ("pm25", "pm10", "pm25_q10", "pm25_q90")}
    models["_space"] = meta.get("space", "raw")
    print(f"models: aq_*_eval ({meta.get('algo', 'lgbm')}), trained before winter 2025/26", flush=True)

    start = pd.Timestamp("2026-10-15", tz=TZ)
    end = pd.Timestamp(str(REPLAY_TO + dt.timedelta(days=1)), tz=TZ) + pd.Timedelta(hours=23)
    sensors = load_sensors()
    era5, cams = weather_frames()
    # Observed weather corrects the observations (humidity) and is the "era5" BLH. ERA5 lags ~6 days, so the
    # tail comes from the live forecast API's past days, the same source run_once corrects today's readings with.
    cells = sorted(set(sensors["cell"].dropna()))
    live_wx, _ = forecast_frames(cells)
    tail = live_wx[pd.to_datetime(live_wx["time"], utc=True) > pd.to_datetime(era5["time"], utc=True).max()]
    observed = pd.concat([era5, tail], ignore_index=True)
    p0 = build_panel(load_hourly(), sensors, observed, cams, start, end)
    print(f"panel {len(p0.times)} h × {p0.pm25.shape[1]} sensors, {len(p0.cells)} weather cells", flush=True)

    wx = forecast_weather(previous_runs(p0.cells, start.date(), end.date()))
    issues = [REPLAY_FROM - dt.timedelta(days=1) + dt.timedelta(days=k) for k in range((REPLAY_TO - REPLAY_FROM).days + 1)]
    runs = {}
    for blh in ("none", "era5"):
        p = dataclasses.replace(p0, weather={k: v.copy() for k, v in p0.weather.items()})
        apply_weather(p, wx, blh, start.tz_convert("UTC"), end.tz_convert("UTC"))
        rows = replay_rows(p, derive(p), models, issues)
        runs[blh] = run_block(rows, blh)
        m = runs[blh]["mae_pm25_next_day"]
        print(f"blh={blh}: {runs[blh]['days']} days, {len(rows)} rows | VT model {m['vt']['model']} CAMS {m['vt']['cams']} "
              f"persistence {m['vt']['persistence']} | BG model {m['bg']['model']} CAMS {m['bg']['cams']} "
              f"persistence {m['bg']['persistence']}", flush=True)
    chosen = pick_blh(runs)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps({"chosen": chosen, "built_at": pd.Timestamp.now(tz=TZ).isoformat(timespec="seconds"),
                                 "runs": runs}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"chosen: {chosen} → {CACHE.relative_to(ROOT)}")


# ---------------- Live: log every hourly run, score it as readings arrive ----------------

LOG_DIR = ROOT / "data" / "forecast_log"
LOG_COLS = ["issued_at", "sensor_id", "t", "horizon_h", "pm25", "pm10", "cams_pm25", "persistence_pm25"]


def log_issued(issued_at: pd.Timestamp, rows: pd.DataFrame, log_dir: Path = LOG_DIR) -> Path:
    """One parquet per run, named by the issue hour in UTC."""
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / f"issued-{pd.Timestamp(issued_at).tz_convert('UTC'):%Y%m%d-%H}.parquet"
    rows[LOG_COLS].to_parquet(path, index=False)
    return path


def read_log(log_dir: Path = LOG_DIR) -> pd.DataFrame:
    files = sorted(log_dir.glob("issued-*.parquet")) if log_dir.exists() else []
    if not files:
        return pd.DataFrame(columns=LOG_COLS)
    return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)


def live_score(log: pd.DataFrame, obs25: np.ndarray, times: pd.DatetimeIndex, sensor_ids: np.ndarray,
               upto: pd.Timestamp) -> dict | None:
    """Score logged forecasts whose hour has passed against the panel's cleaned, humidity-corrected PM2.5.
    None until at least one hour has been scored."""
    if log.empty:
        return None
    t = pd.to_datetime(log["t"], utc=True)
    log = log[t <= pd.Timestamp(upto).tz_convert("UTC")].copy()
    if log.empty:
        return None
    ti = pd.DatetimeIndex(times).get_indexer(pd.to_datetime(log["t"], utc=True))
    si = pd.Index(np.asarray(sensor_ids)).get_indexer(log["sensor_id"])
    ok = (ti >= 0) & (si >= 0)
    log = log[ok].copy()
    log["obs_pm25"] = obs25[ti[ok], si[ok]].astype(float)
    rows = log.rename(columns={"pm25": "model_pm25"})
    scored = rows[rows[["obs_pm25", *_TRIO.values()]].notna().all(axis=1)]
    if scored.empty:
        return None
    since = pd.to_datetime(rows["issued_at"], utc=True).min().tz_convert(TZ)
    return {"since": since.isoformat(timespec="seconds"), "checked_hours": int(scored["t"].nunique()),
            "horizons": f"{int(scored['horizon_h'].min())}–{int(scored['horizon_h'].max())} h",
            "mae_pm25": mae(scored)}


def scoreboard_block(live: dict | None, cache: Path = CACHE) -> dict | None:
    """model.scoreboard: the chosen replay run (if the replay has been cached) and the live score (if any)."""
    block: dict = {}
    if cache.exists():
        c = json.loads(cache.read_text(encoding="utf-8"))
        run = (c.get("runs") or {}).get(c.get("chosen"))
        if run:
            block["replay"] = run
    if live:
        block["live"] = live
    if not block:
        return None
    return {"updated_at": pd.Timestamp.now(tz=TZ).isoformat(timespec="seconds"), **block}


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--replay", action="store_true", help="replay 1–19 Nov 2026 and cache the result")
    if ap.parse_args().replay:
        replay_main()
    else:
        ap.print_help()
