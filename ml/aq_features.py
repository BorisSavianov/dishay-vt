"""Hourly panel (sensors × hours), cleaning, humidity correction and the forecast feature matrix.

Shared by training (ml.aq_train) and the live loop (ml.aq_forecast), so both build features the same way.

Conventions: hours are UTC bin starts. Issue index i = the last complete hour. Target hour T = i + h, h = 1..72.
Every observation feature only reads hours <= i; weather and CAMS are read at T (ERA5/CAMS history in training,
the forecasts live)."""
from __future__ import annotations

import json
import math
import warnings
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "aq"
TZ = "Europe/Sofia"
TYPE_CODE = {"SDS011": 0, "SPS30": 2, "HPM": 3}  # PMS* -> 1
KAPPA = 0.4          # Crilley et al. 2018 kappa-Koehler, OPC hygroscopic growth
RH_REF = 0.80        # SDS011 is trusted below this RH; growth above it is removed
RH_CAP = 0.95
MIN_READINGS = 6     # per hour
NEIGHBOUR_KM = 5.0
WEATHER = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_direction_10m",
           "precipitation", "surface_pressure", "boundary_layer_height"]


def type_code(t: str) -> int:
    return TYPE_CODE.get(t, 1 if t.startswith("PMS") else 4)


def growth(aw: np.ndarray) -> np.ndarray:
    k = KAPPA / 1.65
    aw = np.clip(aw, 0.0, RH_CAP)
    return 1.0 + k / (1.0 / np.maximum(aw, 1e-3) - 1.0)


def humidity_factor(rh_percent: np.ndarray) -> np.ndarray:
    """Divide raw PM by this. 1 below RH_REF, kappa-Koehler growth relative to RH_REF above it."""
    aw = np.asarray(rh_percent, dtype=np.float64) / 100.0
    f = growth(aw) / growth(np.array(RH_REF))
    f = np.where(np.isnan(aw), 1.0, np.maximum(f, 1.0))
    return f.astype(np.float32)


def km(lat1, lon1, lat2, lon2):
    return np.hypot((lat1 - lat2) * 111.2, (lon1 - lon2) * 111.2 * np.cos(np.radians((lat1 + lat2) / 2)))


@dataclass
class Panel:
    times: pd.DatetimeIndex                 # hourly UTC bins
    sensors: pd.DataFrame                   # id, type, lat, lon, cell, elevation, type_code (row order = column order)
    pm25: np.ndarray                        # [hour, sensor] corrected, NaN = missing
    pm10: np.ndarray
    raw25: np.ndarray
    cells: list[str]
    weather: dict[str, np.ndarray]          # var -> [hour, cell]
    cams25: np.ndarray                      # [hour, cell]
    cams10: np.ndarray
    sensor_cell: np.ndarray                 # sensor -> cell column (-1 if none)
    neighbours: np.ndarray = field(default=None)  # [sensor, sensor] weights (0/1), self excluded

    def index_of(self, ts) -> int:
        return int(self.times.get_loc(pd.Timestamp(ts).tz_convert("UTC").floor("h")))


def load_sensors() -> pd.DataFrame:
    s = pd.DataFrame(json.loads((RAW / "sensors_bg.json").read_text(encoding="utf-8")))
    cells = json.loads((RAW / "cells.json").read_text())
    s["cell"] = s["id"].astype(str).map(cells["sensor_cell"])
    elev_path = RAW / "elevation.json"
    elev = {int(k): v for k, v in json.loads(elev_path.read_text()).items()} if elev_path.exists() else {}
    s["elevation"] = s["id"].map(elev).astype(float)
    s["type_code"] = s["type"].map(type_code)
    return s.reset_index(drop=True)


def load_hourly() -> pd.DataFrame:
    parts = sorted((RAW / "hourly").glob("part-*.parquet"))
    df = pd.concat([pd.read_parquet(p) for p in parts], ignore_index=True)
    return df.drop_duplicates(["sensor_id", "hour"], keep="last")


def weather_frames() -> tuple[pd.DataFrame | None, pd.DataFrame | None]:
    era5 = pd.read_parquet(RAW / "era5.parquet") if (RAW / "era5.parquet").exists() else None
    cams = pd.read_parquet(RAW / "cams.parquet") if (RAW / "cams.parquet").exists() else None
    return era5, cams


def _wide(df: pd.DataFrame, col: str, times, keys, key_col: str) -> np.ndarray:
    out = np.full((len(times), len(keys)), np.nan, dtype=np.float32)
    if df is None or df.empty or col not in df:
        return out
    ti = times.get_indexer(df["time"])
    ki = pd.Index(keys).get_indexer(df[key_col])
    ok = (ti >= 0) & (ki >= 0)
    out[ti[ok], ki[ok]] = df[col].to_numpy(dtype=np.float32)[ok]
    return out


def flatline_mask(x: np.ndarray, window: int = 6) -> np.ndarray:
    """True where the value is part of `window` consecutive identical non-NaN readings (stuck sensor)."""
    df = pd.DataFrame(x)
    same = df.diff().abs().eq(0)
    run = same.rolling(window - 1, min_periods=window - 1).sum().eq(window - 1)
    # Mark the whole run, not only its last hour.
    marked = run.copy()
    for k in range(1, window):
        marked |= run.shift(-k, fill_value=False)
    return marked.to_numpy() & ~np.isnan(x)


def spike_filter(p25: np.ndarray, p10: np.ndarray, sensors: pd.DataFrame, radius_km: float = 15.0,
                 ratio: float = 8.0, floor: float = 100.0, bad_share: float = 0.3) -> np.ndarray:
    """Blank hours far above the local picture (median of other sensors within radius_km, else the
    national median) and return the sensors that are mostly broken (> bad_share of their hours flagged).
    Edits p25/p10 in place."""
    lat, lon = sensors["lat"].to_numpy(), sensors["lon"].to_numpy()
    d = km(lat[:, None], lon[:, None], lat[None, :], lon[None, :])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        national = np.nanmedian(p25, axis=1)
        bad = np.zeros(p25.shape[1], dtype=bool)
        for j in range(p25.shape[1]):
            nb = np.flatnonzero((d[j] <= radius_km) & (d[j] > 0.05))
            ref = np.nanmedian(p25[:, nb], axis=1) if len(nb) >= 2 else national
            ref = np.where(np.isnan(ref), national, ref)
            x = p25[:, j]
            flag = (x > floor) & (x > ratio * np.maximum(ref, 1.0))
            # Stuck low: reads under 1/8 of the local picture while the neighbours see real pollution.
            low = (ref > 20) & (x < ref / ratio)
            have = ~np.isnan(x)
            dirty = have & (ref > 20)
            if have.sum() and flag.sum() / have.sum() > bad_share:
                bad[j] = True
            if dirty.sum() >= 24 and low.sum() / dirty.sum() > 0.5:
                bad[j] = True
            p25[flag, j] = np.nan
            p10[flag, j] = np.nan
    return bad


def build_panel(hourly: pd.DataFrame, sensors: pd.DataFrame, era5: pd.DataFrame | None, cams: pd.DataFrame | None,
                start, end, min_uptime: float = 0.6) -> Panel:
    times = pd.date_range(pd.Timestamp(start).tz_convert("UTC").floor("h"),
                          pd.Timestamp(end).tz_convert("UTC").floor("h"), freq="h")
    sensors = sensors[sensors["id"].isin(hourly["sensor_id"].unique())].reset_index(drop=True)
    h = hourly[hourly["sensor_id"].isin(sensors["id"])].copy()
    h = h.rename(columns={"hour": "time"})
    h.loc[h["n"] < MIN_READINGS, ["pm10", "pm25"]] = np.nan
    ids = sensors["id"].tolist()
    p25 = _wide(h, "pm25", times, ids, "sensor_id")
    p10 = _wide(h, "pm10", times, ids, "sensor_id")
    for x in (p25, p10):
        x[(x > 999) | (x < 0)] = np.nan
        x[flatline_mask(x)] = np.nan
    bad_sensor = spike_filter(p25, p10, sensors)

    cells = sorted(set(sensors["cell"].dropna()))
    weather = {v: _wide(era5, v, times, cells, "cell") for v in WEATHER}
    cams25 = _wide(cams, "pm2_5", times, cells, "cell")
    cams10 = _wide(cams, "pm10", times, cells, "cell")
    sensor_cell = pd.Index(cells).get_indexer(sensors["cell"])

    rh = np.where(sensor_cell[None, :] >= 0, weather["relative_humidity_2m"][:, np.maximum(sensor_cell, 0)], np.nan)
    optical = sensors["type_code"].isin([0, 1, 3]).to_numpy()
    f = humidity_factor(rh)
    f[:, ~optical] = 1.0
    raw25 = p25.copy()
    p25 = p25 / f
    p10 = p10 / f

    # Uptime over each sensor's own active span; sensors below min_uptime are dropped.
    # Uptime within the days we have files for (the download fills days in random order, so a span-based
    # uptime would punish sensors that are simply not downloaded yet). Flaky sensors are dropped.
    have = ~np.isnan(p25)
    n_days = -(-len(times) // 24)
    padded = np.zeros((n_days * 24, len(ids)), dtype=bool)
    padded[: len(times)] = have
    per_day = padded.reshape(n_days, 24, len(ids)).sum(axis=1)
    days_with_data = (per_day > 0).sum(axis=0)
    valid_hours = have.sum(axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        uptime = valid_hours / np.maximum(days_with_data * 24, 1)
    keep = (valid_hours >= 12) & (uptime >= min_uptime) & ~bad_sensor
    sensors = sensors[keep].reset_index(drop=True)
    p25, p10, raw25, sensor_cell = p25[:, keep], p10[:, keep], raw25[:, keep], sensor_cell[keep]

    lat, lon = sensors["lat"].to_numpy(), sensors["lon"].to_numpy()
    d = km(lat[:, None], lon[:, None], lat[None, :], lon[None, :])
    nb = ((d <= NEIGHBOUR_KM) & (d > 0.05)).astype(np.float32)  # >50 m: co-located duplicates are not neighbours
    return Panel(times, sensors, p25.astype(np.float32), p10.astype(np.float32), raw25.astype(np.float32), cells,
                 weather, cams25, cams10, sensor_cell, nb)


def _nanmean_neighbours(x: np.ndarray, nb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    have = (~np.isnan(x)).astype(np.float32)
    num = np.nan_to_num(x) @ nb
    den = have @ nb
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(den > 0, num / den, np.nan).astype(np.float32), den.astype(np.float32)


@dataclass
class Derived:
    roll25_mean: np.ndarray
    roll25_max: np.ndarray
    roll10_mean: np.ndarray
    nb25: np.ndarray
    nb25_n: np.ndarray
    nb25_roll: np.ndarray
    up25: np.ndarray = None
    up_n: np.ndarray = None


UPWIND_KM = (2.0, 30.0)
UPWIND_HALF_ANGLE = 45.0


def upwind_mean(p: Panel, x: np.ndarray, chunk: int = 48) -> tuple[np.ndarray, np.ndarray]:
    """Mean of x over sensors 2-30 km upwind of each sensor (within +-45 deg of where the wind comes from)."""
    lat, lon = p.sensors["lat"].to_numpy(), p.sensors["lon"].to_numpy()
    dy = (lat[None, :] - lat[:, None]) * 111.2
    dx = (lon[None, :] - lon[:, None]) * 111.2 * np.cos(np.radians(lat[:, None]))
    dist = np.hypot(dx, dy)
    bearing = (np.degrees(np.arctan2(dx, dy)) + 360) % 360      # from sensor j towards k
    near = (dist >= UPWIND_KM[0]) & (dist <= UPWIND_KM[1])
    cc = np.maximum(p.sensor_cell, 0)
    wd = p.weather["wind_direction_10m"][:, cc].copy()           # [hour, sensor], where the wind comes from
    wd[:, p.sensor_cell < 0] = np.nan
    have = (~np.isnan(x)).astype(np.float32)
    xv = np.nan_to_num(x).astype(np.float32)
    out = np.full(x.shape, np.nan, dtype=np.float32)
    cnt = np.zeros(x.shape, dtype=np.float32)
    for a in range(0, x.shape[0], chunk):
        w = wd[a : a + chunk]                                     # [c, j]
        diff = np.abs((bearing[None, :, :] - w[:, :, None] + 180) % 360 - 180)
        m = ((diff <= UPWIND_HALF_ANGLE) & near[None]).astype(np.float32)   # [c, j, k]
        num = np.einsum("cjk,ck->cj", m, xv[a : a + chunk])
        den = np.einsum("cjk,ck->cj", m, have[a : a + chunk])
        with np.errstate(invalid="ignore", divide="ignore"):
            out[a : a + chunk] = np.where(den > 0, num / den, np.nan)
        cnt[a : a + chunk] = den
    return out, cnt


def derive(p: Panel, upwind: bool = True) -> Derived:
    r25 = pd.DataFrame(p.pm25).rolling(24, min_periods=6)
    r10 = pd.DataFrame(p.pm10).rolling(24, min_periods=6)
    roll25_mean = r25.mean().to_numpy(np.float32)
    nb25, nb_n = _nanmean_neighbours(p.pm25, p.neighbours)
    nb_roll, _ = _nanmean_neighbours(roll25_mean, p.neighbours)
    d = Derived(roll25_mean, r25.max().to_numpy(np.float32), r10.mean().to_numpy(np.float32), nb25, nb_n, nb_roll)
    if upwind:
        d.up25, d.up_n = upwind_mean(p, p.pm25)
    return d


LAGS = {"lag1": 0, "lag2": 1, "lag3": 2, "lag6": 5, "lag24": 23, "lag48": 47}
FEATURES = (
    [f"pm25_{k}" for k in LAGS] + [f"pm10_{k}" for k in ("lag1", "lag24")]
    + ["pm25_roll24_mean", "pm25_roll24_max", "pm10_roll24_mean", "pm25_same_hour",
       "nb_pm25_lag1", "nb_count", "nb_pm25_roll24",
       "temp", "rh", "rh_issue", "wind_speed", "wind_sin", "wind_cos", "blh", "blh_min6", "wind_mean6", "precip", "precip6",
       "pressure_tend3", "temp_drop_issue",
       "cams_pm25", "cams_pm10", "cams_pm25_issue", "obs_vs_cams",
       "hour_local", "dow", "month", "heating", "holiday", "horizon_h",
       "lat", "lon", "elevation", "sensor_type"]
)
CATEGORICAL = ["sensor_type"]
UPWIND_FEATURES = ["up_pm25_lag1", "up_count"]   # a model uses them only if it was trained with them

GROUPS = {  # feature -> reason group (ml.aq_labels)
    **{f: "persistence" for f in FEATURES if f.startswith(("pm25_", "pm10_"))},
    "nb_pm25_lag1": "neighbours", "nb_count": "neighbours", "nb_pm25_roll24": "neighbours",
    "up_pm25_lag1": "neighbours", "up_count": "neighbours",
    "temp": "temp", "temp_drop_issue": "temp", "rh": "rh", "rh_issue": "rh",
    "wind_speed": "wind_speed", "wind_sin": "wind_speed", "wind_cos": "wind_speed", "wind_mean6": "wind_speed",
    "blh": "pbl_height", "blh_min6": "pbl_height", "pressure_tend3": "pbl_height",
    "precip": "precip", "precip6": "precip",
    "cams_pm25": "cams", "cams_pm10": "cams", "cams_pm25_issue": "cams", "obs_vs_cams": "cams",
    "hour_local": "calendar", "dow": "calendar", "month": "calendar", "heating": "calendar", "holiday": "calendar",
}


def _bg_holidays(years) -> set:
    try:
        import holidays
        return set(holidays.country_holidays("BG", years=list(years)).keys())
    except Exception:
        return set()


def features(p: Panel, d: Derived, i: np.ndarray, s: np.ndarray, h: np.ndarray) -> pd.DataFrame:
    """One row per (issue index i, sensor column s, horizon h). Arrays must have equal length."""
    i, s, h = np.asarray(i), np.asarray(s), np.asarray(h)
    T = i + h
    n_t = len(p.times)
    def at(arr, idx, col):
        ok = (idx >= 0) & (idx < n_t)
        out = np.full(len(idx), np.nan, dtype=np.float32)
        out[ok] = arr[idx[ok], col[ok]]
        return out

    c = p.sensor_cell[s]
    cc = np.maximum(c, 0)
    def w(var, idx):
        v = at(p.weather[var], idx, cc)
        v[c < 0] = np.nan
        return v

    X = {}
    for name, k in LAGS.items():
        X[f"pm25_{name}"] = at(p.pm25, i - k, s)
    X["pm10_lag1"] = at(p.pm10, i, s)
    X["pm10_lag24"] = at(p.pm10, i - 23, s)
    X["pm25_roll24_mean"] = at(d.roll25_mean, i, s)
    X["pm25_roll24_max"] = at(d.roll25_max, i, s)
    X["pm10_roll24_mean"] = at(d.roll10_mean, i, s)
    X["pm25_same_hour"] = at(p.pm25, T - 24 * np.ceil(h / 24).astype(int), s)
    X["nb_pm25_lag1"] = at(d.nb25, i, s)
    X["nb_count"] = at(d.nb25_n, i, s)
    X["nb_pm25_roll24"] = at(d.nb25_roll, i, s)

    X["temp"] = w("temperature_2m", T)
    X["rh"] = w("relative_humidity_2m", T)
    X["rh_issue"] = w("relative_humidity_2m", i)  # the base level was humidity-corrected at i
    X["wind_speed"] = w("wind_speed_10m", T)
    wd = np.radians(w("wind_direction_10m", T))
    X["wind_sin"], X["wind_cos"] = np.sin(wd), np.cos(wd)
    X["blh"] = w("boundary_layer_height", T)
    blh6 = np.stack([w("boundary_layer_height", T - k) for k in range(6)])
    ws6 = np.stack([w("wind_speed_10m", T - k) for k in range(6)])
    pr6 = np.stack([w("precipitation", T - k) for k in range(6)])
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        X["blh_min6"] = np.nanmin(blh6, axis=0)
        X["wind_mean6"] = np.nanmean(ws6, axis=0)
        X["precip6"] = np.nansum(pr6, axis=0)
    X["precip"] = w("precipitation", T)
    X["pressure_tend3"] = w("surface_pressure", T) - w("surface_pressure", T - 3)
    X["temp_drop_issue"] = w("temperature_2m", i) - X["temp"]

    def cams(arr, idx):
        v = at(arr, idx, cc)
        v[c < 0] = np.nan
        return v
    X["cams_pm25"] = cams(p.cams25, T)
    X["cams_pm10"] = cams(p.cams10, T)
    X["cams_pm25_issue"] = cams(p.cams25, i)
    X["obs_vs_cams"] = np.log1p(X["pm25_lag1"]) - np.log1p(X["cams_pm25_issue"])

    tl = p.times[np.clip(T, 0, n_t - 1)].tz_convert(TZ)
    X["hour_local"] = tl.hour.to_numpy(np.float32)
    X["dow"] = tl.day_of_week.to_numpy(np.float32)
    X["month"] = tl.month.to_numpy(np.float32)
    X["heating"] = np.isin(tl.month, [10, 11, 12, 1, 2, 3, 4]).astype(np.float32)
    hol = _bg_holidays(range(p.times[0].year, p.times[-1].year + 2))
    X["holiday"] = np.array([dd in hol for dd in tl.date], dtype=np.float32)
    X["horizon_h"] = h.astype(np.float32)
    X["lat"] = p.sensors["lat"].to_numpy(np.float32)[s]
    X["lon"] = p.sensors["lon"].to_numpy(np.float32)[s]
    X["elevation"] = p.sensors["elevation"].to_numpy(np.float32)[s]
    X["sensor_type"] = p.sensors["type_code"].to_numpy(np.int32)[s]
    if d.up25 is not None:
        X["up_pm25_lag1"] = at(d.up25, i, s)
        X["up_count"] = at(d.up_n, i, s)
    else:
        X["up_pm25_lag1"] = np.full(len(i), np.nan, dtype=np.float32)
        X["up_count"] = np.full(len(i), np.nan, dtype=np.float32)
    df = pd.DataFrame(X)[FEATURES + UPWIND_FEATURES]
    df["sensor_type"] = df["sensor_type"].astype("category").cat.set_categories([0, 1, 2, 3, 4])
    return df


def mask_short_lags(X: pd.DataFrame, rng: np.random.Generator, rate: float = 0.15) -> pd.DataFrame:
    """Hide lags 3/6 (and sometimes 2) in a share of rows: live, today's early hours are missing until
    the archive publishes them, and the model must cope."""
    X = X.copy()
    m1 = rng.random(len(X)) < rate
    m2 = m1 & (rng.random(len(X)) < 0.5)
    X.loc[m1, ["pm25_lag6"]] = np.nan
    X.loc[m2, ["pm25_lag3", "pm25_lag2"]] = np.nan
    return X


def targets(p: Panel, i: np.ndarray, s: np.ndarray, h: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    T = np.asarray(i) + np.asarray(h)
    ok = T < len(p.times)
    y25 = np.full(len(T), np.nan, dtype=np.float32)
    y10 = np.full(len(T), np.nan, dtype=np.float32)
    y25[ok] = p.pm25[T[ok], np.asarray(s)[ok]]
    y10[ok] = p.pm10[T[ok], np.asarray(s)[ok]]
    return y25, y10


def base_log(X: pd.DataFrame, species: str = "pm25") -> np.ndarray:
    """log1p of the last known level: the most recent lag, else the 24 h mean. The models predict the change
    from it (log scale), so short horizons start from persistence by construction."""
    if species == "pm25":
        cols = ["pm25_lag1", "pm25_lag2", "pm25_lag3", "pm25_lag6", "pm25_roll24_mean"]
    else:
        cols = ["pm10_lag1", "pm10_roll24_mean"]
    base = np.full(len(X), np.nan)
    for c in cols:
        v = X[c].to_numpy(dtype=np.float64)
        base = np.where(np.isnan(base), v, base)
    if species == "pm10":  # no PM10 reading (some sensors): scale the PM2.5 level
        b25 = np.expm1(base_log(X, "pm25")) * 1.5
        base = np.where(np.isnan(base), b25, base)
    return np.log1p(np.maximum(base, 0.0))
