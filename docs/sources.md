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
