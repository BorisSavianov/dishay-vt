"""Checks a forecast payload against the contract (contract/CONTRACT.md "Air quality", mobile/src/aq/types.ts).
Used by the tests and by ml.aq_forecast before anything is written."""
from __future__ import annotations

import datetime as dt

from ml.aq_levels import EU_PM10_DAILY_LIMIT, level_of


def _num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and x == x


def _iso(s) -> bool:
    try:
        return isinstance(s, str) and dt.datetime.fromisoformat(s).tzinfo is not None
    except ValueError:
        return False


def validate(payload: dict) -> list[str]:
    errors: list[str] = []
    if not _iso(payload.get("generated_at")):
        errors.append("generated_at: ISO time with offset required")
    model = payload.get("model") or {}
    for key in ("name", "trained_rows", "sensors", "holdout", "mae"):
        if key not in model:
            errors.append(f"model.{key}: missing")
    for key in ("model", "cams", "persistence"):
        if not _num((model.get("mae") or {}).get(key)):
            errors.append(f"model.mae.{key}: number required")
    stations = payload.get("stations")
    if not isinstance(stations, list) or not stations:
        return errors + ["stations: non-empty list required"]
    seen = set()
    for s in stations:
        sid = s.get("id", "?")
        p = f"station {sid}"
        if sid in seen:
            errors.append(f"{p}: duplicate id")
        seen.add(sid)
        for key in ("name", "city"):
            if not isinstance(s.get(key), str):
                errors.append(f"{p}.{key}: string required")
        if not (_num(s.get("lat")) and _num(s.get("lon"))):
            errors.append(f"{p}: lat/lon required")
        latest = s.get("latest")
        if latest is not None and not (_iso(latest.get("t")) and _num(latest.get("pm25")) and _num(latest.get("pm10"))):
            errors.append(f"{p}.latest: t, pm25, pm10 required")
        hourly = s.get("hourly")
        if hourly is not None:
            if len(hourly) != 72:
                errors.append(f"{p}.hourly: 72 items required, got {len(hourly)}")
            for h in hourly:
                if not (_iso(h.get("t")) and _num(h.get("pm25")) and _num(h.get("pm10"))):
                    errors.append(f"{p}.hourly: bad item {h}")
                    break
                if "pm25_lo" in h and not (h["pm25_lo"] <= h["pm25"] <= h["pm25_hi"]):
                    errors.append(f"{p}.hourly: lo <= pm25 <= hi violated at {h['t']}")
                    break
        daily = s.get("daily")
        if not isinstance(daily, list) or not 1 <= len(daily) <= 3:
            errors.append(f"{p}.daily: 1..3 items required")
            continue
        for d in daily:
            if not (_num(d.get("pm25_mean")) and _num(d.get("pm10_mean"))):
                errors.append(f"{p}.daily {d.get('date')}: means required")
                continue
            if d.get("level") != level_of(d["pm25_mean"], d["pm10_mean"]):
                errors.append(f"{p}.daily {d.get('date')}: level does not match the bands")
            if "alert_level" in d and not (isinstance(d["alert_level"], int) and d.get("level", 7) <= d["alert_level"] <= 6):
                errors.append(f"{p}.daily {d.get('date')}: alert_level must be level..6")
            if d.get("exceeds_eu_limit") != (d["pm10_mean"] > EU_PM10_DAILY_LIMIT):
                errors.append(f"{p}.daily {d.get('date')}: exceeds_eu_limit wrong")
            for r in d.get("reasons", []):
                if not (isinstance(r.get("feature"), str) and isinstance(r.get("label_bg"), str) and _num(r.get("impact"))):
                    errors.append(f"{p}.daily {d.get('date')}: bad reason {r}")
    return errors
