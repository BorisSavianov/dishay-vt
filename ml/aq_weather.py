"""Weather (ERA5) and CAMS history for the sensor grid cells, station elevations and Bulgarian place names.

    uv run --group ml python -u -m ml.aq_weather [--cells 50]

Open-Meteo counts a request as (days / 14) calls per location against a 10k/day budget, so:
- sensors are grouped in 0.25° cells (ERA5's grid) and only the top cells by sensor count are fetched (VT first);
- only heating seasons (Oct–Mar) plus this autumn are fetched; the model is a heating-season model.
Responses are cached per cell and window in data/raw/aq/weather/, so a rerun costs nothing."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import time
from collections import Counter
from pathlib import Path

import httpx
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "aq"
CACHE = RAW / "weather"
HEADERS = {"User-Agent": "dishay-vt-hackathon/0.1 (open-data student project)"}
WEATHER_VARS = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "wind_direction_10m",
                "precipitation", "surface_pressure", "boundary_layer_height"]
CAMS_VARS = ["pm2_5", "pm10"]
GRID = 0.25
VT = (43.0786, 25.6211)


def cell_of(lat: float, lon: float) -> str:
    return f"{round(lat / GRID) * GRID:.2f}_{round(lon / GRID) * GRID:.2f}"


def cell_center(cell: str) -> tuple[float, float]:
    a, b = cell.split("_")
    return float(a), float(b)


def windows(today: dt.date) -> list[tuple[dt.date, dt.date]]:
    out = []
    for y in (2023, 2024, 2025):
        out.append((dt.date(y, 10, 1), dt.date(y + 1, 3, 31)))
    out.append((dt.date(2026, 10, 1), today))
    return out


def get_json(client: httpx.Client, url: str, params: dict) -> dict:
    for attempt in range(8):
        try:
            r = client.get(url, params=params, timeout=120)
        except httpx.HTTPError as e:
            print(f"  network error {e!r}, retrying", flush=True)
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code == 429:
            print(f"  429 from open-meteo: {r.text[:120]} — waiting 65 s", flush=True)
            time.sleep(65)
            continue
        if r.status_code >= 500:
            time.sleep(5 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"giving up on {url}")


def fetch_cell(client: httpx.Client, cell: str, today: dt.date) -> None:
    lat, lon = cell_center(cell)
    era5_end = today - dt.timedelta(days=6)
    for start, end in windows(today):
        for kind, url, hourly, stop in (
            ("era5", "https://archive-api.open-meteo.com/v1/archive", WEATHER_VARS, min(end, era5_end)),
            ("cams", "https://air-quality-api.open-meteo.com/v1/air-quality", CAMS_VARS, min(end, today)),
        ):
            path = CACHE / f"{kind}_{cell}_{start.isoformat()}.json"
            if path.exists() or stop < start:
                continue
            params = {"latitude": lat, "longitude": lon, "start_date": start.isoformat(),
                      "end_date": stop.isoformat(), "hourly": ",".join(hourly), "timezone": "UTC"}
            if kind == "cams":
                params["domains"] = "cams_europe"
            data = get_json(client, url, params)
            path.write_text(json.dumps(data), encoding="utf-8")


def combine() -> None:
    for kind in ("era5", "cams"):
        frames = []
        for path in sorted(CACHE.glob(f"{kind}_*.json")):
            cell = "_".join(path.stem.split("_")[1:3])
            h = json.loads(path.read_text(encoding="utf-8"))["hourly"]
            df = pd.DataFrame(h)
            df["time"] = pd.to_datetime(df["time"], utc=True)
            df["cell"] = cell
            frames.append(df)
        if frames:
            out = pd.concat(frames).drop_duplicates(["cell", "time"]).sort_values(["cell", "time"])
            out.to_parquet(RAW / f"{kind}.parquet", index=False)
            print(f"{kind}.parquet: {len(out)} rows, {out['cell'].nunique()} cells", flush=True)


def elevations(client: httpx.Client, sensors: list[dict]) -> dict[int, float]:
    path = RAW / "elevation.json"
    if path.exists():
        return {int(k): v for k, v in json.loads(path.read_text()).items()}
    out = {}
    for i in range(0, len(sensors), 100):
        part = sensors[i : i + 100]
        data = get_json(client, "https://api.open-meteo.com/v1/elevation", {
            "latitude": ",".join(f"{s['lat']:.5f}" for s in part),
            "longitude": ",".join(f"{s['lon']:.5f}" for s in part)})
        out.update({s["id"]: float(e) for s, e in zip(part, data["elevation"])})
    path.write_text(json.dumps(out))
    return out


def km(a, b) -> float:
    return math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 111.2 * math.cos(math.radians(a[0])))


SHORT = {"Велико Търново": "ВТ"}


def place_names(client: httpx.Client, sensors: list[dict]) -> dict[int, dict]:
    """{sensor id: {name, city}} from OSM place nodes: nearest settlement, plus the neighbourhood in a city."""
    path = RAW / "places.json"
    if not path.exists():
        q = ('[out:json][timeout:120];area["ISO3166-1"="BG"][admin_level=2]->.bg;'
             'node["place"~"^(city|town|village|suburb|quarter|neighbourhood)$"](area.bg);out tags center;')
        r = client.post("https://overpass-api.de/api/interpreter", data={"data": q}, timeout=180)
        r.raise_for_status()
        path.write_text(r.text, encoding="utf-8")
    elements = json.loads(path.read_text(encoding="utf-8"))["elements"]
    towns = [(e["lat"], e["lon"], e["tags"].get("name"), e["tags"]["place"]) for e in elements
             if e["tags"].get("place") in ("city", "town", "village") and e["tags"].get("name")]
    hoods = [(e["lat"], e["lon"], e["tags"].get("name")) for e in elements
             if e["tags"].get("place") in ("suburb", "quarter", "neighbourhood") and e["tags"].get("name")]
    out, used = {}, Counter()
    for s in sensors:
        p = (s["lat"], s["lon"])
        # A city or town within 8 km wins over a nearer village (suburbs of big cities).
        big = [(km(p, (t[0], t[1])), t) for t in towns if t[3] in ("city", "town")]
        near_big = min(big, default=(99, None))
        any_t = min(((km(p, (t[0], t[1])), t) for t in towns), default=(99, None))
        city = near_big[1][2] if near_big[0] < 8 else (any_t[1][2] if any_t[1] else "България")
        name = SHORT.get(city, city)
        if near_big[0] < 8:
            hood = min(((km(p, (h[0], h[1])), h[2]) for h in hoods), default=(99, None))
            if hood[0] < 1.5:
                name = f"{name} – {hood[1]}"
        used[name] += 1
        if used[name] > 1:
            name = f"{name} ({used[name]})"
        out[s["id"]] = {"name": name, "city": city}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", type=int, default=50, help="how many cells get history (VT cells always)")
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    sensors_path = RAW / "sensors_bg.json"
    while not sensors_path.exists():
        print("waiting for data/raw/aq/sensors_bg.json (ml.aq_fetch writes it)", flush=True)
        time.sleep(10)
    sensors = json.loads(sensors_path.read_text(encoding="utf-8"))
    counts = Counter(cell_of(s["lat"], s["lon"]) for s in sensors)
    vt_cells = {cell_of(s["lat"], s["lon"]) for s in sensors if s.get("vt")}
    ranked = sorted(counts, key=lambda c: (c not in vt_cells, -counts[c]))
    chosen = ranked[: max(args.cells, len(vt_cells))]
    covered = sum(counts[c] for c in chosen)
    print(f"{len(counts)} cells; fetching history for {len(chosen)} cells covering {covered}/{len(sensors)} sensors",
          flush=True)
    meta = {"grid": GRID, "history_cells": chosen,
            "sensor_cell": {str(s["id"]): cell_of(s["lat"], s["lon"]) for s in sensors}}
    (RAW / "cells.json").write_text(json.dumps(meta, indent=0))

    today = dt.date.today()
    with httpx.Client(headers=HEADERS) as client:
        try:
            elev = elevations(client, sensors)
            print(f"elevation for {len(elev)} sensors", flush=True)
        except Exception as e:
            print(f"elevation failed: {e!r}", flush=True)
        try:
            names = place_names(client, sensors)
            (RAW / "names.json").write_text(json.dumps(names, ensure_ascii=False, indent=0), encoding="utf-8")
            print("names: " + ", ".join(v["name"] for k, v in list(names.items())[:8]), flush=True)
        except Exception as e:
            print(f"place names failed: {e!r}", flush=True)
        for i, cell in enumerate(chosen, 1):
            fetch_cell(client, cell, today)
            print(f"{dt.datetime.now():%H:%M:%S} cell {i}/{len(chosen)} {cell} ({counts[cell]} sensors) cached",
                  flush=True)
            if i % 10 == 0:
                combine()
    combine()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
