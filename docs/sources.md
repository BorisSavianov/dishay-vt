# Sources

Checked on 2026-11-15 during the recon. Endpoints and quirks come from the recon log; re-check before the day.

| Source | Endpoint or file | Licence | Notes and quirks |
|---|---|---|---|
| Eurostat demo_r_pjanaggr3 | `ec.europa.eu/eurostat/api/dissemination` (JSON-stat), geo=BG321 | Reuse with source acknowledged | Veliko Tarnovo NUTS 3 population, 2015 to 2025: 238,456 to 200,413 (−16.0%). Values are indexed by position; the time labels give the years. |
| World Bank SH.MED.PHYS.ZS | `api.worldbank.org/v2` | CC BY 4.0 | Physicians per 1,000, Bulgaria, 2011 to 2022 (last 4.328 in 2022). National only. |
| OpenStreetMap via Overpass | `overpass-api.de/api/interpreter` (GET, `Accept: application/json`) | ODbL | 303 nodes in the Veliko Tarnovo admin area: 43 pharmacy, 3 hospital, 4 clinic, 6 doctors, 247 bus_stop. Area matched by name; checked against the province boundary below: all 303 are inside. Sampled pharmacy records have 2021 check dates. 218 of 303 have a name, 12 an address, 11 opening hours. |
| OpenStreetMap via Overpass (boundary) | same endpoint, `rel["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"="BG-04"]; out geom;` | ODbL | Veliko Tarnovo province, relation 1739524. Stitched into one ring and simplified (Douglas-Peucker) to 1,475 vertices for the map outline. |
| OpenFreeMap vector tiles (web basemap) | `tiles.openfreemap.org/styles/positron` and `/fiord` | Project MIT, map data ODbL (OpenStreetMap) | No key. Attribution is required, and the map shows it: OpenFreeMap © OpenMapTiles, data from OpenStreetMap (checked on openfreemap.org, 2026-11-19). The browser loads the tiles, so the web map needs a connection; offline it falls back to the dot map. |
| Apple Maps (mobile basemap) | iOS MapKit through `react-native-maps` | Apple | No key on iOS. Android would need a Google Maps key, so the mobile map is iOS only for now. |
| ИАОС daily exceedance bulletin (data.egov.bg, dataset 27b66301-74a6-42aa-a994-1200ab1fded7) | per-day CSV at `data.egov.bg/resource/download/<id>/csv` | CC0 | Lists exceedances only, not measurements. 9 daily files (22 to 31 Oct 2026) had one station row or "no exceedances". Veliko Tarnovo does not appear. Not usable as a city air series. |
| NSI census 2021 | census2021.bg, nsi.bg/en and /bg census pages | NSI licence | Not pulled. Pages redirect or 404. Only a StatBook PDF link found. Needs a direct table source. |
| Matura results (ДЗИ) | data.egov.bg keyword search | n/a | Not found under "ДЗИ", "матура" or "зрелостни". Try mon.bg. |
| MON school list | data.egov.bg dataset 9c3313f6-f5b0-4cca-a456-906f0d0c57d1 | open data | Found. Resource format and size not verified; not downloaded. |

## Air-quality forecast („Дишай ВТ“), checked 2026-11-20

| Source | Endpoint or file | Licence | Notes and quirks |
|---|---|---|---|
| sensor.community (Luftdaten) archive | `archive.sensor.community/{YYYY}/{date}/{date}_{type}_sensor_{id}.csv.gz` (≤ 2025), `/{date}/…csv` (2026) | ODbL | The target. 602 outdoor PM sensors in BG (SDS011, PMS*, SPS30), 10 near VT. `P1` = PM10, `P2` = PM2.5, UTC times, a reading every ~2.5 min. Reduced to hourly means on download (`ml/aq_fetch.py`). The server serves ~40 files/s, so only heating seasons (Oct–Mar, 2023 →) are fetched. Today's file appears only tomorrow. |
| sensor.community live API | `data.sensor.community/airrohr/v1/filter/country=BG`, `static/v2/data.24h.json` | ODbL | Sensor list and the live readings, polled every 5 min (`ml/aq_collect.py`). Some sensors are stuck at 999.9 or read 500+ while their neighbours read 1: `spike_filter` in `ml/aq_features.py` drops them. |
| Open-Meteo historical weather (ERA5) | `archive-api.open-meteo.com/v1/archive` | CC BY 4.0 (Open-Meteo); contains modified Copernicus Climate Change Service information | Training features: temperature, RH, wind, precipitation, pressure, boundary-layer height. 0.25° cells, top 50 cells (541 of 602 sensors). ERA5 lags ~5 days. BLH is missing for Jan–Mar 2024 (LightGBM treats it as missing). Observed weather in training, forecast weather live: said on the slide. |
| Open-Meteo forecast | `api.open-meteo.com/v1/forecast` (`past_days=7`, `forecast_days=5`) | CC BY 4.0 | The same variables for the live forecast. Budget: a request counts as days/14 calls per location, 10k calls a day. |
| CAMS Europe via Open-Meteo Air Quality | `air-quality-api.open-meteo.com/v1/air-quality`, `domains=cams_europe` | Copernicus licence: "Generated using Copernicus Atmosphere Monitoring Service information 2026" | The baseline to beat and a feature. History back to 2023 is the archived short-range forecast, so the CAMS baseline is, if anything, flattered. |
| OpenStreetMap place nodes (Overpass) | `place=city|town|village|suburb|quarter|neighbourhood` in BG | ODbL | Station names: nearest settlement, plus the neighbourhood within 1.5 km in a city. VT names follow `mobile/src/aq/mock.ts`. |
| Open-Meteo elevation | `api.open-meteo.com/v1/elevation` | CC BY 4.0 (Copernicus DEM GLO-90) | Static feature per sensor. |
| EEA European Air Quality Index bands | airindex.eea.europa.eu/AQI/index.html (2024 revision, WHO 2021 based) | EEA, reuse with acknowledgement | PM2.5 5/15/50/90/140, PM10 15/45/120/195/270 µg/m³. Defined on hourly values; `daily[].level` applies them to daily means. |

Humidity correction: SDS011-type optical sensors over-read in humid air. Above 80% RH we divide by the κ-Köhler growth factor (Crilley et al. 2018, κ = 0.4) relative to 80% RH, with RH capped at 95%. Below 80% the reading is used as is.
