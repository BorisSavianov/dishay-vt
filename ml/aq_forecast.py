"""Live 72 h forecast for every BG station: predict, explain, upsert into Neon, write the fallback JSON.

    uv run --group ml python -u -m ml.aq_forecast            # every hour at :07, forever
    uv run --group ml python -u -m ml.aq_forecast --once [--no-db]

Inputs: the archive hourly parts (yesterday and before), the live collector (today), the Open-Meteo forecast
and the CAMS Europe forecast (cached for 3 h), and the models from ml.aq_train."""
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import sys
import time
from pathlib import Path

import httpx
import lightgbm as lgb
import numpy as np
import pandas as pd

from ml.aq_contract import validate
from ml.aq_features import (FEATURES, GROUPS, RAW, TZ, WEATHER, build_panel, derive, features, humidity_factor,
                            load_hourly, load_sensors)
from ml.aq_labels import reason
from ml.aq_levels import EU_PM10_DAILY_LIMIT, level_of
from ml.aq_models import Model
from ml.aq_train import predict_all
from ml.aq_scoreboard import live_score, log_issued, read_log, scoreboard_block
from ml.aq_sources import REGIONAL_KM, km_from_vt, load_sources_json, sources_payload

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "ml" / "models"
OUT = ROOT / "web" / "src" / "data" / "aq_forecast.json"
LIVE = RAW / "live"
FC_CACHE = RAW / "forecast_cache"
HEADERS = {"User-Agent": "dishay-vt-hackathon/0.1 (open-data student project)"}
HOURS_OUT = 72
HOURS_DAILY = 96       # daily cards need up to +3 days; horizons past 72 use the 72 h model at its limit
CACHE_TTL = 3 * 3600
FEATURED_KM = 10
# Physical drivers only: "persistence" and "neighbours" mostly encode mean reversion, which reads oddly as a reason.
REASON_GROUPS = {"pbl_height", "wind_speed", "temp", "rh", "precip", "cams", "calendar"}
# Same labels as mobile/src/aq/mock.ts, so web and phone agree on the VT names.
NAME_OVERRIDES = {35767: "ВТ – Център", 66083: "ВТ – Бузлуджа", 66617: "ВТ – Бузлуджа (2)", 41885: "ВТ – Картала",
                  63801: "ВТ – Акация", 98556: "ВТ – Колю Фичето", 37065: "ВТ – Запад", 14776: "Самоводене",
                  76712: "Арбанаси"}

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def log(msg: str) -> None:
    print(f"{dt.datetime.now():%H:%M:%S} {msg}", flush=True)


def r1(x) -> float:
    return round(float(x), 1)


# ---------------- inputs ----------------

def collector_hourly(days: int = 3) -> pd.DataFrame:
    frames = []
    for path in sorted(LIVE.glob("readings-*.csv"))[-days:]:
        frames.append(pd.read_csv(path))
    if not frames:
        return pd.DataFrame(columns=["sensor_id", "hour", "pm10", "pm25", "n"])
    df = pd.concat(frames).drop_duplicates(["sensor_id", "timestamp"])
    df["time"] = pd.to_datetime(df["timestamp"], utc=True)
    df["hour"] = df["time"].dt.floor("h")
    for c in ("pm10", "pm25"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    g = df.groupby(["sensor_id", "hour"]).agg(pm10=("pm10", "mean"), pm25=("pm25", "mean"), n=("pm25", "count"))
    out = g.reset_index()
    # The collector sees ~12 snapshots an hour: scale n so build_panel's readings-per-hour rule means "half an hour".
    out["n"] = out["n"] * 2
    return out


def latest_readings(days: int = 1) -> pd.DataFrame:
    frames = [pd.read_csv(p) for p in sorted(LIVE.glob("readings-*.csv"))[-days - 1:]]
    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames)
    df["time"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.dropna(subset=["pm25", "pm10"]).sort_values("time")
    return df.groupby("sensor_id").tail(1).set_index("sensor_id")


def _cached(name: str):
    path = FC_CACHE / name
    if path.exists() and time.time() - path.stat().st_mtime < CACHE_TTL:
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _batched(client, url, cells, params, name) -> list[dict]:
    hit = _cached(name)
    if hit is not None:
        return hit
    out = []
    for k in range(0, len(cells), 50):
        part = cells[k : k + 50]
        lat = ",".join(c.split("_")[0] for c in part)
        lon = ",".join(c.split("_")[1] for c in part)
        for attempt in range(6):
            r = client.get(url, params={**params, "latitude": lat, "longitude": lon}, timeout=120)
            if r.status_code == 429:
                log("open-meteo 429, waiting 65 s")
                time.sleep(65)
                continue
            r.raise_for_status()
            data = r.json()
            data = data if isinstance(data, list) else [data]
            for c, d in zip(part, data):
                d["cell"] = c
            out.extend(data)
            break
        else:
            raise RuntimeError(f"open-meteo kept refusing {url}")
    FC_CACHE.mkdir(parents=True, exist_ok=True)
    (FC_CACHE / name).write_text(json.dumps(out), encoding="utf-8")
    return out


def forecast_frames(cells: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    with httpx.Client(headers=HEADERS) as client:
        wx = _batched(client, "https://api.open-meteo.com/v1/forecast", cells,
                      {"hourly": ",".join(WEATHER), "past_days": 7, "forecast_days": 5, "timezone": "UTC"},
                      "weather.json")
        aq = _batched(client, "https://air-quality-api.open-meteo.com/v1/air-quality", cells,
                      {"hourly": "pm2_5,pm10", "past_days": 7, "forecast_days": 5, "timezone": "UTC",
                       "domains": "cams_europe"}, "cams.json")

    def frame(items):
        rows = []
        for d in items:
            df = pd.DataFrame(d["hourly"])
            df["time"] = pd.to_datetime(df["time"], utc=True)
            df["cell"] = d["cell"]
            rows.append(df)
        return pd.concat(rows, ignore_index=True)

    return frame(wx), frame(aq)


# ---------------- forecast ----------------

def load_models() -> tuple[dict, dict]:
    meta = json.loads((MODELS / "aq_meta.json").read_text(encoding="utf-8"))
    algo = meta.get("algo", "lgbm")
    models = {n: Model.load(MODELS / f"aq_{n}", algo) for n in ("pm25", "pm10", "pm25_q10", "pm25_q90")}
    models["_space"] = meta.get("space", "raw")
    return models, meta


def extend_cams(arr: np.ndarray, period: int = 24) -> np.ndarray:
    """CAMS Europe stops about 3 days out. Past its last value the model would read NaN, which it never saw in
    training, and the forecast jumped (2.2 → 8.3 µg/m³ at hour 64). For the model's inputs only, each cell's hours
    after its last value repeat the hours `period` earlier (the last forecast day). Interior gaps stay NaN."""
    out = np.array(arr, dtype=float, copy=True)
    for c in range(out.shape[1]):
        ok = np.flatnonzero(~np.isnan(out[:, c]))
        if not len(ok):
            continue
        last = int(ok[-1])
        p = min(period, last + 1)
        for t in range(last + 1, len(out)):
            out[t, c] = out[t - p, c]
    return out


def pick_stations(panel, i: int) -> np.ndarray:
    """Columns with a reading in the last 6 h, one per OSM location (co-located sensors collapse)."""
    recent = ~np.isnan(panel.pm25[max(0, i - 5) : i + 1]).all(axis=0)
    cols = np.flatnonzero(recent)
    seen, keep = set(), []
    loc = panel.sensors["location"].to_numpy()
    for c in cols[np.argsort(-(~np.isnan(panel.pm25[: i + 1, cols])).sum(axis=0))]:
        key = loc[c] if loc[c] == loc[c] else ("id", panel.sensors["id"].iat[c])
        if key in seen:
            continue
        seen.add(key)
        keep.append(c)
    return np.array(sorted(keep), dtype=int)


def explain(booster, X: pd.DataFrame, log_pred: np.ndarray, space: str = "raw") -> dict[str, np.ndarray]:
    """µg/m³ each reason group adds to each row's PM2.5 (SHAP; raw-space models are additive in µg/m³)."""
    contrib = booster.contrib(X)
    names = booster.features
    pred = np.expm1(log_pred)
    out: dict[str, np.ndarray] = {}
    for g in sorted(set(GROUPS.values())):
        idx = [k for k, f in enumerate(names) if GROUPS.get(f) == g]
        if idx:
            c = contrib[:, idx].sum(axis=1)
            out[g] = c if space == "raw" else pred - np.expm1(log_pred - c)
    return out


def run_once(write_db: bool = True) -> dict:
    t0 = time.monotonic()
    models, meta = load_models()
    sensors = load_sensors()
    now = pd.Timestamp.now(tz="UTC")
    i_time = now.floor("h") - pd.Timedelta(hours=1)   # last complete hour
    start = i_time - pd.Timedelta(days=7)
    end = i_time + pd.Timedelta(hours=HOURS_DAILY + 1)

    archive = load_hourly()
    archive = archive[archive["hour"] >= start]
    live = collector_hourly()
    live = live[live["hour"] >= start]
    hourly = pd.concat([live, archive], ignore_index=True).drop_duplicates(["sensor_id", "hour"], keep="last")
    cells = sorted(set(sensors["cell"].dropna()))
    wx, cams = forecast_frames(cells)
    panel = build_panel(hourly, sensors, wx, cams, start, end, min_uptime=0.3)
    d = derive(panel)
    i = panel.index_of(i_time)
    cols = pick_stations(panel, i)
    log(f"{len(cols)} stations with recent data (of {panel.pm25.shape[1]} sensors)")

    H = np.arange(1, HOURS_DAILY + 1)
    ii = np.repeat(np.full(len(cols), i), len(H))
    ss = np.repeat(cols, len(H))
    hh = np.tile(H, len(cols))
    # The model's inputs see CAMS extended past its horizon; the payload and the live log keep the real CAMS.
    fpanel = dataclasses.replace(panel, cams25=extend_cams(panel.cams25), cams10=extend_cams(panel.cams10))
    X = features(fpanel, d, ii, ss, np.minimum(hh, HOURS_OUT))
    # Weather, CAMS and the calendar must still be read at the real target hour past 72 h.
    if HOURS_DAILY > HOURS_OUT:
        X_true = features(fpanel, d, ii, ss, hh)
        past = hh > HOURS_OUT
        keep_cols = [f for f in FEATURES if not f.startswith(("pm25_", "pm10_", "nb_")) and f not in ("horizon_h", "obs_vs_cams")]
        X.loc[past, keep_cols] = X_true.loc[past, keep_cols]
    P = predict_all(models, X)
    p25, p10, lo, hi = P["pm25"], P["pm10"], P["lo"], P["hi"]
    try:  # „Проверка на живо“: log this run's 1–72 h forecasts; never fail the forecast over it
        keep = hh <= HOURS_OUT
        T, cell = ii[keep] + hh[keep], panel.sensor_cell[ss[keep]]
        log_issued(i_time + pd.Timedelta(hours=1), pd.DataFrame({
            "issued_at": i_time + pd.Timedelta(hours=1), "sensor_id": panel.sensors["id"].to_numpy()[ss[keep]],
            "t": panel.times[T], "horizon_h": hh[keep], "pm25": p25[keep], "pm10": p10[keep],
            "cams_pm25": np.where(cell >= 0, panel.cams25[T, np.maximum(cell, 0)], np.nan),
            "persistence_pm25": panel.pm25[ii[keep], ss[keep]]}))
    except Exception as e:
        log(f"forecast log failed: {e!r}")
    why = explain(models["pm25"], X, P["log25"], models["_space"])

    names = json.loads((RAW / "names.json").read_text(encoding="utf-8")) if (RAW / "names.json").exists() else {}
    latest = latest_readings()
    times_local = panel.times.tz_convert(TZ)
    today = now.tz_convert(TZ).date()
    stations = []
    for k, c in enumerate(cols):
        sl = slice(k * len(H), (k + 1) * len(H))
        sid = int(panel.sensors["id"].iat[c])
        T = i + H
        hourly_items = []
        for j in range(HOURS_OUT):
            cams_v = panel.cams25[T[j], panel.sensor_cell[c]] if panel.sensor_cell[c] >= 0 else np.nan
            item = {"t": times_local[T[j]].isoformat(), "pm25": r1(p25[sl][j]), "pm10": r1(p10[sl][j]),
                    "pm25_lo": r1(lo[sl][j]), "pm25_hi": r1(hi[sl][j])}
            if cams_v == cams_v:
                item["cams_pm25"] = r1(cams_v)
            hourly_items.append(item)
        daily = []
        dates = np.array([t.date() for t in times_local[T]])
        for off in (1, 2, 3):
            day = today + dt.timedelta(days=off)
            m = dates == day
            if m.sum() < 12:
                continue
            m25, m10 = r1(p25[sl][m].mean()), r1(p10[sl][m].mean())
            # Alerts use the upper-middle of the band (~70th percentile): see CONTRACT.md "alert_level".
            mid25 = (p25[sl][m].mean() + hi[sl][m].mean()) / 2
            mid10 = mid25 * (p10[sl][m].mean() / max(p25[sl][m].mean(), 0.1))
            impacts = {g: float(v[sl][m].mean()) for g, v in why.items() if g in REASON_GROUPS}
            top = sorted(impacts.items(), key=lambda kv: -abs(kv[1]))[:3]
            lvl = level_of(m25, m10)
            daily.append({"date": day.isoformat(), "pm10_mean": m10, "pm25_mean": m25, "level": lvl,
                          "alert_level": max(lvl, level_of(mid25, mid10)),
                          "exceeds_eu_limit": m10 > EU_PM10_DAILY_LIMIT,
                          "reasons": [reason(g, v) for g, v in top if abs(v) >= 0.05]})
        lt = None
        if sid in latest.index:
            row = latest.loc[sid]
            cell = panel.sensor_cell[c]
            hr = panel.times.searchsorted(row["time"].floor("h"))
            rh = panel.weather["relative_humidity_2m"][min(hr, len(panel.times) - 1), cell] if cell >= 0 else np.nan
            f = float(humidity_factor(np.array([rh]))[0]) if panel.sensors["type_code"].iat[c] != 2 else 1.0
            lt = {"t": row["time"].tz_convert(TZ).isoformat(timespec="seconds"),
                  "pm25": r1(row["pm25"] / f), "pm10": r1(row["pm10"] / f)}
        nm = names.get(str(sid), {})
        slat, slon = float(panel.sensors["lat"].iat[c]), float(panel.sensors["lon"].iat[c])
        near_vt = float(np.hypot((slat - 43.0786) * 111.2, (slon - 25.6211) * 81.3)) <= FEATURED_KM
        stations.append({"id": f"sc-{sid}", "name": NAME_OVERRIDES.get(sid, nm.get("name", f"Сензор {sid}")),
                         "city": "Велико Търново" if near_vt and sid not in (14776, 76712) else nm.get("city", "България"),
                         "featured": near_vt,
                         "lat": round(float(panel.sensors["lat"].iat[c]), 5),
                         "lon": round(float(panel.sensors["lon"].iat[c]), 5),
                         "latest": lt, "hourly": hourly_items, "daily": daily})
    stations.sort(key=lambda s: (not s["featured"], s["city"], s["name"]))
    generated = now.tz_convert(TZ).replace(microsecond=0).isoformat()
    model_block = {k: meta[k] for k in ("name", "kind", "trained_rows", "sensors", "holdout", "mae", "exceedance_f1",
                                        "mae_vt", "mae_by_horizon", "importance", "algorithm", "band_coverage")
                   if k in meta}
    model_block.setdefault("algorithm", {"lgbm": "LightGBM", "xgb": "XGBoost (GPU, RTX 4070)"}[meta.get("algo", "lgbm")])
    ep = episode_block()
    if ep:
        model_block["episode"] = ep
    try:
        live = live_score(read_log(), panel.pm25, panel.times, panel.sensors["id"].to_numpy(), i_time)
        sb = scoreboard_block(live)
        if sb:
            model_block["scoreboard"] = sb
            if live:
                log(f"live check: {live['checked_hours']} h ({live['horizons']}), MAE {live['mae_pm25']}")
    except Exception as e:
        log(f"scoreboard failed: {e!r}")
    try:  # „Кой замърсява?“: an estimate, VT stations only
        src = load_sources_json()
        if src:
            import warnings

            from ml.aq_features import _bg_holidays

            dkm = km_from_vt(panel.sensors["lat"].to_numpy()[cols], panel.sensors["lon"].to_numpy()[cols])
            P25 = p25.reshape(len(cols), len(H))
            reg = P25[(dkm >= REGIONAL_KM[0]) & (dkm <= REGIONAL_KM[1])]
            with np.errstate(all="ignore"), warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                vt_fc = np.nanmean(P25[dkm <= FEATURED_KM], axis=0)
                reg_fc = np.nanpercentile(reg, 20, axis=0) if len(reg) else np.full(len(H), np.nan)
            dates = [(today + dt.timedelta(days=off)).isoformat() for off in (1, 2, 3)]
            vt_cell = panel.sensor_cell[cols[dkm <= FEATURED_KM]]
            vt_cell = vt_cell[vt_cell >= 0]
            temp_fc = (panel.weather["temperature_2m"][i + H, int(np.bincount(vt_cell).argmax())]
                       if len(vt_cell) else np.full(len(H), np.nan))   # forecast °C at the VT cell; heating only < 10 °C
            shares, what_if = sources_payload(vt_fc, reg_fc, times_local[i + H], dates, src,
                                              _bg_holidays({today.year, today.year + 1}), temp_fc)
            for s in stations:
                if s["featured"]:
                    for item in s["daily"]:
                        if item["date"] in shares:
                            item["sources"] = shares[item["date"]]
            model_block["sources_what_if"] = what_if
            log(f"sources (estimate) {dates[0]}: {shares.get(dates[0])}; 20% switch −{what_if['evening_drop_pm25']} µg/m³ evening")
    except Exception as e:
        log(f"sources failed: {e!r}")
    payload = {"generated_at": generated, "model": model_block, "stations": stations}
    errors = validate(payload)
    if errors:
        raise RuntimeError(f"payload fails the contract: {errors[:5]}")
    # The bundled fallback keeps hourly for the featured stations only (all of it is in Neon), so the
    # web bundle and the mobile copy stay small. /api/aq leaves hourly out anyway.
    slim = {**payload, "stations": [s if s["featured"] else {k: v for k, v in s.items() if k != "hourly"}
                                    for s in stations]}
    OUT.write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    if write_db:
        upsert(payload)
        notify_telegram()
    vt = next((s for s in stations if s["id"] == "sc-35767"), stations[0])
    log(f"forecast {generated}: {len(stations)} stations, {OUT.stat().st_size / 1e6:.1f} MB, "
        f"VT {vt['name']} days {[(x['date'], x['pm10_mean'], x['level']) for x in vt['daily']]} "
        f"in {time.monotonic() - t0:.0f}s")
    return payload


def episode_block() -> dict | None:
    """model.episode for the „Защо?“ page (Velko's shape), from ml.aq_episode's replay: the forecast issued the
    day before a real VT smog day, by a model that never saw that winter."""
    path = ROOT / "web" / "src" / "data" / "aq_episode.json"
    if not path.exists():
        return None
    ep = json.loads(path.read_text(encoding="utf-8"))
    day_before = next((f for f in ep["forecasts"] if f["days_before"] == 1), None)
    if not day_before:
        return None
    pts = lambda rows: [{"t": r["t"], "pm10": r["pm10"], "pm25": r["pm25"]} for r in rows if r["pm10"] is not None]
    return {"station_id": "vt-city", "place": ep["place"], "place_en": ep["place_en"], "date": ep["date"],
            "issued_at": day_before["issued"], "observed": pts(ep["observed"]), "predicted": pts(day_before["hourly"]),
            "cams": pts(ep["cams"]), "observed_daily": ep["observed_daily"], "predicted_daily": day_before["daily"],
            "cams_daily": ep["cams_daily"], "score": ep.get("score")}


# ---------------- Neon ----------------

def env_value(key: str) -> str | None:
    """A value from web/.env.local (the same file the web app reads), or None."""
    env = ROOT / "web" / ".env.local"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


def database_url() -> str | None:
    return env_value("DATABASE_URL")


def notify_telegram(post=httpx.post) -> None:
    """Asks the web app to send the Telegram alerts that are now due. Never breaks the forecast loop."""
    url, secret = env_value("TG_NOTIFY_URL"), env_value("TELEGRAM_NOTIFY_SECRET")
    if not url or not secret:
        log("no TG_NOTIFY_URL / TELEGRAM_NOTIFY_SECRET in web/.env.local: skipped Telegram alerts")
        return
    try:
        res = post(url, headers={"Authorization": f"Bearer {secret}"}, timeout=10)
        log(f"Telegram notify: {res.text[:200]}")
    except Exception as e:  # noqa: BLE001 - a failed call must not stop the hourly forecast
        log(f"Telegram notify failed: {e!r}")


DDL = """create table if not exists aq_forecast (
  id text primary key,
  generated_at timestamptz not null,
  payload jsonb not null
)"""


def upsert(payload: dict) -> None:
    import psycopg
    from psycopg.types.json import Jsonb

    url = database_url()
    if not url:
        log("no DATABASE_URL in web/.env.local: skipped Neon")
        return
    gen = payload["generated_at"]
    rows = [("_model", gen, Jsonb({"generated_at": gen, "model": payload["model"]}))]
    rows += [(s["id"], gen, Jsonb(s)) for s in payload["stations"]]
    with psycopg.connect(url, connect_timeout=20) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
            cur.execute("delete from aq_forecast")
            cur.executemany("insert into aq_forecast (id, generated_at, payload) values (%s, %s, %s)", rows)
        conn.commit()
    log(f"Neon: replaced aq_forecast with {len(rows)} rows")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--no-db", action="store_true")
    args = ap.parse_args()
    while True:
        try:
            run_once(write_db=not args.no_db)
        except Exception as e:
            log(f"forecast run failed: {e!r}")
            if args.once:
                raise
        if args.once:
            return
        now = dt.datetime.now()
        nxt = (now + dt.timedelta(hours=1)).replace(minute=7, second=0, microsecond=0)
        time.sleep(max(60, (nxt - now).total_seconds()))


if __name__ == "__main__":
    main()
