"""Write the mock web/src/data/aq_forecast.json in the contract shape (contract/CONTRACT.md "Air quality").

    uv run --group ml python -m ml.aq_mock

Stations are real sensor.community sensors (checked 20.11.2026); the numbers are invented
(quiet today, a smoggy evening tomorrow) and model.kind is "mock", so the apps can label them."""
from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path
from zoneinfo import ZoneInfo

from ml.aq_labels import reason
from ml.aq_levels import EU_PM10_DAILY_LIMIT, level_of

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "src" / "data" / "aq_forecast.json"
TZ = ZoneInfo("Europe/Sofia")

# Same stations and names as mobile/src/aq/mock.ts, so web and phone demos match.
SEEDS = [
    ("sc-35767", "ВТ – Център", "Велико Търново", 43.0786, 25.6211, 1.0, True),
    ("sc-66083", "ВТ – Бузлуджа", "Велико Търново", 43.0738, 25.6249, 1.1, False),
    ("sc-41885", "ВТ – Картала", "Велико Търново", 43.084, 25.616, 0.9, False),
    ("sc-63801", "ВТ – Акация", "Велико Търново", 43.06, 25.624, 1.2, False),
    ("sc-98556", "ВТ – Колю Фичето", "Велико Търново", 43.074, 25.628, 1.05, False),
    ("sc-37065", "ВТ – Запад", "Велико Търново", 43.08, 25.55, 0.8, False),
    ("sc-14776", "Самоводене", "Самоводене", 43.124, 25.686, 0.85, False),
    ("sc-76712", "Арбанаси", "Арбанаси", 43.154, 25.658, 0.6, False),
    ("demo-sofia", "София – Надежда", "София", 42.733, 23.31, 1.4, False),
    ("demo-plovdiv", "Пловдив – Каменица", "Пловдив", 42.14, 24.75, 1.35, False),
    ("demo-varna", "Варна – Чайка", "Варна", 43.21, 27.92, 0.7, False),
]


def r1(x: float) -> float:
    return round(x, 1)


def diurnal(hour: int) -> float:
    return 0.55 + math.exp(-((hour - 21) ** 2) / 8) + 0.45 * math.exp(-((hour - 8) ** 2) / 4)


EPISODE = {0: 1.0, 1: 3.8, 2: 1.6, 3: 1.0}  # day offset -> multiplier; tomorrow is the bad day


def build(now: dt.datetime) -> dict:
    now = now.astimezone(TZ)
    start = now.replace(minute=0, second=0, microsecond=0) + dt.timedelta(hours=1)
    today = now.date()
    stations = []
    for si, (sid, name, city, lat, lon, base, featured) in enumerate(SEEDS):
        hourly = []
        for i in range(72):
            t = start + dt.timedelta(hours=i)
            off = (t.date() - today).days
            pm25 = 11 * base * diurnal(t.hour) * EPISODE.get(off, 1.0) * (1 + 0.08 * math.sin(i * 0.9 + si))
            spread = 0.18 + 0.006 * i
            hourly.append({
                "t": t.isoformat(timespec="seconds"),
                "pm25": r1(pm25),
                "pm10": r1(pm25 * 1.55),
                "pm25_lo": r1(pm25 * (1 - spread)),
                "pm25_hi": r1(pm25 * (1 + spread * 1.3)),
                "cams_pm25": r1(pm25 * (0.72 + 0.1 * math.sin(i / 7))),
            })
        daily = []
        for off in (1, 2, 3):
            day = today + dt.timedelta(days=off)
            hrs = [h for h in hourly if h["t"].startswith(day.isoformat())]
            if not hrs:
                continue
            # Round first, so level and exceeds_eu_limit agree with the published means.
            pm25m = r1(sum(h["pm25"] for h in hrs) / len(hrs))
            pm10m = r1(sum(h["pm10"] for h in hrs) / len(hrs))
            bad = EPISODE.get(off, 1.0) > 1.5
            reasons = (
                [reason("pbl_height", 11.2 * base), reason("wind_speed", 7.4 * base), reason("temp", 5.1 * base)]
                if bad
                else [reason("wind_speed", -4.2 * base), reason("pbl_height", -3.1 * base), reason("calendar", 2.0 * base)]
            )
            daily.append({
                "date": day.isoformat(),
                "pm10_mean": r1(pm10m),
                "pm25_mean": r1(pm25m),
                "level": level_of(pm25m, pm10m),
                "exceeds_eu_limit": pm10m > EU_PM10_DAILY_LIMIT,
                "reasons": reasons,
            })
        first = hourly[0]
        stations.append({
            "id": sid, "name": name, "city": city, "featured": featured, "lat": lat, "lon": lon,
            "latest": {"t": (start - dt.timedelta(minutes=5)).isoformat(timespec="seconds"),
                       "pm25": r1(first["pm25"] * 0.95), "pm10": r1(first["pm10"] * 0.95)},
            "hourly": hourly,
            "daily": daily,
        })
    return {
        "generated_at": now.replace(microsecond=0).isoformat(),
        "model": {
            "name": "mock-v0", "kind": "mock", "trained_rows": 0, "sensors": len(SEEDS),
            "holdout": "winter 2025/26",
            "mae": {"model": 6.1, "cams": 9.8, "persistence": 8.4},
            "exceedance_f1": {"model": 0.78, "cams": 0.55},
        },
        "stations": stations,
    }


def main() -> None:
    data = build(dt.datetime.now(TZ))
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(data['stations'])} stations")


if __name__ == "__main__":
    main()
