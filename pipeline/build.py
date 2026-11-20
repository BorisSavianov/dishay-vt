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


def point_details(tags: dict) -> dict:
    """The OSM tags worth showing in a pin popup. Only what the volunteers entered; nothing is guessed."""
    out = {}
    if tags.get("name"):
        out["name"] = tags["name"]
    street = " ".join(x for x in (tags.get("addr:street"), tags.get("addr:housenumber")) if x)
    address = ", ".join(x for x in (street, tags.get("addr:city")) if x)
    if address:
        out["address"] = address
    for key, tag in (("hours", "opening_hours"), ("phone", "phone"), ("website", "website")):
        if tags.get(tag):
            out[key] = tags[tag]
    return out


def facilities() -> None:
    path = RAW / "osm_overpass_VT_pharm_clinic_busstop.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    points = []
    for e in d["elements"]:
        tags = e.get("tags", {})
        kind = tags.get("amenity") or tags.get("highway") or "other"
        counts[kind] = counts.get(kind, 0) + 1
        points.append({"lat": e["lat"], "lon": e["lon"], "type": kind, **point_details(tags)})
    meta = {
        "source": "OpenStreetMap via Overpass API: pharmacies, hospitals, clinics, doctors, bus stops, Veliko Tarnovo",
        "as_of": file_date(path),
        "license": "ODbL: contains OpenStreetMap data, © OpenStreetMap contributors",
        "generated_at": now_iso(),
    }
    write("facilities_veliko_tarnovo.json", {"meta": meta, "counts": counts, "points": points})
    named = sum(1 for p in points if "name" in p)
    print(f"  {named} of {len(points)} points have a name, "
          f"{sum(1 for p in points if 'address' in p)} an address, "
          f"{sum(1 for p in points if 'hours' in p)} opening hours")


def stitch_rings(ways: list[list[list[float]]]) -> list[list[list[float]]]:
    """Join the outer ways of a boundary relation into closed rings. OSM ways share end nodes exactly."""
    pool = [list(w) for w in ways if len(w) > 1]
    rings = []
    while pool:
        ring = pool.pop(0)
        while ring[0] != ring[-1]:
            for i, w in enumerate(pool):
                if w[0] == ring[-1]:
                    ring.extend(w[1:])
                elif w[-1] == ring[-1]:
                    ring.extend(reversed(w[:-1]))
                else:
                    continue
                pool.pop(i)
                break
            else:
                raise ValueError("boundary ways do not close into a ring")
        rings.append(ring)
    return rings


def simplify(line: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker, iterative. Tolerance is in degrees (0.0004 is about 40 m)."""
    if len(line) < 3:
        return line
    keep = [False] * len(line)
    keep[0] = keep[-1] = True
    stack = [(0, len(line) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = line[a], line[b]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5 or 1e-12
        far, far_d = -1, tolerance
        for i in range(a + 1, b):
            px, py = line[i]
            dist = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if dist > far_d:
                far, far_d = i, dist
        if far != -1:
            keep[far] = True
            stack.append((a, far))
            stack.append((far, b))
    return [p for p, k in zip(line, keep) if k]


def simplify_ring(ring: list[list[float]], tolerance: float) -> list[list[float]]:
    """Simplify a closed ring. Douglas-Peucker needs two different end points, and a closed ring starts and
    ends at the same one, so split it at the vertex farthest from the start and simplify both halves."""
    k = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    return simplify(ring[: k + 1], tolerance)[:-1] + simplify(ring[k:], tolerance)


def inside(ring: list[list[float]], lon: float, lat: float) -> bool:
    """Ray casting point-in-polygon test."""
    hit = False
    j = len(ring) - 1
    for i in range(len(ring)):
        (xi, yi), (xj, yj) = ring[i], ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def region() -> None:
    path = RAW / "osm_overpass_BG04_boundary.json"
    rel = json.loads(path.read_text(encoding="utf-8"))["elements"][0]
    ways = [[[round(n["lon"], 5), round(n["lat"], 5)] for n in m["geometry"]] for m in rel["members"]
            if m["type"] == "way" and m.get("role") == "outer"]
    rings = [simplify_ring(r, 0.0004) for r in stitch_rings(ways)]
    geometry = (
        {"type": "Polygon", "coordinates": rings}
        if len(rings) == 1
        else {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
    )
    # Check every facility against the shape, so the map caveat can say what was verified.
    pts = json.loads((PROCESSED / "facilities_veliko_tarnovo.json").read_text(encoding="utf-8"))["points"]
    inside_count = sum(1 for p in pts if any(inside(r, p["lon"], p["lat"]) for r in rings))
    meta = {
        "source": "OpenStreetMap via Overpass API: Veliko Tarnovo province boundary (relation "
        f"{rel['id']}, admin_level 4, ISO 3166-2 BG-04)",
        "as_of": file_date(path),
        "license": "ODbL: contains OpenStreetMap data, © OpenStreetMap contributors",
        "generated_at": now_iso(),
    }
    write(
        "region_veliko_tarnovo.json",
        {"meta": meta, "geometry": geometry, "check": {"points": len(pts), "inside": inside_count}},
    )
    print(f"  {sum(len(r) for r in rings)} vertices in {len(rings)} ring(s); {inside_count} of {len(pts)} facilities inside")


def main() -> None:
    population()
    physicians()
    facilities()
    region()


if __name__ == "__main__":
    main()
