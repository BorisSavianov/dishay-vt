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
