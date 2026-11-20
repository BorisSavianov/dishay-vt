"""Live readings in Neon: table aq_live_hourly holds the hourly means the forecast reads at inference.

    uv run --group ml python -u -m ml.aq_live --seed                 # once: archive + collector files → Neon
    uv run --group ml python -u -m ml.aq_live --check                # data.1h.json vs the collector's hourly means
    uv run --group ml python -u -m ml.aq_live --check-archive 2026-11-20   # stored hours vs the archive's

Every forecast run (ml.aq_forecast) fetches sensor.community's 1-hour averages (data.1h.json) and upserts them as
the last complete hour, so neither the archive nor the 5-minute collector is read at inference. The table keeps
KEEP_DAYS days (the forecast reads 7)."""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import time

import httpx
import numpy as np
import pandas as pd

from ml.aq_features import RAW, load_hourly

URL_1H = "https://data.sensor.community/static/v2/data.1h.json"
HEADERS = {"User-Agent": "dishay-vt-hackathon/0.1 (open-data student project)"}
LIVE = RAW / "live"
KEEP_DAYS = 8
# data.1h.json gives one mean per sensor and no reading count. A listed sensor reported within the hour, so it
# gets the archive's median count (24 readings an hour); build_panel then counts it as a valid hour (n >= 6).
N_1H = 24

DDL = """
create table if not exists aq_live_hourly (
  sensor_id integer not null,
  hour timestamptz not null,
  pm10 real,
  pm25 real,
  n smallint not null,
  source text not null,
  fetched_at timestamptz not null default now(),
  primary key (sensor_id, hour)
);
create index if not exists aq_live_hourly_hour on aq_live_hourly (hour)
"""
COLS = ["sensor_id", "hour", "pm10", "pm25", "n"]

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def log(msg: str) -> None:
    print(f"{dt.datetime.now():%H:%M:%S} {msg}", flush=True)


# ---------------- data.1h.json ----------------

def fetch_1h(client: httpx.Client, attempts: int = 4) -> list[dict]:
    """The global 1-hour averages (~9 MB, regenerated every ~5 min). Retries 429/5xx/network errors."""
    for k in range(attempts):
        try:
            r = client.get(URL_1H, timeout=120)
            if r.status_code == 429 or r.status_code >= 500:
                raise httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError) as e:
            if k == attempts - 1:
                raise
            wait = 15 * (k + 1)
            log(f"data.1h.json failed ({e!r}), retrying in {wait} s")
            time.sleep(wait)
    raise AssertionError("unreachable")


def parse_1h(records: list[dict], sensor_ids, hour: pd.Timestamp) -> pd.DataFrame:
    """Known BG sensors' 1-hour means, stored as `hour` (the last complete hour of the run). Columns COLS plus
    `t`, the sensor's latest reading in the window (UTC). P1 = PM10, P2 = PM2.5; a reading older than `hour` is
    dropped, so a sensor that went silent is not carried forward."""
    known = {int(s) for s in sensor_ids}
    rows = []
    for r in records:
        sid = (r.get("sensor") or {}).get("id")
        if sid is None or int(sid) not in known:
            continue
        vals = {v.get("value_type"): v.get("value") for v in r.get("sensordatavalues") or []}
        if "P1" not in vals and "P2" not in vals:
            continue
        rows.append({"sensor_id": int(sid), "t": r.get("timestamp"), "pm10": vals.get("P1"), "pm25": vals.get("P2")})
    df = pd.DataFrame(rows, columns=["sensor_id", "t", "pm10", "pm25"])
    df["t"] = pd.to_datetime(df["t"], utc=True, errors="coerce")
    for c in ("pm10", "pm25"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    hour = pd.Timestamp(hour).tz_convert("UTC")
    df = df[(df["t"] >= hour) & (df["pm10"].notna() | df["pm25"].notna())]
    df = df.sort_values("t").drop_duplicates("sensor_id", keep="last")
    df["hour"] = hour
    df["n"] = N_1H
    return df[[*COLS, "t"]].reset_index(drop=True)


# ---------------- Neon ----------------

def ensure_tables(cur) -> None:
    for stmt in DDL.split(";"):
        if stmt.strip():
            cur.execute(stmt)


def read_hourly(cur, since: pd.Timestamp) -> pd.DataFrame:
    """Hourly means from `since` (UTC) on, in load_hourly()'s schema."""
    cur.execute("select sensor_id, hour, pm10, pm25, n from aq_live_hourly where hour >= %s", (pd.Timestamp(since).to_pydatetime(),))
    df = pd.DataFrame(cur.fetchall(), columns=COLS)
    df["hour"] = pd.to_datetime(df["hour"], utc=True)
    for c in ("pm10", "pm25"):
        df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    df["sensor_id"] = df["sensor_id"].astype("int64")
    df["n"] = df["n"].astype("int64")
    return df


def _none(x):
    return None if x is None or x != x else float(x)


def upsert_hourly(cur, df: pd.DataFrame, source: str, now: pd.Timestamp | None = None) -> int:
    """Insert or replace (sensor, hour) rows, then drop hours older than KEEP_DAYS."""
    rows = [(int(r.sensor_id), pd.Timestamp(r.hour).to_pydatetime(), _none(r.pm10), _none(r.pm25),
             int(min(r.n, 32767)), source) for r in df[COLS].itertuples(index=False)]
    if rows:
        cur.executemany(
            "insert into aq_live_hourly (sensor_id, hour, pm10, pm25, n, source) values (%s, %s, %s, %s, %s, %s) "
            "on conflict (sensor_id, hour) do update set pm10 = excluded.pm10, pm25 = excluded.pm25, n = excluded.n, "
            "source = excluded.source, fetched_at = now()", rows)
    cutoff = pd.Timestamp(now or pd.Timestamp.now(tz="UTC")) - pd.Timedelta(days=KEEP_DAYS)
    cur.execute("delete from aq_live_hourly where hour < %s", (cutoff.to_pydatetime(),))
    return len(rows)


# ---------------- seed: the local archive and collector files ----------------

def collector_hourly(days: int = 3) -> pd.DataFrame:
    """The 5-minute collector's snapshots rolled into hours. The collector sees ~12 snapshots an hour: n is scaled
    so build_panel's readings-per-hour rule means "half an hour"."""
    frames = [pd.read_csv(p) for p in sorted(LIVE.glob("readings-*.csv"))[-days:]]
    if not frames:
        return pd.DataFrame(columns=COLS)
    df = pd.concat(frames).drop_duplicates(["sensor_id", "timestamp"])
    df["hour"] = pd.to_datetime(df["timestamp"], utc=True).dt.floor("h")
    for c in ("pm10", "pm25"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    out = df.groupby(["sensor_id", "hour"]).agg(pm10=("pm10", "mean"), pm25=("pm25", "mean"),
                                                n=("pm25", "count")).reset_index()
    out["n"] = out["n"] * 2
    return out[COLS]


def seed(url: str) -> None:
    """aq_live_hourly from the archive hourly parts (KEEP_DAYS back) and the collector files (archive wins where
    both have an hour, as the local loop did), plus the parquet forecast log. Safe to run again."""
    import psycopg

    from ml.aq_scoreboard import backfill_log, ensure_log_tables

    now = pd.Timestamp.now(tz="UTC")
    since = now.floor("h") - pd.Timedelta(days=KEEP_DAYS)
    archive = load_hourly()
    archive = archive[archive["hour"] >= since][COLS]
    live = collector_hourly()
    live = live[live["hour"] >= since]
    log(f"archive {len(archive)} rows (to {archive['hour'].max()}), collector {len(live)} rows "
        f"({live['hour'].min()} – {live['hour'].max()})")
    with psycopg.connect(url, connect_timeout=20) as conn:
        with conn.transaction(), conn.cursor() as cur:
            ensure_tables(cur)
            ensure_log_tables(cur)
            n_live = upsert_hourly(cur, live[~live.set_index(["sensor_id", "hour"]).index.isin(
                archive.set_index(["sensor_id", "hour"]).index)], "collector", now)
            n_arch = upsert_hourly(cur, archive, "archive", now)
            n_log = backfill_log(cur)
        log(f"Neon: aq_live_hourly +{n_arch} archive, +{n_live} collector rows; aq_forecast_log +{n_log} rows")
        with conn.cursor() as cur:
            cur.execute("select source, count(*), min(hour), max(hour) from aq_live_hourly group by 1 order by 1")
            for row in cur.fetchall():
                log(f"  {row[0]}: {row[1]} rows, {row[2]} – {row[3]}")


# ---------------- checks ----------------

def _compare(a: pd.Series, b: pd.Series) -> str:
    ok = a.notna() & b.notna()
    d = (a[ok] - b[ok]).abs()
    if not ok.sum():
        return "no overlap"
    corr = float(np.corrcoef(a[ok], b[ok])[0, 1]) if ok.sum() > 2 else float("nan")
    return (f"{int(ok.sum())} sensors, MAE {d.mean():.2f}, median |Δ| {d.median():.2f}, p90 |Δ| {d.quantile(0.9):.2f} "
            f"µg/m³, r {corr:.3f}, mean {a[ok].mean():.2f} vs {b[ok].mean():.2f}")


def check_collector() -> None:
    """data.1h.json now vs the collector's snapshots: the same 60-minute window per sensor, and the clock hour
    the forecast files it under. Needs the collector to have run for the past hour."""
    from ml.aq_features import load_sensors

    with httpx.Client(headers=HEADERS) as client:
        recs = fetch_1h(client)
    now = pd.Timestamp.now(tz="UTC")
    hour = now.floor("h") - pd.Timedelta(hours=1)
    fresh = parse_1h(recs, load_sensors()["id"], hour).set_index("sensor_id")
    snaps = pd.concat([pd.read_csv(p) for p in sorted(LIVE.glob("readings-*.csv"))[-2:]])
    snaps["time"] = pd.to_datetime(snaps["timestamp"], utc=True)
    snaps = snaps.drop_duplicates(["sensor_id", "timestamp"])
    end = snaps["sensor_id"].map(fresh["t"])
    win = snaps[(snaps["time"] <= end) & (snaps["time"] > end - pd.Timedelta(minutes=60))]
    w = win.groupby("sensor_id")[["pm25", "pm10"]].mean()
    clock = snaps[snaps["time"].dt.floor("h") == hour].groupby("sensor_id")[["pm25", "pm10"]].mean()
    log(f"data.1h.json: {len(fresh)} known sensors, readings {fresh['t'].min()} – {fresh['t'].max()}; filed as {hour}")
    for sp in ("pm25", "pm10"):
        log(f"{sp} vs collector, same 60 min:   {_compare(fresh[sp], w[sp].reindex(fresh.index))}")
        log(f"{sp} vs collector, clock hour:    {_compare(fresh[sp], clock[sp].reindex(fresh.index))}")


def check_archive(day: dt.date, url: str) -> None:
    """Stored hours of `day` (UTC) vs the archive's hourly means, fetched now for the sensors that have them."""
    import asyncio

    import psycopg

    from ml.aq_fetch import archive_url, hourly_from_csv

    from ml.aq_features import load_sensors

    a, b = pd.Timestamp(str(day), tz="UTC"), pd.Timestamp(str(day + dt.timedelta(days=1)), tz="UTC")
    with psycopg.connect(url, connect_timeout=20) as conn, conn.cursor() as cur:
        cur.execute("select sensor_id, hour, pm10, pm25, source from aq_live_hourly where hour >= %s and hour < %s",
                    (a.to_pydatetime(), b.to_pydatetime()))
        stored = pd.DataFrame(cur.fetchall(), columns=["sensor_id", "hour", "pm10", "pm25", "source"])
    stored["hour"] = pd.to_datetime(stored["hour"], utc=True)
    types = load_sensors().set_index("id")["type"]
    ids = sorted(set(stored["sensor_id"]) & set(types.index))

    async def get_all():
        sem = asyncio.Semaphore(16)
        async with httpx.AsyncClient(headers=HEADERS, timeout=60) as client:
            async def one(sid):
                async with sem:
                    r = await client.get(archive_url(types[sid], sid, day))
                    return sid, (hourly_from_csv(r.text) if r.status_code == 200 else [])
            return await asyncio.gather(*(one(s) for s in ids))

    rows = [(sid, h, p10, p25) for sid, items in asyncio.run(get_all()) for h, p10, p25, _ in items]
    arch = pd.DataFrame(rows, columns=["sensor_id", "hour", "pm10_a", "pm25_a"])
    if arch.empty:
        log(f"archive has nothing for {day} yet")
        return
    arch["hour"] = pd.to_datetime(arch["hour"], utc=True)
    m = stored.merge(arch, on=["sensor_id", "hour"])
    log(f"{day}: {len(stored)} stored rows, {len(m)} matched in the archive")
    for src, g in m.groupby("source"):
        for sp in ("pm25", "pm10"):
            log(f"{src:9s} {sp}: {_compare(g[sp].astype(float), g[sp + '_a'].astype(float))}")


def main() -> None:
    from ml.aq_forecast import database_url

    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--check-archive", type=dt.date.fromisoformat)
    args = ap.parse_args()
    if args.seed:
        seed(database_url())
    if args.check:
        check_collector()
    if args.check_archive:
        check_archive(args.check_archive, database_url())


if __name__ == "__main__":
    main()
