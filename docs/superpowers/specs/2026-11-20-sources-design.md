# „Кой замърсява?“ (pollution sources, estimate): design

Owners: Teodor (ML, 13:00–15:00), Velko (web, about 45 min, after the scoreboard section), Boris (one line in the bot). Size: small project (short design).

## Why

The forecast says *when* the air will be bad. This feature says *why* and *what would help*: how much is home heating, traffic, or pollution carried in from elsewhere. It serves two audiences:
- **Citizens:** a short line on the day cards and in the bot.
- **The municipality:** a what-if line.

It targets „Най-умно използване на публични данни“. It is built only from public citizen sensors and weather, with no chemical analysis.

## Facts from the data (VT, 9 sensors, Nov–Feb, last 3 winters)

- **Heating is temperature-driven.** The local excess above the regional background is 4.2 µg/m³ above 10 °C, 9.3 at 5–10 °C, 13.1 at 0–5 °C, and 14.5 below 0 °C.
- **The evening peak (19–23 h) isn't traffic.** It is the same on weekdays and weekends.
- **Traffic is visible in the mornings.** At 08:00, PM2.5 is 11.5 on weekdays and 8.6 at weekends.
- **The regional background is small.** It is about 15% of the VT mean (20th percentile of sensors 15–80 km away: 2.8 vs 18.9).
- **The PM2.5/PM10 ratio is useless.** It stays at 0.5–0.6 all day, so it isn't used.

## Goals

- **The split:** each VT forecast day gets PM2.5 shares: отопление / трафик / пренос / друго.
- **Where it shows:** the web day cards and the bot reply, labelled „оценка“.
- **The what-if line:** „Ако 20% от домовете на дърва сменят отоплението: −X µg/m³ вечер утре; N вместо M лоши дни миналата зима“.

## Non-goals and anti-goals

- **Non-goals:**
  - splits for stations outside VT;
  - a slider (the what-if is one fixed scenario, 20%);
  - PM10 shares;
  - PMF/NMF receptor models (we have no chemical species).
- **Anti-goals:**
  - Presenting the split as measured. Every place it appears says „оценка“, and the method page names its two biases.
  - A split that doesn't add up to the forecast.

## Approaches

| | Approach | Trade-off | |
|---|---|---|---|
| A | **Increment tables:** regional background, then the local excess, then the warm-day baseline. Traffic is the weekday excess over weekends in that baseline; heating is everything above the baseline. | One-sentence explanation, data-derived, about 2 h. It credits a little too much to heating on inversion nights. | **Picked** |
| B | A fitted model with a dispersion term (boundary layer × wind) | Separates inversion from heating, but it's harder to explain and fit in 2 h | Rejected |
| C | Counterfactual: run our model with a warm temperature | Temperature also stands for inversions, and the lags already contain smoke, so it's hard to defend | Rejected |

## Design

**Profiles** (`python -m ml.aq_sources --profiles`, history only, writes `ml/models/aq_sources.json`, committed):

1. Take hourly data for Oct–Mar of the 3 winters *before* the holdout, using the same cleaned panel as training.
2. Compute two series each hour:
   - `vt`: the VT city mean, over sensors within 10 km;
   - `regional`: the 20th percentile of sensors 15–80 km from VT.
3. `inc = max(0, vt − min(regional, vt))`.
4. `baseline[hour][daytype]`: the median `inc` over hours with ERA5 temperature above 10 °C. The daytype is weekday or weekend (Sat/Sun and BG holidays). A cell needs at least 30 samples; otherwise it falls back to the hour's median across both daytypes.
5. `traffic[hour] = max(0, baseline[hour][weekday] − baseline[hour][weekend])`.

**Split** (pure function, applied to the forecast):

- For each forecast hour:
  - `regional = min(vt_fc, reg_fc)`. Here `vt_fc` is the mean of the featured VT stations' forecasts. `reg_fc` is the 20th percentile of the forecasts for stations 15–80 km away, so it comes from our own forecast too.
  - `base = min(inc_fc, baseline[hour][daytype])`
  - `traffic = min(base, traffic[hour])` on weekdays, 0 at weekends
  - `other = base − traffic`
  - `heating = inc_fc − base`
- The four parts add up to `vt_fc` at every hour.
- **Day shares:** each part's sum over the day's hours divided by the day's `vt_fc` sum, rounded to 2 decimals. Rounding leftovers go to the largest part, so the shares sum to exactly 1.00.
- **On a clean day** (`vt_fc` daily mean below 5 µg/m³), shares are still given, and the UI may hide them.

**What-if** (`model.sources_what_if`, recomputed every run):

- **Tomorrow evening:** `evening_drop_pm25 = round(0.2 × mean(heating over tomorrow 18:00–23:00), 1)`.
- **Last winter (holdout 2025/26):**
  1. Split the *observed* VT and regional series with the same profiles.
  2. Subtract `0.2 × heating` from PM2.5 each hour, scaling PM10 by the same factor.
  3. Recount the days with EAQI ≥ 3, using days with at least 18 observed hours, as `numbers.md` does.
  4. This is computed once and cached in `aq_sources.json`.

**Contract** (optional; add to `contract/CONTRACT.md`):

- On the featured stations' `daily[]` items: `"sources": { "heating": 0.64, "traffic": 0.08, "regional": 0.15, "other": 0.13 }`. These are shares of PM2.5 and they sum to 1.
- `model.sources_what_if`: `{ "method": "estimate", "switch_share": 0.2, "date": "2026-11-21", "evening_drop_pm25": 3.1, "last_winter": { "bad_days": 15, "bad_days_after": 11 } }`

**Web (Velko).**
- **VT day cards:** a thin 4-colour bar plus „Източници (оценка): отопление 64% · трафик 8% · пренос 15%“.
- **VT card or „Защо?“:** the what-if line.
- **Methodology:** one paragraph on the method and its two biases:
  - inversion nights also trap traffic smoke, so heating is slightly over-credited;
  - „пренос“ includes the smoke of nearby villages.

**Bot (Boris).** One extra line in the 3-day reply, for the first day: „Източници (оценка): отопление 64% · трафик 8% · пренос 15%“.

**Tests (pytest, toy arrays):**
- profile building: baseline, the 30-sample fallback, traffic ≥ 0;
- the split: the parts add up to the forecast, are never negative, weekend traffic is 0, and shares sum to 1.00;
- the what-if recount on a toy winter;
- contract validation of both fields.

## Left to the builder

The colours of the 4-part bar, where exactly the what-if line sits on the web, the holiday list (reuse `_bg_holidays`), and the PNG for slide 6 (an optional „студена вечер в ВТ“ breakdown).
