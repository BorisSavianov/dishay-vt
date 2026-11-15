"""Turn raw source files into the JSON the web app reads. Standard library only."""
import datetime as dt
import json
from pathlib import Path

from pipeline.config import PROCESSED, RAW, WEB_DATA


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def file_date(path: Path) -> str:
    return dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).date().isoformat()


def write(name: str, payload: dict) -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=1)
    (PROCESSED / name).write_text(text, encoding="utf-8")
    (WEB_DATA / name).write_text(text, encoding="utf-8")
    print(f"wrote {name}")


def population() -> None:
    path = RAW / "eurostat_demo_r_pjanaggr3_BG321_VelikoTarnovo.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    years = list(d["dimension"]["time"]["category"]["label"].keys())
    values = d["value"]
    series = [{"year": int(y), "value": values[str(i)]} for i, y in enumerate(years) if str(i) in values]
    meta = {
        "source": "Eurostat demo_r_pjanaggr3, BG321 Veliko Tarnovo, population on 1 January",
        "as_of": d["updated"][:10],
        "license": "Eurostat reuse policy: reuse with source acknowledged",
        "generated_at": now_iso(),
    }
    write("population_veliko_tarnovo.json", {"meta": meta, "series": series})


def physicians() -> None:
    body = json.loads((RAW / "worldbank_SH.MED.PHYS.ZS_BG.json").read_text(encoding="utf-8"))
    head, rows = body[0], body[1]
    series = sorted(
        ({"year": int(r["date"]), "value": r["value"]} for r in rows if r["value"] is not None),
        key=lambda p: p["year"],
    )
    meta = {
        "source": "World Bank SH.MED.PHYS.ZS, physicians per 1,000 people, Bulgaria",
        "as_of": head.get("lastupdated", now_iso()[:10]),
        "license": "World Bank: CC BY 4.0",
        "generated_at": now_iso(),
    }
    write("health_physicians_bg.json", {"meta": meta, "series": series})


def facilities() -> None:
    path = RAW / "osm_overpass_VT_pharm_clinic_busstop.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    points = []
    for e in d["elements"]:
        tags = e.get("tags", {})
        kind = tags.get("amenity") or tags.get("highway") or "other"
        counts[kind] = counts.get(kind, 0) + 1
        point = {"lat": e["lat"], "lon": e["lon"], "type": kind}
        if "name" in tags:
            point["name"] = tags["name"]
        points.append(point)
    meta = {
        "source": "OpenStreetMap via Overpass API: pharmacies, hospitals, clinics, doctors, bus stops, Veliko Tarnovo",
        "as_of": file_date(path),
        "license": "ODbL: contains OpenStreetMap data, © OpenStreetMap contributors",
        "generated_at": now_iso(),
    }
    write("facilities_veliko_tarnovo.json", {"meta": meta, "counts": counts, "points": points})


def main() -> None:
    population()
    physicians()
    facilities()


if __name__ == "__main__":
    main()
