# Data contract

Every file in `web/src/data/` is written by `pipeline/build.py`. The same files are seeded into the Neon `datasets` table by `pnpm seed`, and the app falls back to them when the database is not set or unreachable. The web types in `web/src/lib/types.ts` must match these shapes. Change a shape only after telling the whole team.

## Meta (every file)

- `source`: human-readable source name
- `as_of`: `YYYY-MM-DD`, the date of the source data
- `license`: licence or reuse condition, shown in the app footer
- `generated_at`: ISO 8601 UTC timestamp of the build

## Time series

`{ "meta": Meta, "series": [{ "year": int, "value": number }] }`, sorted by year.

Files: `population_veliko_tarnovo.json`, `health_physicians_bg.json`.

## Points

`{ "meta": Meta, "counts": { "<type>": int }, "points": [{ "lat": number, "lon": number, "type": string, "name"?: string }] }`

Files: `facilities_veliko_tarnovo.json`.
