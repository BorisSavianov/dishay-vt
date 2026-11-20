"""Live collector: every 5 minutes, save the current BG sensor.community readings.

    uv run --group ml python -m ml.aq_collect            # loop forever
    uv run --group ml python -m ml.aq_collect --once

The archive publishes a day only after it ends, so today's hours (the short lags at inference) come from here.
Appends PM rows to data/raw/aq/live/readings-YYYY-MM-DD.csv (UTC dates); ml.aq_forecast rolls them into hours."""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "data" / "raw" / "aq" / "live"
URL = "https://data.sensor.community/airrohr/v1/filter/country=BG"
HEADERS = {"User-Agent": "dishay-vt-hackathon/0.1 (open-data student project)"}
FIELDS = ["sensor_id", "sensor_type", "lat", "lon", "indoor", "timestamp", "pm10", "pm25"]


def extract(records: list[dict]) -> list[dict]:
    rows = []
    for r in records:
        vals = {v.get("value_type"): v.get("value") for v in r.get("sensordatavalues", [])}
        if "P1" not in vals and "P2" not in vals:
            continue
        loc = r.get("location") or {}
        sensor = r.get("sensor") or {}
        rows.append({
            "sensor_id": sensor.get("id"),
            "sensor_type": (sensor.get("sensor_type") or {}).get("name"),
            "lat": loc.get("latitude"),
            "lon": loc.get("longitude"),
            "indoor": loc.get("indoor"),
            "timestamp": r.get("timestamp"),  # UTC, "YYYY-MM-DD HH:MM:SS"
            "pm10": vals.get("P1"),
            "pm25": vals.get("P2"),
        })
    return rows


def append(rows: list[dict]) -> int:
    LIVE.mkdir(parents=True, exist_ok=True)
    by_day: dict[str, list[dict]] = {}
    for row in rows:
        by_day.setdefault(str(row["timestamp"])[:10], []).append(row)
    for day, part in by_day.items():
        path = LIVE / f"readings-{day}.csv"
        new = not path.exists()
        with path.open("a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            if new:
                w.writeheader()
            w.writerows(part)
    return len(rows)


def poll(client: httpx.Client) -> int:
    resp = client.get(URL, timeout=60)
    resp.raise_for_status()
    return append(extract(resp.json()))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=int, default=300, help="seconds between polls")
    args = ap.parse_args()
    with httpx.Client(headers=HEADERS) as client:
        while True:
            started = time.monotonic()
            try:
                n = poll(client)
                print(f"{dt.datetime.now():%H:%M:%S} collected {n} PM readings", flush=True)
            except Exception as e:  # keep the loop alive through network hiccups
                print(f"{dt.datetime.now():%H:%M:%S} poll failed: {e!r}", flush=True)
            if args.once:
                return
            time.sleep(max(5, args.every - (time.monotonic() - started)))


if __name__ == "__main__":
    main()
