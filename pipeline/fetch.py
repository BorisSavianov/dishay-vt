"""Download the raw sources into data/raw. Standard library only."""
import urllib.parse
import urllib.request

from pipeline.config import OVERPASS_QUERY, RAW, SOURCES

HEADERS = {
    "User-Agent": "fmi-open-data/0.1 (hackathon data pipeline)",
    # Overpass answers 406 to requests without an Accept header.
    "Accept": "application/json",
}


def fetch(name: str) -> None:
    spec = SOURCES[name]
    url = spec["url"]
    if name == "osm_vt_facilities":
        url = url + "?" + urllib.parse.urlencode({"data": OVERPASS_QUERY})
    RAW.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read()
    (RAW / spec["file"]).write_bytes(body)
    print(f"fetched {name}: {len(body)} bytes")


if __name__ == "__main__":
    for source_name in SOURCES:
        fetch(source_name)
