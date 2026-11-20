"""„Проверка на живо“: how good the forecast is with real forecast weather, on data no model has seen.

    uv run --group ml python -u -m ml.aq_scoreboard --replay

- Replay: 1–19 Nov 2026, one forecast a day at 12:00 local for the next day, by the models trained before winter
  2025/26 (ml/models/aq_*_eval). The weather is what was forecast at the time (Open-Meteo Previous Runs), never from
  a run newer than the issue time. The archive has no boundary-layer height, so the replay runs twice: without it
  ("none") and with observed ERA5 ("era5"). The payload carries "none" if it still beats CAMS for VT.
- Live: ml/aq_forecast.py logs every hourly run to Neon (aq_forecast_log) and scores each hour once its readings
  arrive (aq_forecast_score).

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
            "weather": "forecast", "blh": blh,
            # CAMS (model input and baseline) comes from Open-Meteo's CAMS archive, which keeps the newest run per
            # hour, so it is fresher than the 12:00 issue. Model vs CAMS stays like-for-like; the page says so.
            "cams": "archive", "days": len(dates),
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


# ---------------- Live: log every hourly run in Neon, score it as readings arrive ----------------
#
# aq_forecast_log: one row per (run, sensor), the 1–72 h forecasts as arrays (index = horizon; the target hour
# t = issued_at + (h - 1) h), about 0.5 MB a run; kept LOG_KEEP_DAYS, long enough for every forecast to be scored.
# aq_forecast_score: per (target hour, horizon), the count and the summed absolute errors of the model, CAMS and
# persistence. An hour is scored once, in SQL, when its readings arrive, so nothing is downloaded for scoring.

LOG_DIR = ROOT / "data" / "forecast_log"   # the old parquet log; backfill_log() moves it into Neon
LOG_COLS = ["issued_at", "sensor_id", "t", "horizon_h", "pm25", "pm10", "cams_pm25", "persistence_pm25"]
HORIZON = 72
LOG_KEEP_DAYS = 4
LOG_DDL = [
    """create table if not exists aq_forecast_log (
  issued_at timestamptz not null,
  sensor_id integer not null,
  pm25 real[] not null,
  pm10 real[] not null,
  cams_pm25 real[] not null,
  persistence_pm25 real,
  primary key (issued_at, sensor_id)
)""",
    """create table if not exists aq_forecast_score (
  t timestamptz not null,
  horizon_h smallint not null,
  n integer not null,
  abs_model double precision not null,
  abs_cams double precision not null,
  abs_persistence double precision not null,
  first_issued timestamptz not null,
  primary key (t, horizon_h)
)"""]


def ensure_log_tables(cur) -> None:
    for stmt in LOG_DDL:
        cur.execute(stmt)


def _f(x):
    return None if x is None or x != x else float(x)


def log_arrays(rows: pd.DataFrame) -> list[tuple]:
    """Long rows (LOG_COLS, one per sensor and horizon) → (issued_at, sensor_id, pm25[], pm10[], cams_pm25[],
    persistence_pm25) per (run, sensor). Array k (0-based) is horizon k + 1; missing horizons are NULL."""
    out = []
    for (issued, sid), g in rows.groupby(["issued_at", "sensor_id"], sort=True):
        h = g["horizon_h"].to_numpy(dtype=int)
        arr = {c: [None] * HORIZON for c in ("pm25", "pm10", "cams_pm25")}
        for c in arr:
            for k, v in zip(h, g[c].to_numpy(dtype=float)):
                if 1 <= k <= HORIZON:
                    arr[c][k - 1] = _f(v)
        out.append((pd.Timestamp(issued).tz_convert("UTC").to_pydatetime(), int(sid), arr["pm25"], arr["pm10"],
                    arr["cams_pm25"], _f(g["persistence_pm25"].iloc[0])))
    return out


INSERT_LOG = ("insert into aq_forecast_log (issued_at, sensor_id, pm25, pm10, cams_pm25, persistence_pm25) "
              "values (%s, %s, %s, %s, %s, %s) on conflict (issued_at, sensor_id) do ")


def log_issued(cur, issued_at: pd.Timestamp, rows: pd.DataFrame) -> int:
    """This run's 1–72 h forecasts into aq_forecast_log (a rerun of the same issue hour replaces it); runs older
    than LOG_KEEP_DAYS are dropped."""
    data = log_arrays(rows[LOG_COLS])
    cur.executemany(INSERT_LOG + "update set pm25 = excluded.pm25, pm10 = excluded.pm10, "
                    "cams_pm25 = excluded.cams_pm25, persistence_pm25 = excluded.persistence_pm25", data)
    cutoff = pd.Timestamp(issued_at).tz_convert("UTC") - pd.Timedelta(days=LOG_KEEP_DAYS)
    cur.execute("delete from aq_forecast_log where issued_at < %s", (cutoff.to_pydatetime(),))
    return len(data)


def read_log(cur, t_from: pd.Timestamp | None = None, t_to: pd.Timestamp | None = None) -> pd.DataFrame:
    """The log in long form (LOG_COLS) for target hours in [t_from, t_to] (UTC; either end may be open)."""
    a = pd.Timestamp(t_from if t_from is not None else "2000-01-01T00:00Z").to_pydatetime()
    b = pd.Timestamp(t_to if t_to is not None else "2100-01-01T00:00Z").to_pydatetime()
    cur.execute(
        "select l.issued_at, l.sensor_id, l.issued_at + (h - 1) * interval '1 hour' as t, h as horizon_h, "
        "l.pm25[h], l.pm10[h], l.cams_pm25[h], l.persistence_pm25 "
        "from aq_forecast_log l cross join generate_series(1, %s) h "
        "where l.issued_at > %s - interval '72 hours' and l.issued_at <= %s "
        "and l.issued_at + (h - 1) * interval '1 hour' between %s and %s", (HORIZON, a, b, a, b))
    df = pd.DataFrame(cur.fetchall(), columns=LOG_COLS)
    for c in ("issued_at", "t"):
        df[c] = pd.to_datetime(df[c], utc=True)
    for c in ("pm25", "pm10", "cams_pm25", "persistence_pm25"):
        df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    return df


SCORE_SQL = """
with obs(sensor_id, t, pm25) as (
  select * from unnest(%(sid)s::int[], %(t)s::timestamptz[], %(obs)s::real[])
), pairs as (
  select o.t, (extract(epoch from o.t - l.issued_at) / 3600)::int + 1 as h, l.issued_at, o.pm25 as obs,
         l.pm25 as f_model, l.cams_pm25 as f_cams, l.persistence_pm25
  from obs o join aq_forecast_log l
    on l.sensor_id = o.sensor_id and l.issued_at <= o.t and l.issued_at > o.t - interval '72 hours'
)
insert into aq_forecast_score (t, horizon_h, n, abs_model, abs_cams, abs_persistence, first_issued)
select t, h, count(*), sum(abs(f_model[h] - obs)), sum(abs(f_cams[h] - obs)), sum(abs(persistence_pm25 - obs)),
       min(issued_at)
from pairs
where f_model[h] is not null and f_cams[h] is not null and persistence_pm25 is not null
group by t, h
on conflict (t, horizon_h) do nothing
"""


def new_observations(obs25: np.ndarray, times: pd.DatetimeIndex, sensor_ids: np.ndarray, after, upto) -> dict:
    """The panel's cleaned, humidity-corrected PM2.5 for the hours in (after, upto], as SQL arrays."""
    times = pd.DatetimeIndex(times)
    sel = times <= pd.Timestamp(upto).tz_convert("UTC")
    if after is not None:
        sel &= times > pd.Timestamp(after).tz_convert("UTC")
    ti = np.flatnonzero(sel)
    sub = obs25[ti]
    r, c = np.nonzero(~np.isnan(sub))
    return {"sid": [int(x) for x in np.asarray(sensor_ids)[c]], "t": [times[ti[k]].to_pydatetime() for k in r],
            "obs": [float(x) for x in sub[r, c]]}


def live_block(row) -> dict | None:
    """(first_issued, hours, min_h, max_h, n, abs_model, abs_cams, abs_persistence) → the contract's `live`."""
    since, hours, h0, h1, n, a_m, a_c, a_p = row
    if not n:
        return None
    return {"since": pd.Timestamp(since).tz_convert(TZ).isoformat(timespec="seconds"), "checked_hours": int(hours),
            "horizons": f"{int(h0)}–{int(h1)} h",
            "mae_pm25": {"model": round(a_m / n, 1), "cams": round(a_c / n, 1), "persistence": round(a_p / n, 1)}}


def live_score(cur, obs25: np.ndarray, times: pd.DatetimeIndex, sensor_ids: np.ndarray,
               upto: pd.Timestamp) -> dict | None:
    """Score the logged forecasts for the hours whose readings arrived since the last scored hour (up to `upto`,
    the last complete hour) against the panel's PM2.5, then return the live score over every hour scored so far.
    None until at least one hour has been scored."""
    cur.execute("select max(t) from aq_forecast_score")
    after = cur.fetchone()[0]
    if after is None:
        cur.execute("select min(issued_at) - interval '1 hour' from aq_forecast_log")
        after = cur.fetchone()[0]
    if after is not None:
        obs = new_observations(obs25, times, sensor_ids, after, upto)
        if obs["sid"]:
            cur.execute(SCORE_SQL, obs)
    cur.execute("select min(first_issued), count(distinct t), min(horizon_h), max(horizon_h), sum(n), "
                "sum(abs_model), sum(abs_cams), sum(abs_persistence) from aq_forecast_score")
    return live_block(cur.fetchone())


def backfill_log(cur, log_dir: Path = LOG_DIR) -> int:
    """Move the old parquet log (data/forecast_log/issued-*.parquet) into aq_forecast_log. Safe to run again."""
    files = sorted(log_dir.glob("issued-*.parquet")) if log_dir.exists() else []
    n = 0
    for f in files:
        rows = pd.read_parquet(f)
        rows["issued_at"] = pd.to_datetime(rows["issued_at"], utc=True)
        rows["t"] = pd.to_datetime(rows["t"], utc=True)
        lag = (rows["t"] - rows["issued_at"]) / pd.Timedelta(hours=1) + 1
        if not (lag == rows["horizon_h"]).all():
            raise ValueError(f"{f.name}: t != issued_at + (horizon - 1) h")
        data = log_arrays(rows[LOG_COLS])
        cur.executemany(INSERT_LOG + "nothing", data)
        n += len(data)
    return n


def scoreboard_block(live: dict | None, cache: Path = CACHE) -> dict | None:
    """model.scoreboard: the chosen replay run (if the replay has been cached) and the live score (if any)."""
    from ml.aq_contract import scoreboard_errors

    def valid(key: str, part) -> bool:
        """A part that fails the contract or holds NaN is dropped, so it can never stop the hourly forecast."""
        try:
            json.dumps(part, allow_nan=False)
        except (TypeError, ValueError):
            return False
        return not scoreboard_errors({key: part})

    block: dict = {}
    if cache.exists():
        c = json.loads(cache.read_text(encoding="utf-8"))
        run = (c.get("runs") or {}).get(c.get("chosen"))
        if run and valid("replay", run):
            block["replay"] = run
    if live and valid("live", live):
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
