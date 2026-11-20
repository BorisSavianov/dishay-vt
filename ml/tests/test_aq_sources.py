import datetime as dt

import numpy as np
import pandas as pd

from ml.aq_features import TZ, Panel
from ml.aq_sources import build_profiles, daytype, vt_and_regional

VT = (43.0786, 25.6211)


# ---------------- Task 1: profiles ----------------

def test_daytype_weekend_and_holiday():
    t = pd.DatetimeIndex([pd.Timestamp(d, tz=TZ) for d in ("2026-11-20 12:00", "2026-11-21 12:00", "2026-03-03 12:00")])
    assert daytype(t, {dt.date(2026, 3, 3)}).tolist() == [False, True, True]


def toy_panel(pm25: np.ndarray, lats, lons) -> Panel:
    n_t, n_s = pm25.shape
    times = pd.date_range("2026-11-01T00:00Z", periods=n_t, freq="h")
    sensors = pd.DataFrame({"id": range(1, n_s + 1), "type": ["SDS011"] * n_s, "lat": lats, "lon": lons,
                            "cell": ["c"] * n_s, "elevation": [200.0] * n_s, "type_code": [0] * n_s})
    pm = pm25.astype(np.float32)
    return Panel(times, sensors, pm, pm * 1.6, pm.copy(), ["c"], {}, np.zeros((n_t, 1)), np.zeros((n_t, 1)),
                 np.zeros(n_s, dtype=int), np.zeros((n_s, n_s)))


def test_vt_and_regional_toy():
    pm = np.array([[10.0, 20.0, 4.0]] * 3)
    p = toy_panel(pm, [VT[0], VT[0], VT[0] + 0.45], [VT[1], VT[1], VT[1]])  # third sensor ~50 km north
    s = vt_and_regional(p)
    assert s["vt"].tolist() == [15.0] * 3
    assert s["regional"].tolist() == [4.0] * 3
    assert s["inc"].tolist() == [11.0] * 3


def week_series(weeks: int) -> tuple[pd.DataFrame, pd.Series]:
    """Hourly from Monday 2024-11-04 (local). Warm (12 °C) except Mondays (0 °C, inc 50).
    inc: 6 at weekday 08:00, 2 at weekend 08:00, 3 at other hours."""
    local = pd.date_range(pd.Timestamp("2024-11-04", tz=TZ), periods=weeks * 7 * 24, freq="h")
    dow, hr = local.day_of_week.to_numpy(), local.hour.to_numpy()
    inc = np.where(hr == 8, np.where(dow >= 5, 2.0, 6.0), 3.0)
    cold = dow == 0
    inc = np.where(cold, 50.0, inc)
    temp = np.where(cold, 0.0, 12.0)
    idx = local.tz_convert("UTC")
    series = pd.DataFrame({"vt": inc + 4.0, "regional": 4.0, "inc": inc}, index=idx)
    return series, pd.Series(temp, index=idx)


def test_profiles_baseline_and_traffic():
    prof = build_profiles(*week_series(20), set())
    assert prof["baseline"]["weekday"][8] == 6.0 and prof["baseline"]["weekend"][8] == 2.0
    assert prof["traffic"][8] == 4.0 and prof["traffic"][3] == 0.0
    assert prof["baseline"]["weekday"][3] == 3.0, "cold hours (inc 50) must not move the baseline"
    assert prof["samples"]["weekend"][8] == 40


def test_profiles_fallback_under_30_samples():
    prof = build_profiles(*week_series(3), set())
    assert prof["baseline"]["weekend"][8] == prof["baseline"]["weekday"][8] == 6.0
    assert prof["traffic"][8] == 0.0


# ---------------- Task 2: split and day shares ----------------

from ml.aq_sources import day_shares, split

PROF = {"baseline": {"weekday": [3.0] * 24, "weekend": [2.0] * 24}, "traffic": [1.0] * 24}


def day(date: str) -> pd.DatetimeIndex:
    return pd.date_range(pd.Timestamp(date, tz=TZ), periods=24, freq="h")


def flat(v: float, n: int = 24) -> np.ndarray:
    return np.full(n, v, dtype=float)


def test_split_weekday_adds_up():
    parts = split(flat(20), flat(4), day("2026-11-20"), PROF, set())
    assert {k: set(v.tolist()) for k, v in parts.items()} == {"regional": {4.0}, "traffic": {1.0}, "other": {2.0}, "heating": {13.0}}
    assert np.allclose(sum(parts.values()), 20.0)


def test_split_weekend_has_no_traffic():
    parts = split(flat(20), flat(4), day("2026-11-21"), PROF, set())
    assert (parts["traffic"] == 0).all() and (parts["other"] == 2).all() and (parts["heating"] == 14).all()  # inc 16 - weekend base 2


def test_split_holiday_has_no_traffic():
    parts = split(flat(20), flat(4), day("2026-11-20"), PROF, {dt.date(2026, 11, 20)})
    assert (parts["traffic"] == 0).all()


def test_split_vt_below_regional_is_never_negative():
    parts = split(flat(3), flat(5), day("2026-11-20"), PROF, set())
    assert (parts["regional"] == 3).all()
    assert all((parts[k] == 0).all() for k in ("traffic", "other", "heating"))


def test_split_small_excess_goes_to_traffic_first():
    parts = split(flat(5), flat(4), day("2026-11-20"), PROF, set())
    assert (parts["traffic"] == 1).all() and (parts["other"] == 0).all() and (parts["heating"] == 0).all()


def test_split_nan_regional_counts_as_zero():
    parts = split(flat(20), flat(np.nan), day("2026-11-20"), PROF, set())
    assert (parts["regional"] == 0).all() and np.allclose(sum(parts.values()), 20.0)


def test_day_shares_weekday():
    parts = split(flat(20), flat(4), day("2026-11-20"), PROF, set())
    assert day_shares(parts) == {"heating": 0.65, "traffic": 0.05, "other": 0.1, "regional": 0.2}


def test_day_shares_sum_exactly_one():
    s = day_shares({"heating": flat(1.0), "traffic": flat(1.0), "other": flat(1.0), "regional": flat(0.0)})
    assert sum(s.values()) == 1.0 and set(s) == {"heating", "traffic", "other", "regional"}


# ---------------- Task 3: what-if and contract ----------------

import copy
from zoneinfo import ZoneInfo

from ml.aq_contract import validate
from ml.aq_mock import build
from ml.aq_sources import bad_days, evening_drop


def test_evening_drop():
    local = pd.date_range(pd.Timestamp("2026-11-21", tz=TZ), periods=48, freq="h")
    heating = np.where((local.hour >= 18) & (local.date == dt.date(2026, 11, 21)), 10.0, 0.0)
    assert evening_drop({"heating": heating}, local, dt.date(2026, 11, 21)) == 2.0
    assert evening_drop({"heating": heating}, local, dt.date(2026, 11, 25)) == 0.0


def test_bad_days_before_and_after_switch():
    local = pd.date_range(pd.Timestamp("2026-01-10", tz=TZ), periods=72, freq="h")
    pm25 = np.concatenate([flat(20), flat(16), np.where(np.arange(24) < 17, 20.0, np.nan)])
    pm10 = pm25 * 1.6
    heating = flat(10, 72)
    assert bad_days(pm25, pm10, local) == 2          # day C has 17 hours: ignored
    assert bad_days(pm25, pm10, local, heating) == 1  # day B: 16 → 14 µg/m³ PM2.5, level 3 → 2


SOURCES = {"heating": 0.64, "traffic": 0.08, "regional": 0.15, "other": 0.13}
WHAT_IF = {"method": "estimate", "switch_share": 0.2, "date": "2026-11-21", "evening_drop_pm25": 3.1,
           "last_winter": {"bad_days": 15, "bad_days_after": 11, "days": 170}}


def payload_with_sources(sources=SOURCES, what_if=WHAT_IF) -> dict:
    p = build(dt.datetime(2026, 11, 20, 13, 0, tzinfo=ZoneInfo("Europe/Sofia")))
    p["stations"][0]["daily"][0]["sources"] = copy.deepcopy(sources)
    p["model"]["sources_what_if"] = copy.deepcopy(what_if)
    return p


def test_contract_accepts_sources():
    assert validate(payload_with_sources()) == []


def test_contract_rejects_sources_not_summing_to_one():
    bad = dict(SOURCES, heating=0.54)
    assert any(".sources" in e for e in validate(payload_with_sources(sources=bad)))


def test_contract_rejects_measured_what_if():
    assert any("sources_what_if.method" in e for e in validate(payload_with_sources(what_if=dict(WHAT_IF, method="measured"))))


# ---------------- Task 4: payload ----------------

from ml.aq_sources import sources_payload

PROF_JSON = {"share": 0.2, "method": "estimate", "profiles": PROF,
             "last_winter": {"bad_days": 23, "bad_days_after": 14, "days": 182}}
LOCAL58 = pd.date_range(pd.Timestamp("2026-11-21", tz=TZ), periods=58, freq="h")   # 21st, 22nd, 10 h of the 23rd
DATES = ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]


def test_sources_payload_no_regional():
    shares, _ = sources_payload(flat(20, 58), flat(np.nan, 58), LOCAL58, DATES, PROF_JSON, set())
    for s in shares.values():
        assert s["regional"] == 0.0 and abs(sum(s.values()) - 1.0) < 1e-9


def test_sources_payload_partial_day():
    shares, _ = sources_payload(flat(20, 58), flat(4, 58), LOCAL58, DATES, PROF_JSON, set())
    assert list(shares) == ["2026-11-21", "2026-11-22", "2026-11-23"]


def test_sources_payload_what_if_shape():
    shares, what_if = sources_payload(flat(20, 58), flat(4, 58), LOCAL58, DATES, PROF_JSON, set())
    assert what_if["date"] == "2026-11-21" and what_if["evening_drop_pm25"] == 2.8   # Sat: inc 16 - weekend base 2 = heating 14; × 0.2
    assert validate(payload_with_sources(sources=shares["2026-11-21"], what_if=what_if)) == []


def test_evening_drop_all_nan_is_zero():
    local = pd.date_range(pd.Timestamp("2026-11-21", tz=TZ), periods=24, freq="h")
    assert evening_drop({"heating": flat(np.nan)}, local, dt.date(2026, 11, 21)) == 0.0


# ---------------- Fold-in: last winter's season shares (Boris's shape) ----------------

from ml.aq_sources import last_winter_block


def test_last_winter_block_shape_and_shares():
    local = pd.date_range(pd.Timestamp("2026-01-10", tz=TZ), periods=72, freq="h")   # Sat, Sun, Mon
    pm25 = flat(20, 72)
    b = last_winter_block(pm25, pm25 * 1.6, flat(4, 72), local, PROF, set(), "2025-10-01", "2026-03-31")
    assert set(b) == {"bad_days", "bad_days_after", "days", "from", "to", "shares"}
    assert (b["from"], b["to"], b["days"]) == ("2025-10-01", "2026-03-31", 3)
    assert set(b["shares"]) == {"heating", "traffic", "regional", "other"} and sum(b["shares"].values()) == 1.0
    assert b["shares"]["regional"] == 0.2


def test_contract_accepts_last_winter_shares():
    w = copy.deepcopy(WHAT_IF)
    w["last_winter"].update({"from": "2025-10-01", "to": "2026-03-31", "shares": SOURCES})
    assert validate(payload_with_sources(what_if=w)) == []


def test_contract_rejects_bad_last_winter_shares():
    w = copy.deepcopy(WHAT_IF)
    w["last_winter"]["shares"] = dict(SOURCES, heating=0.3)
    assert any("sources_what_if.last_winter.shares" in e for e in validate(payload_with_sources(what_if=w)))


# ---------------- Final review fix: heating only below 10 °C ----------------

def test_split_warm_hours_have_no_heating():
    parts = split(flat(20), flat(4), day("2026-11-20"), PROF, set(), temp=flat(12))
    assert (parts["heating"] == 0).all() and (parts["traffic"] == 1).all() and (parts["other"] == 15).all()
    assert np.allclose(sum(parts.values()), 20.0)


def test_split_cold_hours_keep_heating():
    parts = split(flat(20), flat(4), day("2026-11-20"), PROF, set(), temp=flat(5))
    assert (parts["heating"] == 13).all()


def test_split_unknown_temperature_is_not_heating():
    parts = split(flat(20), flat(4), day("2026-11-20"), PROF, set(), temp=flat(np.nan))
    assert (parts["heating"] == 0).all()


def test_sources_payload_warm_forecast_has_no_heating():
    shares, what_if = sources_payload(flat(20, 58), flat(4, 58), LOCAL58, DATES, PROF_JSON, set(), temp_fc=flat(12, 58))
    assert all(s["heating"] == 0.0 for s in shares.values()) and what_if["evening_drop_pm25"] == 0.0


def test_last_winter_block_warm_season_switch_changes_nothing():
    local = pd.date_range(pd.Timestamp("2026-01-10", tz=TZ), periods=72, freq="h")
    pm25 = flat(16, 72)
    b = last_winter_block(pm25, pm25 * 1.6, flat(4, 72), local, PROF, set(), "2025-10-01", "2026-03-31", temp=flat(12, 72))
    assert b["bad_days_after"] == b["bad_days"] == 3 and b["shares"]["heating"] == 0.0
