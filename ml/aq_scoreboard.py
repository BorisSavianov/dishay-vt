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
