"""„Кой замърсява?“: an estimate of how much of Veliko Tarnovo's PM2.5 is home heating, traffic, pollution carried
in from the region, and other always-on local sources.

    uv run --group ml python -u -m ml.aq_sources --profiles

Method (increment tables, no chemistry: an estimate, and labelled so everywhere):
- regional background = the 20th percentile of sensors 15–80 km from VT; local excess = VT city mean above it;
- the always-on local excess = its median on warm hours (> 10 °C), by local hour and weekday/weekend (+ BG holidays),
  from the winters before the holdout; traffic = weekday minus weekend in that baseline;
- heating = the local excess above the baseline.
Two biases (say them): inversion nights also trap traffic smoke, so heating is slightly over-credited; „пренос“
includes the smoke of nearby villages. Writes ml/models/aq_sources.json (contract/CONTRACT.md "sources")."""
from __future__ import annotations

import datetime as dt
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

from ml.aq_features import TZ, Panel

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "ml" / "models" / "aq_sources.json"
VT = (43.0786, 25.6211)
VT_KM = 10
REGIONAL_KM = (15, 80)
WARM_C = 10.0
MIN_SAMPLES = 30
SHARE = 0.2


def km_from_vt(lat, lon) -> np.ndarray:
    return np.hypot((np.asarray(lat, dtype=float) - VT[0]) * 111.2, (np.asarray(lon, dtype=float) - VT[1]) * 81.3)


def daytype(local: pd.DatetimeIndex, holidays: set) -> np.ndarray:
    """True for Saturday, Sunday and Bulgarian public holidays (local dates)."""
    weekend = np.asarray(local.day_of_week >= 5)
    hol = np.array([d in holidays for d in local.date], dtype=bool)
    return weekend | hol


def vt_and_regional(p: Panel) -> pd.DataFrame:
    """Hourly VT city mean, regional background (20th percentile 15–80 km) and the local excess above it."""
    d = km_from_vt(p.sensors["lat"], p.sensors["lon"])
    vt_cols = np.flatnonzero(d <= VT_KM)
    reg_cols = np.flatnonzero((d >= REGIONAL_KM[0]) & (d <= REGIONAL_KM[1]))
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        vt = np.nanmean(p.pm25[:, vt_cols], axis=1) if len(vt_cols) else np.full(len(p.times), np.nan)
        reg = np.nanpercentile(p.pm25[:, reg_cols], 20, axis=1) if len(reg_cols) else np.full(len(p.times), np.nan)
    vt, reg = vt.astype(float), reg.astype(float)
    inc = vt - np.minimum(np.nan_to_num(reg, nan=0.0), vt)
    return pd.DataFrame({"vt": vt, "regional": reg, "inc": inc}, index=p.times)


def build_profiles(series: pd.DataFrame, temp: pd.Series, holidays: set) -> dict:
    """Median local excess on warm hours by local hour × daytype; traffic = weekday − weekend (>= 0).
    A cell with fewer than MIN_SAMPLES hours uses the hour's median across both daytypes."""
    local = series.index.tz_convert(TZ)
    weekend = daytype(local, holidays)
    hour = np.asarray(local.hour)
    inc = series["inc"].to_numpy(dtype=float)
    warm = (temp.reindex(series.index).to_numpy(dtype=float) > WARM_C) & ~np.isnan(inc)
    base = {"weekday": [], "weekend": []}
    samples = {"weekday": [], "weekend": []}
    for h in range(24):
        both = inc[warm & (hour == h)]
        fallback = float(np.median(both)) if len(both) else 0.0
        for kind, is_we in (("weekday", False), ("weekend", True)):
            v = inc[warm & (hour == h) & (weekend == is_we)]
            samples[kind].append(int(len(v)))
            base[kind].append(round(float(np.median(v)) if len(v) >= MIN_SAMPLES else fallback, 2))
    traffic = [round(max(0.0, a - b), 2) for a, b in zip(base["weekday"], base["weekend"])]
    return {"baseline": base, "traffic": traffic, "samples": samples}


def _history():
    """The cleaned panel from the first winter to the end of the holdout, its VT/regional series and VT temperature."""
    from ml.aq_features import build_panel, load_hourly, load_sensors, weather_frames
    from ml.aq_train import HOLDOUT, START

    era5, cams = weather_frames()
    p = build_panel(load_hourly(), load_sensors(), era5, cams, START, HOLDOUT[1])
    series = vt_and_regional(p)
    vt_cells = p.sensor_cell[(km_from_vt(p.sensors["lat"], p.sensors["lon"]) <= VT_KM) & (p.sensor_cell >= 0)]
    cell = int(pd.Series(vt_cells).mode().iat[0])
    temp = pd.Series(p.weather["temperature_2m"][:, cell].astype(float), index=p.times)
    return p, series, temp


def main_profiles() -> None:
    from ml.aq_features import _bg_holidays
    from ml.aq_train import HOLDOUT

    p, series, temp = _history()
    holidays = _bg_holidays(range(2023, 2027))
    pre = series.index < HOLDOUT[0]
    prof = build_profiles(series[pre], temp[pre], holidays)
    out = {"built_at": pd.Timestamp.now(tz=TZ).isoformat(timespec="seconds"), "share": SHARE,
           "method": "estimate", "profiles": prof}
    b, t = prof["baseline"], prof["traffic"]
    print(f"baseline 08:00 weekday {b['weekday'][8]} weekend {b['weekend'][8]} | 21:00 weekday {b['weekday'][21]} "
          f"weekend {b['weekend'][21]} | traffic peak {max(t)} at {t.index(max(t)):02d}:00")
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--profiles", action="store_true", help="build the profiles (and last winter's what-if)")
    if ap.parse_args().profiles:
        main_profiles()
    else:
        ap.print_help()
