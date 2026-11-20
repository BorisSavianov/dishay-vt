# Live forecast scoreboard: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a `model.scoreboard` block in the forecast payload. It holds two scores:
- a replay of 1–19 Nov 2026, scored with archived forecast weather by models that never saw this season;
- a live score of every hourly run since today.

Velko shows it on „Защо?“.

**Architecture:**
- A new `ml/aq_scoreboard.py` has two parts:
  - The replay CLI. It reuses `build_panel`/`derive`/`features`/`predict_all` the same way `ml/aq_episode.py` does, swaps the panel's weather for Open-Meteo Previous Runs, and caches the result in `data/processed/scoreboard_replay.json`.
  - The live log and score functions, which `run_once` calls every hour.
- `run_once` adds `scoreboard_block()` to the payload, the same way it adds `episode_block()`.
- The web reads `forecast.model.scoreboard`.

**Tech stack:** Python (pandas, numpy, httpx, LightGBM via `ml.aq_models.Model`), pytest through `uv run --group ml`, Next.js and vitest on the web side.

**Spec:** `docs/superpowers/specs/2026-11-20-scoreboard-design.md`

**Owners:** Tasks 1–5 are Teodor's, on `teodor/aq-ml`. Task 6 is Velko's, on his „Защо?“ branch, and he can start once Task 1 is pushed.

## Global constraints

**Replay**
- The replay uses only `ml/models/aq_*_eval` models, the same load as `ml/aq_episode.py:44`, and never the production `aq_*.txt`.
- Issue times are 12:00 Europe/Sofia, from 31 Oct to 18 Nov 2026. The targets are the next local day's 24 hours, which are 12–35 h ahead.
- Weather at a valid hour comes from `*_previous_day{N}` with `N = ceil(lead_h / 24)`. That means target hours 00:00–12:00 use `previous_day1`, and 13:00–23:00 use `previous_day2`. This tightens the spec's "D−I": no weather run newer than the issue time is ever used.
- BLH modes:
  - `"none"`: BLH is NaN for the whole replay window.
  - `"era5"`: keep the ERA5 values. They end 14 Nov, so they're NaN after that.
  - The payload carries `"none"` if its VT model MAE is below VT CAMS; otherwise it carries `"era5"`.
- Weather variables are `WEATHER_VARS` without `boundary_layer_height`, using Open-Meteo's default units, as `ml/aq_weather.py` does.

**Scoring**
- MAE is over hourly PM2.5 per sensor-hour. Only rows where the observation, the model, CAMS and persistence are all present count, so the three are compared on the same hours.
- VT means sensors within 10 km of (43.0786, 25.6211), the same as `ml/aq_episode.py`.
- A VT day row needs at least 18 observed hours of the VT city mean.

**Contract and wording**
- The contract shape is exactly the spec's `scoreboard` block. When there's no replay cache and no live score, the block is left out entirely. It's never filled with mock numbers.
- The page copy says „средна грешка“ for MAE.

## Review focus

1. **A target hour with no observation or no CAMS value** (a sensor offline, CAMS missing for that cell) is dropped from all three MAEs at once. Covered by a test in Task 3.
2. **The replay never reads a weather run issued after the issue time.** Covered by a test in Task 2 (`lead_day` and the hour-of-day pick).
3. **The Previous Runs API returns `null` for a variable or cell, or rate-limits.** The value becomes NaN rather than a crash. Responses are cached per cell, and 429s use `ml.aq_weather.get_json`. Covered by a test in Task 2.
4. **The first live run, before any forecast hour has passed,** omits `live` rather than dividing by zero. Covered by a test in Task 4.
5. **On the web, a missing `scoreboard`** hides the section, and `blh: "era5"` shows the observed-BLH note. Covered by a test in Task 6.

---

### Task 1: Contract and validator

**Files:**
- Modify: `contract/CONTRACT.md`. Add a "`model.scoreboard` (optional)" section with the spec's JSON block, field meanings, and the rule that the page must say so when `blh` is `"era5"`.
- Modify: `ml/aq_contract.py`. In `validate`, when `model.scoreboard` is present, check it.
- Test: `ml/tests/test_aq_scoreboard.py` (new; later tasks add to it).

**Interfaces:**
- **Produces:** `validate` errors prefixed `model.scoreboard.` for:
  - a `replay.blh` outside `{"none", "era5"}`;
  - a non-numeric `replay.mae_pm25_next_day.{vt,bg}.{model,cams,persistence}`;
  - a `live.checked_hours` that isn't an int ≥ 1;
  - a non-numeric `live.mae_pm25.{model,cams,persistence}`.

  Both `replay` and `live` are optional on their own.

- [ ] **Step 1: Write the failing tests:**
  - `test_scoreboard_optional`: a valid payload without `scoreboard` → no `model.scoreboard` errors.
  - `test_scoreboard_valid`: the spec's example → no errors.
  - `test_scoreboard_bad_blh`: `blh: "observed"` → an error containing `model.scoreboard.replay.blh`.
  - `test_scoreboard_bad_live`: `checked_hours: 0` → an error.

  Build the base payload with `ml.aq_mock`'s generator if it has one, or else a minimal 1-station dict.
- [ ] **Step 2: Run** `uv run --group ml pytest ml/tests/test_aq_scoreboard.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement** the checks in `ml/aq_contract.py`, and write the `CONTRACT.md` section.
- [ ] **Step 4: Run** `uv run --group ml pytest ml/tests -q`. Expected: PASS.
- [ ] **Step 5: Commit and push** `feat(aq): model.scoreboard contract`, then tell Velko that Task 6 can start.

### Task 2: Forecast weather from Previous Runs

**Files:**
- Create: `ml/aq_scoreboard.py`
- Test: `ml/tests/test_aq_scoreboard.py`

**Interfaces:**
- **Consumes:** `ml.aq_weather.get_json`, `cell_center` and `WEATHER_VARS`, plus `ml.aq_features.Panel` and `TZ`.
- **Produces:**
  - `lead_day(lead_h: int) -> int`, which is `max(1, ceil(lead_h / 24))`.
  - `previous_runs(cells: list[str], start: dt.date, end: dt.date) -> dict[int, pd.DataFrame]`.
    - Keys are 1 and 2. Each frame is in `era5.parquet`'s schema (`time` in UTC, the six variables, `cell`).
    - It calls `https://previous-runs-api.open-meteo.com/v1/forecast` with `hourly=<var>_previous_day1,<var>_previous_day2,...` and `timezone=UTC`, splitting requests into 14-day windows.
    - Responses are cached in `data/raw/aq/previous_runs/<cell>_<start>_<end>.json`, and `null` becomes NaN.
  - `forecast_weather(frames: dict[int, pd.DataFrame]) -> pd.DataFrame`. For each valid hour `t` it takes `frames[lead_day(local_hour(t) + 12)]`.
  - `apply_weather(p: Panel, wx: pd.DataFrame, blh: str, start: pd.Timestamp, end: pd.Timestamp) -> None`. Inside `[start, end]`, for every cell in `p.cells`, it overwrites `p.weather[var]` with `wx` (NaN where `wx` has no value). When `blh == "none"` it also sets `p.weather["boundary_layer_height"]` to NaN. Call `derive(p)` *after* this.

- [ ] **Step 1: Write the failing tests**

```python
def test_lead_day_never_newer_than_issue():
    assert [lead_day(h) for h in (12, 24, 25, 35)] == [1, 1, 2, 2]

def test_forecast_weather_picks_by_local_hour():
    # frames 1 and 2 hold 1.0 and 2.0 for every hour of 2026-11-02 (local), one cell
    wx = forecast_weather({1: frame(1.0), 2: frame(2.0)})
    local = wx.set_index(wx["time"].dt.tz_convert(TZ).dt.hour)["temperature_2m"]
    assert local[0] == 1.0 and local[12] == 1.0 and local[13] == 2.0 and local[23] == 2.0

def test_previous_runs_nulls_become_nan(tmp_path, monkeypatch):
    # monkeypatch get_json to return a response with None values and point the cache at tmp_path
    f = previous_runs(["43.00_25.50"], dt.date(2026, 11, 1), dt.date(2026, 11, 1))
    assert f[1]["temperature_2m"].isna().all()

def test_apply_weather_blh_none(toy_panel):
    apply_weather(toy_panel, wx, "none", start, end)
    assert np.isnan(toy_panel.weather["boundary_layer_height"][inside]).all()
    assert not np.isnan(toy_panel.weather["boundary_layer_height"][outside]).any()
```

`toy_panel` is a pytest fixture: a `Panel` with 48 hours, 1 cell and 2 sensors, with every weather var set to 5.0. Build it directly from the dataclass, not from `build_panel`.

- [ ] **Step 2: Run** `uv run --group ml pytest ml/tests/test_aq_scoreboard.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(aq): forecast weather for the replay from Open-Meteo previous runs`

### Task 3: Replay, score and cache

**Files:**
- Modify: `ml/aq_scoreboard.py`
- Test: `ml/tests/test_aq_scoreboard.py`

**Interfaces:**
- **Consumes:** Task 2's functions; `Model.load`, `predict_all` and `level_of`; `load_sensors`, `load_hourly`, `weather_frames`, `build_panel`, `derive` and `features`.
- **Produces:**
  - `replay_rows(p, d, models, issue_dates: list[dt.date]) -> pd.DataFrame`, one row per (issue, sensor, target hour).
    - Columns: `date` (target local date), `sensor`, `t`, `vt` (bool), `model_pm25`, `model_pm10`, `cams_pm25`, `cams_pm10`, `persistence_pm25` (`p.pm25` at the issue bin), `obs_pm25` and `obs_pm10`.
    - The issue bin is 11:00 local, as in `aq_episode.forecast`. Sensors with no value at the issue bin are skipped.
  - `mae(rows: pd.DataFrame) -> dict[str, float]`, with keys `model`, `cams` and `persistence`, rounded to 1 decimal, over rows where all four PM2.5 columns are present.
  - `vt_days(rows: pd.DataFrame) -> list[dict]`. It works on VT rows: the mean across sensors per hour, then the mean per day, keeping days with at least 18 observed hours. Each item is `{date, model_pm10, cams_pm10, observed_pm10, model_level, observed_level}`, with levels from `level_of(pm25, pm10)`.
  - `pick_blh(runs: dict[str, dict]) -> str`
  - `run_block(rows, blh: str) -> dict`, in the spec's `replay` shape (`from`, `to`, `issued_local: "12:00"`, `models: "trained before winter 2025/26"`, `weather: "forecast"`, `blh`, `days`, `mae_pm25_next_day: {vt, bg}`, `vt_days`).
  - The CLI is `uv run --group ml python -u -m ml.aq_scoreboard --replay`.
    1. Build the panel from 2026-10-15 to 2026-11-20.
    2. Fetch `previous_runs` for `p.cells` from 2026-10-15 to 2026-11-20.
    3. For each `blh` in `("none", "era5")`: rebuild the panel weather, `apply_weather` from 2026-10-15, `derive`, then `replay_rows`.
    4. Write `data/processed/scoreboard_replay.json` as `{"chosen": pick_blh(...), "runs": {"none": {...}, "era5": {...}}}`.
    5. Print both runs' VT and BG MAE and which one was chosen.

- [ ] **Step 1: Write the failing tests**

```python
def test_mae_drops_rows_missing_any_input():
    rows = pd.DataFrame({"obs_pm25": [10, 20, np.nan], "model_pm25": [12, 18, 5],
                         "cams_pm25": [15, np.nan, 5], "persistence_pm25": [11, 25, 5]})
    assert mae(rows) == {"model": 2.0, "cams": 5.0, "persistence": 1.0}

def test_vt_days_needs_18_hours():
    # 24 VT hours on 2026-11-02, 17 on 2026-11-03 → one row, for 11-02
    assert [r["date"] for r in vt_days(rows)] == ["2026-11-02"]

def test_pick_blh_prefers_strict_when_it_wins():
    win = {"mae_pm25_next_day": {"vt": {"model": 3.0, "cams": 6.0}}}
    lose = {"mae_pm25_next_day": {"vt": {"model": 6.5, "cams": 6.0}}}
    assert pick_blh({"none": win, "era5": win}) == "none"
    assert pick_blh({"none": lose, "era5": win}) == "era5"

def test_run_block_matches_contract():
    block = run_block(rows, "none")
    assert validate(payload_with(scoreboard={"updated_at": NOW_ISO, "replay": block})) == []
```

- [ ] **Step 2: Run** `uv run --group ml pytest ml/tests/test_aq_scoreboard.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the functions and the CLI.
- [ ] **Step 4: Run** the tests (expected: PASS). Then run `uv run --group ml python -u -m ml.aq_scoreboard --replay`. Expected:
  - it prints `models: aq_*_eval`;
  - both runs show VT and BG MAE, with `days` ≥ 15;
  - it says `chosen: none` or `chosen: era5`;
  - the cache file exists.
- [ ] **Step 5: Commit:** `feat(aq): scoreboard replay of Nov 2026 with forecast weather`. Leave the cache out of the commit, since `data/` is local.

### Task 4: Live log, live score, payload

**Files:**
- Modify: `ml/aq_scoreboard.py`
- Modify: `ml/aq_forecast.py`. In `run_once`, after `P = predict_all(...)`, call `log_issued`. Before `validate`, set `model_block["scoreboard"]` when `scoreboard_block(...)` isn't None.
- Test: `ml/tests/test_aq_scoreboard.py`

**Interfaces:**
- **Produces:**
  - `log_issued(issued_at: pd.Timestamp, rows: pd.DataFrame, log_dir: Path = ROOT / "data" / "forecast_log") -> Path`. It writes one file per run: `issued-YYYYMMDD-HH.parquet` (UTC). The rows have the columns `issued_at`, `sensor_id`, `t`, `horizon_h`, `pm25`, `pm10`, `cams_pm25` and `persistence_pm25`. In `run_once`, build `rows` from `cols`, `H`, `p25`, `p10`, `panel.cams25` and `panel.pm25[i, c]`, for horizons 1–72.
  - `live_score(log: pd.DataFrame, obs25: np.ndarray, times: pd.DatetimeIndex, sensor_ids: np.ndarray, upto: pd.Timestamp) -> dict | None`
    - It scores log rows with `t <= upto` against `obs25[time_index, sensor_index]`, using `mae()`'s rule.
    - It returns the spec's `live` shape: `since` (the earliest `issued_at`, Sofia ISO), `checked_hours` (distinct `t` scored), `horizons` (`"{min}–{max} h"`) and `mae_pm25`.
    - It returns None when nothing has been scored yet.
    - In `run_once`, pass `panel.pm25`, `panel.times`, `panel.sensors["id"]` and `i_time`. The panel's values are already cleaned and humidity-corrected, like the model's target.
  - `read_log(log_dir: Path = ...) -> pd.DataFrame`, which concatenates every file (empty frame if none).
  - `scoreboard_block(live: dict | None, cache: Path = ROOT / "data" / "processed" / "scoreboard_replay.json") -> dict | None`. It returns `{"updated_at": <Sofia ISO now>, "replay": runs[chosen]?, "live": live?}`, or None when both are absent.

- [ ] **Step 1: Write the failing tests**

```python
def test_live_score_none_before_any_hour_passes():
    assert live_score(log_at(issued="12:00", t=["13:00"]), obs, times, ids, upto=ts("12:00")) is None

def test_live_score_counts_hours_and_horizons():
    s = live_score(log_two_runs, obs, times, ids, upto=ts("15:00"))
    assert s["checked_hours"] == 3 and s["horizons"] == "1–3 h"
    assert s["mae_pm25"] == {"model": 1.0, "cams": 4.0, "persistence": 2.0}

def test_log_roundtrip(tmp_path):
    log_issued(ts("12:00"), rows, tmp_path); log_issued(ts("13:00"), rows, tmp_path)
    assert len(read_log(tmp_path)) == 2 * len(rows)

def test_scoreboard_block_absent_without_inputs(tmp_path):
    assert scoreboard_block(None, cache=tmp_path / "missing.json") is None
```

- [ ] **Step 2: Run** `uv run --group ml pytest ml/tests/test_aq_scoreboard.py -q`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** them and wire them into `run_once`.
- [ ] **Step 4: Run** `uv run --group ml pytest ml/tests -q` (expected: PASS). Then run `uv run --group ml python -u -m ml.aq_forecast --once --no-db`. Expected:
  - the log line appears;
  - `data/forecast_log/` gains a file;
  - `web/src/data/aq_forecast.json` has `model.scoreboard.replay.blh`.

  After that, restart the hourly loop so Neon gets it at the next run.
- [ ] **Step 5: Commit and push:** `feat(aq): live forecast log and scoreboard in the payload`

### Task 5: Slide 6 and numbers

**Files:**
- Modify: `ml/aq_slides.py`

**Changes:**
- When `data/processed/scoreboard_replay.json` exists, add a second group to `docs/slides/mae_24h.png` labelled „Ноември 2026, реална прогноза за времето“, showing VT and BG bars for model, CAMS and persistence from the chosen run.
- Add a line to `numbers.md`:
  - `- This season (1–19 Nov 2026, forecast weather, BLH {mode}): VT model X vs CAMS Y → Z% better; BG …`
  - When the mode is `era5`, also add „boundary layer observed“.

**Steps:**
- [ ] **Step 1: Run** `uv run --group ml python -m ml.aq_slides`. Expected: the PNG has the new group, and `numbers.md` has the line with the chosen BLH mode.
- [ ] **Step 2: Commit:** `feat(aq): slide 6 adds this season's forecast-weather replay`

### Task 6: „Проверка на живо“ on „Защо?“ (Velko)

**Files:**
- Modify: `web/src/lib/aq/types.ts`. Add `AqScoreboard`, mirroring the contract block, and `scoreboard?: AqScoreboard` on `AqModel`.
- Modify: `web/src/lib/aq/mock.ts`. Add the spec's example block to `demoForecast()`.
- Create: `web/src/lib/aq/scoreboard.ts`
- Create: a section component in Velko's „Защо?“ page folder.
- Modify: `web/src/lib/aq/strings.ts`. Add the keys below in bg; Velko writes the en versions.
- Test: `web/src/lib/aq/scoreboard.test.ts`

**Interfaces:**
- **Produces:** `scoreboardView(sb: AqScoreboard | undefined, lang: Lang): ScoreboardView | null`
  - `ScoreboardView = { headline: string; bars: { area: 'vt' | 'bg'; model: number; cams: number; persistence: number }[]; days: AqScoreboard['replay']['vt_days']; note: string; live: string | null }`
  - It returns null when `sb` is undefined or has no `replay`.

**BG copy:**
- `sb.headline`: „Този сезон, с реалната прогноза за времето: {pct}% по-точно от CAMS за Велико Търново“, where `pct = round((cams − model) / cams × 100)` for VT.
- `sb.note.none`: „Без прогноза за слоя на смесване – и пак по-точно от CAMS. Модели, обучени преди зима 2025/26.“
- `sb.note.era5`: „Слоят на смесване е измерен (ERA5), не прогнозен – единственото изключение от реалната прогноза.“
- `sb.note.cams`, always shown after the note: „CAMS (вход на модела и сравнение) е от архива на Copernicus – по-нов от момента на прогнозата, еднакво за двете колони.“
- `sb.live`'s scope: the live score covers every logged BG sensor, not only VT, so don't label it as VT.
- `sb.live`: „На живо от {HH:MM}: {checked_hours} проверени часа ({horizons} напред) · средна грешка {model} µg/m³, CAMS {cams}“

**Section layout:**
- headline;
- bars (VT and BG: model, CAMS, persistence);
- a 3-week line of `observed_pm10`, `model_pm10` and `cams_pm10` from `days`;
- the live strip when `live` isn't null;
- the note.

The section is hidden when `scoreboardView` returns null. The home line „Вчера за днес казахме X, измерено Y“, built from the last `vt_days` row, is optional.

- [ ] **Step 1: Write the failing tests:**
  - undefined → null;
  - the spec example → headline contains `43%` (VT: model 3.4, cams 6.0);
  - `blh: 'era5'` → note equals `sb.note.era5`;
  - no `live` → `live === null`;
  - `checked_hours: 37` → live contains „37 проверени часа“.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/aq/scoreboard.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `scoreboard.ts`, the strings, the mock and the section.
- [ ] **Step 4: Run** `pnpm check`. Expected: green. Then check the page at 390 px and on desktop, using demo data and then real data once Task 4 has run.
- [ ] **Step 5: Commit:** `feat(web): live forecast check on the Why page`
