"""Download BG sensor.community history from the per-sensor daily archive and keep hourly means only.

    uv run --group ml python -u -m ml.aq_fetch [--since 2023-10-01] [--parallel 32]

1. Sensor list: data.24h.json filtered to BG, plus the country filter API; PM sensors (SDS011, PMS*, SPS30, HPM), outdoor.
2. Probe the 1st of each month per sensor to find where its history starts (saves ~1/3 of the requests as 404s).
3. Download VT sensors first, then heating-season days, newest first. Each file is reduced to hourly
   mean/count as it lands; raw 5-minute rows are never kept.
Resumable: data/raw/aq/done.txt lists finished (sensor, date) tasks, including 404s."""
from __future__ import annotations

import argparse
import asyncio
import csv
import datetime as dt
import gzip
import io
import json
import math
import random
import time
from collections import defaultdict
from pathlib import Path

import httpx
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "aq"
HOURLY = RAW / "hourly"
DONE = RAW / "done.txt"
SENSORS = RAW / "sensors_bg.json"
ARCHIVE = "https://archive.sensor.community"
HEADERS = {"User-Agent": "dishay-vt-hackathon/0.1 (open-data student project)"}
PM_TYPES = ("SDS011", "PMS1003", "PMS3003", "PMS5003", "PMS6003", "PMS7003", "SPS30", "HPM")
VT = (43.0786, 25.6211)
VT_RADIUS_KM = 25


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    dlat = (a[0] - b[0]) * 111.2
    dlon = (a[1] - b[1]) * 111.2 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dlat, dlon)


def archive_url(sensor_type: str, sensor_id: int, day: dt.date) -> str:
    d = day.isoformat()
    name = f"{d}_{sensor_type.lower()}_sensor_{sensor_id}.csv"
    if day.year <= 2025:
        return f"{ARCHIVE}/{day.year}/{d}/{name}.gz"
    return f"{ARCHIVE}/{d}/{name}"


def hourly_from_csv(text: str) -> list[tuple]:
    """(hour_utc_iso, pm10_mean, pm25_mean, n) per hour. P1 = PM10, P2 = PM2.5. Bad numbers are skipped."""
    acc: dict[str, list[float]] = defaultdict(lambda: [0.0, 0, 0.0, 0, 0])
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    for row in reader:
        ts = row.get("timestamp") or ""
        if len(ts) < 13:
            continue
        hour = ts[:13]
        a = acc[hour]
        a[4] += 1
        for key, i in (("P1", 0), ("P2", 2)):
            v = row.get(key)
            if not v:
                continue
            try:
                x = float(v)
            except ValueError:
                continue
            if 0 <= x < 1999:
                a[i] += x
                a[i + 1] += 1
    out = []
    for hour, (s10, n10, s25, n25, n) in sorted(acc.items()):
        out.append((hour + ":00:00", s10 / n10 if n10 else None, s25 / n25 if n25 else None, int(max(n10, n25))))
    return out


async def load_sensors(client: httpx.AsyncClient) -> list[dict]:
    if SENSORS.exists():
        return json.loads(SENSORS.read_text(encoding="utf-8"))
    found: dict[int, dict] = {}

    def add(records):
        for r in records:
            loc, s = r.get("location") or {}, r.get("sensor") or {}
            t = (s.get("sensor_type") or {}).get("name", "")
            if loc.get("country") != "BG" or t not in PM_TYPES or int(loc.get("indoor") or 0):
                continue
            try:
                lat, lon = float(loc["latitude"]), float(loc["longitude"])
            except (KeyError, TypeError, ValueError):
                continue
            found[int(s["id"])] = {"id": int(s["id"]), "type": t, "lat": lat, "lon": lon, "location": loc.get("id")}

    for url in ("https://data.sensor.community/static/v2/data.24h.json",
                "https://data.sensor.community/airrohr/v1/filter/country=BG"):
        try:
            resp = await client.get(url, timeout=180)
            resp.raise_for_status()
            add(resp.json())
        except Exception as e:
            print(f"sensor list: {url} failed: {e!r}", flush=True)
    sensors = sorted(found.values(), key=lambda s: s["id"])
    for s in sensors:
        s["vt"] = km((s["lat"], s["lon"]), VT) <= VT_RADIUS_KM
    RAW.mkdir(parents=True, exist_ok=True)
    SENSORS.write_text(json.dumps(sensors, ensure_ascii=False, indent=0), encoding="utf-8")
    return sensors


def month_starts(since: dt.date, until: dt.date) -> list[dt.date]:
    out, d = [], since.replace(day=1)
    while d <= until:
        out.append(d)
        d = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return out


async def exists(client: httpx.AsyncClient, url: str) -> bool:
    for attempt in range(3):
        try:
            r = await client.head(url, timeout=30)
            return r.status_code == 200
        except httpx.HTTPError:
            await asyncio.sleep(1 + attempt)
    return False


async def first_month(client, sem, s, months) -> dt.date | None:
    """Earliest month whose 1st or 2nd day has a file (None: no history found in the window)."""
    async def probe(m):
        async with sem:
            for d in (m, m + dt.timedelta(days=1)):
                if await exists(client, archive_url(s["type"], s["id"], d)):
                    return True
            return False

    hits = await asyncio.gather(*(probe(m) for m in months))
    for m, hit in zip(months, hits):
        if hit:
            # Back off one month: the sensor may have started mid-month before the first hit.
            i = months.index(m)
            return months[max(0, i - 1)]
    return None


def priority(s: dict, day: dt.date, today: dt.date) -> tuple:
    heating = day.month in (10, 11, 12, 1, 2, 3)
    return (0 if s["vt"] else 1, 0 if heating else 1, (today - day).days)


class Writer:
    def __init__(self):
        HOURLY.mkdir(parents=True, exist_ok=True)
        self.rows: list[tuple] = []
        self.done_lines: list[str] = []
        self.part = len(list(HOURLY.glob("part-*.parquet")))

    def add(self, sensor_id: int, day: dt.date, status: str, hours: list[tuple]):
        self.rows.extend((sensor_id, *h) for h in hours)
        self.done_lines.append(f"{sensor_id},{day.isoformat()},{status}\n")

    def flush(self):
        if self.rows:
            df = pd.DataFrame(self.rows, columns=["sensor_id", "hour", "pm10", "pm25", "n"])
            df["hour"] = pd.to_datetime(df["hour"], utc=True)
            df.to_parquet(HOURLY / f"part-{self.part:05d}.parquet", index=False)
            self.part += 1
            self.rows = []
        if self.done_lines:
            with DONE.open("a", encoding="utf-8") as f:
                f.writelines(self.done_lines)
            self.done_lines = []


async def run(since: dt.date, parallel: int):
    limits = httpx.Limits(max_connections=parallel, max_keepalive_connections=parallel)
    async with httpx.AsyncClient(headers=HEADERS, limits=limits, follow_redirects=True) as client:
        sensors = await load_sensors(client)
        print(f"{len(sensors)} BG outdoor PM sensors ({sum(s['vt'] for s in sensors)} near VT)", flush=True)
        today = dt.date.today()
        until = today - dt.timedelta(days=1)

        starts_path = RAW / "sensor_starts.json"
        starts: dict[str, str | None] = json.loads(starts_path.read_text()) if starts_path.exists() else {}
        sem = asyncio.Semaphore(parallel)
        # Quarterly probes (backing off one quarter) keep the probe phase to a few minutes.
        months = month_starts(since, until)[::3]
        todo = [s for s in sensors if str(s["id"]) not in starts]
        t0 = time.monotonic()
        # VT sensors first, so their downloads can start even while the rest are probed.
        todo.sort(key=lambda s: not s["vt"])
        for i in range(0, len(todo), 40):
            batch = todo[i : i + 40]
            res = await asyncio.gather(*(first_month(client, sem, s, months) for s in batch))
            for s, m in zip(batch, res):
                starts[str(s["id"])] = m.isoformat() if m else None
            starts_path.write_text(json.dumps(starts))
            print(f"probed {min(i + 40, len(todo))}/{len(todo)} sensors in {time.monotonic() - t0:.0f}s", flush=True)

        done: set[tuple[int, str]] = set()
        if DONE.exists():
            for line in DONE.read_text(encoding="utf-8").splitlines():
                sid, d, *_ = line.split(",")
                done.add((int(sid), d))

        # Only what training can use: heating-season days (the weather history covers Oct–Mar only) for
        # sensors in weather-covered cells. Every sensor also gets its last 3 days (lags at inference).
        cells_path = RAW / "cells.json"
        covered = None
        if cells_path.exists():
            meta = json.loads(cells_path.read_text())
            hist = set(meta["history_cells"])
            covered = {int(k) for k, c in meta["sensor_cell"].items() if c in hist}
        recent = today - dt.timedelta(days=3)
        rng = random.Random(42)
        tasks = []
        for s in sensors:
            st = starts.get(str(s["id"]))
            if not st:
                continue
            use_history = s["vt"] or covered is None or s["id"] in covered
            d = max(dt.date.fromisoformat(st), since)
            while d <= until:
                key = (s["id"], d.isoformat())
                is_recent = d >= recent
                if key not in done and (is_recent or (use_history and d.month in (10, 11, 12, 1, 2, 3))):
                    # VT first, then the last 3 days everywhere, then random order so the training winters
                    # and the holdout winter fill in evenly while the download runs.
                    tasks.append(((0 if s["vt"] else 1 if is_recent else 2, rng.random()), s, d))
                d += dt.timedelta(days=1)
        tasks.sort(key=lambda x: x[0])
        total = len(tasks)
        print(f"{total} daily files to fetch ({len(done)} already done)", flush=True)

        writer = Writer()
        queue: asyncio.Queue = asyncio.Queue()
        for t in tasks:
            queue.put_nowait(t)
        stats = {"ok": 0, "missing": 0, "error": 0, "hours": 0}
        t0 = time.monotonic()

        async def worker():
            while True:
                try:
                    _, s, d = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                url = archive_url(s["type"], s["id"], d)
                status = "error"
                for attempt in range(4):
                    try:
                        r = await client.get(url, timeout=60)
                        if r.status_code == 404:
                            status = "missing"
                            writer.add(s["id"], d, status, [])
                            break
                        r.raise_for_status()
                        body = r.content
                        if url.endswith(".gz") and body[:2] == b"\x1f\x8b":
                            body = gzip.decompress(body)
                        hours = hourly_from_csv(body.decode("utf-8", errors="replace"))
                        writer.add(s["id"], d, "ok", hours)
                        stats["hours"] += len(hours)
                        status = "ok"
                        break
                    except (httpx.HTTPError, OSError, EOFError):
                        await asyncio.sleep(2 * (attempt + 1))
                stats[status] += 1
                n = stats["ok"] + stats["missing"] + stats["error"]
                if len(writer.rows) > 200_000 or n % 5000 == 0:
                    writer.flush()
                if n % 2000 == 0:
                    rate = n / max(1e-9, time.monotonic() - t0)
                    eta = (total - n) / max(rate, 1e-9) / 60
                    print(f"{dt.datetime.now():%H:%M:%S} {n}/{total} files ({rate:.0f}/s, ETA {eta:.0f} min) "
                          f"ok={stats['ok']} missing={stats['missing']} error={stats['error']} hours={stats['hours']}",
                          flush=True)

        await asyncio.gather(*(worker() for _ in range(parallel)))
        writer.flush()
        print(f"DONE {stats}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="2023-10-01")
    ap.add_argument("--parallel", type=int, default=32)
    args = ap.parse_args()
    asyncio.run(run(dt.date.fromisoformat(args.since), args.parallel))


if __name__ == "__main__":
    main()
