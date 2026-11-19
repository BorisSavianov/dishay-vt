# FMI Open Data Hackathon: hosted demo

A Next.js app for Vercel with Neon Postgres. Groq (primary) and Gemini (fallback) write short summaries of the figures. A Python pipeline (standard library only) turns public data into JSON. The same JSON is bundled into the app as a fallback and seeded into Neon.

An ML toolkit (`ml/`, scikit-learn) trains a tabular model and exports it to `web/src/model/model.json`. The app serves it at `/api/model` and `/api/predict` to the web page `/predict` and to the mobile app. Until the topic is known, this is a placeholder model trained on toy data, and the app labels it as such.

Live URL: not deployed yet. See "Deploy" below.

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
- `data/raw/` cached downloads (git-ignored). `data/processed/` the JSON, committed.
- `contract/CONTRACT.md` the JSON shapes, including the ML API. `web/src/lib/types.ts` and `web/src/lib/ml/types.ts` must match them.
- `web/src/app/` pages and the `/api/summary` route. `web/src/lib/` data, facts, AI calls, store.
- `web/db/schema.sql` the three tables. `web/scripts/seed.ts` loads the data.
- `docs/sources.md` what each source is, its licence and quirks.
- `ml/` Python: `data.py` loading, `preprocess.py` exportable preprocessing, `train.py` training and evaluation, `export.py` JSON export, `fixture.py` the placeholder model, `parity.py` cross-language test cases.
- `web/src/model/model.json` the served model. `web/src/lib/ml/` its TypeScript evaluator, validation, client and hooks. `web/src/app/api/model` and `web/src/app/api/predict` the routes; `web/src/app/predict` the page.
- `mobile-kit/` the ML client files for the mobile app. `pnpm ml:kit` in `web/` refreshes them.
- `docs/ml-playbook.md` the ML steps for the day.

## Not in this version

No user accounts. No free-text AI questions. The mobile app lives in its own project and calls this app's ML API through `mobile-kit/`.
