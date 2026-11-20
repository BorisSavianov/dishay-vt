# FMI Open Data Hackathon: hosted demo

A Next.js app for Vercel with Neon Postgres. Groq (primary) and Gemini (fallback) write short summaries of the figures. A Python pipeline (standard library only) turns public data into JSON. The same JSON is bundled into the app as a fallback and seeded into Neon.

An ML toolkit (`ml/`, scikit-learn) trains a tabular model and exports it to `web/src/model/model.json`. The app serves it at `/api/model` and `/api/predict` to the web page `/predict` and to the mobile app. Until the topic is known, this is a placeholder model trained on toy data, and the app labels it as such.

Live URL: https://fmi-open-data.vercel.app. See "Deploy" below.

## Run locally

```bash
uv run python -m pipeline.build   # raw files in data/raw -> data/processed and web/src/data
cd web
pnpm install
cp .env.example .env.local        # leave the keys empty to get text built from the figures
pnpm dev                          # http://localhost:3000
```

Checks before a push:

```bash
cd web
pnpm typecheck
pnpm test
pnpm build
```

Run `uv run python -m pipeline.fetch` first on a new machine to download the raw files (needs network).

ML commands. The steps for the day are in `docs/ml-playbook.md`.

```bash
uv run --group ml pytest -q                                           # toolkit tests
uv run --group ml python -m ml.inspect data/raw/<file>.csv            # first look at a dataset
uv run --group ml python -m ml.train --data <file> --target <column>  # writes web/src/model/model.json
uv run --group ml python -m ml.parity                                 # after editing ml/preprocess.py or ml/export.py
```

## Database (Neon)

1. Create a Neon project (free). Copy its connection string.
2. Put it in `web/.env.local` as `DATABASE_URL`.
3. `cd web && pnpm seed` creates the three tables and loads the three datasets.

Without `DATABASE_URL`, or if the database fails, the app shows the bundled data and says so on the page.

## Environment variables

Names are in `web/.env.example`. Set them in `.env.local` locally and in Vercel for the deployment.

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon connection string |
| `GROQ_API_KEY`, `GROQ_MODEL` | Groq key and model id |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini key and model id |
| `MOCK_LLM` | `1` forces text built from the figures |
| `AI_PER_MINUTE`, `AI_PER_DAY` | live AI calls allowed per visitor |

Model ids are defaults that must be checked in each provider's console before the demo. Keys are server-only. Never give a key a `NEXT_PUBLIC_` name.

## Deploy (Vercel)

Owner: Boris. Git integration deploys the private GitHub repo.

1. In Vercel, import the repo and set the root directory to `web`.
2. Add the variables above under Settings > Environment Variables.
3. Each push from a teammate needs a deploy commit from the owner account, so the change goes live.
4. Check the URL on a phone at 390 px, in both languages.

## Layout

- `pipeline/` Python: `config.py` sources, `fetch.py` downloads, `build.py` writes JSON.
- `web/src/data/region_veliko_tarnovo.json` the province outline, bundled with both apps (not in the database).
- `data/raw/` cached downloads (git-ignored). `data/processed/` the JSON, committed.
- `contract/CONTRACT.md` the JSON shapes, including the ML API. `web/src/lib/types.ts` and `web/src/lib/ml/types.ts` must match them.
- `/` is the story (the 3D landing page: `web/src/components/story/`, `web/src/lib/story/`; `pnpm story:terrain` in `web/` re-bakes the terrain), `/now` the live forecast dashboard.
- `web/src/app/` pages (Dashboard, Geographic Explorer, Health, AI Insights, Prediction, Datasets and Sources, Methodology and About), `/api/summary`, `/api/export/<dataset>` (CSV), `/api/model` and `/api/predict`. `web/src/lib/` data, metrics, facts, AI calls, store.
- `ml/` Python: `data.py` loading, `preprocess.py` exportable preprocessing, `train.py` training and evaluation, `export.py` JSON export, `fixture.py` the placeholder model, `parity.py` cross-language test cases.
- `web/src/model/model.json` the served model. `web/src/lib/ml/` its TypeScript evaluator, validation, client and hooks.
- `mobile-kit/` the ML client files as Teo delivered them. `pnpm ml:kit` in `web/` refreshes them. The app uses its own copy in `mobile/src/ml/`, written by `npm run sync`.
- `docs/ml-playbook.md` the ML steps for the day.
- `web/src/components/shell/` the sidebar, header and bottom bar. `web/src/components/charts/` the SVG charts and the maps: `LiveMap` (MapLibre over OpenFreeMap tiles, clustered pins, province outline) with `FacilityMap` (the dot map) as the offline fallback.
- `mobile/` Expo app with the same design: five tabs (Dashboard, Map, Health, AI, Data) and a Prediction screen opened from the Data tab. The Map tab is a native Apple Maps view (`react-native-maps`, clustered with `supercluster`); it needs a development build (`npx expo run:ios`), not Expo Go. Set `EXPO_PUBLIC_API_URL` to the deployed site. `npm run sync` copies the shared TypeScript from `web/src/lib`; `npm test` checks the colours against `web/src/app/globals.css`.
- `web/db/schema.sql` the three tables. `web/scripts/seed.ts` loads the data.
- `docs/sources.md` what each source is, its licence and quirks.

## Not in this version

No user accounts. No free-text AI questions. No age, density or municipality data: the sources in `docs/sources.md` do not provide them, so the dashboard does not show them.
