# ML add-on to the FMI Open Data Hackathon plan

## Context
The event (ml-hackathon.pages.dev) is an ML hackathon. The topic is revealed Fri 20.11 at 09:00 and the live URL is due at 16:15. The repo already has a hosted demo: Next.js 15 on Vercel, Neon, Groq/Gemini summaries, and a stdlib Python pipeline that writes JSON. Tonight's goal (feature freeze 21:00 Thu 19.11) is the theme-independent ML path working end to end, so Friday is only: get data → train → swap one model file → deploy. Roles: Teodor = ML + ML API, Velko = web, Boris = mobile + Vercel owner (deploy commits).

## Approach (chosen): train in Python, serve from Next.js
Python/scikit-learn trains tree or linear models. The fitted model, including its preprocessing, is exported to `web/src/model/model.json`, bundled into the app, and run by a small TypeScript evaluator in Next.js API routes. Web and mobile both call the same Vercel URL.
Rejected: FastAPI on Render (second deploy, CORS, cold starts on the free tier) and FastAPI as a fallback (no time tonight).

## Design
1. **`ml/` (Python, uv group `ml`: pandas, scikit-learn, openpyxl, pytest; the pipeline stays stdlib)**
   - `ml/inspect.py`: reads a CSV, JSON or XLSX file and prints dtypes, missing %, uniques and candidate targets.
   - `ml/train.py`: CLI with `--data --target --features --task auto --models tree,forest,gbm,linear --seed 42 [--time-col]`. Steps: split, then a Dummy baseline, then CV over the candidate models, then pick the best and write a report.
   - Exportable preprocessing: numeric columns get median impute (plus standardize for linear models); categorical columns get top-20 one-hot plus "other".
   - `ml/export.py`: exports DecisionTree, RandomForest, ExtraTrees, GradientBoosting and Linear/Ridge/Logistic to `model.json` schema v1, with metrics vs baseline, importances and meta (source, licence, as_of).
   - Fixture model trained on sklearn's bundled toy data, labelled `kind: "fixture"` and never presented as real. It lets web and mobile integrate tonight.
2. **Web**
   - `src/lib/ml/{types,predict,validate}.ts` hold the evaluator and input validation.
   - `GET /api/model` returns the feature schema, metrics and importances.
   - `POST /api/predict` takes 1 to 100 rows (body ≤ 32 KB) and supports OPTIONS/CORS.
   - `/api/health` reports the loaded model.
   - Parity test: Python writes test cases and Vitest asserts TypeScript matches sklearn (to 1e-6).
   - A minimal `/predict` page (bg/en): a form generated from the schema, the result, metrics vs baseline, top features, the decision path for a single tree, and a "fixture" badge. Velko restyles it.
3. **Mobile** (Boris has an app locally): `mobile-kit/ml/` drop-in folder (types, fetch client, `usePrediction` hook, README) kept byte-identical to `web/src/lib/ml/` by a Vitest sync test.
4. **Contract**
   - `GET /api/model` → `{ok, model:{name, version, kind, task, target:{name, unit?, classes?}, features:[{name, type:number|category, required, min?, max?, categories?}], metrics:{model, baseline}, importances, trained_at, meta}}`
   - `POST /api/predict {inputs: {...} | [{...}]}` → `{ok, task, predictions:[{value} | {label, probabilities}], explanation?, model:{name, version, kind}}`
   - Errors: `{ok:false, error:{code, message, details?}}` with status 400, 413 or 503.
5. **Docs**: an ML section in `contract/CONTRACT.md`, `docs/ml-playbook.md` (Friday steps and commands), README updates, and a merged plan doc.

## Friday ML timeline
09:00–09:20: pick the target and task. 09:20–10:30: data, inspect, clean. By 12:00: a first model exported and live, compared with the baseline. Until 15:30: features and tuning, while web and mobile build the themed UI against `/api/model`.

## Not doing
FastAPI/Docker/Render, an `/api/v1` prefix (the repo uses `/api/*`), 9 docs, a shared TS package, training on synthetic data.

## Verification
Run `uv run --group ml pytest`, then `pnpm typecheck && pnpm test && pnpm build`. Then `pnpm start` and curl `/api/health`, `/api/model`, `/api/predict` (valid, invalid and oversized bodies), click through `/predict`, and call the API from the mobile client. Work goes on the branch `feat/ml-predict` with a PR; Boris merges it so Vercel deploys.
