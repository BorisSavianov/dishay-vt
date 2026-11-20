"""„Кой замърсява?“: an estimate of how much of Veliko Tarnovo's PM2.5 is home heating, traffic, pollution carried
in from the region, and other always-on local sources.

    uv run --group ml python -u -m ml.aq_sources --profiles

Method (increment tables, no chemistry: an estimate, and labelled so everywhere):
- regional background = the 20th percentile of sensors 15–80 km from VT; local excess = VT city mean above it;
- the always-on local excess = its median on warm hours (> 10 °C), by local hour and weekday/weekend (+ BG holidays),
  from the winters before the holdout; traffic = weekday minus weekend in that baseline;
- heating = the local excess above the baseline, counted only below 10 °C at the VT cell (else it is "other").
Two biases (say them): on cold inversion nights traffic smoke is trapped too, so heating may still be over-credited; „пренос“
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


PARTS = ("heating", "traffic", "other", "regional")


def split(vt: np.ndarray, reg: np.ndarray, local: pd.DatetimeIndex, prof: dict, holidays: set,
          temp: np.ndarray | None = None) -> dict[str, np.ndarray]:
    """Split PM2.5 hours into regional, traffic, other (always-on local) and heating. Never negative; the four
    parts add up to `vt` at every hour. A NaN regional value counts as 0.
    With `temp` (°C at the VT cell), heating is counted only below WARM_C; on warmer or unknown hours the excess
    above the baseline goes to "other" (an inversion on a mild day is not home heating)."""
    vt = np.maximum(np.asarray(vt, dtype=float), 0.0)
    regional = np.minimum(np.maximum(np.nan_to_num(np.asarray(reg, dtype=float), nan=0.0), 0.0), vt)
    inc = vt - regional
    weekend = daytype(local, holidays)
    hour = np.asarray(local.hour)
    baseline = np.where(weekend, np.asarray(prof["baseline"]["weekend"])[hour], np.asarray(prof["baseline"]["weekday"])[hour])
    base = np.minimum(inc, baseline)
    traffic = np.where(weekend, 0.0, np.minimum(base, np.asarray(prof["traffic"])[hour]))
    above = inc - base
    if temp is None:
        heating = above
    else:
        with np.errstate(invalid="ignore"):
            cold = np.asarray(temp, dtype=float) < WARM_C   # NaN compares False: unknown is not heating
        heating = np.where(cold, above, 0.0)
    return {"heating": heating, "traffic": traffic, "other": base - traffic + (above - heating), "regional": regional}


def day_shares(parts: dict[str, np.ndarray]) -> dict[str, float]:
    """Each part's share of the day's total, rounded to 2 decimals; the rounding leftover goes to the largest part
    so the shares sum to exactly 1.00."""
    sums = {k: float(np.nansum(parts[k])) for k in PARTS}
    total = sum(sums.values())
    if total <= 0:
        return {"heating": 0.0, "traffic": 0.0, "other": 0.0, "regional": 1.0}
    cents = {k: round(100 * v / total) for k, v in sums.items()}
    cents[max(sums, key=sums.get)] += 100 - sum(cents.values())
    return {k: cents[k] / 100 for k in PARTS}


def evening_drop(parts: dict, local: pd.DatetimeIndex, date: dt.date, share: float = SHARE) -> float:
    """µg/m³ of PM2.5 removed on `date` 18:00–23:59 if `share` of the heating smoke went away."""
    m = (np.asarray(local.hour) >= 18) & (np.array(local.date) == date)
    h = np.asarray(parts["heating"], dtype=float)[m]
    if not m.any() or np.isnan(h).all():
        return 0.0
    return round(share * float(np.nanmean(h)), 1)


def bad_days(vt25: np.ndarray, vt10: np.ndarray, local: pd.DatetimeIndex, heating: np.ndarray | None = None,
             share: float = SHARE) -> int:
    """Days at EAQI >= 3 (daily means, >= 18 observed hours). With `heating`, after removing `share` of it each hour
    (PM10 scaled by the same hourly PM2.5 factor)."""
    from ml.aq_levels import level_of

    p25 = np.asarray(vt25, dtype=float)
    p10 = np.asarray(vt10, dtype=float)
    if heating is not None:
        after = np.maximum(p25 - share * np.nan_to_num(np.asarray(heating, dtype=float)), 0.0)
        with np.errstate(all="ignore"):
            p10 = np.where(p25 > 0, p10 * after / p25, p10)
        p25 = after
    df = pd.DataFrame({"date": local.date, "p25": p25, "p10": p10})
    n = 0
    for _, g in df.groupby("date"):
        ok = g["p25"].notna() & g["p10"].notna()
        if ok.sum() >= 18 and level_of(float(g.loc[ok, "p25"].mean()), float(g.loc[ok, "p10"].mean())) >= 3:
            n += 1
    return n


def last_winter_block(vt25: np.ndarray, vt10: np.ndarray, reg: np.ndarray, local: pd.DatetimeIndex, prof: dict,
                      holidays: set, start: str, end: str, share: float = SHARE, temp: np.ndarray | None = None) -> dict:
    """Observed season split and bad days before/after the switch: `model.sources_what_if.last_winter`."""
    parts = split(vt25, reg, local, prof, holidays, temp)
    counts = pd.Series(~np.isnan(np.asarray(vt25, dtype=float))).groupby(np.array(local.date)).sum()
    return {"bad_days": bad_days(vt25, vt10, local), "bad_days_after": bad_days(vt25, vt10, local, parts["heating"], share),
            "days": int((counts >= 18).sum()), "from": start, "to": end, "shares": day_shares(parts)}


def load_sources_json(path: Path = OUT) -> dict | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def sources_payload(vt_fc: np.ndarray, reg_fc: np.ndarray, local: pd.DatetimeIndex, dates: list[str],
                    prof_json: dict, holidays: set, temp_fc: np.ndarray | None = None) -> tuple[dict[str, dict], dict]:
    """Day shares for each forecast date that has hours, and the contract's `sources_what_if`."""
    parts = split(vt_fc, reg_fc, local, prof_json["profiles"], holidays, temp_fc)
    day = np.array([d.isoformat() for d in local.date])
    shares = {}
    for d in dates:
        m = day == d
        if m.any():
            shares[d] = day_shares({k: v[m] for k, v in parts.items()})
    share = float(prof_json.get("share", SHARE))
    first = dates[0] if dates else day[0]
    what_if = {"method": "estimate", "switch_share": share, "date": first,
               "evening_drop_pm25": evening_drop(parts, local, dt.date.fromisoformat(first), share)}
    if prof_json.get("last_winter"):
        what_if["last_winter"] = prof_json["last_winter"]
    return shares, what_if


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
    # Last winter (the holdout): observed VT, split with the profiles, recount bad days after a 20% heating switch.
    hold = (series.index >= HOLDOUT[0]) & (series.index <= HOLDOUT[1])
    local = series.index[hold].tz_convert(TZ)
    vt_cols = np.flatnonzero(km_from_vt(p.sensors["lat"], p.sensors["lon"]) <= VT_KM)
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        vt10 = np.nanmean(p.pm10[:, vt_cols], axis=1).astype(float)[hold]
    last = last_winter_block(series["vt"].to_numpy()[hold], vt10, series["regional"].to_numpy()[hold], local, prof,
                             holidays, HOLDOUT[0].date().isoformat(), HOLDOUT[1].date().isoformat(),  # UTC season
                             temp=temp.to_numpy()[hold])
    print(f"last winter: bad days {last['bad_days']} → {last['bad_days_after']} after a {SHARE:.0%} switch "
          f"({last['days']} days); season shares {last['shares']}")
    out = {"built_at": pd.Timestamp.now(tz=TZ).isoformat(timespec="seconds"), "share": SHARE,
           "method": "estimate", "profiles": prof, "last_winter": last}
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
