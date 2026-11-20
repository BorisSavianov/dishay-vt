from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_DATA = ROOT / "web" / "src" / "data"

SOURCES = {
    "eurostat_pop_vt": {
        "file": "eurostat_demo_r_pjanaggr3_BG321_VelikoTarnovo.json",
        "url": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_r_pjanaggr3?geo=BG321&format=JSON&sinceTimePeriod=2015&sex=T&age=TOTAL&unit=NR",
    },
    "worldbank_physicians_bg": {
        "file": "worldbank_SH.MED.PHYS.ZS_BG.json",
        "url": "https://api.worldbank.org/v2/country/BG/indicator/SH.MED.PHYS.ZS?format=json&per_page=100&date=2000:2025",
    },
    # Premature deaths due to PM2.5, Bulgaria and the EU. sdg_11_50 (exposure) is no longer disseminated.
    "eurostat_pm25_deaths": {
        "file": "eurostat_sdg_11_52_BG_EU27.json",
        "url": "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sdg_11_52?format=JSON&lang=EN&geo=BG&geo=EU27_2020",
    },
    "osm_vt_facilities": {
        "file": "osm_overpass_VT_pharm_clinic_busstop.json",
        "url": "https://overpass-api.de/api/interpreter",
    },
    "osm_vt_boundary": {
        "file": "osm_overpass_BG04_boundary.json",
        "url": "https://overpass-api.de/api/interpreter",
    },
}

OVERPASS_QUERY = (
    '[out:json][timeout:60];'
    'area["name"="Велико Търново"]["boundary"="administrative"]->.a;'
    '(node["amenity"~"^(pharmacy|hospital|clinic|doctors)$"](area.a);'
    'node["highway"="bus_stop"](area.a););out;'
)

# The province (oblast) boundary, with every member way's geometry. The facilities query above matches
# areas by name, so this is the shape to check those points against. ISO 3166-2 BG-04 is Veliko Tarnovo.
BOUNDARY_QUERY = (
    '[out:json][timeout:90];'
    'rel["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"="BG-04"];out geom;'
)

# Overpass queries by source name. Sources without an entry are plain GET downloads.
QUERIES = {
    "osm_vt_facilities": OVERPASS_QUERY,
    "osm_vt_boundary": BOUNDARY_QUERY,
}
